/** Real implementations of BillingDeps (database + Asaas). */

import type { BillingDeps } from "./_core/billing";
import {
  cancelAsaasSubscription,
  createAsaasCustomer,
  createAsaasSubscription,
  firstPaymentUrl,
  getAsaasSubscription,
  isAsaasConfigured,
  listAsaasPayments,
} from "./_core/asaas";
import { getAsaasCustomerByUserId, getPlanByName, getUserByIdFromDb, upsertAsaasCustomer } from "./db";
import {
  cancelPendingInvoicesOf,
  getCurrentSubscription,
  insertBillingInvoice,
  invoicesForAsaasSubscription,
  liveAsaasSubscriptions,
  patchBillingInvoice,
  pendingCheckout,
  renewSubscription,
  setSubscriptionStatus,
  startSubscription,
} from "./billingDb";

export const billingDeps: BillingDeps = {
  getPlanByName,
  getCurrent: getCurrentSubscription,
  start: startSubscription,
  renew: renewSubscription,
  setStatus: setSubscriptionStatus,
  invoicesFor: invoicesForAsaasSubscription,
  insertInvoice: insertBillingInvoice,
  patchInvoice: patchBillingInvoice,
  cancelPendingInvoicesOf,
  liveAsaasSubscriptions,
  pendingCheckout,
  asaasConfigured: isAsaasConfigured,
  async ensureCustomer(userId) {
    const existing = await getAsaasCustomerByUserId(userId);
    if (existing) return existing.asaasCustomerId;
    const user = await getUserByIdFromDb(userId);
    const customer = await createAsaasCustomer({
      name: user?.name ?? `Usuário ${userId}`,
      email: user?.email ?? `user${userId}@autonf.com.br`,
    });
    await upsertAsaasCustomer(userId, customer.id);
    return customer.id;
  },
  createAsaasSubscription: (customerId, plan) =>
    createAsaasSubscription({ customerId, value: plan.pricePerMonth / 100, planName: plan.name }),
  async asaasSubscriptionStatus(id) {
    try {
      const s = await getAsaasSubscription(id);
      return (s as { deleted?: boolean }).deleted ? "DELETED" : s.status;
    } catch {
      return null;
    }
  },
  firstPaymentUrl: (id) => firstPaymentUrl(id),
  async confirmedPayments(id) {
    const { data } = await listAsaasPayments({ subscription: id, limit: 20 });
    return data.filter((p) => p.status === "CONFIRMED" || p.status === "RECEIVED");
  },
  cancelAsaas: cancelAsaasSubscription,
  isProduction: () => process.env.NODE_ENV === "production",
  today: () => new Date().toISOString().slice(0, 10),
};
