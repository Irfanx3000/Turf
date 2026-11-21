import { Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { auditLogs, bookings, payments, profiles, tenants, turfs } from "@turf/db";
import { DbService } from "../database/db-tokens.js";
import { audit } from "../audit-logs/audit.helper.js";

/** Super-admin operations. Every route is @Roles("super_admin"). */
@Injectable()
export class AdminService {
  constructor(private readonly db: DbService) {}

  async dashboard() {
    const [tenantCounts, userCount, bookingCounts, gmv, collected, recentAudit] = await Promise.all([
      this.db.service
        .select({ status: tenants.status, count: sql<number>`COUNT(*)::int` })
        .from(tenants)
        .groupBy(tenants.status),
      this.db.service.select({ count: sql<number>`COUNT(*)::int` }).from(profiles),
      this.db.service
        .select({ status: bookings.bookingStatus, count: sql<number>`COUNT(*)::int`, value: sql<number>`COALESCE(SUM(${bookings.totalAmountMinor}),0)::bigint` })
        .from(bookings)
        .groupBy(bookings.bookingStatus),
      this.db.service.select({ value: sql<number>`COALESCE(SUM(${bookings.totalAmountMinor}),0)::bigint` }).from(bookings),
      this.db.service
        .select({ method: payments.method, value: sql<number>`COALESCE(SUM(${payments.amountMinor}),0)::bigint` })
        .from(payments)
        .where(eq(payments.status, "paid"))
        .groupBy(payments.method),
      this.db.service.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(10),
    ]);

    return {
      tenants: Object.fromEntries(tenantCounts.map((t) => [t.status, t.count])),
      users: userCount[0]?.count ?? 0,
      bookings: Object.fromEntries(bookingCounts.map((b) => [b.status, { count: b.count, valueMinor: Number(b.value) }])),
      financial: {
        gmvMinor: Number(gmv[0]?.value ?? 0),
        collectedOnlineMinor: Number(collected.find((c) => c.method === "online")?.value ?? 0),
        collectedVenueMinor: Number(collected.find((c) => c.method === "pay_at_venue")?.value ?? 0),
      },
      recentAudit,
    };
  }

  async listTenants(status?: string) {
    const conditions = status ? [sql`${tenants.status}::text = ${status}`] : [];
    const rows = await this.db.service
      .select({
        tenant: tenants,
        turfCount: sql<number>`(SELECT COUNT(*)::int FROM ${turfs} t WHERE t.tenant_id = ${tenants.id})`,
      })
      .from(tenants)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(tenants.createdAt))
      .limit(200);
    return rows.map((r) => ({ ...r.tenant, turfCount: r.turfCount }));
  }

  async setTenantStatus(actorId: string, tenantId: string, action: "verify" | "suspend" | "reactivate", reason: string | undefined, requestId: string) {
    const rows = await this.db.service.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "tenant not found" });
    const before = rows[0]!;

    const patch =
      action === "verify"
        ? { status: "active" as const, verifiedAt: new Date(), suspendedAt: null, suspensionReason: null }
        : action === "suspend"
          ? { status: "suspended" as const, suspendedAt: new Date(), suspensionReason: reason ?? null }
          : { status: "active" as const, suspendedAt: null, suspensionReason: null };

    const [updated] = await this.db.service.update(tenants).set(patch).where(eq(tenants.id, tenantId)).returning();
    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: `tenant.${action === "verify" ? "verified" : action === "suspend" ? "suspended" : "reactivated"}`,
      entityType: "tenant", entityId: tenantId,
      before: { status: before.status }, after: { status: updated!.status },
    });
    return updated;
  }

  async listUsers(search?: string) {
    const conditions = search
      ? [sql`(${profiles.email} ILIKE ${"%" + search + "%"} OR COALESCE(${profiles.fullName}, '') ILIKE ${"%" + search + "%"})`]
      : [];
    return this.db.service
      .select({ id: profiles.id, email: profiles.email, platformRole: profiles.platformRole, fullName: profiles.fullName, phone: profiles.phone, isActive: profiles.isActive, createdAt: profiles.createdAt })
      .from(profiles)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(profiles.createdAt))
      .limit(100);
  }

  async setUserActive(actorId: string, userId: string, isActive: boolean, requestId: string) {
    const rows = await this.db.service.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "user not found" });
    await this.db.service.update(profiles).set({ isActive }).where(eq(profiles.id, userId));
    await audit(this.db.service, {
      requestId, actorId, action: isActive ? "user.enabled" : "user.disabled",
      entityType: "profile", entityId: userId, before: { isActive: !isActive }, after: { isActive },
    });
    return { userId, isActive };
  }

  async listBookings(status?: string) {
    const conditions = status ? [sql`${bookings.bookingStatus}::text = ${status}`] : [];
    return this.db.service
      .select({ booking: bookings, turfName: turfs.name, tenantName: tenants.name })
      .from(bookings)
      .innerJoin(turfs, eq(turfs.id, bookings.turfId))
      .innerJoin(tenants, eq(tenants.id, bookings.tenantId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(bookings.createdAt))
      .limit(200);
  }

  async listPayments(status?: string) {
    const conditions = status ? [sql`${payments.status}::text = ${status}`] : [];
    return this.db.service
      .select({ payment: payments, reference: bookings.reference, tenantName: tenants.name })
      .from(payments)
      .innerJoin(bookings, eq(bookings.id, payments.bookingId))
      .innerJoin(tenants, eq(tenants.id, bookings.tenantId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(payments.createdAt))
      .limit(200);
  }

  async listAuditLogs(entityType?: string, actorId?: string, page = 1, pageSize = 50) {
    const conditions = [];
    if (entityType) conditions.push(eq(auditLogs.entityType, entityType));
    if (actorId) conditions.push(eq(auditLogs.actorId, actorId));
    const rows = await this.db.service
      .select()
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const total = await this.db.service
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
    return { items: rows, total: total[0]?.count ?? 0, page, pageSize };
  }

  async listTurfs(status?: string) {
    const conditions = status ? [sql`${turfs.status}::text = ${status}`] : [];
    return this.db.service
      .select({ turf: turfs, tenantName: tenants.name })
      .from(turfs)
      .innerJoin(tenants, eq(tenants.id, turfs.tenantId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(turfs.createdAt))
      .limit(200);
  }
}
