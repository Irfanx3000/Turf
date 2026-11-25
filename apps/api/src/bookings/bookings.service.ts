import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { bookingCancellations, bookingItems, bookingStatusHistory, bookings, notifications, payments, profiles, refunds, turfSlots, turfs } from "@turf/db";
import type { BookingSummary, CreateBookingResponse } from "@turf/shared-types";
import { DbService } from "../database/db-tokens.js";
import { audit } from "../audit-logs/audit.helper.js";
import { ENV } from "../config/configuration.js";
import { paymentProvider } from "../payments/adapters/index.js";
import { computeRefundDue } from "./cancellation-policy.js";
import { logger } from "../common/logging/logger.service.js";

/**
 * ── Booking engine ─────────────────────────────────────────────────────
 * Every write goes through the service pool inside a transaction with row
 * locks. Anti-double-booking is guaranteed at three levels:
 *   1. SELECT ... FOR UPDATE on the slot rows (ordered by id — no deadlocks)
 *   2. conditional UPDATE ... WHERE status = 'available' (compare-and-swap)
 *   3. DB constraints: booking_items.slot_id UNIQUE + turf_slots_no_overlap
 * Idempotency: UNIQUE (customer_id, idempotency_key) retries map to the
 * original booking.
 */
@Injectable()
export class BookingsService {
  private readonly nestLogger = new Logger(BookingsService.name);

  constructor(private readonly db: DbService) {}

