import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { bookings, paymentEvents, payments, refunds, turfSlots, turfs } from "@turf/db";
import { DbService } from "../database/db-tokens.js";
import { logger } from "../common/logging/logger.service.js";
import { paymentProvider } from "./adapters/index.js";
import { BookingsService } from "../bookings/bookings.service.js";
import { audit } from "../audit-logs/audit.helper.js";

/**
 * Payment lifecycle service. Webhooks are the ONLY trust source for online
 * payment success:
 *   1. HMAC signature verified against the raw body.
 *   2. Event stored idempotently (UNIQUE provider+event_id) — duplicates
 *      return 200 without side effects.
 *   3. Booking confirmed atomically (row locks, status-guarded updates).
 * Late events for expired reservations never resurrect a booking; the money
 * is flagged for refund instead.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly db: DbService,
    private readonly bookings: BookingsService,
  ) {}

  /** Raw webhook entry point (POST /payments/webhook/:provider). */
  async handleWebhook(providerName: string, rawBody: string, signature: string | null): Promise<{
    received: true; duplicate?: boolean; outcome?: string;
  }> {
    const provider = paymentProvider();
    if (provider.name !== providerName) {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: `webhook provider mismatch (active: ${provider.name})` });
    }

    // 1. Signature over the RAW body — never the parsed JSON.
    if (!provider.verifyWebhookSignature(rawBody, signature)) {
      logger.warn({ provider: providerName }, "webhook signature verification FAILED — rejected");
      throw new UnauthorizedException({ errorCode: "UNAUTHORIZED", message: "invalid webhook signature" });
    }

    const event = provider.parseWebhookEvent(rawBody);

    // 2. Idempotent event storage.
    const inserted = await this.db.service
      .insert(paymentEvents)
      .values({
        provider: providerName,
        eventId: event.eventId,
        eventType: event.eventType,
        signatureVerified: true,
        payload: JSON.parse(rawBody) as never,
      })
      .onConflictDoNothing()
      .returning({ id: paymentEvents.id });
    if (inserted.length === 0) {
      // Duplicate delivery: acknowledge without reprocessing.
      logger.info({ eventId: event.eventId }, "duplicate webhook event acknowledged");
      return { received: true, duplicate: true };
    }
    const eventRow = inserted[0]!;

    // 3. Apply.
    try {
      const outcome = await this.applyEvent(event, eventRow.id);
      await this.db.service
        .update(paymentEvents)
        .set({ processedAt: new Date(), paymentId: outcome.paymentId ?? null })
        .where(eq(paymentEvents.id, eventRow.id));
      return { received: true, outcome: outcome.summary };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.db.service
        .update(paymentEvents)
        .set({ error: message.slice(0, 1000), processedAt: new Date() })
        .where(eq(paymentEvents.id, eventRow.id));
      logger.error({ eventId: event.eventId, err }, "webhook processing failed");
      throw err;
    }
  }

  private async applyEvent(
    event: { eventId: string; eventType: string; orderId: string | null; paymentId: string | null; status: "pending" | "paid" | "failed"; amountMinor: number | null },
    _eventRowId: string,
  ): Promise<{ paymentId: string | null; summary: string }> {
    if (!event.orderId) return { paymentId: null, summary: "event carried no order reference" };

    const payRows = await this.db.service
      .select()
      .from(payments)
      .where(eq(payments.providerOrderId, event.orderId))
      .limit(1);
    const payment = payRows[0];
    if (!payment) {
      return { paymentId: null, summary: "unknown order (stored for reconciliation)" };
    }

    if (event.status === "paid" && event.eventType.includes("captured")) {
      // Amount check: gateway money must match the order we created.
      if (event.amountMinor !== null && event.amountMinor < payment.amountMinor) {
        logger.warn(
          { orderId: event.orderId, expected: payment.amountMinor, got: event.amountMinor },
          "webhook amount mismatch — flagged for reconciliation",
        );
        return { paymentId: payment.id, summary: "amount mismatch — flagged" };
      }

      const already = payment.status === "paid";
      if (!already) {
        await this.db.service
          .update(payments)
          .set({ status: "paid", providerPaymentId: event.paymentId, paidAt: new Date(), updatedAt: new Date() })
          .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
      }

      const result = await this.bookings.confirmPaidBooking(
        payment.bookingId,
        payment.amountMinor,
        payment.id,
        "webhook: payment captured",
      );

      if (result.lateAfterExpiry) {
        // Money captured for a dead reservation: record the refund due.
        await this.db.service
          .insert(refunds)
          .values({
            paymentId: payment.id,
            bookingId: payment.bookingId,
            amountMinor: payment.amountMinor,
            status: "pending",
            reason: "late payment after reservation expiry",
          })
          .onConflictDoNothing();
        return { paymentId: payment.id, summary: "late payment flagged for refund" };
      }

      if (result.confirmed) {
        await this.bookings.scheduleBookingNotifications(payment.bookingId, "online");
      }
      return { paymentId: payment.id, summary: already ? "already paid (duplicate content)" : "payment marked paid, booking confirmed" };
    }

    if (event.status === "failed") {
      await this.db.service
        .update(payments)
        .set({ status: "failed", providerPaymentId: event.paymentId, updatedAt: new Date() })
        .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
      return { paymentId: payment.id, summary: "payment failed" };
    }

    return { paymentId: payment.id, summary: `event ${event.eventType} ignored` };
  }

  /** Create (or retry) a payment order for the caller's own pending booking. */
  async createOrderForBooking(userId: string, bookingId: string, requestId: string) {
    const rows = await this.db.service
      .select({ booking: bookings })
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .limit(1);
    const booking = rows[0]?.booking;
    if (!booking || booking.customerId !== userId) {
      throw new NotFoundException({ errorCode: "NOT_FOUND", message: "booking not found" });
    }
    if (booking.paymentMethod !== "online") {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "booking is not an online payment booking" });
    }
    if (booking.bookingStatus !== "pending_payment") {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: `booking is ${booking.bookingStatus}` });
    }

    const order = await paymentProvider().createOrder({
      amountMinor: booking.totalAmountMinor,
      currency: "INR",
      receipt: booking.reference,
      notes: { bookingId: booking.id, customerId: userId },
    });
    const [row] = await this.db.service
      .insert(payments)
      .values({
        bookingId: booking.id,
        provider: order.provider,
        providerOrderId: order.orderId,
        method: "online",
        status: "pending",
        amountMinor: booking.totalAmountMinor,
        orderedBy: userId,
      })
      .returning();
    await audit(this.db.service, {
      requestId, actorId: userId, action: "payment.order_created",
      entityType: "payment", entityId: row!.id, after: { orderId: order.orderId },
    });
    return {
      bookingId: booking.id,
      orderId: order.orderId,
      provider: order.provider,
      keyId: order.keyId,
      amountMinor: booking.totalAmountMinor,
      currency: "INR" as const,
    };
  }

  /**
   * Mock gateway "checkout": simulates the customer paying an order. Only
   * available when the MOCK provider is active (never in Razorpay mode).
   * It goes through the exact same signed-webhook code path as production.
   */
  async mockPay(input: { orderId?: string; bookingId?: string }, userId: string, requestId: string) {
    const provider = paymentProvider();
    if (provider.name !== "mock") {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "mock pay is disabled when Razorpay is active" });
    }
    const { MockPaymentProvider, mockCapture } = await import("./adapters/mock-payment.provider.js");
    if (!(provider instanceof MockPaymentProvider)) {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "mock provider not active" });
    }

    const payRows = await this.db.service
      .select({ payment: payments, booking: bookings })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(
        input.orderId
          ? eq(payments.providerOrderId, input.orderId)
          : and(eq(payments.bookingId, input.bookingId!), eq(payments.method, "online"), eq(payments.status, "pending")),
      )
      .orderBy(desc(payments.createdAt))
      .limit(1);
    const row0 = payRows[0];
    if (!row0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "pending order not found" });
    // Only the booking's customer can "pay" the mock order.
    if (row0.booking.customerId !== userId) {
      throw new NotFoundException({ errorCode: "NOT_FOUND", message: "pending order not found" });
    }
    const payment = row0.payment;
    const orderId = payment.providerOrderId;
    if (payment.status === "paid") return { alreadyPaid: true };

    const { paymentId } = mockCapture(orderId, payment.amountMinor);
    const payload = JSON.stringify({
      eventId: `mock_evt_${paymentId}`,
      event: "payment.captured",
      payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: payment.amountMinor, status: "captured" } } },
    });
    const signature = provider.signWebhookPayload(payload);
    const result = await this.handleWebhook("mock", payload, signature);

    await audit(this.db.service, {
      requestId, actorType: "system", action: "payment.mock_paid",
      entityType: "payment", entityId: payment.id, after: { orderId },
    });
    return result;
  }

  /**
   * Reconciliation: for pending payments past a grace window, ask the gateway
   * for the authoritative status and apply the same transitions as webhooks.
   * Handles missed/late events without double effects (idempotent updates).
   */
  async reconcile(graceSeconds: number, requestId: string): Promise<{ checked: number; resolved: number }> {
    const cutoff = new Date(Date.now() - graceSeconds * 1000);
    const stale = await this.db.service
      .select()
      .from(payments)
      .where(and(eq(payments.status, "pending"), eq(payments.method, "online"), lt(payments.createdAt, cutoff)))
      .limit(100);

    let resolved = 0;
    for (const payment of stale) {
      try {
        const status = await paymentProvider().fetchOrderStatus(payment.providerOrderId);
        if (status.status === "paid" && status.paymentId) {
          await this.db.service
            .update(payments)
            .set({ status: "paid", providerPaymentId: status.paymentId, paidAt: new Date(), updatedAt: new Date() })
            .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
          const result = await this.bookings.confirmPaidBooking(
            payment.bookingId, status.amountMinor ?? payment.amountMinor, payment.id, "reconciliation: captured",
          );
          if (result.lateAfterExpiry) {
            await this.db.service
              .insert(refunds)
              .values({
                paymentId: payment.id, bookingId: payment.bookingId,
                amountMinor: payment.amountMinor, status: "pending",
                reason: "reconciliation: late capture after expiry",
              })
              .onConflictDoNothing();
          } else if (result.confirmed) {
            await this.bookings.scheduleBookingNotifications(payment.bookingId, "online");
          }
          resolved++;
        } else if (status.status === "failed") {
          await this.db.service
            .update(payments)
            .set({ status: "failed", providerPaymentId: status.paymentId, updatedAt: new Date() })
            .where(and(eq(payments.id, payment.id), eq(payments.status, "pending")));
          resolved++;
        }
      } catch (err) {
        logger.warn({ err, paymentId: payment.id }, "reconciliation status fetch failed");
      }
    }

    if (stale.length > 0) {
      await audit(this.db.service, {
        requestId, actorType: "system", action: "payments.reconciled",
        entityType: "payment", after: { checked: stale.length, resolved },
      });
    }
    return { checked: stale.length, resolved };
  }

  /** Tenant collections view: online vs pay-at-venue money states. */
  async listForTenant(tenantId: string) {
    const rows = await this.db.service
      .select({
        payment: payments,
        bookingReference: bookings.reference,
        turfName: turfs.name,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .innerJoin(turfs, eq(turfs.id, bookings.turfId))
      .where(eq(bookings.tenantId, tenantId))
      .orderBy(desc(payments.createdAt))
      .limit(200);
    return rows.map((r) => ({ ...r.payment, bookingReference: r.bookingReference, turfName: r.turfName }));
  }

  /** Marks a pay-at-venue payment as collected (tenant staff, cash counter). */
  async markVenueCollected(tenantId: string, actorId: string, paymentId: string, requestId: string) {
    const rows = await this.db.service
      .select({ payment: payments, booking: bookings })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(and(eq(payments.id, paymentId), eq(bookings.tenantId, tenantId)))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "payment not found" });
    const { payment, booking } = rows[0]!;
    if (payment.method !== "pay_at_venue") {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "only pay-at-venue payments can be marked collected here" });
    }
    if (payment.status === "paid") return { alreadyCollected: true };

    await this.db.service.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({ status: "paid", paidAt: new Date(), updatedAt: new Date() })
        .where(eq(payments.id, paymentId));
      await tx
        .update(bookings)
        .set({ paidAmountMinor: booking.totalAmountMinor, updatedAt: new Date() })
        .where(eq(bookings.id, booking.id));
    });

    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "payment.venue_collected", entityType: "payment", entityId: paymentId,
      after: { bookingReference: booking.reference, amountMinor: payment.amountMinor },
    });
    return { collected: true, paymentId };
  }
}
