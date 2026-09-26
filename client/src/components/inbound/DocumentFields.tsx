import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { DOC_TYPE_LABEL, centsToInput, formatCents } from "@/lib/inbound";

/** Mirrors server/_core/inbound/schemas.ts ExtractedDocument (kept structural to avoid importing server code). */
export interface EditableDocument {
  docType: "nfe" | "cte" | "nfse" | "boleto" | "extrato" | "recibo" | "outro";
  number: string | null;
  series: string | null;
  accessKey: string | null;
  issueDate: string | null;
  dueDate: string | null;
  issuer: { document: string | null; name: string | null };
  recipient: { document: string | null; name: string | null };
  totalCents: number | null;
  items: { description: string; quantity: number | null; unitValueCents: number | null; totalCents: number; ncm: string | null; cfop: string | null }[];
  taxes: Record<"icmsCents" | "ipiCents" | "pisCents" | "cofinsCents" | "issCents" | "ibsCents" | "cbsCents", number | null>;
  boleto: { digitableLine: string | null; bankName: string | null } | null;
  serviceDescription: string | null;
}

/** Form state keeps money as typed text so partial input ("12,") is not lost. */
export type MoneyDraft = Record<"total" | keyof EditableDocument["taxes"], string>;

export function moneyDraftFrom(doc: EditableDocument): MoneyDraft {
  return {
    total: centsToInput(doc.totalCents),
    icmsCents: centsToInput(doc.taxes.icmsCents),
    ipiCents: centsToInput(doc.taxes.ipiCents),
    pisCents: centsToInput(doc.taxes.pisCents),
    cofinsCents: centsToInput(doc.taxes.cofinsCents),
    issCents: centsToInput(doc.taxes.issCents),
    ibsCents: centsToInput(doc.taxes.ibsCents),
    cbsCents: centsToInput(doc.taxes.cbsCents),
  };
}

const TAX_LABEL: Record<keyof EditableDocument["taxes"], string> = {
  icmsCents: "ICMS", ipiCents: "IPI", pisCents: "PIS", cofinsCents: "COFINS", issCents: "ISS", ibsCents: "IBS", cbsCents: "CBS",
};

interface Props {
  doc: EditableDocument;
  money: MoneyDraft;
  readOnly: boolean;
  /** Field paths with validation issues, e.g. "issuer.document" */
  flagged: Set<string>;
  onChange: (doc: EditableDocument) => void;
  onMoneyChange: (money: MoneyDraft) => void;
}

const onlyChars = (v: string) => v.replace(/[^0-9A-Za-z]/g, "").toUpperCase() || null;

export function DocumentFields({ doc, money, readOnly, flagged, onChange, onMoneyChange }: Props) {
  const field = (path: string, label: string, value: string, set: (v: string) => void, opts: { type?: string; mono?: boolean; span?: boolean } = {}) => (
    <div className={cn(opts.span && "col-span-2")}>
      <Label htmlFor={path} className={cn(flagged.has(path) && "text-red-700")}>{label}</Label>
      <Input
        id={path}
        type={opts.type ?? "text"}
        value={value}
        readOnly={readOnly}
        onChange={(e) => set(e.target.value)}
        aria-invalid={flagged.has(path)}
        className={cn("mt-1", opts.mono && "font-mono text-xs", flagged.has(path) && "border-red-400 focus-visible:ring-red-300")}
      />
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="docType">Tipo</Label>
          <select
            id="docType"
            value={doc.docType}
            disabled={readOnly}
            onChange={(e) => onChange({ ...doc, docType: e.target.value as EditableDocument["docType"] })}
            className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {field("number", "Número", doc.number ?? "", (v) => onChange({ ...doc, number: v || null }))}
          {field("series", "Série", doc.series ?? "", (v) => onChange({ ...doc, series: v || null }))}
        </div>
        {field("issueDate", "Emissão", doc.issueDate ?? "", (v) => onChange({ ...doc, issueDate: v || null }), { type: "date" })}
        {field("dueDate", "Vencimento", doc.dueDate ?? "", (v) => onChange({ ...doc, dueDate: v || null }), { type: "date" })}
        {field("accessKey", "Chave de acesso", doc.accessKey ?? "", (v) => onChange({ ...doc, accessKey: onlyChars(v) }), { mono: true, span: true })}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <h3 className="col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Emitente</h3>
        {field("issuer.document", "CNPJ/CPF", doc.issuer.document ?? "", (v) => onChange({ ...doc, issuer: { ...doc.issuer, document: onlyChars(v) } }), { mono: true })}
        {field("issuer.name", "Razão social", doc.issuer.name ?? "", (v) => onChange({ ...doc, issuer: { ...doc.issuer, name: v || null } }))}
        <h3 className="col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">Destinatário / tomador</h3>
        {field("recipient.document", "CNPJ/CPF", doc.recipient.document ?? "", (v) => onChange({ ...doc, recipient: { ...doc.recipient, document: onlyChars(v) } }), { mono: true })}
        {field("recipient.name", "Razão social", doc.recipient.name ?? "", (v) => onChange({ ...doc, recipient: { ...doc.recipient, name: v || null } }))}
      </section>

      <section className="grid grid-cols-4 gap-3">
        <h3 className="col-span-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valores (R$)</h3>
        <div className="col-span-2">
          {field("totalCents", "Valor total", money.total, (v) => onMoneyChange({ ...money, total: v }))}
        </div>
        {(Object.keys(TAX_LABEL) as (keyof EditableDocument["taxes"])[]).map((k) => (
          <div key={k}>{field(`taxes.${k}`, TAX_LABEL[k], money[k], (v) => onMoneyChange({ ...money, [k]: v }))}</div>
        ))}
      </section>

      {(doc.docType === "boleto" || doc.boleto) && (
        <section className="grid grid-cols-2 gap-3">
          <h3 className="col-span-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Boleto</h3>
          {field("boleto.digitableLine", "Linha digitável", doc.boleto?.digitableLine ?? "", (v) =>
            onChange({ ...doc, boleto: { bankName: doc.boleto?.bankName ?? null, digitableLine: v.replace(/\D/g, "") || null } }), { mono: true, span: true })}
          {field("boleto.bankName", "Banco", doc.boleto?.bankName ?? "", (v) =>
            onChange({ ...doc, boleto: { digitableLine: doc.boleto?.digitableLine ?? null, bankName: v || null } }))}
        </section>
      )}

      {(doc.docType === "nfse" || doc.serviceDescription) &&
        field("serviceDescription", "Descrição do serviço", doc.serviceDescription ?? "", (v) => onChange({ ...doc, serviceDescription: v || null }), { span: true })}

      {doc.items.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Itens ({doc.items.length})</h3>
          <div className="rounded-md border border-border divide-y divide-border text-sm max-h-60 overflow-auto">
            {doc.items.map((it, i) => (
              <div key={i} className="flex justify-between gap-3 px-3 py-2">
                <span className="truncate">{it.description}</span>
                <span className="tabular-nums shrink-0 text-muted-foreground">
                  {it.quantity !== null ? `${it.quantity.toLocaleString("pt-BR")} × ` : ""}{formatCents(it.totalCents)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
