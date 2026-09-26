import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { AlertCircle, AlertTriangle, ArrowLeft, Check, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { DocumentFields, moneyDraftFrom, type EditableDocument, type MoneyDraft } from "@/components/inbound/DocumentFields";
import { FileViewer } from "@/components/inbound/FileViewer";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { DOC_TYPE_LABEL, STATUS_LABEL, STATUS_STYLE, parseMoney } from "@/lib/inbound";

function applyMoney(doc: EditableDocument, money: MoneyDraft): EditableDocument | string {
  const total = parseMoney(money.total);
  if (Number.isNaN(total)) return "Valor total inválido";
  const taxes = { ...doc.taxes };
  for (const k of Object.keys(taxes) as (keyof typeof taxes)[]) {
    const v = parseMoney(money[k]);
    if (Number.isNaN(v)) return `Valor de ${k.replace("Cents", "").toUpperCase()} inválido`;
    taxes[k] = v;
  }
  return { ...doc, totalCents: total, taxes };
}

export default function DocumentReview() {
  const { isAuthenticated, loading } = useAuth();
  const [, params] = useRoute("/entrada/:id");
  const [, navigate] = useLocation();
  const id = Number(params?.id);
  const utils = trpc.useUtils();

  const query = trpc.inbound.get.useQuery({ id }, { enabled: isAuthenticated && Number.isInteger(id) });
  const nextQuery = trpc.inbound.list.useQuery({ status: "revisao", page: 1, pageSize: 2 }, { enabled: isAuthenticated });
  const updateMutation = trpc.inbound.update.useMutation();
  const approveMutation = trpc.inbound.approve.useMutation();
  const discardMutation = trpc.inbound.discard.useMutation();
  const reprocessMutation = trpc.inbound.reprocess.useMutation();

  const [doc, setDoc] = useState<EditableDocument | null>(null);
  const [money, setMoney] = useState<MoneyDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardReason, setDiscardReason] = useState("");

  const record = query.data?.document;
  useEffect(() => {
    if (record?.extracted) {
      setDoc(record.extracted as EditableDocument);
      setMoney(moneyDraftFrom(record.extracted as EditableDocument));
      setDirty(false);
    }
  }, [record?.id, record?.updatedAt]);

  useEffect(() => {
    if (!isAuthenticated && !loading) navigate("/");
  }, [isAuthenticated, loading, navigate]);

  const issues = record?.issues ?? [];
  const errors = issues.filter((i) => i.severity === "error");
  const flagged = useMemo(() => new Set(issues.map((i) => i.field).filter((f): f is string => !!f)), [issues]);
  const editable = record?.status === "revisao" || record?.status === "aprovado";
  const nextId = nextQuery.data?.items.find((d) => d.id !== id)?.id;

  const invalidate = () => {
    utils.inbound.get.invalidate({ id });
    utils.inbound.list.invalidate();
    utils.inbound.counts.invalidate();
  };

  async function save(): Promise<boolean> {
    if (!doc || !money) return false;
    const merged = applyMoney(doc, money);
    if (typeof merged === "string") {
      toast.error(merged);
      return false;
    }
    try {
      const { issues: newIssues } = await updateMutation.mutateAsync({ id, extracted: merged });
      setDirty(false);
      await utils.inbound.get.invalidate({ id });
      const errs = newIssues.filter((i) => i.severity === "error").length;
      toast[errs ? "warning" : "success"](errs ? `Salvo, mas ainda há ${errs} erro(s)` : "Correções salvas");
      return errs === 0;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }

  async function approve() {
    if (dirty && !(await save())) return;
    try {
      await approveMutation.mutateAsync({ id });
      toast.success("Documento aprovado");
      invalidate();
      navigate(nextId ? `/entrada/${nextId}` : "/entrada");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function discard() {
    try {
      await discardMutation.mutateAsync({ id, reason: discardReason.trim() });
      setDiscardOpen(false);
      setDiscardReason("");
      toast.success("Documento descartado");
      invalidate();
      navigate(nextId ? `/entrada/${nextId}` : "/entrada");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Ctrl/Cmd+Enter approves (saving first) — the reviewer's main loop stays on the keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && record?.status === "revisao") {
        e.preventDefault();
        approve();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!record) {
    return (
      <DashboardLayout>
        <div className="py-12 text-center text-sm text-muted-foreground">{query.error ? query.error.message : "Carregando…"}</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate("/entrada")} aria-label="Voltar">
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground tracking-tight truncate">
                {record.docType ? DOC_TYPE_LABEL[record.docType] : "Documento"} {record.issuerName ? `· ${record.issuerName}` : ""}
              </h1>
              <p className="text-xs text-muted-foreground truncate">
                #{record.id} · {record.originalFilename} · {record.method === "xml" ? "lido do XML" : record.method === "llm" ? "lido pela IA" : "não lido"}
              </p>
            </div>
            <span className={cn("shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-medium", STATUS_STYLE[record.status])}>
              {STATUS_LABEL[record.status]}
            </span>
          </div>
          <div className="flex gap-2">
            {record.status === "erro" && (
              <Button variant="outline" className="gap-2" disabled={reprocessMutation.isPending}
                onClick={async () => { await reprocessMutation.mutateAsync({ id }); toast.success("Reenviado para processamento"); invalidate(); }}>
                <RotateCcw className="w-4 h-4" />Reprocessar
              </Button>
            )}
            {record.status !== "exportado" && record.status !== "descartado" && (
              <Button variant="outline" className="gap-2" onClick={() => setDiscardOpen(true)}>
                <Trash2 className="w-4 h-4" />Descartar
              </Button>
            )}
            {editable && (
              <Button variant="outline" className="gap-2" disabled={!dirty || updateMutation.isPending} onClick={save}>
                <Save className="w-4 h-4" />Salvar
              </Button>
            )}
            {record.status === "revisao" && (
              <Button className="gap-2" disabled={(!dirty && errors.length > 0) || approveMutation.isPending} onClick={approve}
                title="Ctrl+Enter">
                <Check className="w-4 h-4" />Aprovar
              </Button>
            )}
          </div>
        </div>

        {record.errorMessage && (
          <div className="flex gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{record.errorMessage}
          </div>
        )}
        {issues.length > 0 && (
          <ul className="rounded-md border border-border divide-y divide-border text-sm">
            {issues.map((i, n) => (
              <li key={n} className="flex gap-2 px-4 py-2">
                {i.severity === "error"
                  ? <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />}
                <span className={i.severity === "error" ? "text-red-800" : "text-amber-900"}>{i.message}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="grid lg:grid-cols-2 gap-4 items-start">
          <div className="rounded-lg border border-border bg-muted/30 overflow-hidden lg:sticky lg:top-4 h-[70vh]">
            <FileViewer id={record.id} mediaType={record.mediaType} />
          </div>
          <div className="rounded-lg border border-border p-5">
            {doc && money ? (
              <DocumentFields
                doc={doc}
                money={money}
                readOnly={!editable}
                flagged={flagged}
                onChange={(d) => { setDoc(d); setDirty(true); }}
                onMoneyChange={(m) => { setMoney(m); setDirty(true); }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">Os dados aparecem aqui quando o processamento terminar.</p>
            )}
            {query.data?.events && (
              <details className="mt-6 text-sm">
                <summary className="cursor-pointer text-muted-foreground">Histórico ({query.data.events.length})</summary>
                <ol className="mt-2 space-y-1.5">
                  {query.data.events.map((e) => (
                    <li key={e.id} className="text-xs text-muted-foreground">
                      <span className="tabular-nums">{new Date(e.createdAt).toLocaleString("pt-BR")}</span> —{" "}
                      {e.fromStatus ? `${STATUS_LABEL[e.fromStatus]} → ` : ""}{STATUS_LABEL[e.toStatus]}
                      {e.note ? ` · ${e.note}` : ""}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </div>
        </div>
      </div>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Descartar documento</DialogTitle>
            <DialogDescription>Ele sai da fila e não será exportado. O motivo fica no histórico.</DialogDescription>
          </DialogHeader>
          <Textarea placeholder="Ex.: não é desta empresa, documento duplicado, cópia ilegível" value={discardReason}
            onChange={(e) => setDiscardReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={discardReason.trim().length < 3 || discardMutation.isPending} onClick={discard}>
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
