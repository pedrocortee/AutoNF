import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Plus, Pencil, Trash2, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { DOC_TYPE_LABEL, formatDocument } from "@/lib/inbound";

type DocType = "nfe" | "cte" | "nfse" | "boleto" | "extrato" | "recibo" | "outro";

interface RuleForm {
  name: string;
  companyId: number | null;
  matchIssuerDocument: string;
  matchDocType: DocType | null;
  matchKeyword: string;
  account: string;
  costCenter: string;
  historyTemplate: string;
  priority: number;
  active: boolean;
}

const EMPTY: RuleForm = {
  name: "", companyId: null, matchIssuerDocument: "", matchDocType: null, matchKeyword: "",
  account: "", costCenter: "", historyTemplate: "{tipo} {numero} - {emitente}", priority: 100, active: true,
};

const selectClass = "mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm";

export default function Rules() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const utils = trpc.useUtils();
  const rulesQuery = trpc.rules.list.useQuery(undefined, { enabled: isAuthenticated });
  const companiesQuery = trpc.companies.list.useQuery({ includeInactive: true }, { enabled: isAuthenticated });
  const createMutation = trpc.rules.create.useMutation();
  const updateMutation = trpc.rules.update.useMutation();
  const deleteMutation = trpc.rules.delete.useMutation();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RuleForm>(EMPTY);

  useEffect(() => {
    if (!isAuthenticated && !loading) navigate("/");
  }, [isAuthenticated, loading, navigate]);

  // /regras?novo=1&emitente=CNPJ&nome=Fornecedor&empresa=ID — prefilled from the review screen
  useEffect(() => {
    const p = new URLSearchParams(search);
    if (p.get("novo") !== "1") return;
    const empresa = p.get("empresa");
    setForm({
      ...EMPTY,
      name: p.get("nome") ? `Fornecedor ${p.get("nome")}` : "",
      matchIssuerDocument: p.get("emitente") ?? "",
      companyId: empresa ? Number(empresa) : null,
    });
    setEditingId(null);
    setOpen(true);
    navigate("/regras", { replace: true });
  }, [search]);

  const companies = companiesQuery.data?.companies ?? [];
  const companyName = (id: number | null) => (id === null ? "Todas" : companies.find((c) => c.id === id)?.name ?? `#${id}`);

  function openEdit(r: NonNullable<typeof rulesQuery.data>[number]) {
    setEditingId(r.id);
    setForm({
      name: r.name, companyId: r.companyId, matchIssuerDocument: r.matchIssuerDocument ?? "", matchDocType: r.matchDocType,
      matchKeyword: r.matchKeyword ?? "", account: r.account, costCenter: r.costCenter ?? "",
      historyTemplate: r.historyTemplate ?? "", priority: r.priority, active: r.active,
    });
    setOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const rule = { ...form, matchIssuerDocument: form.matchIssuerDocument || null, matchKeyword: form.matchKeyword || null, costCenter: form.costCenter || null, historyTemplate: form.historyTemplate || null };
    try {
      if (editingId) await updateMutation.mutateAsync({ id: editingId, rule });
      else await createMutation.mutateAsync(rule);
      toast.success(editingId ? "Regra atualizada" : "Regra criada");
      setOpen(false);
      utils.rules.list.invalidate();
      utils.inbound.get.invalidate();
    } catch (err) {
      const msg = (err as Error).message;
      toast.error(msg.includes("pelo menos um critério") ? "Informe pelo menos um critério: emitente, tipo ou palavra-chave" : msg);
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex flex-wrap justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Regras de lançamento</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Definem conta, centro de custo e histórico de cada documento na exportação. A primeira regra que combinar vale.
            </p>
          </div>
          <Button className="gap-2" onClick={() => { setEditingId(null); setForm(EMPTY); setOpen(true); }}>
            <Plus className="w-4 h-4" />Nova regra
          </Button>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regra</TableHead>
                <TableHead>Quando</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Centro de custo</TableHead>
                <TableHead className="text-right">Prioridade</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rulesQuery.data?.map((r) => (
                <TableRow key={r.id} className={r.active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[
                      r.matchIssuerDocument && `emitente ${formatDocument(r.matchIssuerDocument)}`,
                      r.matchDocType && DOC_TYPE_LABEL[r.matchDocType],
                      r.matchKeyword && `contém “${r.matchKeyword}”`,
                    ].filter(Boolean).join(" · ")}
                  </TableCell>
                  <TableCell className="text-sm">{companyName(r.companyId)}</TableCell>
                  <TableCell className="font-mono text-xs">{r.account}</TableCell>
                  <TableCell className="text-sm">{r.costCenter ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.priority}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button variant="ghost" size="icon" aria-label="Editar regra" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Excluir regra" onClick={async () => {
                      if (!confirm(`Excluir a regra "${r.name}"?`)) return;
                      await deleteMutation.mutateAsync({ id: r.id });
                      utils.rules.list.invalidate();
                    }}><Trash2 className="w-4 h-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {rulesQuery.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <ListChecks className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-foreground font-medium">Nenhuma regra ainda</p>
                    <p className="text-sm text-muted-foreground">Crie a partir da tela de revisão de um documento ou aqui.</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar regra" : "Nova regra"}</DialogTitle>
            <DialogDescription>Todos os critérios preenchidos precisam combinar.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label htmlFor="r-name">Nome</Label>
              <Input id="r-name" className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Energia elétrica" required />
            </div>
            <fieldset className="grid grid-cols-2 gap-3 rounded-md border border-border p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quando</legend>
              <div>
                <Label htmlFor="r-issuer">CNPJ do emitente</Label>
                <Input id="r-issuer" className="mt-1 font-mono text-xs" value={form.matchIssuerDocument} onChange={(e) => setForm({ ...form, matchIssuerDocument: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="r-type">Tipo de documento</Label>
                <select id="r-type" className={selectClass} value={form.matchDocType ?? ""} onChange={(e) => setForm({ ...form, matchDocType: (e.target.value || null) as DocType | null })}>
                  <option value="">Qualquer</option>
                  {Object.entries(DOC_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <Label htmlFor="r-kw">Contém a palavra (emitente, serviço ou itens)</Label>
                <Input id="r-kw" className="mt-1" value={form.matchKeyword} onChange={(e) => setForm({ ...form, matchKeyword: e.target.value })} placeholder="Ex.: aluguel" />
              </div>
              <div className="col-span-2">
                <Label htmlFor="r-company">Empresa</Label>
                <select id="r-company" className={selectClass} value={form.companyId ?? ""} onChange={(e) => setForm({ ...form, companyId: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Todas as empresas</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="r-account">Conta contábil</Label>
                <Input id="r-account" className="mt-1 font-mono text-xs" value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} placeholder="Ex.: 3.1.02.005" required />
              </div>
              <div>
                <Label htmlFor="r-cc">Centro de custo</Label>
                <Input id="r-cc" className="mt-1" value={form.costCenter} onChange={(e) => setForm({ ...form, costCenter: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="r-hist">Histórico</Label>
                <Input id="r-hist" className="mt-1" value={form.historyTemplate} onChange={(e) => setForm({ ...form, historyTemplate: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">
                  Use {"{tipo} {numero} {emitente} {cnpj_emitente} {emissao} {vencimento} {valor}"}
                </p>
              </div>
              <div>
                <Label htmlFor="r-prio">Prioridade (menor vale primeiro)</Label>
                <Input id="r-prio" type="number" min={0} max={1000} className="mt-1" value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} />
              </div>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <Switch checked={form.active} onCheckedChange={(active) => setForm({ ...form, active })} />Ativa
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
