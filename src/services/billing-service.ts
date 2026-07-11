/**
 * Billing service — THE SEAM WHERE STRIPE ATTACHES LATER (#70).
 *
 * Issue #70 deliberately stops short of payments: no Stripe code is merged
 * until the entity/bank account exists. What ships now is (a) the interface a
 * payment provider must implement and (b) a free-tier implementation backed by
 * the per-token meter in llm_usage.
 *
 * When Stripe lands, the plan is:
 *   1. Add a `credits_ledger` table (grants + decrements in micro-USD). Usage
 *      rows in llm_usage map 1:1 to decrement events — the meter already
 *      stores a derived costMicroUsd per call, so credit accounting is a SUM,
 *      not a re-architecture.
 *   2. Implement `BillingProvider` with a StripeBillingProvider that reports
 *      metered usage / sells credit grants, and swap it in via
 *      getBillingProvider(). Nothing at the call sites (quota preHandler,
 *      /users/me, /usage) changes.
 *
 * Free-vs-metered boundary (also documented in docs/accounts.md):
 *   - Non-agentic reads (claim lookup, search, trees) are free and generous —
 *     they never touch this service.
 *   - Agentic surfaces (source ingestion, claim proposal, future extension /
 *     chat endpoints) consume the monthly grant.
 *   - Contribution review costs are system overhead, not user spend: good-
 *     faith contribution stays free (#71).
 */
import { loadConfig } from "../config.js";
import { getMonthToDateCostMicroUsd } from "./usage-service.js";

export interface Entitlement {
  plan: "free";
  /** Monthly grant of metered (agentic) usage, in micro-USD of derived cost. */
  monthlyGrantMicroUsd: number;
  usedMicroUsd: number;
  remainingMicroUsd: number;
}

export interface SpendCheck {
  allowed: boolean;
  entitlement: Entitlement;
}

export interface BillingProvider {
  getEntitlement(userId: string): Promise<Entitlement>;
  /** May the user start a new metered (agentic) operation right now? */
  checkSpend(userId: string): Promise<SpendCheck>;
}

/**
 * The pre-payments provider: everyone is on the free plan with a monthly
 * trial grant (FREE_TIER_MONTHLY_USD). Beyond it, agentic endpoints return
 * 402 — purchasing credits is "not yet available" until Stripe lands.
 */
class FreeTierBillingProvider implements BillingProvider {
  async getEntitlement(userId: string): Promise<Entitlement> {
    const grant = Math.round(loadConfig().freeTierMonthlyUsd * 1_000_000);
    const used = await getMonthToDateCostMicroUsd(userId);
    return {
      plan: "free",
      monthlyGrantMicroUsd: grant,
      usedMicroUsd: used,
      remainingMicroUsd: Math.max(0, grant - used),
    };
  }

  async checkSpend(userId: string): Promise<SpendCheck> {
    const entitlement = await this.getEntitlement(userId);
    // A grant of 0 disables the free trial entirely; otherwise allow starting
    // an operation while any grant remains (the operation itself is metered,
    // so a user can overshoot by at most one operation — acceptable slack for
    // a trial tier, and the next request is blocked).
    return { allowed: entitlement.remainingMicroUsd > 0, entitlement };
  }
}

let _provider: BillingProvider | null = null;

export function getBillingProvider(): BillingProvider {
  if (!_provider) _provider = new FreeTierBillingProvider();
  return _provider;
}

/** Test hook / future Stripe swap-in point. */
export function setBillingProvider(provider: BillingProvider | null): void {
  _provider = provider;
}
