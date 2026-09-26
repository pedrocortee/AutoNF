import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { Button } from "./ui/button";
import { useLocation } from "wouter";
import { Sparkles, TrendingUp } from "lucide-react";

export function PlanUsageCard() {
  const [, navigate] = useLocation();
  const { data: subscription } = trpc.plans.getSubscription.useQuery();
  const { data: usage } = trpc.plans.getUsage.useQuery(undefined, { enabled: !!subscription });

  if (!subscription || !usage) {
    return (
      <div className="rounded-xl border border-dashed border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <p className="text-sm font-semibold text-foreground">Sem plano ativo</p>
            </div>
            <p className="text-xs text-muted-foreground">Escolha um plano para começar a emitir notas fiscais com o AutoNF.</p>
          </div>
          <Button size="sm" onClick={() => navigate("/plans")} className="bg-indigo-600 hover:bg-indigo-700 shrink-0 ml-4">
            Ver Planos
          </Button>
        </div>
      </div>
    );
  }

  const isNearLimit = usage.percentage >= 80;
  const isAtLimit = usage.percentage >= 100;

  const progressColor = isAtLimit
    ? "[&>div]:bg-red-500"
    : isNearLimit
      ? "[&>div]:bg-amber-500"
      : "[&>div]:bg-indigo-600";

  return (
    <div className={`rounded-xl border p-5 ${
      isAtLimit ? "border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/20" : "border-border bg-card shadow-sm"
    }`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-950/60 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{subscription.plan.name}</p>
            <p className="text-xs text-muted-foreground">
              R$ {(subscription.plan.pricePerMonth / 100).toFixed(0)}/mês
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className={`text-lg font-bold tabular-nums ${
            isAtLimit ? "text-red-600" : isNearLimit ? "text-amber-600" : "text-foreground"
          }`}>
            {usage.usage}
            <span className="text-sm font-normal text-muted-foreground ml-1">
              / {subscription.plan.maxInvoicesPerMonth === 999999 ? "∞" : subscription.plan.maxInvoicesPerMonth}
            </span>
          </p>
          <p className="text-[11px] text-muted-foreground">notas este mês</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Progress
          value={Math.min(usage.percentage, 100)}
          className={`h-1.5 bg-muted ${progressColor}`}
        />
        <div className="flex justify-between items-center">
          <p className={`text-xs ${
            isAtLimit ? "text-red-600 font-medium" : isNearLimit ? "text-amber-600" : "text-muted-foreground"
          }`}>
            {isAtLimit
              ? "Limite atingido — faça upgrade para continuar"
              : isNearLimit
                ? `${usage.remaining} nota(s) restante(s)`
                : `${usage.remaining} de ${subscription.plan.maxInvoicesPerMonth === 999999 ? "∞" : subscription.plan.maxInvoicesPerMonth} disponíveis`}
          </p>
          <span className={`text-xs font-semibold tabular-nums ${
            isAtLimit ? "text-red-600" : isNearLimit ? "text-amber-600" : "text-indigo-600 dark:text-indigo-400"
          }`}>
            {usage.percentage}%
          </span>
        </div>
      </div>

      {(isAtLimit || isNearLimit) && (
        <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {isAtLimit ? "Precisa de mais notas?" : "Está chegando perto do limite."}
          </p>
          <Button
            size="sm"
            variant={isAtLimit ? "default" : "outline"}
            onClick={() => navigate("/plans")}
            className={`h-7 text-xs ${isAtLimit ? "bg-indigo-600 hover:bg-indigo-700" : "border-border"}`}
          >
            {isAtLimit ? "Fazer Upgrade" : "Ver Planos"}
          </Button>
        </div>
      )}
    </div>
  );
}
