/**
 * Entrada module access: included by plan (upload quota — per account on the free plan,
 * monthly on paid plans). The account owner (admin) has no limit, for demos. SEFAZ capture
 * is not counted — XML costs nothing to read.
 */

import { getUserSubscription } from "../../db";
import { countUploadsThisMonth, countUploadsTotal } from "../../inboundDb";
import { limitPeriod, type LimitPeriod } from "../planLimits";

export interface InboundAllowance {
  allowed: boolean;
  used: number;
  /** null = unlimited */
  limit: number | null;
  remaining: number | null;
  planName: string | null;
  period: LimitPeriod;
  reason: string | null;
}

type PlanQuota = { name: string; pricePerMonth: number; maxInboundDocsPerMonth: number };

export function computeAllowance(user: { role?: string | null }, plan: PlanQuota | null, used: number): InboundAllowance {
  const period = plan ? limitPeriod(plan) : "month";
  const base = { used, planName: plan?.name ?? null, period };
  if (user.role === "admin") return { ...base, allowed: true, limit: null, remaining: null, reason: null };
  if (!plan) return { ...base, allowed: false, limit: 0, remaining: 0, reason: "Assine um plano para enviar documentos à Entrada." };
  const limit = plan.maxInboundDocsPerMonth;
  if (limit <= 0) return { ...base, allowed: false, limit: 0, remaining: 0, reason: `O plano ${plan.name} não inclui a Entrada de documentos.` };
  const remaining = Math.max(0, limit - used);
  const reason =
    remaining > 0
      ? null
      : period === "account"
        ? `Você já usou os ${limit} documentos do plano ${plan.name}. Assine um plano para continuar.`
        : `Limite de ${limit} documentos/mês do plano ${plan.name} atingido.`;
  return { ...base, allowed: remaining > 0, limit, remaining, reason };
}

export async function inboundAllowance(user: { id: number; role?: string | null }): Promise<InboundAllowance> {
  const sub = await getUserSubscription(user.id);
  const plan = sub ? sub.plan : null;
  const used = plan && limitPeriod(plan) === "account" ? await countUploadsTotal(user.id) : await countUploadsThisMonth(user.id);
  return computeAllowance(user, plan, used);
}
