import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UnauthorizedException } from "@nestjs/common";
import type { DbPools } from "@turf/db";
import { paymentProvider } from "../src/payments/adapters/index.js";
import { MockPaymentProvider, mockCapture } from "../src/payments/adapters/mock-payment.provider.js";
import { cleanupVenue, insertSlot, probePools, realServices, seedVenue, skipTest, type TestVenue } from "./helpers.js";

/**
 * Webhook path integrity (requires Postgres + the mock gateway):
 * signature verification, idempotent delivery, booking confirmation.
 */
describe("payments webhook (DB integration)", () => {
  let pools: DbPools | null = null;
  let venue: TestVenue | null = null;
  let services: ReturnType<typeof realServices> | null = null;

  beforeAll(async () => {
    pools = await probePools();
    if (!pools) return;
    services = realServices(pools);
    venue = await seedVenue(pools, 1);
  });

  afterAll(async () => {
    if (pools && venue) await cleanupVenue(pools, venue);
    await pools?.end();
  });

  function webhookBody(eventId: string, orderId: string, amountMinor: number) {
    return JSON.stringify({
      eventId,
      event: "payment.captured",
      payload: { payment: { entity: { id: `pay_${eventId}`, order_id: orderId, amount: amountMinor, status: "captured" } } },
    });
  }

  it("mock gateway active (else this suite is meaningless here)", (ctx) => {
    if (paymentProvider().name !== "mock") {
      skipTest(ctx);
      return;
    }
    expect(paymentProvider().name).toBe("mock");
  });

  it("verified webhook confirms an online booking; duplicate delivery is a no-op", async (ctx) => {
    if (!pools || !venue || !services) { skipTest(ctx); return; }
    if (paymentProvider().name !== "mock") { skipTest(ctx); return; }

    const slotId = await insertSlot(pools, venue.turfId, new Date(Date.now() + 30 * 3600 * 1000));
    const created = await services.bookings.create(
      { id: venue.customers[0]!, email: "c@turf.test" },
      { turfId: venue.turfId, slotIds: [slotId], paymentMethod: "online", idempotencyKey: "webhook-1" },
      "test-request-id",
    );
    expect(created.booking.bookingStatus).toBe("pending_payment");
    expect(created.payment?.orderId).toBeTruthy();

    const orderId = created.payment!.orderId;
    mockCapture(orderId, created.booking.totalAmountMinor);

    // Sign with a local mock instance — same PAYMENT_MOCK_SECRET as the active one.
    const signer = new MockPaymentProvider();
    const raw = webhookBody(`testevt-${venue.suffix}-1`, orderId, created.booking.totalAmountMinor);
    const signature = signer.signWebhookPayload(raw);

    const first = await services.payments.handleWebhook("mock", raw, signature);
    expect(first.received).toBe(true);

    const bookingRow = await pools.servicePool.query(`SELECT booking_status FROM bookings WHERE id = $1`, [created.booking.id]);
    expect(bookingRow.rows[0]!.booking_status).toBe("confirmed");
    const slotRow = await pools.servicePool.query(`SELECT status FROM turf_slots WHERE id = $1`, [slotId]);
    expect(slotRow.rows[0]!.status).toBe("booked");
    const payRow = await pools.servicePool.query(`SELECT status FROM payments WHERE provider_order_id = $1`, [orderId]);
    expect(payRow.rows[0]!.status).toBe("paid");

    // Duplicate delivery of the same event id: acknowledged, not reprocessed.
    const duplicate = await services.payments.handleWebhook("mock", raw, signature);
    expect(duplicate.received).toBe(true);
    expect(duplicate.duplicate).toBe(true);
    const payCount = await pools.servicePool.query(
      `SELECT COUNT(*)::int AS n FROM payments WHERE booking_id = $1`,
      [created.booking.id],
    );
    expect(payCount.rows[0]!.n).toBe(1);
  });

  it("rejects webhooks with invalid signatures before any state change", async (ctx) => {
    if (!pools || !venue || !services) { skipTest(ctx); return; }
    if (paymentProvider().name !== "mock") { skipTest(ctx); return; }

    const slotId = await insertSlot(pools, venue.turfId, new Date(Date.now() + 31 * 3600 * 1000));
    const created = await services.bookings.create(
      { id: venue.customers[0]!, email: "c@turf.test" },
      { turfId: venue.turfId, slotIds: [slotId], paymentMethod: "online", idempotencyKey: "webhook-2" },
      "test-request-id",
    );
    const raw = webhookBody(`testevt-${venue.suffix}-2`, created.payment!.orderId, created.booking.totalAmountMinor);

    await expect(services.payments.handleWebhook("mock", raw, "deadbeef")).rejects.toBeInstanceOf(UnauthorizedException);

    const bookingRow = await pools.servicePool.query(`SELECT booking_status FROM bookings WHERE id = $1`, [created.booking.id]);
    expect(bookingRow.rows[0]!.booking_status).toBe("pending_payment"); // untouched
  });
});
