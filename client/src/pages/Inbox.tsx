import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Download, Search, Sparkles, FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { UploadDropzone } from "@/components/inbound/UploadDropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  DOC_TYPE_LABEL,
  STATUS_LABEL,
  STATUS_STYLE,
  formatCents,
  formatDocument,
  formatIsoDate,
  useInboundApi,
  type InboundStatus,
} from "@/lib/inbound";

const FILTERS: { key: InboundStatus | "todos"; label: string }[] = [
  { key: "revisao", label: "Revisar" },
  { key: "aprovado", label: "Aprovados" },
  { key: "exportado", label: "Exportados" },
  { key: "erro", label: "Com erro" },
  { key: "processando", label: "Processando" },
  { key: "descartado", label: "Descartados" },
  { key: "todos", label: "Todos" },
];

const PAGE_SIZE = 25;

export default function Inbox() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const { exportCsv } = useInboundApi();
  const search_ = useSearch();
  const [filter, setFilter] = useState<InboundStatus | "todos">("revisao");
  // undefined = all companies, null = without company, number = one company. Synced with ?empresa=
  const empresaParam = new URLSearchParams(search_).get("empresa");
  const [companyId, setCompanyId] = useState<number | null | undefined>(
    empresaParam === "sem" ? null : empresaParam ? Number(empresaParam) : undefined
  );
  const companiesQuery = trpc.companies.list.useQuery({ includeInactive: true }, { enabled: isAuthenticated });
  const companyNames = new Map((companiesQuery.data?.companies ?? []).map((c) => [c.id, c.name]));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Poll counters (and the list, below) only while documents are queued or processing
  const countsQuery = trpc.inbound.counts.useQuery({ companyId }, {
    enabled: isAuthenticated,
    refetchInterval: (q) => ((q.state.data?.recebido ?? 0) + (q.state.data?.processando ?? 0) > 0 ? 3000 : false),
  });
  const inFlight = (countsQuery.data?.recebido ?? 0) + (countsQuery.data?.processando ?? 0);
  const listQuery = trpc.inbound.list.useQuery(
    { status: filter === "todos" ? undefined : filter, companyId, search: search || undefined, page, pageSize: PAGE_SIZE },
    { enabled: isAuthenticated, refetchInterval: inFlight > 0 ? 3000 : false }
  );

  useEffect(() => {
    if (!isAuthenticated && !loading) navigate("/");
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => setPage(1), [filter, search, companyId]);

  function changeCompany(value: string) {
    const next = value === "" ? undefined : value === "sem" ? null : Number(value);
    setCompanyId(next);
    navigate(value ? `/entrada?empresa=${value}` : "/entrada", { replace: true });
  }

  const refresh = () => {
    countsQuery.refetch();
    listQuery.refetch();
  };

  async function handleExport() {
    setExporting(true);
    try {
      await exportCsv({ companyId });
      toast.success("Planilha gerada — documentos marcados como exportados");
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const counts = countsQuery.data;
  const approved = counts?.aprovado ?? 0;
  const data = listQuery.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Entrada de documentos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Notas e boletos recebidos, conferidos automaticamente. Você só revisa o que ficou em dúvida.
            </p>
          </div>
          <Button onClick={handleExport} disabled={approved === 0 || exporting} className="gap-2">
            <Download className="w-4 h-4" />
            Exportar aprovados{approved ? ` (${approved})` : ""}
          </Button>
        </div>

        <UploadDropzone onUploaded={refresh} />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar por status">
            {FILTERS.map((f) => {
              const n = f.key === "todos" ? null : counts?.[f.key];
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm border transition-colors",
                    active ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                  {n ? <span className={cn("ml-1.5 tabular-nums", active ? "opacity-80" : "text-foreground")}>{n}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <select
            aria-label="Filtrar por empresa"
            value={companyId === undefined ? "" : companyId === null ? "sem" : String(companyId)}
            onChange={(e) => changeCompany(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm max-w-[240px]"
          >
            <option value="">Todas as empresas</option>
            <option value="sem">Sem empresa</option>
            {companiesQuery.data?.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Emitente, CNPJ, chave ou arquivo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          </div>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Documento</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Emitente</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Leitura</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((d) => (
                <TableRow key={d.id} className="cursor-pointer" onClick={() => navigate(`/entrada/${d.id}`)}>
                  <TableCell>
                    <div className="font-medium text-foreground">{d.docType ? DOC_TYPE_LABEL[d.docType] : "—"}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-[180px]" title={d.originalFilename}>
                      {d.originalFilename}
                    </div>
                  </TableCell>
                  <TableCell>
                    {d.companyId !== null ? (
                      <div className="truncate max-w-[160px] text-sm">{companyNames.get(d.companyId) ?? `#${d.companyId}`}</div>
                    ) : (
                      <span className="text-xs text-amber-700">Sem empresa</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="truncate max-w-[200px]">{d.issuerName ?? "—"}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{formatDocument(d.issuerDocument)}</div>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatIsoDate(d.issueDate)}</TableCell>
                  <TableCell className="tabular-nums">{formatIsoDate(d.dueDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCents(d.totalCents)}</TableCell>
                  <TableCell>
                    {d.method === "xml" && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><FileCode2 className="w-3.5 h-3.5" />XML</span>
                    )}
                    {d.method === "llm" && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Sparkles className="w-3.5 h-3.5" />IA {d.confidence ? `· ${Math.round(Number(d.confidence) * 100)}%` : ""}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-flex px-2.5 py-1 rounded-full text-xs font-medium", STATUS_STYLE[d.status])}>
                      {STATUS_LABEL[d.status]}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {data && data.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-sm text-muted-foreground">
                    {filter === "revisao" ? "Nada para revisar. 🎉" : "Nenhum documento aqui."}
                  </TableCell>
                </TableRow>
              )}
              {!data && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-sm text-muted-foreground">Carregando…</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-end gap-2 text-sm">
            <span className="text-muted-foreground tabular-nums">Página {page} de {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Próxima</Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
