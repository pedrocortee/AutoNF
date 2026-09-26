/**
 * Raw Express routes for the inbound module: binary upload, original file download
 * and CSV export. Mounted after clerkMiddleware(); auth reuses the tRPC context.
 */

import express, { type Request, type Response } from "express";
import { createContext } from "./_core/trpc";
import { expandFiles, ingestFile, type IngestResult } from "./_core/inbound/ingest";
import { enqueueInbound } from "./_core/inbound/queue";
import { toCsv } from "./_core/inbound/exporter";
import { readObject } from "./_core/storage";
import { getInboundDocument, getInboundForExport, markInboundExported } from "./inboundDb";
import { companiesByIds, rulesForCompanies } from "./clientCompaniesDb";
import { classify } from "./_core/inbound/rules";
import { inboundAllowance } from "./_core/inbound/quota";

const MAX_UPLOAD = `${Number(process.env.INBOUND_MAX_UPLOAD_MB ?? 100)}mb`;

async function requireAuthUser(req: Request, res: Response) {
  const ctx = await createContext({ req, res });
  if (!ctx.user) {
    res.status(401).json({ error: "Não autenticado" });
    return null;
  }
  return ctx.user;
}

async function requireUser(req: Request, res: Response): Promise<number | null> {
  return (await requireAuthUser(req, res))?.id ?? null;
}

export const inboundRoutes = express.Router();

/** Body: raw file bytes. Header X-Filename: URI-encoded original name. One file (or ZIP) per request. */
inboundRoutes.post(
  "/api/inbound/upload",
  express.raw({ type: () => true, limit: MAX_UPLOAD }),
  async (req, res) => {
    const user = await requireAuthUser(req, res);
    if (!user) return;
    const userId = user.id;

    // Plan quota (each new document counts; duplicates and rejected files do not)
    const allowance = await inboundAllowance(user);
    if (!allowance.allowed) {
      res.status(402).json({ error: allowance.reason, allowance });
      return;
    }
    let remaining = allowance.remaining ?? Infinity;

    const filename = decodeURIComponent(String(req.header("x-filename") ?? "arquivo"));
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: "Arquivo vazio" });
      return;
    }

    try {
      const { files, rejected } = await expandFiles([{ filename, buffer: req.body }]);
      const results: IngestResult[] = [...rejected];
      for (const f of files) {
        if (remaining <= 0) {
          const reason = allowance.period === "account" ? "Limite de documentos do plano gratuito atingido" : "Limite mensal de documentos do plano atingido";
          results.push({ filename: f.filename, status: "rejeitado", reason });
          continue;
        }
        const r = await ingestFile(userId, f);
        if (r.status === "criado" && r.documentId) {
          await enqueueInbound(r.documentId);
          remaining--;
        }
        results.push(r);
      }
      res.json({ results });
    } catch (err) {
      console.error("[inbound-upload]", err);
      res.status(500).json({ error: "Falha ao processar o upload" });
    }
  }
);

inboundRoutes.get("/api/inbound/:id/file", async (req, res) => {
  const userId = await requireUser(req, res);
  if (userId === null) return;

  const doc = await getInboundDocument(Number(req.params.id), userId);
  if (!doc) {
    res.status(404).json({ error: "Documento não encontrado" });
    return;
  }
  const buf = await readObject(doc.storageKey);
  if (!buf) {
    res.status(404).json({ error: "Arquivo não encontrado" });
    return;
  }
  const type = doc.mediaType === "application/xml" ? "text/xml; charset=utf-8" : doc.mediaType;
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.originalFilename)}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "sandbox");
  res.send(buf);
});

/**
 * Body JSON: { ids?: number[], companyId?: number | null, markExported?: boolean }.
 * Without ids exports every approved document (of one company when companyId is given).
 */
inboundRoutes.post("/api/inbound/export", express.json(), async (req, res) => {
  const userId = await requireUser(req, res);
  if (userId === null) return;

  const ids: number[] | undefined = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : undefined;
  const rawCompany = req.body?.companyId;
  const companyId = rawCompany === null ? null : Number.isInteger(rawCompany) ? (rawCompany as number) : undefined;
  const docs = (await getInboundForExport(userId, ids, companyId)).filter(
    (d) => d.extracted && (d.status === "aprovado" || d.status === "exportado")
  );

  const [companies, rules] = await Promise.all([
    companiesByIds(userId, [...new Set(docs.map((d) => d.companyId).filter((c): c is number => c !== null))]),
    rulesForCompanies(userId),
  ]);
  const csv = toCsv(
    docs.map((d) => {
      const c = d.companyId !== null ? companies.get(d.companyId) : undefined;
      return {
        id: d.id,
        status: d.status,
        method: d.method,
        document: d.extracted!,
        company: c ? { document: c.document, name: c.name, externalCode: c.externalCode } : null,
        classification: classify(d.extracted!, d.companyId, rules),
      };
    })
  );
  if (req.body?.markExported !== false) {
    await markInboundExported(docs.filter((d) => d.status === "aprovado").map((d) => d.id), userId);
  }

  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="autonf-entrada-${stamp}.csv"`);
  res.send(csv);
});
