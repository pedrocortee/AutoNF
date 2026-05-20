import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, FileText, Clock, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, Loader2, XCircle } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { PlanUsageCard } from "@/components/PlanUsageCard";

export default function Dashboard() {
  const { user, isAuthenticated, loading, logout } = useAuth();
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
  const hasActivePlan = !!subscriptionQuery.data;

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
    switch (status) {
      case "Pendente":
        return <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30"><Clock className="w-3 h-3 mr-1" /> Pendente</Badge>;
      case "Processando":
        return <Badge className="bg-blue-500/20 text-blue-700 border-blue-500/30"><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Processando</Badge>;
      case "Processado":
        return <Badge className="bg-green-500/20 text-green-700 border-green-500/30"><CheckCircle2 className="w-3 h-3 mr-1" /> Processado</Badge>;
      case "Erro":
        return <Badge className="bg-red-500/20 text-red-700 border-red-500/30"><AlertCircle className="w-3 h-3 mr-1" /> Erro</Badge>;
      case "Cancelado":
        return <Badge className="bg-slate-500/20 text-slate-600 border-slate-400/30"><XCircle className="w-3 h-3 mr-1" /> Cancelado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
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
      <div className="space-y-8">
        {/* Plan Usage Card */}
        <PlanUsageCard />

        {/* Certificate expiry alert */}
        {certExpiryQuery.data && (
          <div
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
              (certExpiryQuery.data.daysLeft ?? 30) <= 7
                ? "bg-red-50 border-red-300 text-red-800"
                : "bg-yellow-50 border-yellow-300 text-yellow-800"
            }`}
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Certificado digital expirando em {certExpiryQuery.data.daysLeft} dia(s).</span>{" "}
              <span className="opacity-80">
                {certExpiryQuery.data.filename} vence em{" "}
                {certExpiryQuery.data.validUntil
                  ? new Date(certExpiryQuery.data.validUntil).toLocaleDateString("pt-BR")
                  : "breve"}
                . Renove o certificado em{" "}
                <a href="/settings" className="underline font-medium">Configurações</a>.
              </span>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-600 mt-2">Bem-vindo, {user?.name || "usuário"}!</p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button
                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
                onClick={(e) => {
                  if (!hasActivePlan) {
                    e.preventDefault();
                    navigate("/plans");
                  }
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
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
                <div className="border border-slate-200 rounded-lg">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg"
                    onClick={() => setShowRetentions(!showRetentions)}
                  >
                    Retenções de impostos (opcional — tomador PJ)
                    {showRetentions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  {showRetentions && (
                    <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                      {(["irpj", "csll", "cofins", "pis", "inss"] as const).map((field) => (
                        <div key={field}>
                          <Label className="text-xs uppercase text-slate-500">{field.toUpperCase()} (R$)</Label>
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
                  <Button type="submit" className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white" disabled={createMutation.isPending}>
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

        {/* Metrics Cards */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-600">Total de Notas</p>
                    <p className="text-3xl font-bold text-blue-900 mt-2">{metrics.total}</p>
                  </div>
                  <FileText className="w-10 h-10 text-blue-300" />
                </div>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 border-yellow-200">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-yellow-600">Pendentes</p>
                    <p className="text-3xl font-bold text-yellow-900 mt-2">{metrics.pending}</p>
                  </div>
                  <Clock className="w-10 h-10 text-yellow-300" />
                </div>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100/50 border-green-200">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-green-600">Processadas</p>
                    <p className="text-3xl font-bold text-green-900 mt-2">{metrics.processed}</p>
                  </div>
                  <CheckCircle2 className="w-10 h-10 text-green-300" />
                </div>
              </div>
            </Card>

            <Card className="bg-gradient-to-br from-red-50 to-red-100/50 border-red-200">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-red-600">Com Erro</p>
                    <p className="text-3xl font-bold text-red-900 mt-2">{metrics.error}</p>
                  </div>
                  <AlertCircle className="w-10 h-10 text-red-300" />
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-4">
          <h3 className="font-semibold text-slate-900">Filtros</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="filterStatus" className="text-sm">Status</Label>
            <Select value={filters.status || "all"} onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? undefined : value })}>
              <SelectTrigger id="filterStatus" className="mt-1">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="Pendente">Pendente</SelectItem>
                <SelectItem value="Processado">Processado</SelectItem>
                <SelectItem value="Erro">Erro</SelectItem>
              </SelectContent>
            </Select>
            </div>

            <div>
              <Label htmlFor="filterClient" className="text-sm">Cliente</Label>
              <Input
                id="filterClient"
                placeholder="Buscar por cliente..."
                value={filters.clientName}
                onChange={(e) => setFilters({ ...filters, clientName: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="filterMonth" className="text-sm">Competência</Label>
              <Input
                id="filterMonth"
                type="month"
                value={filters.competenceMonth}
                onChange={(e) => setFilters({ ...filters, competenceMonth: e.target.value })}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 border-b border-slate-200">
                  <TableHead className="text-slate-900 font-semibold">Cliente</TableHead>
                  <TableHead className="text-slate-900 font-semibold">Serviço</TableHead>
                  <TableHead className="text-slate-900 font-semibold">Valor</TableHead>
                  <TableHead className="text-slate-900 font-semibold">Competência</TableHead>
                  <TableHead className="text-slate-900 font-semibold">Status</TableHead>
                  <TableHead className="text-slate-900 font-semibold">Data</TableHead>
                  <TableHead className="text-slate-900 font-semibold">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                      Nenhuma nota fiscal encontrada. Crie uma nova para começar.
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((invoice: any) => (
                    <TableRow key={invoice.id} className="border-b border-slate-200 hover:bg-slate-50">
                      <TableCell className="font-medium text-slate-900">{invoice.clientName}</TableCell>
                      <TableCell className="text-slate-700 max-w-xs truncate">{invoice.serviceDescription}</TableCell>
                      <TableCell className="text-slate-900 font-medium">{formatValue(invoice.value)}</TableCell>
                      <TableCell className="text-slate-700">{invoice.competenceMonth}</TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell className="text-slate-700">{formatDate(invoice.createdAt)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          onClick={() => navigate(`/invoices/${invoice.id}`)}
                        >
                          Ver Detalhes
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-6 px-6 pb-6">
            <div className="text-sm text-slate-600">
              Página {page + 1}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(page + 1)}
                disabled={!listQuery.data || listQuery.data.length < ITEMS_PER_PAGE}
              >
                Próxima
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