  async create(
    user: { id: string; email: string },
    input: { turfId: string; slotIds: string[]; paymentMethod: "online" | "pay_at_venue"; notes?: string; idempotencyKey: string },
    requestId: string,
  ): Promise<CreateBookingResponse> {
    // 1. Idempotent replay.
    const existing = await this.db.service
      .select()
      .from(bookings)
      .where(and(eq(bookings.customerId, user.id), eq(bookings.idempotencyKey, input.idempotencyKey)))
      .limit(1);
    if (existing.length > 0) {
      const booking = existing[0]!;
      const paymentRows = await this.db.service
        .select()
        .from(payments)
        .where(eq(payments.bookingId, booking.id))
        .orderBy(desc(payments.createdAt))
        .limit(1);
      return this.toCreateResponse(booking, paymentRows[0] ?? null, { replayed: true });
    }

    // 2. Load turf (server-side state only; client input is never trusted for
    //    prices, ownership or availability).
    const turfRows = await this.db.service
      .select({
        id: turfs.id,
        tenantId: turfs.tenantId,
        name: turfs.name,
        slug: turfs.slug,
        status: turfs.status,
        payAtVenueAllowed: turfs.payAtVenueAllowed,
        cancellationPolicy: turfs.cancellationPolicy,
      })
      .from(turfs)
      .where(eq(turfs.id, input.turfId))
      .limit(1);
    const turf = turfRows[0];
    if (!turf || turf.status !== "published") {
      throw new NotFoundException({ errorCode: "NOT_FOUND", message: "turf not found or not bookable" });
    }
    if (input.paymentMethod === "pay_at_venue" && !turf.payAtVenueAllowed) {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "this turf requires online payment" });
    }

    // 3. Transaction: lock slots, create booking, claim slots, write items.
    const now = new Date();
    const reservationExpiresAt =
      input.paymentMethod === "online" ? new Date(now.getTime() + ENV.RESERVATION_TTL_SECONDS * 1000) : null;

    const created = await this.db.service.transaction(async (tx) => {
      const slots = await tx
        .select()
        .from(turfSlots)
        .where(and(eq(turfSlots.turfId, turf.id), inArray(turfSlots.id, input.slotIds)))
        .orderBy(asc(turfSlots.id)); // deterministic lock order
      if (slots.length !== new Set(input.slotIds).size) {
        throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "some slots do not exist on this turf" });
      }
      for (const slot of slots) {
        if (slot.status !== "available") {
          throw new ConflictException({
            errorCode: "SLOT_TAKEN",
            message: "this slot was just booked by someone else",
          });
        }
        if (slot.startsAt.getTime() <= now.getTime()) {
          throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "cannot book a slot that already started" });
        }
      }

      const total = slots.reduce((sum, s) => sum + s.priceMinor, 0);
      const [booking] = await tx
        .insert(bookings)
        .values({
          reference: sql`public.next_booking_reference()`,
          tenantId: turf.tenantId,
          turfId: turf.id,
          customerId: user.id,
          bookingStatus: input.paymentMethod === "online" ? "pending_payment" : "confirmed",
          paymentMethod: input.paymentMethod,
          totalAmountMinor: total,
          notes: input.notes,
          idempotencyKey: input.idempotencyKey,
          reservationExpiresAt,
        })
        .returning();

      // Compare-and-swap claim; the FOR UPDATE above means nobody else can be
      // between our read and this write, but the WHERE keeps the invariant
      // explicit and testable.
      for (const slot of slots) {
        const claimed = await tx
          .update(turfSlots)
          .set({
            status: input.paymentMethod === "online" ? "reserved" : "booked",
            bookingId: booking!.id,
            reservationExpiresAt,
            updatedAt: now,
          })
          .where(and(eq(turfSlots.id, slot.id), eq(turfSlots.status, "available")))
          .returning({ id: turfSlots.id });
        if (claimed.length === 0) {
          throw new ConflictException({
            errorCode: "SLOT_TAKEN",
            message: "this slot was just booked by someone else",
          });
        }
      }

      await tx.insert(bookingItems).values(
        slots.map((s) => ({
          bookingId: booking!.id,
          slotId: s.id,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
          priceMinor: s.priceMinor,
        })),
      );

      await tx.insert(bookingStatusHistory).values({
        bookingId: booking!.id,
        fromStatus: null,
        toStatus: booking!.bookingStatus,
        changedBy: user.id,
        reason: input.paymentMethod === "online" ? "reservation created" : "confirmed (pay at venue)",
      });

      return booking!;
    });

    // 4. Payment order for online flow (compensate on failure).
    let paymentRow: typeof payments.$inferSelect | null = null;
    if (input.paymentMethod === "online") {
      try {
        const order = await paymentProvider().createOrder({
          amountMinor: created.totalAmountMinor,
          currency: "INR",
          receipt: created.reference,
          notes: { bookingId: created.id, customerId: user.id },
        });
        const [row] = await this.db.service
          .insert(payments)
          .values({
            bookingId: created.id,
            provider: order.provider,
            providerOrderId: order.orderId,
            method: "online",
            status: "pending",
            amountMinor: created.totalAmountMinor,
            orderedBy: user.id,
          })
          .returning();
        paymentRow = row!;
      } catch (err) {
        logger.error({ requestId, err, bookingId: created.id }, "payment order creation failed — releasing reservation");
        await this.cancelReservation(created.id, "payment provider unavailable", requestId);
        throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "payment provider unavailable, please retry" });
      }
    } else {
      const [row] = await this.db.service
        .insert(payments)
        .values({
          bookingId: created.id,
          provider: "none",
          providerOrderId: `venue_${created.reference}`,
          method: "pay_at_venue",
          status: "pending",
          amountMinor: created.totalAmountMinor,
          orderedBy: user.id,
        })
        .returning();
      paymentRow = row!;
      // Pay-at-venue is instantly confirmed: schedule notifications now.
      await this.scheduleBookingNotifications(created.id, "pay_at_venue");
    }

    await audit(this.db.service, {
      requestId,
      actorId: user.id,
      tenantId: created.tenantId,
      action: "booking.created",
      entityType: "booking",
      entityId: created.id,
      after: { reference: created.reference, total: created.totalAmountMinor, method: input.paymentMethod },
    });

    return this.toCreateResponse(created, paymentRow, { replayed: false });
  }

  /** Used by the payments webhook: online payment verified → confirm. */
  async confirmPaidBooking(
    bookingId: string,
    paidAmountMinor: number,
    paymentId: string,
    reason: string,
  ): Promise<{ confirmed: boolean; lateAfterExpiry: boolean }> {
    return this.db.service.transaction(async (tx) => {
      const rows = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1).for("update");
      const booking = rows[0];
      if (!booking) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "booking not found" });

      if (booking.bookingStatus === "confirmed" || booking.bookingStatus === "completed") {
        return { confirmed: true, lateAfterExpiry: false }; // already confirmed (duplicate webhook)
      }

      if (booking.bookingStatus === "expired" || booking.bookingStatus === "cancelled") {
        // Late payment after expiry/cancellation: money captured for a dead
        // reservation. Keep the payment as paid and flag for refund.
        logger.warn(
          { bookingId, paymentId, status: booking.bookingStatus },
          "late payment event for expired/cancelled booking — flagged for refund",
        );
        return { confirmed: false, lateAfterExpiry: true };
      }

      await tx
        .update(bookings)
        .set({ bookingStatus: "confirmed", paidAmountMinor, updatedAt: new Date() })
        .where(eq(bookings.id, bookingId));

      await tx
        .update(turfSlots)
        .set({ status: "booked", reservationExpiresAt: null, updatedAt: new Date() })
        .where(and(eq(turfSlots.bookingId, bookingId), eq(turfSlots.status, "reserved")));

      await tx.insert(bookingStatusHistory).values({
        bookingId,
        fromStatus: "pending_payment",
        toStatus: "confirmed",
        reason,
      });

      return { confirmed: true, lateAfterExpiry: false };
    });
  }

  /** Releases a pending reservation (sweeper + provider-failure compensation). */
  async cancelReservation(bookingId: string, reason: string, requestId?: string): Promise<void> {
    await this.db.service.transaction(async (tx) => {
      const rows = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1).for("update");
      const booking = rows[0];
      if (!booking || booking.bookingStatus !== "pending_payment") return;

      await tx
        .update(bookings)
        .set({ bookingStatus: "expired", updatedAt: new Date() })
        .where(eq(bookings.id, bookingId));
      await tx
        .update(turfSlots)
        .set({ status: "available", bookingId: null, reservationExpiresAt: null, updatedAt: new Date() })
        .where(and(eq(turfSlots.bookingId, bookingId), eq(turfSlots.status, "reserved")));
      await tx.insert(bookingStatusHistory).values({
        bookingId, fromStatus: "pending_payment", toStatus: "expired", reason,
      });
    });
    if (requestId) {
      await audit(this.db.service, {
        requestId, actorType: "system", action: "booking.reservation_released",
        entityType: "booking", entityId: bookingId, after: { reason },
      });
    }
  }

  /**
   * Cancellation by customer (own booking) or tenant staff (their turf).
   * Applies the explicit refund policy and releases the slots.
   */
  async cancel(
    bookingId: string,
    actor: { id: string; platformRole: string; memberships: Array<{ tenantId: string; role: string }> },
    reason: string | undefined,
    requestId: string,
  ): Promise<{ booking: BookingSummary; refundDueMinor: number }> {
    const rows = await this.db.service
      .select({ booking: bookings, turf: turfs, customerEmail: profiles.email })
      .from(bookings)
      .innerJoin(turfs, eq(turfs.id, bookings.turfId))
      .innerJoin(profiles, eq(profiles.id, bookings.customerId))
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "booking not found" });
    const { booking, turf } = rows[0]!;

    const isCustomer = booking.customerId === actor.id;
    const isTenantMember = actor.memberships.some((m) => m.tenantId === booking.tenantId) || actor.platformRole === "super_admin";
    if (!isCustomer && !isTenantMember) {
      throw new ForbiddenException({ errorCode: "FORBIDDEN", message: "not your booking" });
    }
    if (!["confirmed", "pending_payment"].includes(booking.bookingStatus)) {
      throw new ConflictException({ errorCode: "CONFLICT", message: `booking is ${booking.bookingStatus} and cannot be cancelled` });
    }

    const firstItem = (
      await this.db.service
        .select({ startsAt: bookingItems.startsAt })
        .from(bookingItems)
        .where(eq(bookingItems.bookingId, bookingId))
        .orderBy(asc(bookingItems.startsAt))
        .limit(1)
    )[0];

    const decision = computeRefundDue({
      policy: turf.cancellationPolicy,
      customRefundPercent: turf.customRefundPercent,
      bookingStartsAt: firstItem?.startsAt ?? new Date(),
      now: new Date(),
      paidAmountMinor: booking.paidAmountMinor,
      paymentMethod: booking.paymentMethod,
    });

    const cancelled = await this.db.service.transaction(async (tx) => {
      const locked = await tx.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1).for("update");
      if (!["confirmed", "pending_payment"].includes(locked[0]!.bookingStatus)) {
        throw new ConflictException({ errorCode: "CONFLICT", message: "booking state changed, refresh and retry" });
      }

      await tx
        .update(bookings)
        .set({ bookingStatus: "cancelled", cancelledAt: new Date(), cancelledBy: actor.id, updatedAt: new Date() })
        .where(eq(bookings.id, bookingId));
      await tx
        .update(turfSlots)
        .set({ status: "available", bookingId: null, reservationExpiresAt: null, updatedAt: new Date() })
        .where(and(eq(turfSlots.bookingId, bookingId), inArray(turfSlots.status, ["reserved", "booked"])));
      await tx.insert(bookingCancellations).values({
        bookingId, cancelledBy: actor.id, reason, policyApplied: decision.policyApplied, refundDueMinor: decision.refundDueMinor,
      });
      await tx.insert(bookingStatusHistory).values({
        bookingId, fromStatus: booking.bookingStatus, toStatus: "cancelled", changedBy: actor.id, reason: decision.reason,
      });

      // Refund record for money actually collected online.
      if (decision.refundDueMinor > 0) {
        const payRows = await tx
          .select()
          .from(payments)
          .where(and(eq(payments.bookingId, bookingId), eq(payments.status, "paid")))
          .limit(1);
        const pay = payRows[0];
        if (pay) {
          await tx.insert(refunds).values({
            paymentId: pay.id,
            bookingId,
            amountMinor: decision.refundDueMinor,
            status: "pending",
            reason: decision.reason,
            initiatedBy: actor.id,
          });
        }
      }
      return locked[0]!;
    });

    // Notifications (best effort).
    await this.db.service
      .insert(notifications)
      .values({
        userId: booking.customerId,
        kind: "booking_cancelled",
        title: `Booking ${booking.reference} cancelled`,
        body: decision.refundDueMinor > 0
          ? `Your booking was cancelled. A refund of ₹${(decision.refundDueMinor / 100).toFixed(2)} is being processed.`
          : `Your booking was cancelled. ${decision.reason}.`,
        data: { bookingId, refundDueMinor: decision.refundDueMinor },
      })
      .catch(() => undefined);

    await audit(this.db.service, {
      requestId, actorId: actor.id, tenantId: booking.tenantId,
      action: "booking.cancelled", entityType: "booking", entityId: bookingId,
      before: { status: booking.bookingStatus }, after: { status: "cancelled", refundDueMinor: decision.refundDueMinor },
    });

    return { booking: await this.toSummary(cancelled), refundDueMinor: decision.refundDueMinor };
  }

  /* ── queries ─────────────────────────────────────────────── */

  async listForCustomer(userId: string, page: number, pageSize: number, status?: string) {
    const conditions = [eq(bookings.customerId, userId)];
    if (status) conditions.push(sql`${bookings.bookingStatus}::text = ${status}`);
    const rows = await this.db.service
      .select({ booking: bookings, turfName: turfs.name, turfSlug: turfs.slug })
      .from(bookings)
      .innerJoin(turfs, eq(turfs.id, bookings.turfId))
      .where(and(...conditions))
      .orderBy(desc(bookings.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const total = await this.db.service
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(bookings)
      .where(and(...conditions));
    return {
      items: await Promise.all(rows.map((r) => this.toSummary(r.booking, r.turfName, r.turfSlug))),
      total: total[0]?.count ?? 0,
      page,
      pageSize,
    };
  }

  async listForTenant(tenantId: string, page: number, pageSize: number, status?: string, from?: Date, to?: Date) {
    const conditions = [eq(bookings.tenantId, tenantId)];
    if (status) conditions.push(sql`${bookings.bookingStatus}::text = ${status}`);
    if (from) conditions.push(gte(bookings.createdAt, from));
    if (to) conditions.push(lt(bookings.createdAt, to));
    const rows = await this.db.service
      .select({ booking: bookings, turfName: turfs.name, turfSlug: turfs.slug, customerName: profiles.fullName, customerEmail: profiles.email })
      .from(bookings)
      .innerJoin(turfs, eq(turfs.id, bookings.turfId))
      .innerJoin(profiles, eq(profiles.id, bookings.customerId))
      .where(and(...conditions))
      .orderBy(desc(bookings.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const total = await this.db.service
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(bookings)
      .where(and(...conditions));
    return {
      items: rows.map((r) => ({
        ...r.booking,
        turfName: r.turfName,
        turfSlug: r.turfSlug,
        customerName: r.customerName,
        customerEmail: r.customerEmail,
      })),
      total: total[0]?.count ?? 0,
      page,
      pageSize,
    };
  }

  async getForActor(bookingId: string, actor: { id: string; platformRole: string; memberships: Array<{ tenantId: string; role: string }> }) {
    const rows = await this.db.service
      .select({ booking: bookings, turfName: turfs.name, turfSlug: turfs.slug })
      .from(bookings)
      .innerJoin(turfs, eq(turfs.id, bookings.turfId))
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "booking not found" });
    const { booking, turfName, turfSlug } = rows[0]!;
    const allowed =
      booking.customerId === actor.id ||
      actor.platformRole === "super_admin" ||
      actor.memberships.some((m) => m.tenantId === booking.tenantId);
    if (!allowed) throw new ForbiddenException({ errorCode: "FORBIDDEN", message: "not allowed to view this booking" });
    return { ...(await this.toSummary(booking, turfName, turfSlug)), items: await this.itemsFor(bookingId) };
  }

  async historyFor(bookingId: string) {
    return this.db.service
      .select()
      .from(bookingStatusHistory)
      .where(eq(bookingStatusHistory.bookingId, bookingId))
      .orderBy(asc(bookingStatusHistory.createdAt));
  }

  /** Tenant-side no-show marking (pay-at-venue money never collected). */
  async markNoShow(tenantId: string, actorId: string, bookingId: string, requestId: string) {
    const result = await this.db.service.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, bookingId), eq(bookings.tenantId, tenantId)))
        .limit(1)
        .for("update");
      if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "booking not found" });
      const booking = rows[0]!;
      if (booking.bookingStatus !== "confirmed") {
        throw new ConflictException({ errorCode: "CONFLICT", message: "only confirmed bookings can be marked no-show" });
      }
      await tx.update(bookings).set({ bookingStatus: "no_show", updatedAt: new Date() }).where(eq(bookings.id, bookingId));
      await tx
        .update(turfSlots)
        .set({ status: "available", bookingId: null, reservationExpiresAt: null, updatedAt: new Date() })
        .where(and(eq(turfSlots.bookingId, bookingId), eq(turfSlots.status, "booked")));
      await tx.insert(bookingStatusHistory).values({
        bookingId, fromStatus: "confirmed", toStatus: "no_show", changedBy: actorId, reason: "marked no-show by venue",
      });
      return booking;
    });
    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "booking.no_show", entityType: "booking", entityId: bookingId,
    });
    return { bookingId, status: "no_show", reference: result.reference };
  }

  /**
   * Notifications for a confirmed booking: confirmation + 24h/1h reminders.
   * Direct DB writes; the dispatcher (jobs module) picks them up.
   */
  async scheduleBookingNotifications(bookingId: string, method: string): Promise<void> {
    try {
      const rows = await this.db.service
        .select({ booking: bookings, turfName: turfs.name, customerEmail: profiles.email })
        .from(bookings)
        .innerJoin(turfs, eq(turfs.id, bookings.turfId))
        .innerJoin(profiles, eq(profiles.id, bookings.customerId))
        .where(eq(bookings.id, bookingId))
        .limit(1);
      const row = rows[0];
      if (!row) return;
      const firstItem = (
        await this.db.service
          .select({ startsAt: bookingItems.startsAt })
          .from(bookingItems)
          .where(eq(bookingItems.bookingId, bookingId))
          .orderBy(asc(bookingItems.startsAt))
          .limit(1)
      )[0];
      const startsAt = firstItem?.startsAt;
      if (!startsAt) return;

      await this.db.service.insert(notifications).values({
        userId: row.booking.customerId,
        kind: "booking_confirmed",
        title: `Booking confirmed: ${row.turfName}`,
        body: `Your booking ${row.booking.reference} starts ${startsAt.toISOString()}. Payment: ${method === "pay_at_venue" ? "pay at venue" : "paid online"}.`,
        data: { bookingId, startsAt: startsAt.toISOString() },
      });

      // Reminders as pre-scheduled rows for the dispatcher.
      const reminder = async (kind: "booking_reminder_24h" | "booking_reminder_1h", leadMs: number) => {
        const due = new Date(startsAt.getTime() - leadMs);
        if (due.getTime() <= Date.now()) return;
        await this.db.service.insert(notifications).values({
          userId: row.booking.customerId,
          kind,
          title: kind === "booking_reminder_24h" ? "Tomorrow's booking" : "Starting soon",
          body: `Booking ${row.booking.reference} at ${row.turfName} starts ${startsAt.toISOString()}.`,
          data: { bookingId, startsAt: startsAt.toISOString(), scheduledFor: due.toISOString() },
        });
      };
      await reminder("booking_reminder_24h", 24 * 3600 * 1000);
      await reminder("booking_reminder_1h", 3600 * 1000);
    } catch (err) {
      logger.error({ err, bookingId }, "failed to schedule booking notifications");
    }
  }

  private async itemsFor(bookingId: string) {
    return this.db.service
      .select({ id: bookingItems.id, slotId: bookingItems.slotId, startsAt: bookingItems.startsAt, endsAt: bookingItems.endsAt, priceMinor: bookingItems.priceMinor })
      .from(bookingItems)
      .where(eq(bookingItems.bookingId, bookingId))
      .orderBy(asc(bookingItems.startsAt));
  }

  private async toSummary(b: typeof bookings.$inferSelect, turfName?: string, turfSlug?: string): Promise<BookingSummary> {
    let name = turfName;
    let slug = turfSlug;
    if (!name || !slug) {
      const rows = await this.db.service
        .select({ name: turfs.name, slug: turfs.slug })
        .from(turfs)
        .where(eq(turfs.id, b.turfId))
        .limit(1);
      name = rows[0]?.name ?? "Unknown";
      slug = rows[0]?.slug ?? "";
    }
    const items = await this.itemsFor(b.id);
    const latestPayment = (
      await this.db.service
        .select({ status: payments.status })
        .from(payments)
        .where(eq(payments.bookingId, b.id))
        .orderBy(desc(payments.createdAt))
        .limit(1)
    )[0];
    return {
      id: b.id,
      reference: b.reference,
      turfId: b.turfId,
      turfName: name,
      turfSlug: slug,
      startsAt: items[0]?.startsAt.toISOString() ?? b.createdAt.toISOString(),
      endsAt: items[items.length - 1]?.endsAt.toISOString() ?? b.createdAt.toISOString(),
      totalAmountMinor: b.totalAmountMinor,
      paidAmountMinor: b.paidAmountMinor,
      currency: "INR",
      bookingStatus: b.bookingStatus,
      paymentStatus: latestPayment?.status ?? "pending",
      paymentMethod: b.paymentMethod,
      createdAt: b.createdAt.toISOString(),
    };
  }

  private toCreateResponse(
    booking: typeof bookings.$inferSelect,
    payment: typeof payments.$inferSelect | null,
    meta: { replayed: boolean },
  ): CreateBookingResponse {
    const provider = paymentProvider();
    return {
      booking: {
        id: booking.id,
        reference: booking.reference,
        turfId: booking.turfId,
        turfName: "",
        turfSlug: "",
        startsAt: booking.createdAt.toISOString(),
        endsAt: booking.createdAt.toISOString(),
        totalAmountMinor: booking.totalAmountMinor,
        paidAmountMinor: booking.paidAmountMinor,
        currency: "INR",
        bookingStatus: booking.bookingStatus,
        paymentStatus: payment?.status ?? "pending",
        paymentMethod: booking.paymentMethod,
        createdAt: booking.createdAt.toISOString(),
      },
      payment:
        payment && booking.paymentMethod === "online"
          ? {
              orderId: payment.providerOrderId,
              provider: payment.provider as "razorpay" | "mock",
              keyId: provider.name === "razorpay" ? ENV.RAZORPAY_KEY_ID ?? null : null,
              amountMinor: payment.amountMinor,
              currency: "INR",
              checkoutToken: null,
            }
          : undefined,
      reservationExpiresAt: booking.reservationExpiresAt?.toISOString() ?? null,
      ...(meta.replayed ? { replayed: true as const } : {}),
    };
  }
}
