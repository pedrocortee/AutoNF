/**
 * Entrada module access: included by plan (monthly upload quota). The account owner (admin)
 * has no limit, for demos. SEFAZ capture is not counted — XML costs nothing to read.
 */

import { getUserSubscription } from "../../db";
import { countUploadsThisMonth } from "../../inboundDb";

export interface InboundAllowance {
  allowed: boolean;
  used: number;
  /** null = unlimited */
  limit: number | null;
  remaining: number | null;
  planName: string | null;
  reason: string | null;
}

export function computeAllowance(
  user: { role?: string | null },
  plan: { name: string; maxInboundDocsPerMonth: number } | null,
  used: number
): InboundAllowance {
  if (user.role === "admin") return { allowed: true, used, limit: null, remaining: null, planName: plan?.name ?? null, reason: null };
  if (!plan) return { allowed: false, used, limit: 0, remaining: 0, planName: null, reason: "Assine um plano para enviar documentos à Entrada." };
  const limit = plan.maxInboundDocsPerMonth;
  if (limit <= 0) return { allowed: false, used, limit: 0, remaining: 0, planName: plan.name, reason: `O plano ${plan.name} não inclui a Entrada de documentos.` };
  const remaining = Math.max(0, limit - used);
  return {
    allowed: remaining > 0,
    used,
    limit,
    remaining,
    planName: plan.name,
    reason: remaining > 0 ? null : `Limite de ${limit} documentos/mês do plano ${plan.name} atingido.`,
  };
}

export async function inboundAllowance(user: { id: number; role?: string | null }): Promise<InboundAllowance> {
  const [sub, used] = await Promise.all([getUserSubscription(user.id), countUploadsThisMonth(user.id)]);
  return computeAllowance(user, sub ? sub.plan : null, used);
}
