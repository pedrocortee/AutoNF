import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Building2, Plus, Upload, AlertCircle, KeyRound, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { formatDocument } from "@/lib/inbound";
import { CertificateDialog } from "@/components/inbound/CertificateDialog";

const time = (d: string | Date) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** One line describing the SEFAZ capture for a company. */
function captureStatus(capture: { lastSyncAt: string | Date | null; nextAllowedAt: string | Date | null; statusCode: string | null; statusMessage: string | null } | null) {
  if (!capture?.lastSyncAt) return { text: "Aguardando 1ª consulta", tone: "text-muted-foreground" };
  const next = capture.nextAllowedAt ? ` · próxima ${time(capture.nextAllowedAt)}` : "";
  if (capture.statusCode === "137" || capture.statusCode === "138") return { text: `Em dia · ${time(capture.lastSyncAt)}${next}`, tone: "text-emerald-700" };
  if (capture.statusCode === "656") return { text: `SEFAZ pausou as consultas${next}`, tone: "text-amber-700" };
  return { text: `Erro: ${capture.statusMessage ?? capture.statusCode}${next}`, tone: "text-destructive" };
}

function routedMessage(routed: number, approved: number) {
  if (!routed) return "";
  return ` ${routed} documento(s) atribuído(s)${approved ? `, ${approved} aprovado(s) automaticamente` : ""}.`;
}

