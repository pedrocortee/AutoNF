import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useCallback } from "react";

export type InboundStatus = "recebido" | "processando" | "revisao" | "aprovado" | "exportado" | "erro" | "descartado";

export const STATUS_LABEL: Record<InboundStatus, string> = {
  recebido: "Na fila",
  processando: "Processando",
  revisao: "Revisar",
  aprovado: "Aprovado",
  exportado: "Exportado",
  erro: "Erro",
  descartado: "Descartado",
};

export const STATUS_STYLE: Record<InboundStatus, string> = {
  recebido: "bg-muted text-muted-foreground",
  processando: "bg-sky-50 text-sky-700",
  revisao: "bg-amber-50 text-amber-800",
  aprovado: "bg-emerald-50 text-emerald-700",
  exportado: "bg-indigo-50 text-indigo-700",
  erro: "bg-red-50 text-red-700",
  descartado: "bg-muted text-muted-foreground line-through",
};

export const DOC_TYPE_LABEL: Record<string, string> = {
  nfe: "NF-e",
  cte: "CT-e",
  nfse: "NFS-e",
  boleto: "Boleto",
  extrato: "Extrato",
  recibo: "Recibo",
  outro: "Outro",
};

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "1.234,56" | "1234.56" | "1234,5" → 123456; empty → null; invalid → NaN */
export function parseMoney(input: string): number | null {
  const s = input.trim().replace(/^R\$\s*/, "");
  if (s === "") return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function centsToInput(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatIsoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function formatDocument(doc: string | null | undefined): string {
  if (!doc) return "—";
  if (doc.length === 14) return `${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5, 8)}/${doc.slice(8, 12)}-${doc.slice(12)}`;
  if (doc.length === 11) return `${doc.slice(0, 3)}.${doc.slice(3, 6)}.${doc.slice(6, 9)}-${doc.slice(9)}`;
  return doc;
}

export interface UploadResult {
  filename: string;
  documentId?: number;
  status: "criado" | "duplicado" | "rejeitado";
  reason?: string;
}

/** Fetch helpers for the raw Express routes (same Clerk bearer token as tRPC). */
export function useInboundApi() {
  const { getToken } = useClerkAuth();

  const authed = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const token = await getToken();
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const res = await fetch(url, { ...init, headers });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erro ${res.status}`);
      }
      return res;
    },
    [getToken]
  );

  const upload = useCallback(
    async (file: File): Promise<UploadResult[]> => {
      const res = await authed("/api/inbound/upload", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-Filename": encodeURIComponent(file.name) },
        body: file,
      });
      return (await res.json()).results;
    },
    [authed]
  );

  const fileBlob = useCallback(async (id: number) => (await authed(`/api/inbound/${id}/file`)).blob(), [authed]);

  const exportCsv = useCallback(
    async (opts: { ids?: number[]; companyId?: number | null } = {}) => {
      const res = await authed("/api/inbound/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts),
      });
      const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "autonf-entrada.csv";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    },
    [authed]
  );

  return { upload, fileBlob, exportCsv };
}
