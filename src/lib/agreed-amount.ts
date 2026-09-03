/**
 * Agreed booking amount resolution.
 *
 * Order of truth:
 *  1. An approved row in `booking_estimates` (a genuine, later estimate).
 *  2. The accepted professional proposal — `job_applications.quoted_price`,
 *     copied onto `bookings.estimated_amount` by `customer_accept_job_application`
 *     (bookings created this way always have `job_application_id` set).
 *  3. The customer's original budget (`bookings.budget` / legacy `estimated_cost`).
 *
 * The customer's budget is never overwritten — it stays as history.
 */

export function customerBudgetOf(b: any): number | null {
  const n = Number(b?.budget ?? b?.estimated_cost ?? NaN);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Accepted professional proposal (only for bookings created from an application). */
export function acceptedProposalOf(b: any): number | null {
  if (!b?.job_application_id) return null;
  const n = Number(b?.estimated_amount ?? b?.estimated_cost ?? NaN);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type AgreedAmount = {
  value: number | null;
  label: string;
  source: "estimate" | "proposal" | "budget" | "none";
};

export function agreedAmountOf(b: any, acceptedEstimate?: number | null): AgreedAmount {
  if (acceptedEstimate != null && Number(acceptedEstimate) > 0) {
    return { value: Number(acceptedEstimate), label: "Approved estimate", source: "estimate" };
  }
  const proposal = acceptedProposalOf(b);
  if (proposal != null) {
    return { value: proposal, label: "Accepted proposal", source: "proposal" };
  }
  const budget = customerBudgetOf(b);
  if (budget != null) return { value: budget, label: "Customer budget", source: "budget" };
  return { value: null, label: "Agreed amount", source: "none" };
}
