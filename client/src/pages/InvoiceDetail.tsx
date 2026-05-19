import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation, useParams } from "wouter";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DashboardLayout from "@/components/DashboardLayout";
import { ArrowLeft, CheckCircle2, Clock, AlertCircle, Calendar, DollarSign, FileText, User, XCircle, Loader2, Download } from "lucide-react";
import { toast } from "sonner";

type CancelamentoMotivo = "1" | "2" | "3" | "4";

const CANCELAMENTO_MOTIVOS: Record<CancelamentoMotivo, string> = {
  "1": "Erro na emissão",
  "2": "Serviço não prestado",
  "3": "Duplicidade da nota",
  "4": "Outro",
};

export default function InvoiceDetail() {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const { id } = useParams();
  const invoiceId = parseInt(id || "0", 10);

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState<CancelamentoMotivo>("1");
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  const detailQuery = trpc.invoices.detail.useQuery(
    { id: invoiceId },
    {
      refetchInterval: (query) =>
        query.state.data?.invoice?.status === "Processando" ? 3000 : false,
    }
  );

  const isProcessing = detailQuery.data?.invoice?.status === "Processando";

  const pdfQuery = trpc.pdf.get.useQuery(
    { invoiceId },
    { enabled: false }
  );

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      const result = await pdfQuery.refetch();
      if (!result.data) return;
      const { pdf, filename } = result.data;
      const bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || "Erro ao baixar PDF");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const cancelMutation = trpc.invoices.cancelInvoice.useMutation({
    onSuccess: () => {
      toast.success("NFS-e cancelada com sucesso");
      setCancelDialogOpen(false);
      detailQuery.refetch();
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao cancelar NFS-e");
    },
  });

  useEffect(() => {
    if (!isAuthenticated && !loading) {
      navigate("/");
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading || !isAuthenticated) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-slate-400">Carregando...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (detailQuery.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-pulse text-slate-400">Carregando...</div>
        </div>
      </DashboardLayout>
    );
  }

  if (!detailQuery.data) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Button variant="ghost" onClick={() => navigate("/dashboard")} className="text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar
          </Button>
          <Card className="p-8 text-center">
            <p className="text-slate-600">Nota fiscal não encontrada</p>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const { invoice, history } = detailQuery.data;

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
        return <Badge className="bg-slate-200 text-slate-600 border-slate-300"><XCircle className="w-3 h-3 mr-1" /> Cancelado</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const formatValue = (cents: number) => {
    return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  const formatDateOnly = (date: Date | string) => {
    return new Date(date).toLocaleDateString("pt-BR");
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate("/dashboard")} className="text-slate-600 hover:text-slate-900">
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Nota Fiscal #{invoice.id}</h1>
              <p className="text-slate-600 mt-1">Criada em {formatDate(invoice.createdAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {getStatusBadge(invoice.status)}
            {invoice.status === "Processado" && (
              <Button
                variant="outline"
                size="sm"
                disabled={isDownloadingPdf}
                onClick={handleDownloadPdf}
                className="border-blue-300 text-blue-600 hover:bg-blue-50"
              >
                {isDownloadingPdf ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-1.5" />
                )}
                Baixar PDF
              </Button>
            )}
            {invoice.status === "Processado" && (invoice as any).nfseNumber && (
              <Button
                variant="outline"
                size="sm"
                className="border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => setCancelDialogOpen(true)}
              >
                <XCircle className="w-4 h-4 mr-1.5" />
                Cancelar NF
              </Button>
            )}
          </div>
        </div>

        {/* Main Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column */}
          <Card className="p-6 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 mb-4">Informações da Nota</h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-slate-600">Cliente (Tomador)</p>
                    <p className="font-medium text-slate-900">{invoice.clientName}</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <FileText className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-slate-600">Descrição do Serviço</p>
                    <p className="font-medium text-slate-900 mt-1">{invoice.serviceDescription}</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <DollarSign className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-slate-600">Valor</p>
                    <p className="font-bold text-lg text-slate-900">{formatValue(invoice.value)}</p>
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-slate-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-slate-600">Competência</p>
                    <p className="font-medium text-slate-900">{invoice.competenceMonth}</p>
                  </div>
                </div>
              </div>
            </div>

            {invoice.errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm font-medium text-red-900 mb-1">Mensagem de Erro</p>
                <p className="text-sm text-red-700">{invoice.errorMessage}</p>
              </div>
            )}
          </Card>

          {/* Right Column - Timeline */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-6">Histórico de Status</h2>

            <div className="space-y-4">
              {history && history.length > 0 ? (
                history.map((entry: any, index: number) => (
                  <div key={entry.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${
                        entry.toStatus === "Processado" ? "bg-green-500" :
                        entry.toStatus === "Erro" ? "bg-red-500" :
                        "bg-yellow-500"
                      }`} />
                      {index < (history?.length || 0) - 1 && (
                        <div className="w-0.5 h-12 bg-slate-200 my-1" />
                      )}
                    </div>
                    <div className="pb-4">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-900">
                          {entry.fromStatus} → {entry.toStatus}
                        </p>
                      </div>
                      <p className="text-sm text-slate-600 mt-1">{entry.reason}</p>
                      <p className="text-xs text-slate-500 mt-2">{formatDate(entry.createdAt)}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-slate-600">Sem histórico disponível</p>
              )}
            </div>
          </Card>
        </div>

        {/* Status Info */}
        <Card className="p-6 bg-gradient-to-r from-blue-50 to-blue-100/50 border-blue-200">
          <div className="flex items-center gap-4">
            {invoice.status === "Processado" && (
              <>
                <CheckCircle2 className="w-8 h-8 text-green-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-slate-900">Nota Fiscal Processada</p>
                  <p className="text-sm text-slate-600 mt-1">
                    Esta nota fiscal foi emitida com sucesso em {formatDate(invoice.processedAt || invoice.updatedAt)}.
                  </p>
                </div>
              </>
            )}
            {invoice.status === "Pendente" && (
              <>
                <Clock className="w-8 h-8 text-yellow-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-slate-900">Aguardando Envio</p>
                  <p className="text-sm text-slate-600 mt-1">
                    Esta nota fiscal aguarda o envio à prefeitura.
                  </p>
                </div>
              </>
            )}
            {invoice.status === "Processando" && (
              <>
                <Loader2 className="w-8 h-8 text-blue-600 flex-shrink-0 animate-spin" />
                <div>
                  <p className="font-semibold text-slate-900">Emissão em Andamento</p>
                  <p className="text-sm text-slate-600 mt-1">
                    Sua nota está sendo processada pela prefeitura. Esta página atualiza automaticamente.
                  </p>
                </div>
              </>
            )}
            {invoice.status === "Erro" && (
              <>
                <AlertCircle className="w-8 h-8 text-red-600 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-slate-900">Erro no Processamento</p>
                  <p className="text-sm text-slate-600 mt-1">
                    Houve um erro ao processar esta nota fiscal. Verifique os detalhes acima.
                  </p>
                </div>
              </>
            )}
            {invoice.status === "Cancelado" && (
              <>
                <XCircle className="w-8 h-8 text-slate-500 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-slate-900">Nota Fiscal Cancelada</p>
                  <p className="text-sm text-slate-600 mt-1">
                    Esta nota fiscal foi cancelada junto à prefeitura. Consulte o histórico para detalhes.
                  </p>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar Nota Fiscal #{invoice.id}</DialogTitle>
            <DialogDescription>
              Esta ação cancela a NFS-e junto à prefeitura e não pode ser desfeita.
              Selecione o motivo do cancelamento.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <label className="text-sm font-medium mb-2 block">Motivo do cancelamento</label>
            <Select
              value={cancelMotivo}
              onValueChange={(v) => setCancelMotivo(v as CancelamentoMotivo)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(CANCELAMENTO_MOTIVOS) as [CancelamentoMotivo, string][]).map(
                  ([code, label]) => (
                    <SelectItem key={code} value={code}>
                      {code} — {label}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate({ id: invoice.id, motivo: cancelMotivo })}
            >
              {cancelMutation.isPending ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
