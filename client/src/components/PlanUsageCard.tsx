import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { useLocation } from "wouter";

export function PlanUsageCard() {
  const [, navigate] = useLocation();
  const { data: subscription } = trpc.plans.getSubscription.useQuery();
  const { data: usage } = trpc.plans.getUsage.useQuery(undefined, {
    enabled: !!subscription,
  });

  if (!subscription || !usage) {
    return (
      <Card className="p-6 border-dashed border-2 border-slate-200 bg-slate-50/50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-800">Nenhum plano ativo</h3>
            <p className="text-sm text-slate-500 mt-1">
              Selecione um plano para começar a emitir notas fiscais.
            </p>
          </div>
        </div>
        <Button onClick={() => navigate("/plans")} className="mt-4 w-full sm:w-auto">
          Ver Planos
        </Button>
      </Card>
    );
  }

  const isNearLimit = usage.percentage >= 80;
  const isAtLimit = usage.percentage >= 100;

  return (
    <Card className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-slate-200 dark:border-slate-700">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Seu Plano: {subscription.plan.name}
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            R$ {(subscription.plan.pricePerMonth / 100).toFixed(0)}/mês
          </p>
        </div>
        {isAtLimit ? (
          <AlertCircle className="w-6 h-6 text-red-500" />
        ) : isNearLimit ? (
          <AlertCircle className="w-6 h-6 text-yellow-500" />
        ) : (
          <CheckCircle2 className="w-6 h-6 text-green-500" />
        )}
      </div>

      <div className="space-y-3">
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Notas Fiscais Emitidas
            </span>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {usage.usage} / {subscription.plan.maxInvoicesPerMonth === 999999 ? "∞" : subscription.plan.maxInvoicesPerMonth}
            </span>
          </div>
          <Progress
            value={Math.min(usage.percentage, 100)}
            className="h-2"
          />
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600 dark:text-slate-400">
            {usage.remaining > 0
              ? `${usage.remaining} notas restantes`
              : "Limite atingido"}
          </span>
          <span className={`font-semibold ${
            isAtLimit
              ? "text-red-600 dark:text-red-400"
              : isNearLimit
                ? "text-yellow-600 dark:text-yellow-400"
                : "text-green-600 dark:text-green-400"
          }`}>
            {usage.percentage}%
          </span>
        </div>
      </div>

      {isAtLimit && (
        <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-400">
            Você atingiu o limite de notas fiscais para este mês. Faça upgrade do plano para continuar.
          </p>
          <Button
            onClick={() => navigate("/plans")}
            size="sm"
            className="mt-2 w-full"
            variant="default"
          >
            Fazer Upgrade
          </Button>
        </div>
      )}

      {isNearLimit && !isAtLimit && (
        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-700 dark:text-yellow-400">
            Você está próximo do limite. Considere fazer upgrade do plano.
          </p>
          <Button
            onClick={() => navigate("/plans")}
            size="sm"
            className="mt-2 w-full"
            variant="outline"
          >
            Ver Planos
          </Button>
        </div>
      )}
    </Card>
  );
}
