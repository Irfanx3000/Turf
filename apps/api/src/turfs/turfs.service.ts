import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  amenities, cities, locations, operatingHours, sports, turfAmenities, turfImages,
  turfSlots, turfSports, turfs,
} from "@turf/db";
import type { TurfCard, TurfDetail } from "@turf/shared-types";
import { DbService } from "../database/db-tokens.js";
import { audit } from "../audit-logs/audit.helper.js";
import { isYmd, venueDayRange } from "../common/utils/venue-time.js";
import type { CreateTurfInput } from "@turf/validation";

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

@Injectable()
export class TurfsService {
  constructor(private readonly db: DbService) {}

  /* ── tenant management ─────────────────────────────────────── */

  async create(tenantId: string, actorId: string, input: CreateTurfInput, requestId: string) {
    // Ownership consistency (also enforced by a DB CHECK — defense in depth).
    const loc = await this.db.service
      .select({ id: locations.id, tenantId: locations.tenantId })
      .from(locations)
      .where(eq(locations.id, input.locationId))
      .limit(1);
    if (loc.length === 0 || loc[0]!.tenantId !== tenantId) {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "location does not belong to this tenant" });
    }

    const turfId = crypto.randomUUID();
    await this.db.service.transaction(async (tx) => {
      await tx.insert(turfs).values({
        id: turfId,
        tenantId,
        locationId: input.locationId,
        name: input.name,
        slug: input.slug,
        tagline: input.tagline,
        description: input.description,
        surfaceType: input.surfaceType,
        basePriceMinor: input.basePriceMinor,
        slotDurationMinutes: input.slotDurationMinutes,
        capacity: input.capacity,
        cancellationPolicy: input.cancellationPolicy,
        customRefundPercent: input.customRefundPercent,
        payAtVenueAllowed: input.payAtVenueAllowed,
        status: "draft",
      });
      await tx.insert(turfSports).values(input.sportIds.map((sportId: string) => ({ turfId, sportId })));
      for (const day of DAY_ORDER) {
        await tx.insert(operatingHours).values({ turfId, day, opensAt: "06:00", closesAt: "23:30", closed: false });
      }
    });

    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "turf.created", entityType: "turf", entityId: turfId,
      after: { name: input.name, slug: input.slug },
    });
    return this.getForTenant(tenantId, turfId);
  }

  async listForTenant(tenantId: string) {
    const rows = await this.db.service
      .select({
        turf: turfs,
        locationName: locations.name,
        cityName: locations.cityName,
      })
      .from(turfs)
      .innerJoin(locations, eq(locations.id, turfs.locationId))
      .where(eq(turfs.tenantId, tenantId))
      .orderBy(desc(turfs.createdAt));
    const sportMap = await this.sportNamesFor(rows.map((r) => r.turf.id));
    return rows.map((r) => ({
      ...r.turf,
      locationName: r.locationName,
      cityName: r.cityName,
      sports: sportMap.get(r.turf.id) ?? [],
    }));
  }

  async getForTenant(tenantId: string, turfId: string) {
    const rows = await this.db.service
      .select()
      .from(turfs)
      .where(and(eq(turfs.id, turfId), eq(turfs.tenantId, tenantId)))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "turf not found" });
    const [sportNames, images, hours, amenityRows] = await Promise.all([
      this.sportNamesFor([turfId]),
      this.imagesFor([turfId]),
      this.hoursFor([turfId]),
      this.amenityNamesFor([turfId]),
    ]);
    return {
      ...rows[0]!,
      sports: sportNames.get(turfId) ?? [],
      images: images.get(turfId) ?? [],
      operatingHours: hours.get(turfId) ?? [],
      amenities: amenityRows.get(turfId) ?? [],
    };
  }

  async update(tenantId: string, actorId: string, turfId: string, input: Partial<CreateTurfInput>, requestId: string) {
    await this.assertOwned(tenantId, turfId);
    await this.db.service
      .update(turfs)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.basePriceMinor !== undefined ? { basePriceMinor: input.basePriceMinor } : {}),
        ...(input.cancellationPolicy !== undefined ? { cancellationPolicy: input.cancellationPolicy } : {}),
        ...(input.customRefundPercent !== undefined ? { customRefundPercent: input.customRefundPercent } : {}),
        ...(input.payAtVenueAllowed !== undefined ? { payAtVenueAllowed: input.payAtVenueAllowed } : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
      })
      .where(and(eq(turfs.id, turfId), eq(turfs.tenantId, tenantId)));
    await audit(this.db.service, {
      requestId, actorId, tenantId, action: "turf.updated", entityType: "turf", entityId: turfId, after: input,
    });
    return this.getForTenant(tenantId, turfId);
  }

  async updateStatus(tenantId: string, actorId: string, turfId: string, status: "draft" | "published" | "archived", requestId: string) {
    await this.assertOwned(tenantId, turfId);
    if (status === "published") {
      const missing = await this.db.service
        .select({ id: turfSports.turfId })
        .from(turfSports)
        .where(eq(turfSports.turfId, turfId))
        .limit(1);
      if (missing.length === 0) {
        throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "assign at least one sport before publishing" });
      }
    }
    await this.db.service
      .update(turfs)
      .set({ status })
      .where(and(eq(turfs.id, turfId), eq(turfs.tenantId, tenantId)));
    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "turf.status_changed", entityType: "turf", entityId: turfId,
      after: { status },
    });
    return { turfId, status };
  }

  async setImages(tenantId: string, actorId: string, turfId: string, images: Array<{ url: string; alt?: string }>, requestId: string) {
    await this.assertOwned(tenantId, turfId);
    await this.db.service.transaction(async (tx) => {
      await tx.delete(turfImages).where(eq(turfImages.turfId, turfId));
      if (images.length > 0) {
        await tx.insert(turfImages).values(
          images.slice(0, 20).map((img, i) => ({ turfId, url: img.url, alt: img.alt ?? null, sortOrder: i + 1 })),
        );
      }
    });
    await audit(this.db.service, {
      requestId, actorId, tenantId, action: "turf.images_updated", entityType: "turf", entityId: turfId,
      after: { count: images.length },
    });
    return (await this.imagesFor([turfId])).get(turfId) ?? [];
  }

  async setSports(tenantId: string, actorId: string, turfId: string, sportIds: string[], requestId: string) {
    await this.assertOwned(tenantId, turfId);
    if (sportIds.length === 0) throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "at least one sport required" });
    const valid = await this.db.service.select({ id: sports.id }).from(sports).where(inArray(sports.id, sportIds));
    if (valid.length !== new Set(sportIds).size) {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "unknown sport id" });
    }
    await this.db.service.transaction(async (tx) => {
      await tx.delete(turfSports).where(eq(turfSports.turfId, turfId));
      await tx.insert(turfSports).values(sportIds.map((sportId) => ({ turfId, sportId })));
    });
    await audit(this.db.service, {
      requestId, actorId, tenantId, action: "turf.sports_updated", entityType: "turf", entityId: turfId,
    });
    return { sports: (await this.sportNamesFor([turfId])).get(turfId) ?? [] };
  }

  async setAmenities(tenantId: string, actorId: string, turfId: string, amenityIds: string[], requestId: string) {
    await this.assertOwned(tenantId, turfId);
    const valid = await this.db.service.select({ id: amenities.id }).from(amenities).where(inArray(amenities.id, amenityIds));
    if (valid.length !== new Set(amenityIds).size) {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "unknown amenity id" });
    }
    await this.db.service.transaction(async (tx) => {
      await tx.delete(turfAmenities).where(eq(turfAmenities.turfId, turfId));
      if (amenityIds.length > 0) {
        await tx.insert(turfAmenities).values(amenityIds.map((amenityId) => ({ turfId, amenityId })));
      }
    });
    await audit(this.db.service, {
      requestId, actorId, tenantId, action: "turf.amenities_updated", entityType: "turf", entityId: turfId,
    });
    return { amenities: (await this.amenityNamesFor([turfId])).get(turfId) ?? [] };
  }

  async setOperatingHours(
    tenantId: string, actorId: string, turfId: string,
    hours: Array<{ day: string; opensAt: string; closesAt: string; closed: boolean }>,
    requestId: string,
  ) {
    await this.assertOwned(tenantId, turfId);
    const byDay = new Map(hours.map((h) => [h.day, h]));
    await this.db.service.transaction(async (tx) => {
      for (const day of DAY_ORDER) {
        const h = byDay.get(day);
        if (h) {
          await tx
            .insert(operatingHours)
            .values({ turfId, day, opensAt: h.opensAt, closesAt: h.closesAt, closed: h.closed })
            .onConflictDoUpdate({
              target: [operatingHours.turfId, operatingHours.day],
              set: { opensAt: h.opensAt, closesAt: h.closesAt, closed: h.closed },
            });
        }
      }
    });
    await audit(this.db.service, {
      requestId, actorId, tenantId, action: "turf.operating_hours_updated", entityType: "turf", entityId: turfId,
    });
    return (await this.hoursFor([turfId])).get(turfId) ?? [];
  }

  /* ── public discovery ──────────────────────────────────────── */

  async browse(params: {
    page: number; pageSize: number; city?: string; sport?: string; search?: string; maxPriceMinor?: number;
  }): Promise<{ items: TurfCard[]; total: number; page: number; pageSize: number }> {
    const conditions = [eq(turfs.status, "published")];
    if (params.city) conditions.push(eq(locations.cityName, params.city));
    if (params.search) {
      conditions.push(
        sql`(${turfs.name} ILIKE ${"%" + params.search + "%"} OR ${locations.areaName} ILIKE ${"%" + params.search + "%"} OR ${locations.cityName} ILIKE ${"%" + params.search + "%"})`,
      );
    }
    if (params.sport) conditions.push(sql`EXISTS (SELECT 1 FROM ${turfSports} ts JOIN ${sports} s ON s.id = ts.sport_id WHERE ts.turf_id = ${turfs.id} AND s.slug = ${params.sport})`);
    if (params.maxPriceMinor !== undefined) conditions.push(lte(turfs.basePriceMinor, params.maxPriceMinor));

    const rows = await this.db.service
      .select({
        id: turfs.id, slug: turfs.slug, name: turfs.name, tagline: turfs.tagline,
        cityName: locations.cityName, areaName: locations.areaName,
        basePriceMinor: turfs.basePriceMinor, ratingAvg: turfs.ratingAvg, ratingCount: turfs.ratingCount,
        lat: sql<number>`ST_Y(${locations.geog}::geometry)`,
        lng: sql<number>`ST_X(${locations.geog}::geometry)`,
      })
      .from(turfs)
      .innerJoin(locations, eq(locations.id, turfs.locationId))
      .where(and(...conditions))
      .orderBy(desc(turfs.ratingAvg))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize);

    const totalRows = await this.db.service
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(turfs)
      .innerJoin(locations, eq(locations.id, turfs.locationId))
      .where(and(...conditions));

    return {
      items: await this.decorateCards(rows),
      total: totalRows[0]?.count ?? 0,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  async nearby(params: {
    lat: number; lng: number; radiusMeters: number; page: number; pageSize: number;
    sport?: string; search?: string; maxPriceMinor?: number;
  }): Promise<{ items: TurfCard[]; total: number; page: number; pageSize: number }> {
    const point = sql`ST_SetSRID(ST_MakePoint(${params.lng}, ${params.lat}), 4326)::geography`;
    const conditions = [
      eq(turfs.status, "published"),
      sql`ST_DWithin(${locations.geog}, ${point}, ${params.radiusMeters})`,
    ];
    if (params.sport) conditions.push(sql`EXISTS (SELECT 1 FROM ${turfSports} ts JOIN ${sports} s ON s.id = ts.sport_id WHERE ts.turf_id = ${turfs.id} AND s.slug = ${params.sport})`);
    if (params.search) conditions.push(sql`(${turfs.name} ILIKE ${"%" + params.search + "%"} OR ${locations.areaName} ILIKE ${"%" + params.search + "%"})`);
    if (params.maxPriceMinor !== undefined) conditions.push(lte(turfs.basePriceMinor, params.maxPriceMinor));

    const rows = await this.db.service
      .select({
        id: turfs.id, slug: turfs.slug, name: turfs.name, tagline: turfs.tagline,
        cityName: locations.cityName, areaName: locations.areaName,
        basePriceMinor: turfs.basePriceMinor, ratingAvg: turfs.ratingAvg, ratingCount: turfs.ratingCount,
        lat: sql<number>`ST_Y(${locations.geog}::geometry)`,
        lng: sql<number>`ST_X(${locations.geog}::geometry)`,
        distanceMeters: sql<number>`ST_Distance(${locations.geog}, ${point})`,
      })
      .from(turfs)
      .innerJoin(locations, eq(locations.id, turfs.locationId))
      .where(and(...conditions))
      .orderBy(sql`ST_Distance(${locations.geog}, ${point})`)
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize);

    return {
      items: await this.decorateCards(rows),
      total: rows.length < params.pageSize ? (params.page - 1) * params.pageSize + rows.length : -1,
      page: params.page,
      pageSize: params.pageSize,
    };
  }

  async getBySlug(slug: string): Promise<TurfDetail> {
    const rows = await this.db.service
      .select({
        turf: turfs,
        cityName: locations.cityName,
        areaName: locations.areaName,
        lat: sql<number>`ST_Y(${locations.geog}::geometry)`,
        lng: sql<number>`ST_X(${locations.geog}::geometry)`,
      })
      .from(turfs)
      .innerJoin(locations, eq(locations.id, turfs.locationId))
      .where(eq(turfs.slug, slug))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "turf not found" });
    const r = rows[0]!;
    const [sportNames, images, hours, amenityRows] = await Promise.all([
      this.sportNamesFor([r.turf.id]),
      this.imagesFor([r.turf.id]),
      this.hoursFor([r.turf.id]),
      this.amenityNamesFor([r.turf.id]),
    ]);
    const hero = (images.get(r.turf.id) ?? [])[0]?.url ?? null;
    return {
      id: r.turf.id,
      slug: r.turf.slug,
      name: r.turf.name,
      tagline: r.turf.tagline,
      cityName: r.cityName,
      areaName: r.areaName,
      sports: sportNames.get(r.turf.id) ?? [],
      heroImageUrl: hero,
      images: images.get(r.turf.id) ?? [],
      basePriceMinor: r.turf.basePriceMinor,
      currency: "INR",
      ratingAvg: r.turf.ratingAvg,
      ratingCount: r.turf.ratingCount,
      distanceMeters: null,
      location: { lat: Number(r.lat), lng: Number(r.lng) },
      tenantId: r.turf.tenantId,
      description: r.turf.description,
      amenities: amenityRows.get(r.turf.id) ?? [],
      operatingHours: hours.get(r.turf.id) ?? [],
      cancellationPolicy: r.turf.cancellationPolicy,
      payAtVenueAllowed: r.turf.payAtVenueAllowed,
    };
  }

  /** Public availability: slots for one venue-local date. */
  async availability(slug: string, date: string) {
    if (!isYmd(date)) throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "date must be YYYY-MM-DD" });
    const detail = await this.getBySlug(slug);
    const city = await this.db.service
      .select({ timezone: cities.timezone })
      .from(locations)
      .leftJoin(cities, eq(cities.id, locations.cityId))
      .where(eq(locations.id, (await this.turfLocationId(detail.id))!))
      .limit(1);
    const tz = city[0]?.timezone ?? "Asia/Kolkata";
    const { start, end } = venueDayRange(date, tz);

    const rows = await this.db.service
      .select({
        id: turfSlots.id, startsAt: turfSlots.startsAt, endsAt: turfSlots.endsAt,
        priceMinor: turfSlots.priceMinor, status: turfSlots.status,
      })
      .from(turfSlots)
      .where(and(eq(turfSlots.turfId, detail.id), gte(turfSlots.startsAt, start), lte(turfSlots.startsAt, end)))
      .orderBy(asc(turfSlots.startsAt));

    return {
      turfId: detail.id,
      turfName: detail.name,
      date,
      timezone: tz,
      slots: rows
        .filter((s) => s.status !== "expired")
        .map((s) => ({
          id: s.id,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          priceMinor: s.priceMinor,
          status: s.status,
        })),
    };
  }

  /* ── internals ─────────────────────────────────────────────── */

  private async turfLocationId(turfId: string): Promise<string | null> {
    const rows = await this.db.service.select({ locationId: turfs.locationId }).from(turfs).where(eq(turfs.id, turfId)).limit(1);
    return rows[0]?.locationId ?? null;
  }

  private async assertOwned(tenantId: string, turfId: string): Promise<void> {
    const rows = await this.db.service
      .select({ id: turfs.id })
      .from(turfs)
      .where(and(eq(turfs.id, turfId), eq(turfs.tenantId, tenantId)))
      .limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "turf not found" });
  }

  private async sportNamesFor(turfIds: string[]): Promise<Map<string, string[]>> {
    if (turfIds.length === 0) return new Map();
    const rows = await this.db.service
      .select({ turfId: turfSports.turfId, name: sports.name })
      .from(turfSports)
      .innerJoin(sports, eq(sports.id, turfSports.sportId))
      .where(inArray(turfSports.turfId, turfIds));
    const map = new Map<string, string[]>();
    for (const r of rows) map.set(r.turfId, [...(map.get(r.turfId) ?? []), r.name]);
    return map;
  }

  private async amenityNamesFor(turfIds: string[]): Promise<Map<string, string[]>> {
    if (turfIds.length === 0) return new Map();
    const rows = await this.db.service
      .select({ turfId: turfAmenities.turfId, name: amenities.name })
      .from(turfAmenities)
      .innerJoin(amenities, eq(amenities.id, turfAmenities.amenityId))
      .where(inArray(turfAmenities.turfId, turfIds));
    const map = new Map<string, string[]>();
    for (const r of rows) map.set(r.turfId, [...(map.get(r.turfId) ?? []), r.name]);
    return map;
  }

  private async imagesFor(turfIds: string[]): Promise<Map<string, Array<{ id: string; url: string; alt: string | null; sortOrder: number }>>> {
    if (turfIds.length === 0) return new Map();
    const rows = await this.db.service
      .select()
      .from(turfImages)
      .where(inArray(turfImages.turfId, turfIds))
      .orderBy(asc(turfImages.sortOrder));
    const map = new Map<string, Array<{ id: string; url: string; alt: string | null; sortOrder: number }>>();
    for (const r of rows) {
      const list = map.get(r.turfId) ?? [];
      list.push({ id: r.id, url: r.url, alt: r.alt, sortOrder: r.sortOrder });
      map.set(r.turfId, list);
    }
    return map;
  }

  private async hoursFor(turfIds: string[]): Promise<Map<string, Array<{ day: string; opensAt: string; closesAt: string; closed: boolean }>>> {
    if (turfIds.length === 0) return new Map();
    const rows = await this.db.service.select().from(operatingHours).where(inArray(operatingHours.turfId, turfIds));
    const map = new Map<string, Array<{ day: string; opensAt: string; closesAt: string; closed: boolean }>>();
    for (const day of DAY_ORDER) {
      const row = rows.find((r) => r.turfId && r.day === day);
      void row;
    }
    for (const r of rows) {
      const list = map.get(r.turfId) ?? [];
      list.push({ day: r.day, opensAt: r.opensAt, closesAt: r.closesAt, closed: r.closed });
      map.set(r.turfId, list);
    }
    for (const [id, list] of map) {
      list.sort((a, b) => DAY_ORDER.indexOf(a.day as (typeof DAY_ORDER)[number]) - DAY_ORDER.indexOf(b.day as (typeof DAY_ORDER)[number]));
      void id;
    }
    return map;
  }

  private async decorateCards(
    rows: Array<{
      id: string; slug: string; name: string; tagline: string | null; cityName: string; areaName: string | null;
      basePriceMinor: number; ratingAvg: number | null; ratingCount: number; lat: number; lng: number;
      distanceMeters?: number;
    }>,
  ): Promise<TurfCard[]> {
    const [sportNames, images] = await Promise.all([
      this.sportNamesFor(rows.map((r) => r.id)),
      this.imagesFor(rows.map((r) => r.id)),
    ]);
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      tagline: r.tagline,
      cityName: r.cityName,
      areaName: r.areaName,
      sports: sportNames.get(r.id) ?? [],
      heroImageUrl: (images.get(r.id) ?? [])[0]?.url ?? null,
      basePriceMinor: r.basePriceMinor,
      currency: "INR" as const,
      ratingAvg: r.ratingAvg,
      ratingCount: r.ratingCount,
      distanceMeters: r.distanceMeters !== undefined ? Math.round(Number(r.distanceMeters)) : null,
      location: { lat: Number(r.lat), lng: Number(r.lng) },
    }));
  }
}
