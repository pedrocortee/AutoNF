import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Check, Sparkles, Zap, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";

export default function Plans() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [subscribingTo, setSubscribingTo] = useState<string | null>(null);
  const [awaitingPayment, setAwaitingPayment] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: plans, isLoading: plansLoading, error: plansError } = trpc.plans.list.useQuery();
  const { data: currentSubscription, isLoading: subscriptionLoading, refetch: refetchSubscription } = trpc.plans.getSubscription.useQuery(
    undefined,
    { enabled: !!user }
  );

  const utils = trpc.useUtils();

  const syncMutation = trpc.payments.syncSubscription.useMutation({
    onSuccess: (data) => {
      if (data.activated) {
        stopPolling();
        toast.success(`Plano ${(data as any).planName} ativado com sucesso!`);
        utils.plans.getSubscription.invalidate();
        utils.plans.getUsage.invalidate();
        setTimeout(() => navigate("/dashboard"), 1000);
      } else if (data.alreadyActive) {
        stopPolling();
        utils.plans.getSubscription.invalidate();
        navigate("/dashboard");
      }
    },
  });

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    setAwaitingPayment(false);
  };

  const startPolling = () => {
    setAwaitingPayment(true);
    pollRef.current = setInterval(() => syncMutation.mutate(), 5000);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const checkoutMutation = trpc.payments.createCheckout.useMutation({
    onSuccess: (data) => {
      setSubscribingTo(null);
      if (data.directActivation) {
        toast.success("Plano ativado com sucesso!");
        utils.plans.getSubscription.invalidate();
        utils.plans.getUsage.invalidate();
        setTimeout(() => navigate("/dashboard"), 800);
      } else if (data.paymentUrl) {
        toast.info("Complete o pagamento na página do Asaas.");
        window.open(data.paymentUrl, "_blank");
        startPolling();
      } else {
        toast.success("Assinatura criada! Efetue o pagamento para ativar.");
        navigate("/billing");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Erro ao iniciar checkout");
      setSubscribingTo(null);
    },
  });

  const handleSubscribe = (planName: string) => {
    setSubscribingTo(planName);
    checkoutMutation.mutate({ planName });
  };

  const renderContent = () => {
    if (!user) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
          <p className="text-muted-foreground text-sm">Faça login para visualizar os planos.</p>
          <Button size="sm" onClick={() => navigate("/")}>Ir para Home</Button>
        </div>
      );
    }

    if (plansLoading || subscriptionLoading) {
      return (
        <div className="flex items-center justify-center py-32">
          <div className="w-5 h-5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
        </div>
      );
    }

    if (plansError || !plans || plans.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-sm text-muted-foreground">Nenhum plano disponível no momento.</p>
          <Button size="sm" variant="outline" onClick={() => navigate("/dashboard")}>Voltar</Button>
        </div>
      );
    }

    return (
      <div className="space-y-10">
        {/* Awaiting payment banner */}
        {awaitingPayment && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl px-5 py-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-indigo-600 animate-spin shrink-0" />
              <div>
                <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">Aguardando confirmação do pagamento...</p>
                <p className="text-xs text-indigo-600 dark:text-indigo-400">Verificando automaticamente a cada 5 segundos.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                {syncMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Já paguei"}
              </Button>
              <Button size="sm" variant="ghost" onClick={stopPolling}>Cancelar</Button>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="text-center space-y-2 pb-2">
          <div className="inline-flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-100 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-xs font-medium px-3 py-1.5 rounded-full mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            Planos disponíveis
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Escolha seu plano</h1>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            {currentSubscription
              ? <>Plano atual: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{currentSubscription.plan.name}</span>{currentSubscription.status === "paused" && <span className="text-amber-700"> — pagamento em atraso</span>}</>
              : "Emita notas fiscais com segurança e conformidade. Cancele quando quiser."}
          </p>
        </div>

        {/* Plan Cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((plan, idx) => {
            const isCurrentPlan = currentSubscription?.planId === plan.id && currentSubscription.status === "active";
            const isOverduePlan = currentSubscription?.planId === plan.id && currentSubscription.status === "paused";
            const isFree = plan.pricePerMonth === 0;
            const isHighlighted = idx === 1 && !isFree;
            const features: string[] = JSON.parse(plan.features || "[]");

            return (
              <div
                key={plan.id}
                className={`relative rounded-2xl border flex flex-col transition-all duration-200 ${
                  isCurrentPlan
                    ? "border-indigo-400 dark:border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-md"
                    : isHighlighted
                      ? "border-indigo-300 dark:border-indigo-600 bg-card shadow-xl scale-[1.02]"
                      : "border-border bg-card hover:border-border/80 hover:shadow-md"
                }`}
              >
                {isHighlighted && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 bg-indigo-600 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-md">
                      <Zap className="w-3 h-3" />
                      Mais popular
                    </span>
                  </div>
                )}

                {isCurrentPlan && (
                  <div className="absolute top-3.5 right-3.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-full">
                      Ativo
                    </span>
                  </div>
                )}

                <div className="p-6 flex flex-col flex-1">
                  {/* Plan name + desc */}
                  <div className="mb-5">
                    <h2 className="text-base font-bold text-foreground">{plan.name}</h2>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{plan.description}</p>
                  </div>

                  {/* Price */}
                  <div className="mb-6">
                    {isFree ? (
                      <div>
                        <p className="text-4xl font-extrabold text-foreground">Grátis</p>
                        <p className="text-xs text-muted-foreground mt-1">Para sempre</p>
                        <p className="text-xs text-muted-foreground">Entrada: {plan.maxInboundDocsPerMonth > 0 ? `até ${plan.maxInboundDocsPerMonth} documentos/mês` : "não inclusa"}</p>
                      </div>
                    ) : (
                      <div>
                        <div className="flex items-baseline gap-1">
                          <span className="text-xs text-muted-foreground font-medium">R$</span>
                          <span className="text-4xl font-extrabold text-foreground tabular-nums">
                            {(plan.pricePerMonth / 100).toFixed(0)}
                          </span>
                          <span className="text-sm text-muted-foreground">/mês</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Até {plan.maxInvoicesPerMonth === 999999 ? "∞" : plan.maxInvoicesPerMonth} notas/mês
                        </p>
                        <p className="text-xs text-muted-foreground">Entrada: {plan.maxInboundDocsPerMonth > 0 ? `até ${plan.maxInboundDocsPerMonth} documentos/mês` : "não inclusa"}</p>
                      </div>
                    )}
                  </div>

                  {/* CTA */}
                  <Button
                    onClick={() => handleSubscribe(plan.name)}
                    disabled={isCurrentPlan || subscribingTo === plan.name}
                    variant={isCurrentPlan ? "outline" : "default"}
                    className={`w-full mb-6 ${
                      isCurrentPlan
                        ? "border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300"
                        : isHighlighted
                          ? "bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 dark:shadow-indigo-900"
                          : isFree
                            ? "bg-emerald-600 hover:bg-emerald-700"
                            : ""
                    }`}
                  >
                    {isCurrentPlan
                      ? "Plano atual"
                      : isOverduePlan
                        ? "Pagar fatura em atraso"
                      : subscribingTo === plan.name
                        ? "Processando..."
                        : isFree
                          ? "Começar Grátis"
                          : "Assinar agora"}
                  </Button>

                  {/* Features */}
                  <div className="space-y-3 mt-auto">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Incluso</p>
                    {features.map((feature, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                          isHighlighted
                            ? "bg-indigo-100 dark:bg-indigo-900/60"
                            : "bg-muted"
                        }`}>
                          <Check className={`w-2.5 h-2.5 ${
                            isHighlighted
                              ? "text-indigo-600 dark:text-indigo-400"
                              : "text-muted-foreground"
                          }`} />
                        </div>
                        <span className="text-xs text-muted-foreground leading-relaxed">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ */}
        <div className="bg-card rounded-2xl border border-border p-8 max-w-2xl shadow-sm">
          <h3 className="text-base font-bold text-foreground mb-6">Perguntas frequentes</h3>
          <div className="space-y-6">
            {[
              {
                q: "Posso trocar de plano a qualquer momento?",
                a: "Sim. Upgrade e downgrade são imediatos, sem custo adicional e sem burocracia.",
              },
              {
                q: "O que acontece se eu atingir o limite de notas?",
                a: "Você recebe um alerta quando se aproxima do limite. Pode fazer upgrade a qualquer momento para continuar emitindo.",
              },
              {
                q: "Há contrato ou fidelidade?",
                a: "Não. Todos os planos são mensais. Cancele quando quiser, sem taxas ou penalidades.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="pb-6 border-b border-border last:border-0 last:pb-0">
                <p className="text-sm font-semibold text-foreground mb-1.5">{q}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return <DashboardLayout>{renderContent()}</DashboardLayout>;
}
