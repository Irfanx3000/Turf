import type { CancellationPolicy } from "@turf/shared-types";

export interface PolicyInput {
  policy: CancellationPolicy;
  customRefundPercent: number | null;
  bookingStartsAt: Date;
  now: Date;
  paidAmountMinor: number;
  paymentMethod: "online" | "pay_at_venue";
}

export interface RefundDecision {
  refundDueMinor: number;
  policyApplied: CancellationPolicy;
  reason: string;
}

/**
 * Pure, unit-tested cancellation/refund policy.
 * Pay-at-venue bookings owe nothing (nothing was collected); online bookings
 * are refunded according to the turf's policy window.
 */
export function computeRefundDue(input: PolicyInput): RefundDecision {
  const hoursUntilStart = (input.bookingStartsAt.getTime() - input.now.getTime()) / 3_600_000;

  if (input.paymentMethod === "pay_at_venue" || input.paidAmountMinor <= 0) {
    return {
      refundDueMinor: 0,
      policyApplied: input.policy,
      reason: "nothing collected — pay-at-venue booking",
    };
  }

  switch (input.policy) {
    case "free_until_24h":
      if (hoursUntilStart >= 24) {
        return { refundDueMinor: input.paidAmountMinor, policyApplied: "free_until_24h", reason: "cancelled 24h+ before start — full refund" };
      }
      return { refundDueMinor: 0, policyApplied: "free_until_24h", reason: "cancelled inside 24h window — no refund" };
    case "free_until_2h":
      if (hoursUntilStart >= 2) {
        return { refundDueMinor: input.paidAmountMinor, policyApplied: "free_until_2h", reason: "cancelled 2h+ before start — full refund" };
      }
      return { refundDueMinor: 0, policyApplied: "free_until_2h", reason: "cancelled inside 2h window — no refund" };
    case "non_refundable":
      return { refundDueMinor: 0, policyApplied: "non_refundable", reason: "non-refundable booking" };
    case "custom": {
      const percent = input.customRefundPercent ?? 0;
      const refund = Math.round((input.paidAmountMinor * percent) / 100);
      return { refundDueMinor: refund, policyApplied: "custom", reason: `custom policy — ${percent}% of collected` };
    }
  }
}
