import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useState } from "react";

export default function Plans() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [subscribingTo, setSubscribingTo] = useState<string | null>(null);

  const { data: plans, isLoading: plansLoading, error: plansError } = trpc.plans.list.useQuery();
  const { data: currentSubscription, isLoading: subscriptionLoading } = trpc.plans.getSubscription.useQuery(
    undefined,
    { enabled: !!user }
  );
  const checkoutMutation = trpc.payments.createCheckout.useMutation({
    onSuccess: (data) => {
      setSubscribingTo(null);
      if (data.directActivation) {
        toast.success("Plano ativado com sucesso!");
        setTimeout(() => navigate("/dashboard"), 800);
      } else if (data.paymentUrl) {
        toast.info("Redirecionando para pagamento...");
        window.open(data.paymentUrl, "_blank");
        navigate("/billing");
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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-white">Faça login para ver os planos</h1>
          <Button onClick={() => navigate("/")} variant="default">
            Voltar para Home
          </Button>
        </div>
      </div>
    );
  }

  if (plansLoading || subscriptionLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Carregando planos...</p>
        </div>
      </div>
    );
  }

  if (plansError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-white">Erro ao carregar planos</h1>
          <p className="text-slate-300 mb-4">Tente novamente mais tarde</p>
          <Button onClick={() => navigate("/dashboard")} variant="default">
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (!plans || plans.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4 text-white">Nenhum plano disponível</h1>
          <Button onClick={() => navigate("/dashboard")} variant="default">
            Voltar ao Dashboard
          </Button>
        </div>
      </div>
    );
  }

  const handleSubscribe = (planName: string) => {
    setSubscribingTo(planName);
    checkoutMutation.mutate({ planName });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Escolha seu Plano
          </h1>
          <p className="text-xl text-slate-300 mb-2">
            Emita notas fiscais com segurança e conformidade
          </p>
          <p className="text-slate-400">
            {currentSubscription && (
              <>
                Plano atual: <span className="font-semibold text-blue-400">{currentSubscription.plan.name}</span>
              </>
            )}
          </p>
        </div>

        {/* Plans Grid */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {plans?.map((plan) => {
            const isCurrentPlan = currentSubscription?.planId === plan.id;
            const features = JSON.parse(plan.features || "[]");

            return (
              <Card
                key={plan.id}
                className={`relative overflow-hidden transition-all duration-300 ${
                  isCurrentPlan
                    ? "ring-2 ring-blue-500 shadow-2xl shadow-blue-500/20"
                    : "hover:shadow-xl"
                }`}
              >
                {isCurrentPlan && (
                  <div className="absolute top-0 right-0">
                    <Badge className="rounded-none rounded-bl-lg bg-blue-500">
                      Plano Atual
                    </Badge>
                  </div>
                )}

                <div className="p-8">
                  {/* Plan Name */}
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">
                    {plan.name}
                  </h2>
                  <p className="text-slate-600 mb-6 text-sm">
                    {plan.description}
                  </p>

                  {/* Price */}
                  <div className="mb-6">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-slate-900">
                        R$ {(plan.pricePerMonth / 100).toFixed(0)}
                      </span>
                      <span className="text-slate-600">/mês</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-2">
                      Até {plan.maxInvoicesPerMonth === 999999 ? "∞" : plan.maxInvoicesPerMonth} notas fiscais
                    </p>
                  </div>

                  {/* CTA Button */}
                  <Button
                    onClick={() => handleSubscribe(plan.name)}
                    disabled={isCurrentPlan || subscribingTo === plan.name}
                    className="w-full mb-8"
                    variant={isCurrentPlan ? "outline" : "default"}
                  >
                    {isCurrentPlan
                      ? "Plano Ativo"
                      : subscribingTo === plan.name
                        ? "Processando..."
                        : "Assinar"}
                  </Button>

                  {/* Features */}
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-slate-900 mb-4">
                      Incluso neste plano:
                    </p>
                    {features.map((feature: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-slate-700">{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h3 className="text-2xl font-bold text-white mb-8 text-center">
            Perguntas Frequentes
          </h3>

          <div className="space-y-6">
            <div className="bg-slate-800 rounded-lg p-6">
              <h4 className="font-semibold text-white mb-2">
                Posso trocar de plano a qualquer momento?
              </h4>
              <p className="text-slate-300">
                Sim! Você pode fazer upgrade ou downgrade do seu plano a qualquer momento. A mudança é imediata.
              </p>
            </div>

            <div className="bg-slate-800 rounded-lg p-6">
              <h4 className="font-semibold text-white mb-2">
                O que acontece se eu atingir o limite de notas?
              </h4>
              <p className="text-slate-300">
                Você receberá um alerta e poderá fazer upgrade do plano para continuar emitindo notas fiscais.
              </p>
            </div>

            <div className="bg-slate-800 rounded-lg p-6">
              <h4 className="font-semibold text-white mb-2">
                Há contrato de longo prazo?
              </h4>
              <p className="text-slate-300">
                Não! Todos os planos são mensais e você pode cancelar a qualquer momento sem penalidades.
              </p>
            </div>

            <div className="bg-slate-800 rounded-lg p-6">
              <h4 className="font-semibold text-white mb-2">
                Qual é a diferença entre os planos?
              </h4>
              <p className="text-slate-300">
                A principal diferença é o número de notas fiscais que você pode emitir por mês. Todos os planos incluem acesso ao dashboard, histórico e suporte.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
