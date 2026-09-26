/**
 * One capture run for one company: pages through NFeDistribuicaoDFe from the last NSU and hands
 * each document to the inbound pipeline. Pure orchestration — I/O comes in through SyncDeps.
 *
 * Throttling (SEFAZ blocks "consumo indevido", cStat 656): when there is nothing new
 * (cStat 137 or ultNSU = maxNSU), after an error, or when blocked, the next call for this
 * company waits at least one hour.
 */

import { CSTAT, parseResNFe, type DistDocument, type DistRequest, type DistResponse, type NfeSummary, type SefazEnv } from "./dfeDistribution";

export const WAIT_MS = 60 * 60 * 1000;
export const MAX_PAGES_PER_RUN = 10;

export interface SyncDeps {
  distribute(req: DistRequest): Promise<DistResponse>;
  /** Full NF-e XML → inbound document. Returns whether it was new. */
  ingestNfe(doc: DistDocument): Promise<"criado" | "duplicado" | "rejeitado">;
  saveSummary(summary: NfeSummary, nsu: string): Promise<void>;
  now(): Date;
}

export interface SyncInput {
  env: SefazEnv;
  ufCode: number;
  document: string;
  lastNsu: string;
  nextAllowedAt: Date | null;
  maxPages?: number;
}

export interface SyncOutcome {
  ran: boolean;
  lastNsu: string;
  maxNsu: string | null;
  nextAllowedAt: Date | null;
  statusCode: string | null;
  statusMessage: string | null;
  pages: number;
  received: number;
  duplicates: number;
  summaries: number;
  ignored: number;
}

export async function syncCompany(input: SyncInput, deps: SyncDeps): Promise<SyncOutcome> {
  const now = deps.now();
  const out: SyncOutcome = {
    ran: false,
    lastNsu: input.lastNsu,
    maxNsu: null,
    nextAllowedAt: input.nextAllowedAt,
    statusCode: null,
    statusMessage: null,
    pages: 0,
    received: 0,
    duplicates: 0,
    summaries: 0,
    ignored: 0,
  };
  if (input.nextAllowedAt && input.nextAllowedAt > now) {
    out.statusMessage = `Aguardando até ${input.nextAllowedAt.toISOString()} para não bloquear na SEFAZ`;
    return out;
  }
  out.ran = true;
  const later = () => new Date(deps.now().getTime() + WAIT_MS);
  const maxPages = input.maxPages ?? MAX_PAGES_PER_RUN;

  while (out.pages < maxPages) {
    let res: DistResponse;
    try {
      res = await deps.distribute({ env: input.env, ufCode: input.ufCode, document: input.document, lastNsu: out.lastNsu });
    } catch (err) {
      out.statusCode = "erro";
      out.statusMessage = (err as Error).message.slice(0, 500);
      out.nextAllowedAt = later();
      return out;
    }
    out.pages++;
    out.statusCode = res.cStat;
    out.statusMessage = res.xMotivo.slice(0, 500);

    if (res.cStat === CSTAT.OVERUSE) {
      out.nextAllowedAt = later();
      return out;
    }
    if (res.cStat === CSTAT.NONE_FOUND) {
      if (res.ultNSU > out.lastNsu) out.lastNsu = res.ultNSU;
      out.maxNsu = res.maxNSU;
      out.nextAllowedAt = later();
      return out;
    }
    if (res.cStat !== CSTAT.FOUND) {
      // Rejections (e.g. 593: CNPJ do certificado difere do consultado) — retry later, cursor unchanged
      out.nextAllowedAt = later();
      return out;
    }

    for (const doc of res.documents) {
      if (doc.kind === "nfe") {
        const r = await deps.ingestNfe(doc);
        if (r === "criado") out.received++;
        else if (r === "duplicado") out.duplicates++;
        else out.ignored++;
      } else if (doc.kind === "nfe_summary") {
        const summary = await parseResNFe(doc.xml);
        if (summary) {
          await deps.saveSummary(summary, doc.nsu);
          out.summaries++;
        } else out.ignored++;
      } else out.ignored++; // events (cancelamento, CC-e) are handled in a later phase
    }

    // Documents are persisted before the cursor moves, so a crash re-reads (and dedups) the page
    out.lastNsu = res.ultNSU;
    out.maxNsu = res.maxNSU;
    if (res.ultNSU >= res.maxNSU) {
      out.nextAllowedAt = later();
      return out;
    }
  }
  // Page budget used up with documents still pending: the next scheduled run continues
  out.nextAllowedAt = null;
  return out;
}
