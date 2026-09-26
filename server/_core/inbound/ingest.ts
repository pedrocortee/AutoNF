/**
 * Receives files (single or ZIP), stores them once per content hash and records
 * the inbound document. Processing is queued separately (see queue.ts).
 */

import crypto from "crypto";
import path from "path";
import JSZip from "jszip";
import { createInboundDocument, findInboundBySha, recordInboundCreated } from "../../inboundDb";
import { saveObject } from "../storage";

export const MAX_FILE_BYTES = Number(process.env.INBOUND_MAX_FILE_MB ?? 15) * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 500;

const EXT_MEDIA: Record<string, string> = {
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export interface IncomingFile {
  filename: string;
  buffer: Buffer;
}

export interface IngestResult {
  filename: string;
  documentId?: number;
  status: "criado" | "duplicado" | "rejeitado";
  reason?: string;
}

export function isZip(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

/** Flattens ZIPs (one level) into individual files, skipping folders and OS metadata. */
export async function expandFiles(files: IncomingFile[]): Promise<{ files: IncomingFile[]; rejected: IngestResult[] }> {
  const out: IncomingFile[] = [];
  const rejected: IngestResult[] = [];
  for (const f of files) {
    if (!isZip(f.buffer)) {
      out.push(f);
      continue;
    }
    const zip = await JSZip.loadAsync(f.buffer);
    const entries = Object.values(zip.files).filter(
      (e) => !e.dir && !e.name.startsWith("__MACOSX/") && !path.basename(e.name).startsWith(".")
    );
    if (entries.length > MAX_ZIP_ENTRIES) {
      rejected.push({ filename: f.filename, status: "rejeitado", reason: `ZIP com mais de ${MAX_ZIP_ENTRIES} arquivos` });
      continue;
    }
    for (const e of entries) {
      out.push({ filename: path.basename(e.name), buffer: await e.async("nodebuffer") });
    }
  }
  return { files: out, rejected };
}

export async function ingestFile(
  userId: number,
  file: IncomingFile,
  source: "upload" | "sefaz_dfe" | "adn_nfse" | "email" = "upload"
): Promise<IngestResult> {
  const ext = path.extname(file.filename).toLowerCase();
  const mediaType = EXT_MEDIA[ext];
  if (!mediaType) return { filename: file.filename, status: "rejeitado", reason: `Extensão ${ext || "(nenhuma)"} não suportada` };
  if (file.buffer.length === 0) return { filename: file.filename, status: "rejeitado", reason: "Arquivo vazio" };
  if (file.buffer.length > MAX_FILE_BYTES) return { filename: file.filename, status: "rejeitado", reason: "Arquivo acima do limite" };

  const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const existing = await findInboundBySha(userId, sha256);
  if (existing) return { filename: file.filename, documentId: existing.id, status: "duplicado", reason: "Arquivo já enviado" };

  const storageKey = await saveObject(`inbound/${userId}/${sha256}${ext}`, file.buffer, mediaType);
  const documentId = await createInboundDocument({
    userId,
    source,
    status: "recebido",
    originalFilename: file.filename.slice(0, 255),
    mediaType,
    storageKey,
    sizeBytes: file.buffer.length,
    sha256,
  });
  await recordInboundCreated(documentId, `Recebido via ${source}`);
  return { filename: file.filename, documentId, status: "criado" };
}
