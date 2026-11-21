import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { profiles, tenantMembers, tenants } from "@turf/db";
import type { CreateTenantInput } from "@turf/validation";
import type { TenantSummary } from "@turf/shared-types";
import { DbService } from "../database/db-tokens.js";
import { audit } from "../audit-logs/audit.helper.js";
import { slugify } from "../auth/auth.service.js";

@Injectable()
export class TenantsService {
  constructor(private readonly db: DbService) {}

  /** Owner onboarding: creates the org and the founding owner membership. */
  async createForUser(userId: string, input: CreateTenantInput, requestId: string): Promise<TenantSummary> {
    const slug = slugify(input.slug !== "" ? input.slug : input.name);
    const taken = await this.db.service.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (taken.length > 0) {
      throw new ConflictException({ errorCode: "CONFLICT", message: "organization slug already taken" });
    }

    const tenant = await this.db.service.transaction(async (tx) => {
      const inserted = await tx
        .insert(tenants)
        .values({
          name: input.name,
          slug,
          status: "pending_verification",
          supportEmail: input.supportEmail,
          supportPhone: input.supportPhone,
          logoUrl: input.logoUrl,
          createdBy: userId,
        })
        .returning();
      const row = inserted[0]!;
      await tx.insert(tenantMembers).values({ tenantId: row.id, userId, role: "owner" });
      // Founding owner gets the tenant_owner platform role (idempotent upgrade).
      await tx
        .update(profiles)
        .set({ platformRole: sql`CASE WHEN platform_role = 'customer' THEN 'tenant_owner' ELSE platform_role END` })
        .where(eq(profiles.id, userId));
      return row;
    });

    await audit(this.db.service, {
      requestId,
      actorId: userId,
      action: "tenant.created",
      entityType: "tenant",
      entityId: tenant.id,
      after: { name: tenant.name, slug: tenant.slug },
    });

    return this.toSummary(tenant);
  }

  async listForUser(userId: string): Promise<TenantSummary[]> {
    const rows = await this.db.service
      .select({
        id: tenants.id, name: tenants.name, slug: tenants.slug,
        status: tenants.status, logoUrl: tenants.logoUrl, city: tenants.supportEmail,
      })
      .from(tenantMembers)
      .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
      .where(eq(tenantMembers.userId, userId))
      .orderBy(desc(tenantMembers.createdAt));
    return rows.map((r) => ({
      id: r.id, name: r.name, slug: r.slug, status: r.status, logoUrl: r.logoUrl, city: null,
    }));
  }

  async get(tenantId: string): Promise<TenantSummary> {
    const rows = await this.db.service.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "tenant not found" });
    return this.toSummary(rows[0]!);
  }

  async update(tenantId: string, actorId: string, input: Partial<CreateTenantInput>, requestId: string): Promise<TenantSummary> {
    const rows = await this.db.service.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "tenant not found" });
    const before = rows[0]!;

    const [updated] = await this.db.service
      .update(tenants)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.supportEmail !== undefined ? { supportEmail: input.supportEmail } : {}),
        ...(input.supportPhone !== undefined ? { supportPhone: input.supportPhone } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "tenant.updated", entityType: "tenant", entityId: tenantId,
      before: { name: before.name, supportEmail: before.supportEmail },
      after: { name: updated!.name, supportEmail: updated!.supportEmail },
    });
    return this.toSummary(updated!);
  }

  /** Membership management used by the tenant members controller. */
  async listMembers(tenantId: string) {
    return this.db.service
      .select({
        id: tenantMembers.id,
        userId: profiles.id,
        email: profiles.email,
        fullName: profiles.fullName,
        role: tenantMembers.role,
        createdAt: tenantMembers.createdAt,
      })
      .from(tenantMembers)
      .innerJoin(profiles, eq(profiles.id, tenantMembers.userId))
      .where(eq(tenantMembers.tenantId, tenantId))
      .orderBy(desc(tenantMembers.createdAt));
  }

  async addMember(tenantId: string, actorId: string, email: string, role: "manager" | "staff", requestId: string) {
    const profileRows = await this.db.service.select().from(profiles).where(eq(profiles.email, email)).limit(1);
    const profile = profileRows[0];
    if (!profile) {
      // Honest behavior: we do not silently invite unregistered emails in v1.
      throw new NotFoundException({ errorCode: "NOT_FOUND", message: "no account exists with that email — ask them to register first" });
    }
    const existing = await this.db.service
      .select({ id: tenantMembers.id })
      .from(tenantMembers)
      .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.userId, profile.id)))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictException({ errorCode: "CONFLICT", message: "user is already a member" });
    }
    const [member] = await this.db.service
      .insert(tenantMembers)
      .values({ tenantId, userId: profile.id, role, invitedBy: actorId })
      .returning();
    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "tenant.member_added", entityType: "tenant_member", entityId: member!.id,
      after: { email, role },
    });
    return { id: member!.id, userId: profile.id, email: profile.email, fullName: profile.fullName, role: member!.role };
  }

  async updateMemberRole(tenantId: string, actorId: string, memberId: string, role: "owner" | "manager" | "staff", requestId: string) {
    const rows = await this.db.service
      .select()
      .from(tenantMembers)
      .where(and(eq(tenantMembers.id, memberId), eq(tenantMembers.tenantId, tenantId)))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "member not found" });
    const member = rows[0]!;

    if (role === "owner") {
      // Ownership transfer: demote every other owner first, in one transaction.
      await this.db.service.transaction(async (tx) => {
        await tx
          .update(tenantMembers)
          .set({ role: "manager" })
          .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.role, "owner"), ne(tenantMembers.id, memberId)));
        await tx.update(tenantMembers).set({ role: "owner" }).where(eq(tenantMembers.id, memberId));
      });
    } else {
      if (member.role === "owner") {
        const owners = await this.db.service
          .select({ id: tenantMembers.id })
          .from(tenantMembers)
          .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.role, "owner")));
        if (owners.length <= 1) {
          throw new ForbiddenException({ errorCode: "FORBIDDEN", message: "tenant must keep at least one owner" });
        }
      }
      await this.db.service.update(tenantMembers).set({ role }).where(eq(tenantMembers.id, memberId));
    }

    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "tenant.member_role_changed", entityType: "tenant_member", entityId: memberId,
      before: { role: member.role }, after: { role },
    });
    return { id: memberId, role };
  }

  async removeMember(tenantId: string, actorId: string, memberId: string, requestId: string) {
    const rows = await this.db.service
      .select()
      .from(tenantMembers)
      .where(and(eq(tenantMembers.id, memberId), eq(tenantMembers.tenantId, tenantId)))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "member not found" });
    if (rows[0]!.role === "owner") {
      const owners = await this.db.service
        .select({ id: tenantMembers.id })
        .from(tenantMembers)
        .where(and(eq(tenantMembers.tenantId, tenantId), eq(tenantMembers.role, "owner")));
      if (owners.length <= 1) {
        throw new ForbiddenException({ errorCode: "FORBIDDEN", message: "cannot remove the last owner" });
      }
    }
    await this.db.service.delete(tenantMembers).where(eq(tenantMembers.id, memberId));
    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "tenant.member_removed", entityType: "tenant_member", entityId: memberId,
    });
    return { removed: true };
  }

  private toSummary(t: typeof tenants.$inferSelect): TenantSummary {
    return { id: t.id, name: t.name, slug: t.slug, status: t.status, logoUrl: t.logoUrl, city: null };
  }
}
