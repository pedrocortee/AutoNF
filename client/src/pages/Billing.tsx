import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { AlertCircle, CheckCircle2, Clock, FileText, XCircle } from "lucide-react";
import { useLocation } from "wouter";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  confirmed: {
    label: "Pago",
    variant: "default",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  pending: {
    label: "Pendente",
    variant: "secondary",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  overdue: {
    label: "Vencido",
    variant: "destructive",
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  cancelled: {
    label: "Cancelado",
    variant: "outline",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

const BILLING_TYPE_LABEL: Record<string, string> = {
  BOLETO: "Boleto",
  CREDIT_CARD: "Cartão de Crédito",
  PIX: "Pix",
  DEBIT_CARD: "Cartão de Débito",
  UNDEFINED: "—",
};

export default function Billing() {
  const [, navigate] = useLocation();

  const { data: invoices, isLoading, error } = trpc.billing.list.useQuery();
  const { data: subscription } = trpc.plans.getSubscription.useQuery();

  const cancelMutation = trpc.payments.cancelSubscription.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
  });

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Faturas</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Histórico de cobranças da sua assinatura AutoNF
            </p>
          </div>
          {subscription && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/plans")}
            >
              Ver Planos
            </Button>
          )}
        </div>

        {/* Current Subscription */}
        {subscription && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Assinatura Atual</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="font-semibold">{subscription.plan.name}</p>
                  <p className="text-sm text-muted-foreground">
                    R$ {(subscription.plan.pricePerMonth / 100).toFixed(0)}/mês ·{" "}
                    {subscription.plan.maxInvoicesPerMonth === 999999
                      ? "Notas ilimitadas"
                      : `até ${subscription.plan.maxInvoicesPerMonth} notas/mês`}
                  </p>
                  {subscription.renewalDate && (
                    <p className="text-xs text-muted-foreground">
                      Próxima renovação:{" "}
                      {new Date(subscription.renewalDate).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="default" className="bg-green-600">Ativa</Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Tem certeza que deseja cancelar sua assinatura?")) {
                        cancelMutation.mutate();
                      }
                    }}
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending ? "Cancelando..." : "Cancelar"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Invoice List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Histórico de Cobranças</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-destructive py-6 justify-center">
                <AlertCircle className="w-5 h-5" />
                <span>Erro ao carregar faturas</span>
              </div>
            )}

            {!isLoading && !error && (!invoices || invoices.length === 0) && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="font-medium">Nenhuma fatura ainda</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Suas cobranças aparecerão aqui após a ativação do plano
                </p>
              </div>
            )}

            {invoices && invoices.length > 0 && (
              <div className="divide-y">
                {invoices.map((invoice) => {
                  const statusCfg = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.pending;
                  return (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between py-4 first:pt-0 last:pb-0"
                    >
                      <div className="space-y-0.5">
                        <p className="font-medium text-sm">
                          Plano {invoice.planName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Venc. {new Date(invoice.dueDate + "T00:00:00").toLocaleDateString("pt-BR")}{" "}
                          · {BILLING_TYPE_LABEL[invoice.paymentMethod ?? "UNDEFINED"] ?? invoice.paymentMethod ?? "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-semibold text-sm">
                          R$ {(invoice.amount / 100).toFixed(2)}
                        </span>
                        <Badge
                          variant={statusCfg.variant}
                          className="gap-1 text-xs"
                        >
                          {statusCfg.icon}
                          {statusCfg.label}
                        </Badge>
                        {invoice.paymentUrl && invoice.status === "pending" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => window.open(invoice.paymentUrl!, "_blank")}
                          >
                            Pagar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Grace period warning */}
        {!subscription && (
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-900 dark:text-amber-200">
                  Sem assinatura ativa
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                  Você não possui um plano ativo. Ative um plano para continuar emitindo notas fiscais.
                </p>
                <Button
                  size="sm"
                  className="mt-3"
                  onClick={() => navigate("/plans")}
                >
                  Ver Planos
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
