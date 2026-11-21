import { Injectable } from "@nestjs/common";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { bookings, payments, turfSlots } from "@turf/db";
import { DbService } from "../database/db-tokens.js";

/**
 * Tenant analytics. Financial metrics deliberately distinguish:
 *   bookedValueMinor   — value of bookings (what customers committed to)
 *   collectedMinor     — money actually received (paid payments)
 *   pendingVenueMinor  — pay-at-venue money still to collect at the counter
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DbService) {}

  async overview(tenantId: string, from: Date, to: Date) {
    const window = and(gte(bookings.createdAt, from), lt(bookings.createdAt, to), eq(bookings.tenantId, tenantId));

    const byStatus = await this.db.service
      .select({ status: bookings.bookingStatus, count: sql<number>`COUNT(*)::int`, value: sql<number>`COALESCE(SUM(${bookings.totalAmountMinor}),0)::bigint` })
      .from(bookings)
      .where(window)
      .groupBy(bookings.bookingStatus);

    const collected = await this.db.service
      .select({
        method: payments.method,
        amount: sql<number>`COALESCE(SUM(${payments.amountMinor}),0)::bigint`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(and(eq(bookings.tenantId, tenantId), eq(payments.status, "paid"), gte(payments.paidAt, from), lt(payments.paidAt, to)))
      .groupBy(payments.method);

    const pendingVenue = await this.db.service
      .select({ amount: sql<number>`COALESCE(SUM(${payments.amountMinor}),0)::bigint`, count: sql<number>`COUNT(*)::int` })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .where(and(eq(bookings.tenantId, tenantId), eq(payments.method, "pay_at_venue"), eq(payments.status, "pending")))
      .limit(1);

    // Occupancy: booked slots / all future-or-recent slots in the window.
    const occupancy = await this.db.service
      .select({
        total: sql<number>`COUNT(*)::int`,
        booked: sql<number>`COUNT(*) FILTER (WHERE ${turfSlots.status} IN ('booked','reserved'))::int`,
      })
      .from(turfSlots)
      .where(and(gte(turfSlots.startsAt, from), lt(turfSlots.startsAt, to)))

    const daily = await this.db.service
      .select({
        day: sql<string>`to_char(${bookings.createdAt}, 'YYYY-MM-DD')`,
        bookedValueMinor: sql<number>`COALESCE(SUM(${bookings.totalAmountMinor}),0)::bigint`,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(bookings)
      .where(window)
      .groupBy(sql`to_char(${bookings.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${bookings.createdAt}, 'YYYY-MM-DD')`);

    const collectedOnline = collected.find((c) => c.method === "online");
    const collectedVenue = collected.find((c) => c.method === "pay_at_venue");
    const statusMap = Object.fromEntries(byStatus.map((s) => [s.status, { count: s.count, valueMinor: Number(s.value) }]));

    return {
      window: { from: from.toISOString(), to: to.toISOString() },
      bookings: {
        total: byStatus.reduce((n, s) => n + s.count, 0),
        byStatus: statusMap,
      },
      financial: {
        bookedValueMinor: byStatus.reduce((n, s) => n + Number(s.value), 0),
        collectedOnlineMinor: Number(collectedOnline?.amount ?? 0),
        collectedVenueMinor: Number(collectedVenue?.amount ?? 0),
        collectedTotalMinor: Number(collectedOnline?.amount ?? 0) + Number(collectedVenue?.amount ?? 0),
        pendingVenueMinor: Number(pendingVenue[0]?.amount ?? 0),
        pendingVenueCount: pendingVenue[0]?.count ?? 0,
      },
      occupancy: {
        totalSlots: occupancy[0]?.total ?? 0,
        bookedSlots: occupancy[0]?.booked ?? 0,
        percent: occupancy[0]?.total ? Math.round(((occupancy[0]!.booked ?? 0) / occupancy[0]!.total) * 100) : 0,
      },
      daily,
    };
  }
}
