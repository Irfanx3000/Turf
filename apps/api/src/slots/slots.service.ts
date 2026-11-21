import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { cities, locations, operatingHours, pricingRules, slotBlocks, slotTemplates, turfSlots, turfs } from "@turf/db";
import { DbService } from "../database/db-tokens.js";
import { audit } from "../audit-logs/audit.helper.js";
import { localToUtc } from "../common/utils/venue-time.js";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

@Injectable()
export class SlotsService {
  constructor(private readonly db: DbService) {}

  /* ── templates ─────────────────────────────────────────────── */

  async listTemplates(tenantId: string, turfId: string) {
    await this.assertTurfOwned(tenantId, turfId);
    return this.db.service
      .select()
      .from(slotTemplates)
      .where(eq(slotTemplates.turfId, turfId))
      .orderBy(asc(slotTemplates.startTime));
  }

  async upsertTemplate(
    tenantId: string, actorId: string, turfId: string,
    input: { name: string; daysOfWeek: string[]; startTime: string; endTime: string; slotDurationMinutes: number; priceMinor: number; effectiveFrom: string; effectiveTo?: string },
    requestId: string,
  ) {
    await this.assertTurfOwned(tenantId, turfId);
    const [row] = await this.db.service
      .insert(slotTemplates)
      .values({ turfId, ...input, daysOfWeek: input.daysOfWeek, isActive: true })
      .returning();
    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "slot_template.created", entityType: "slot_template", entityId: row!.id, after: { name: input.name },
    });
    return row;
  }

  async deleteTemplate(tenantId: string, actorId: string, turfId: string, templateId: string, requestId: string) {
    await this.assertTurfOwned(tenantId, turfId);
    await this.db.service
      .delete(slotTemplates)
      .where(and(eq(slotTemplates.id, templateId), eq(slotTemplates.turfId, turfId)));
    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "slot_template.deleted", entityType: "slot_template", entityId: templateId,
    });
    return { removed: true };
  }

  /* ── generation ────────────────────────────────────────────── */

  /**
   * Materializes slot rows from templates for a date range, applying active
   * pricing rules (multiplier or override, highest priority wins). Idempotent:
   * existing (or already booked) slots are skipped by ON CONFLICT DO NOTHING,
   * which honors the exclusion constraint.
   */
  async generate(
    tenantId: string, actorId: string, turfId: string,
    input: { from: string; to: string },
    requestId: string,
  ): Promise<{ created: number; skipped: number }> {
    await this.assertTurfOwned(tenantId, turfId);

    const tzRow = await this.db.service
      .select({ timezone: cities.timezone })
      .from(turfs)
      .innerJoin(locations, eq(locations.id, turfs.locationId))
      .leftJoin(cities, eq(cities.id, locations.cityId))
      .where(eq(turfs.id, turfId))
      .limit(1);
    const tz = tzRow[0]?.timezone ?? "Asia/Kolkata";

    const templates = await this.db.service
      .select()
      .from(slotTemplates)
      .where(and(eq(slotTemplates.turfId, turfId), eq(slotTemplates.isActive, true)));
    if (templates.length === 0) {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "no active slot templates for this turf" });
    }

    const rules = await this.db.service
      .select()
      .from(pricingRules)
      .where(and(eq(pricingRules.turfId, turfId), eq(pricingRules.isActive, true)));

    const hours = await this.db.service.select().from(operatingHours).where(eq(operatingHours.turfId, turfId));
    const hoursByDay = new Map(hours.map((h) => [h.day, h]));

    let created = 0;
    let skipped = 0;

    const start = new Date(`${input.from}T00:00:00Z`);
    const end = new Date(`${input.to}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "invalid date range" });
    }
    if (end.getTime() - start.getTime() > 60 * 24 * 3600 * 1000) {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "range too large (max 60 days)" });
    }

    for (const template of templates) {
      for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) {
        const dayName = DAYS[(d.getUTCDay() + 6) % 7]!;
        if (!template.daysOfWeek.includes(dayName)) continue;
        const oh = hoursByDay.get(dayName);
        if (oh?.closed) continue;

        const dateStr = d.toISOString().slice(0, 10);
        let minutes = toMinutes(template.startTime);
        const endMinutes = toMinutes(template.endTime);
        while (minutes + template.slotDurationMinutes <= endMinutes) {
          const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
          const mm = String(minutes % 60).padStart(2, "0");
          const startsAt = localToUtc(dateStr, `${hh}:${mm}`, tz);
          const endsAt = new Date(startsAt.getTime() + template.slotDurationMinutes * 60_000);

          // Only generate future slots; past slots are pointless.
          if (startsAt.getTime() > Date.now()) {
            const price = this.priceFor(template.priceMinor, rules, dayName, `${hh}:${mm}`);
            const res = await this.db.service
              .insert(turfSlots)
              .values({ turfId, templateId: template.id, startsAt, endsAt, priceMinor: price, status: "available" })
              .onConflictDoNothing()
              .returning({ id: turfSlots.id });
            if ((res.length ?? 0) > 0) created++;
            else skipped++;
          } else {
            skipped++;
          }
          minutes += template.slotDurationMinutes;
        }
      }
    }

    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "slots.generated", entityType: "turf", entityId: turfId,
      after: { from: input.from, to: input.to, created, skipped },
    });
    return { created, skipped };
  }

  /** Tenant slot calendar (paginated by time window). */
  async listSlots(tenantId: string, turfId: string, from: Date, to: Date, statuses?: string[]) {
    await this.assertTurfOwned(tenantId, turfId);
    const conditions = [eq(turfSlots.turfId, turfId), gte(turfSlots.startsAt, from), lte(turfSlots.startsAt, to)];
    if (statuses && statuses.length > 0) {
      conditions.push(sql`${turfSlots.status}::text = ANY(${statuses})`);
    }
    return this.db.service
      .select()
      .from(turfSlots)
      .where(and(...conditions))
      .orderBy(asc(turfSlots.startsAt));
  }

  /* ── blocks ────────────────────────────────────────────────── */

  async createBlock(
    tenantId: string, actorId: string, turfId: string,
    input: { startsAt: string; endsAt: string; reason?: string },
    requestId: string,
  ) {
    await this.assertTurfOwned(tenantId, turfId);
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt >= endsAt) {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "invalid block window" });
    }

    const [block] = await this.db.service
      .insert(slotBlocks)
      .values({ turfId, startsAt, endsAt, reason: input.reason, createdBy: actorId })
      .returning();

    // Any AVAILABLE slot inside the window becomes blocked. Reserved/booked
    // slots are left alone — existing customer commitments win.
    const res = await this.db.service
      .update(turfSlots)
      .set({ status: "blocked", bookingId: null, reservationExpiresAt: null })
      .where(
        and(
          eq(turfSlots.turfId, turfId),
          eq(turfSlots.status, "available"),
          lte(turfSlots.startsAt, endsAt),
          gte(turfSlots.endsAt, startsAt),
        ),
      )
      .returning({ id: turfSlots.id });

    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "slot.blocked", entityType: "slot_block", entityId: block!.id,
      after: { startsAt: input.startsAt, endsAt: input.endsAt, blocked: res.length },
    });
    return { ...block, blockedSlots: res.length };
  }

  async removeBlock(tenantId: string, actorId: string, turfId: string, blockId: string, requestId: string) {
    await this.assertTurfOwned(tenantId, turfId);
    const rows = await this.db.service
      .select()
      .from(slotBlocks)
      .where(and(eq(slotBlocks.id, blockId), eq(slotBlocks.turfId, turfId)))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "block not found" });
    const block = rows[0]!;

    await this.db.service.transaction(async (tx) => {
      // Re-free only slots that are still blocked because of this window and
      // don't overlap any other block.
      const stillBlocked = await tx
        .select({ id: turfSlots.id })
        .from(turfSlots)
        .where(
          and(
            eq(turfSlots.turfId, turfId),
            eq(turfSlots.status, "blocked"),
            lte(turfSlots.startsAt, block.endsAt),
            gte(turfSlots.endsAt, block.startsAt),
            sql`NOT EXISTS (SELECT 1 FROM ${slotBlocks} b2 WHERE b2.turf_id = ${turfId} AND b2.id <> ${blockId} AND turf_slots.starts_at <= b2.ends_at AND turf_slots.ends_at >= b2.starts_at)`,
          ),
        );
      if (stillBlocked.length > 0) {
        await tx
          .update(turfSlots)
          .set({ status: "available" })
          .where(
            and(
              eq(turfSlots.turfId, turfId),
              eq(turfSlots.status, "blocked"),
              sql`${turfSlots.id} IN ${stillBlocked.map((s) => s.id)}`,
            ),
          );
      }
      await tx.delete(slotBlocks).where(eq(slotBlocks.id, blockId));
    });

    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "slot.unblocked", entityType: "slot_block", entityId: blockId,
    });
    return { removed: true };
  }

  /* ── pricing rules ─────────────────────────────────────────── */

  async listPricingRules(tenantId: string, turfId: string) {
    await this.assertTurfOwned(tenantId, turfId);
    return this.db.service
      .select()
      .from(pricingRules)
      .where(eq(pricingRules.turfId, turfId))
      .orderBy(asc(pricingRules.priority));
  }

  async upsertPricingRule(
    tenantId: string, actorId: string, turfId: string,
    input: {
      ruleType: "base" | "weekend" | "peak_hours" | "special_date";
      name: string; daysOfWeek?: string[]; startTime?: string; endTime?: string;
      specialDate?: string; multiplierPercent?: number; priceOverrideMinor?: number; priority?: number;
    },
    requestId: string,
  ) {
    await this.assertTurfOwned(tenantId, turfId);
    const [rule] = await this.db.service
      .insert(pricingRules)
      .values({
        turfId,
        ruleType: input.ruleType,
        name: input.name,
        daysOfWeek: input.daysOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        specialDate: input.specialDate,
        multiplierPercent: input.multiplierPercent,
        priceOverrideMinor: input.priceOverrideMinor,
        priority: input.priority ?? 0,
        isActive: true,
      })
      .returning();
    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "pricing_rule.created", entityType: "pricing_rule", entityId: rule!.id,
      after: { name: input.name, type: input.ruleType },
    });
    return rule;
  }

  async deletePricingRule(tenantId: string, actorId: string, turfId: string, ruleId: string, requestId: string) {
    await this.assertTurfOwned(tenantId, turfId);
    const res = await this.db.service
      .delete(pricingRules)
      .where(and(eq(pricingRules.id, ruleId), eq(pricingRules.turfId, turfId)))
      .returning({ id: pricingRules.id });
    if (res.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "rule not found" });
    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "pricing_rule.deleted", entityType: "pricing_rule", entityId: ruleId,
    });
    return { removed: true };
  }

  /** Pure price computation shared by generation (unit tested). */
  priceFor(
    basePriceMinor: number,
    rules: Array<{ ruleType: string; daysOfWeek: string[] | null; startTime: string | null; endTime: string | null; specialDate: string | null; multiplierPercent: number | null; priceOverrideMinor: number | null; priority: number }>,
    dayName: string,
    hhmm: string,
    dateYmd?: string,
  ): number {
    let price = basePriceMinor;
    const applicable = rules
      .filter((r) => {
        if (r.ruleType === "weekend") return dayName === "saturday" || dayName === "sunday";
        if (r.ruleType === "peak_hours") {
          return (!r.daysOfWeek || r.daysOfWeek.includes(dayName)) && (!!r.startTime && !!r.endTime && hhmm >= r.startTime && hhmm < r.endTime);
        }
        if (r.ruleType === "special_date") return !!dateYmd && r.specialDate === dateYmd;
        return false; // base rules don't adjust
      })
      .sort((a, b) => b.priority - a.priority);

    for (const rule of applicable) {
      if (rule.priceOverrideMinor !== null) {
        price = rule.priceOverrideMinor;
        break; // highest-priority override wins outright
      }
      if (rule.multiplierPercent !== null) {
        price = Math.round((price * rule.multiplierPercent) / 100);
      }
    }
    return Math.max(0, Math.round(price));
  }

  private async assertTurfOwned(tenantId: string, turfId: string): Promise<void> {
    const rows = await this.db.service
      .select({ id: turfs.id, tenantId: turfs.tenantId })
      .from(turfs)
      .where(eq(turfs.id, turfId))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "turf not found" });
    if (rows[0]!.tenantId !== tenantId) {
      throw new ForbiddenException({ errorCode: "FORBIDDEN", message: "turf belongs to another tenant" });
    }
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h! * 60 + m!;
}
