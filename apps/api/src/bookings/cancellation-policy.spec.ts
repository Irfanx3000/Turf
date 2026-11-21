import { describe, expect, it } from "vitest";
import { computeRefundDue } from "./cancellation-policy.js";

const T = (iso: string) => new Date(iso);
const NOW = T("2026-01-10T12:00:00.000Z");
const base = {
  now: NOW,
  paidAmountMinor: 100_000, // ₹1000.00
  paymentMethod: "online" as const,
  customRefundPercent: null,
};

describe("computeRefundDue", () => {
  it("pay-at-venue bookings owe nothing (nothing was collected)", () => {
    const d = computeRefundDue({ ...base, policy: "free_until_24h", paymentMethod: "pay_at_venue", bookingStartsAt: T("2026-01-11T12:00:00.000Z") });
    expect(d.refundDueMinor).toBe(0);
  });

  it("online bookings with nothing paid owe nothing", () => {
    const d = computeRefundDue({ ...base, policy: "free_until_24h", paidAmountMinor: 0, bookingStartsAt: T("2026-01-11T12:00:00.000Z") });
    expect(d.refundDueMinor).toBe(0);
  });

  it("free_until_24h: full refund when cancelled >= 24h before start", () => {
    const d = computeRefundDue({ ...base, policy: "free_until_24h", bookingStartsAt: T("2026-01-11T12:00:01.000Z") });
    expect(d.refundDueMinor).toBe(100_000);
  });

  it("free_until_24h: no refund inside the 24h window", () => {
    const d = computeRefundDue({ ...base, policy: "free_until_24h", bookingStartsAt: T("2026-01-11T11:59:59.000Z") });
    expect(d.refundDueMinor).toBe(0);
  });

  it("free_until_2h: full refund when cancelled >= 2h before start", () => {
    const d = computeRefundDue({ ...base, policy: "free_until_2h", bookingStartsAt: T("2026-01-10T14:00:00.000Z") });
    expect(d.refundDueMinor).toBe(100_000);
  });

  it("free_until_2h: no refund inside the 2h window", () => {
    const d = computeRefundDue({ ...base, policy: "free_until_2h", bookingStartsAt: T("2026-01-10T13:59:00.000Z") });
    expect(d.refundDueMinor).toBe(0);
  });

  it("non_refundable: never refunds", () => {
    const d = computeRefundDue({ ...base, policy: "non_refundable", bookingStartsAt: T("2026-02-01T12:00:00.000Z") });
    expect(d.refundDueMinor).toBe(0);
  });

  it("custom: refunds the tenant-defined percent, rounded to whole minor units", () => {
    const d = computeRefundDue({ ...base, policy: "custom", customRefundPercent: 50, bookingStartsAt: T("2026-01-11T12:00:00.000Z") });
    expect(d.refundDueMinor).toBe(50_000);
    const odd = computeRefundDue({ ...base, policy: "custom", customRefundPercent: 33, paidAmountMinor: 999, bookingStartsAt: T("2026-01-11T12:00:00.000Z") });
    expect(odd.refundDueMinor).toBe(330); // Math.round(999 * 0.33)
  });

  it("custom with no percent configured refunds nothing", () => {
    const d = computeRefundDue({ ...base, policy: "custom", customRefundPercent: null, bookingStartsAt: T("2026-01-11T12:00:00.000Z") });
    expect(d.refundDueMinor).toBe(0);
  });

  it("reports which policy was applied and a human reason", () => {
    const d = computeRefundDue({ ...base, policy: "free_until_24h", bookingStartsAt: T("2026-01-11T12:00:00.000Z") });
    expect(d.policyApplied).toBe("free_until_24h");
    expect(d.reason).toMatch(/24h\+/);
  });
});