export default function Companies() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [showInactive, setShowInactive] = useState(false);
  const listQuery = trpc.companies.list.useQuery({ includeInactive: showInactive }, { enabled: isAuthenticated });
  const createMutation = trpc.companies.create.useMutation();
  const updateMutation = trpc.companies.update.useMutation();
  const importMutation = trpc.companies.bulkImport.useMutation();
  const syncMutation = trpc.companies.syncNow.useMutation();
  const [certCompany, setCertCompany] = useState<{ id: number; name: string; hasCertificate: boolean } | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ document: "", name: "", externalCode: "" });
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");

  useEffect(() => {
    if (!isAuthenticated && !loading) navigate("/");
  }, [isAuthenticated, loading, navigate]);

  const refresh = () => {
    utils.companies.list.invalidate();
    utils.inbound.invalidate();
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      const r = await createMutation.mutateAsync({ document: form.document, name: form.name, externalCode: form.externalCode || undefined });
      toast.success(`Empresa cadastrada.${routedMessage(r.routed, r.approved)}`);
      setForm({ document: "", name: "", externalCode: "" });
      setAddOpen(false);
      refresh();
    } catch (err) {
      toast.error((err as Error).message.includes("CNPJ/CPF inválido") ? "CNPJ/CPF inválido" : (err as Error).message);
    }
  }

  async function handleImport() {
    try {
      const r = await importMutation.mutateAsync({ text: importText });
      toast.success(`${r.created} empresa(s) cadastrada(s).${routedMessage(r.routed, r.approved)}`);
      if (r.skipped.length) {
        toast.warning(`${r.skipped.length} linha(s) ignorada(s): ${r.skipped.slice(0, 3).map((s) => `linha ${s.line} (${s.reason})`).join(", ")}${r.skipped.length > 3 ? "…" : ""}`);
      }
      setImportText("");
      setImportOpen(false);
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function handleSync(companyId: number) {
    try {
      const r = await syncMutation.mutateAsync({ companyId });
      if (!r.ran) toast.info(r.statusMessage ?? "Consulta adiada para não bloquear na SEFAZ.");
      else if (r.statusCode === "137" || r.statusCode === "138") toast.success(`SEFAZ consultada: ${r.received} nota(s) nova(s)${r.summaries ? `, ${r.summaries} resumo(s) aguardando ciência` : ""}.`);
      else toast.warning(`SEFAZ respondeu ${r.statusCode}: ${r.statusMessage}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
    refresh();
  }

  const data = listQuery.data;

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Empresas atendidas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Os documentos enviados vão sozinhos para a empresa cujo CNPJ é o destinatário.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4" />Importar lista
            </Button>
            <Button className="gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4" />Adicionar empresa
            </Button>
          </div>
        </div>

        {data && data.unassigned.total > 0 && (
          <button
            onClick={() => navigate("/entrada?empresa=sem")}
            className="w-full flex items-start gap-2.5 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-left text-amber-900 hover:bg-amber-100/60"
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <span className="font-medium">{data.unassigned.total} documento(s) sem empresa.</span> O destinatário não bate com
              nenhuma empresa cadastrada — cadastre a empresa ou atribua na revisão.
            </span>
          </button>
        )}

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>CNPJ/CPF</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Captura SEFAZ</TableHead>
                <TableHead className="text-right">Revisar</TableHead>
                <TableHead className="text-right">Aprovados</TableHead>
                <TableHead className="text-right">Documentos</TableHead>
                <TableHead className="text-right">Ativa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.companies.map((c) => (
                <TableRow key={c.id} className={c.active ? "" : "opacity-60"}>
                  <TableCell>
                    <button className="font-medium text-foreground hover:underline text-left" onClick={() => navigate(`/entrada?empresa=${c.id}`)}>
                      {c.name}
                    </button>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{formatDocument(c.document)}</TableCell>
                  <TableCell className="text-muted-foreground">{c.externalCode ?? "—"}</TableCell>
                  <TableCell>
                    {c.certificate ? (
                      <div className="flex items-center gap-1.5">
                        <div className="text-xs leading-tight">
                          <button className="text-foreground hover:underline" onClick={() => setCertCompany({ id: c.id, name: c.name, hasCertificate: true })}>
                            A1 até {new Date(c.certificate.validUntil).toLocaleDateString("pt-BR")}
                          </button>
                          <div className={captureStatus(c.capture).tone}>{data?.captureEnv ? captureStatus(c.capture).text : "Captura desligada no servidor"}</div>
                        </div>
                        {data?.captureEnv && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Consultar SEFAZ agora" disabled={syncMutation.isPending} onClick={() => handleSync(c.id)}>
                            <RefreshCw className={`w-3.5 h-3.5 ${syncMutation.isPending && syncMutation.variables?.companyId === c.id ? "animate-spin" : ""}`} />
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setCertCompany({ id: c.id, name: c.name, hasCertificate: false })}>
                        <KeyRound className="w-3.5 h-3.5" />Enviar certificado
                      </Button>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.pending.revisao || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.pending.aprovado || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{c.pending.total || "—"}</TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={c.active}
                      aria-label={c.active ? "Desativar empresa" : "Ativar empresa"}
                      onCheckedChange={async (active) => {
                        await updateMutation.mutateAsync({ id: c.id, active });
                        refresh();
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {data && data.companies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <Building2 className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-foreground font-medium">Nenhuma empresa cadastrada</p>
                    <p className="text-sm text-muted-foreground">Adicione uma a uma ou importe a lista de clientes do escritório.</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} />
          Mostrar empresas desativadas
        </label>
      </div>

      <CertificateDialog company={certCompany} onClose={() => setCertCompany(null)} onSaved={refresh} />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar empresa</DialogTitle>
            <DialogDescription>Documentos já enviados para este CNPJ serão atribuídos a ela.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <Label htmlFor="c-doc">CNPJ ou CPF</Label>
              <Input id="c-doc" className="mt-1" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} placeholder="00.000.000/0000-00" required />
            </div>
            <div>
              <Label htmlFor="c-name">Razão social</Label>
              <Input id="c-name" className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <Label htmlFor="c-code">Código no sistema contábil (opcional)</Label>
              <Input id="c-code" className="mt-1" value={form.externalCode} onChange={(e) => setForm({ ...form, externalCode: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending}>Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Importar lista de empresas</DialogTitle>
            <DialogDescription>
              Cole uma empresa por linha: <span className="font-mono text-xs">CNPJ;Razão social;Código</span>. O código é opcional.
              Dá para colar direto de uma planilha.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={10}
            className="font-mono text-xs"
            placeholder={"12.345.678/0001-95;Padaria Pão Quente Ltda;101\n98.765.432/0001-98;Oficina Mecânica Sul;102"}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button disabled={!importText.trim() || importMutation.isPending} onClick={handleImport}>Importar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
