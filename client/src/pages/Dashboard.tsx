import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, AlertCircle, ChevronDown, ChevronUp, FileText, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { PlanUsageCard } from "@/components/PlanUsageCard";
import { MonthPicker } from "@/components/ui/month-picker";

export default function Dashboard() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [filters, setFilters] = useState({ status: undefined as any, clientName: "", competenceMonth: "" });
  const [processingInvoices, setProcessingInvoices] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 10;
  const [showRetentions, setShowRetentions] = useState(false);
  const [formData, setFormData] = useState({
    clientName: "",
    takerType: "CNPJ" as "CPF" | "CNPJ",
    takerCPFCNPJ: "",
    serviceDescription: "",
    value: "",
    competenceMonth: new Date().toISOString().slice(0, 7),
    tomadorEmail: "",
    retentions: { irpj: 0, csll: 0, cofins: 0, pis: 0, inss: 0 },
  });

  const subscriptionQuery = trpc.plans.getSubscription.useQuery();
  const hasActivePlan = subscriptionQuery.data?.status === "active";

  const metricsQuery = trpc.invoices.metrics.useQuery();
  const certExpiryQuery = trpc.certificates.expirySoon.useQuery();
  const listQuery = trpc.invoices.list.useQuery({
    ...filters,
    limit: ITEMS_PER_PAGE,
    offset: page * ITEMS_PER_PAGE,
  });
  const createMutation = trpc.invoices.create.useMutation();
  const submitRPSMutation = trpc.nfse.submitRPS.useMutation();
  const [pollingInvoiceId, setPollingInvoiceId] = useState<number | null>(null);
  const statusQuery = trpc.nfse.status.useQuery(
    { invoiceId: pollingInvoiceId ?? 0 },
    { enabled: !!pollingInvoiceId, refetchInterval: 2000 }
  );

  useEffect(() => {
    if (!isAuthenticated && !loading) {
      navigate("/");
    }
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    if (!pollingInvoiceId || !statusQuery.data) return;
    const { status, errorMessage } = statusQuery.data;
    if (status === "Processado" || status === "Erro") {
      setPollingInvoiceId(null);
      setProcessingInvoices(prev => prev.filter(id => id !== pollingInvoiceId));
      if (status === "Processado") toast.success("Nota fiscal emitida com sucesso!");
      else toast.error(`Erro ao emitir: ${errorMessage ?? "Erro desconhecido"}`);
      listQuery.refetch();
      metricsQuery.refetch();
    }
  }, [statusQuery.data?.status, pollingInvoiceId]);

  if (loading || !isAuthenticated) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-slate-400">Carregando...</div>
        </div>
      </DashboardLayout>
    );
  }

  const handleCreateInvoice = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.clientName || !formData.serviceDescription || !formData.value) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      const result = await createMutation.mutateAsync({
        clientName: formData.clientName,
        takerType: formData.takerCPFCNPJ ? formData.takerType : undefined,
        takerCPFCNPJ: formData.takerCPFCNPJ || undefined,
        serviceDescription: formData.serviceDescription,
        value: parseFloat(formData.value),
        competenceMonth: formData.competenceMonth,
        tomadorEmail: formData.tomadorEmail || undefined,
        retentions: formData.retentions,
      });

      toast.success("Nota fiscal criada! Enviando para processamento...");
      setFormData({
        clientName: "",
        takerType: "CNPJ",
        takerCPFCNPJ: "",
        serviceDescription: "",
        value: "",
        competenceMonth: new Date().toISOString().slice(0, 7),
        tomadorEmail: "",
        retentions: { irpj: 0, csll: 0, cofins: 0, pis: 0, inss: 0 },
      });
      setShowRetentions(false);
      setIsOpen(false);

      setPage(0);
      setProcessingInvoices(prev => [...prev, result.id]);
      try {
        await submitRPSMutation.mutateAsync({ invoiceId: result.id });
        setPollingInvoiceId(result.id);
        listQuery.refetch();
      } catch (submitError: any) {
        setProcessingInvoices(prev => prev.filter(id => id !== result.id));
        toast.error(`Erro ao enfileirar emissão: ${submitError?.message ?? "Erro desconhecido"}`);
      }
    } catch (error: any) {
      const message: string = error?.message ?? "";
      const isLimitError = message.includes("Limite") || message.includes("plano ativo");
      if (isLimitError) {
        setIsOpen(false);
        toast.error(message || "Limite de emissões atingido", {
          description: "Faça upgrade do seu plano para continuar emitindo notas.",
          action: { label: "Ver Planos", onClick: () => navigate("/plans") },
        });
      } else {
        toast.error("Erro ao criar nota fiscal");
      }
    }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; icon?: React.ReactNode }> = {
      Pendente:    { bg: "bg-amber-50 dark:bg-amber-950/40",   text: "text-amber-700 dark:text-amber-400",   icon: <Clock className="w-3 h-3" /> },
      Processando: { bg: "bg-blue-50 dark:bg-blue-950/40",    text: "text-blue-700 dark:text-blue-400",    icon: <Loader2 className="w-3 h-3 animate-spin" /> },
      Processado:  { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", icon: <CheckCircle2 className="w-3 h-3" /> },
      Erro:        { bg: "bg-red-50 dark:bg-red-950/40",     text: "text-red-700 dark:text-red-400",     icon: <AlertCircle className="w-3 h-3" /> },
      Cancelado:   { bg: "bg-muted",  text: "text-muted-foreground",  icon: <XCircle className="w-3 h-3" /> },
    };
    const s = map[status] ?? { bg: "bg-muted", text: "text-muted-foreground" };
    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${s.bg} ${s.text}`}>
        {s.icon}
        {status}
      </span>
    );
  };

  const formatValue = (cents: number) => {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString("pt-BR");
  };

  const metrics = metricsQuery.data;
  const invoices = listQuery.data || [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Plan Usage Card */}
        <PlanUsageCard />

        {/* Certificate expiry alert */}
        {certExpiryQuery.data && (
          <div className="flex items-start gap-2.5 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">Certificado expirando em {certExpiryQuery.data.daysLeft} dia(s).</span>{" "}
              {certExpiryQuery.data.filename} vence em{" "}
              {certExpiryQuery.data.validUntil
                ? new Date(certExpiryQuery.data.validUntil).toLocaleDateString("pt-BR")
                : "breve"}.{" "}
              <a href="/settings" className="underline text-foreground">Renove em Configurações</a>.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Notas Fiscais</h1>
            <p className="text-sm text-muted-foreground mt-1">Bem-vindo de volta, {user?.name?.split(" ")[0] || "usuário"} 👋</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button
                className="gap-2 shadow-sm shadow-indigo-200"
                onClick={(e) => {
                  if (!hasActivePlan) {
                    e.preventDefault();
                    navigate("/plans");
                  }
                }}
              >
                <Plus className="w-4 h-4" />
                Nova Nota Fiscal
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Criar Nova Nota Fiscal</DialogTitle>
                <DialogDescription>
                  Preencha os dados para criar uma nova nota fiscal. A emissão será enviada à SEFIN automaticamente.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleCreateInvoice} className="space-y-4">
                <div>
                  <Label htmlFor="clientName">Cliente (Tomador) *</Label>
                  <Input
                    id="clientName"
                    placeholder="Nome do cliente"
                    value={formData.clientName}
                    onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label htmlFor="takerType">Tipo doc. tomador</Label>
                    <select
                      id="takerType"
                      value={formData.takerType}
                      onChange={(e) => setFormData({ ...formData, takerType: e.target.value as "CPF" | "CNPJ" })}
                      className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="CNPJ">CNPJ</option>
                      <option value="CPF">CPF</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="takerCPFCNPJ">CPF/CNPJ do tomador (opcional)</Label>
                    <Input
                      id="takerCPFCNPJ"
                      placeholder={formData.takerType === "CPF" ? "00000000000" : "00000000000000"}
                      value={formData.takerCPFCNPJ}
                      onChange={(e) => setFormData({ ...formData, takerCPFCNPJ: e.target.value.replace(/\D/g, "") })}
                      className="mt-1"
                      maxLength={formData.takerType === "CPF" ? 11 : 14}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="serviceDescription">Descrição do Serviço *</Label>
                  <Textarea
                    id="serviceDescription"
                    placeholder="Descreva o serviço prestado"
                    value={formData.serviceDescription}
                    onChange={(e) => setFormData({ ...formData, serviceDescription: e.target.value })}
                    className="mt-1 min-h-24"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="value">Valor (R$) *</Label>
                    <Input
                      id="value"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formData.value}
                      onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="competenceMonth">Competência *</Label>
                    <Input
                      id="competenceMonth"
                      type="month"
                      value={formData.competenceMonth}
                      onChange={(e) => setFormData({ ...formData, competenceMonth: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="tomadorEmail">Email do tomador (opcional)</Label>
                  <Input
                    id="tomadorEmail"
                    type="email"
                    placeholder="cliente@empresa.com"
                    value={formData.tomadorEmail}
                    onChange={(e) => setFormData({ ...formData, tomadorEmail: e.target.value })}
                    className="mt-1"
                  />
                </div>

                {/* Retenções (colapsável) */}
                <div className="border border-border rounded-lg">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 rounded-lg"
                    onClick={() => setShowRetentions(!showRetentions)}
                  >
                    Retenções de impostos (opcional — tomador PJ)
                    {showRetentions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showRetentions && (
                    <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                      {(["irpj", "csll", "cofins", "pis", "inss"] as const).map((field) => (
                        <div key={field}>
                          <Label className="text-xs uppercase text-muted-foreground">{field.toUpperCase()} (R$)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={formData.retentions[field] || ""}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                retentions: {
                                  ...formData.retentions,
                                  [field]: parseFloat(e.target.value) || 0,
                                },
                              })
                            }
                            className="mt-1"
                            placeholder="0.00"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <Button type="submit" className="flex-1 " disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Criando..." : "Criar Nota Fiscal"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                    Cancelar
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Metrics */}
        {metrics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total de Notas", value: metrics.total,     icon: FileText,     bg: "bg-muted",                              color: "text-muted-foreground" },
              { label: "Pendentes",      value: metrics.pending,   icon: Clock,        bg: "bg-amber-50 dark:bg-amber-950/40",      color: "text-amber-600 dark:text-amber-400" },
              { label: "Processadas",    value: metrics.processed, icon: CheckCircle2, bg: "bg-emerald-50 dark:bg-emerald-950/40",  color: "text-emerald-600 dark:text-emerald-400" },
              { label: "Com Erro",       value: metrics.error,     icon: AlertCircle,  bg: "bg-red-50 dark:bg-red-950/40",          color: "text-red-600 dark:text-red-400" },
            ].map(({ label, value, icon: Icon, bg, color }) => (
              <div key={label} className="bg-card rounded-xl border border-border p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
                  <div className={`p-1.5 rounded-lg ${bg}`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                </div>
                <p className="text-3xl font-bold text-foreground tabular-nums">{value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={filters.status || "all"} onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? undefined : value })}>
              <SelectTrigger className="h-9 w-40 text-sm bg-muted/50 border-border">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="Pendente">Pendente</SelectItem>
                <SelectItem value="Processado">Processado</SelectItem>
                <SelectItem value="Erro">Erro</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar por cliente..."
              value={filters.clientName}
              onChange={(e) => setFilters({ ...filters, clientName: e.target.value })}
              className="h-9 w-52 text-sm bg-muted/50 border-border"
            />
            <MonthPicker
              value={filters.competenceMonth}
              onChange={(v) => setFilters({ ...filters, competenceMonth: v })}
              placeholder="Competência"
              className="w-44"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 border-b border-border hover:bg-muted/40">
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10 pl-6">Cliente</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">Serviço</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">Valor</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">Competência</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">Status</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10">Data</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground h-10 pr-6"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <FileText className="w-8 h-8 text-muted-foreground/40" />
                        <div>
                          <p className="font-medium text-sm text-muted-foreground">Nenhuma nota fiscal encontrada</p>
                          <p className="text-xs mt-0.5 text-muted-foreground/60">Clique em "Nova Nota Fiscal" para criar a primeira</p>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((invoice: any) => {
                    const daysLeft = invoice.expiresAt
                      ? Math.ceil((new Date(invoice.expiresAt).getTime() - Date.now()) / 86400000)
                      : null;
                    return (
                      <TableRow
                        key={invoice.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => navigate(`/invoices/${invoice.id}`)}
                      >
                        <TableCell className="font-medium text-sm text-foreground py-4 pl-6">
                          {invoice.clientName}
                          {daysLeft !== null && daysLeft >= 0 && (
                            <span className="ml-2 text-[11px] bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-medium px-1.5 py-0.5 rounded-full">
                              expira em {daysLeft}d
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate py-4">{invoice.serviceDescription}</TableCell>
                        <TableCell className="text-sm font-semibold text-foreground tabular-nums py-4">{formatValue(invoice.value)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground py-4">{invoice.competenceMonth}</TableCell>
                        <TableCell className="py-4">{getStatusBadge(invoice.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground py-4">{formatDate(invoice.createdAt)}</TableCell>
                        <TableCell className="py-4 pr-6">
                          <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 px-2.5 py-1 rounded-full transition-colors">
                            Ver detalhes
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-between items-center px-6 py-3 border-t border-border bg-muted/20">
            <span className="text-xs text-muted-foreground">Página {page + 1}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>
                ← Anterior
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => setPage(page + 1)} disabled={!listQuery.data || listQuery.data.length < ITEMS_PER_PAGE}>
                Próxima →
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
