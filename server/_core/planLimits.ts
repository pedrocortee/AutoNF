/**
 * Free plan limits are a one-time allowance for the account (a trial); paid plan limits reset monthly.
 */

import { invoiceUsageTotal } from "../billingDb";
import { getInvoiceUsageThisMonth } from "../db";

export type LimitPeriod = "month" | "account";

export function limitPeriod(plan: { pricePerMonth: number }): LimitPeriod {
  return plan.pricePerMonth === 0 ? "account" : "month";
}

/** Notes issued that count against the plan limit. */
export async function emissionUsage(userId: number, plan: { pricePerMonth: number }): Promise<number> {
  return limitPeriod(plan) === "account" ? invoiceUsageTotal(userId) : getInvoiceUsageThisMonth(userId);
}

export function emissionLimitMessage(plan: { name: string; pricePerMonth: number; maxInvoicesPerMonth: number }): string {
  return limitPeriod(plan) === "account"
    ? `Você já usou as ${plan.maxInvoicesPerMonth} notas do plano ${plan.name}. Assine um plano para continuar emitindo.`
    : `Limite de ${plan.maxInvoicesPerMonth} notas/mês do plano ${plan.name} atingido.`;
}
