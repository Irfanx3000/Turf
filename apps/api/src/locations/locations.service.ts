import { Injectable, NotFoundException } from "@nestjs/common";
import { desc, eq, sql } from "drizzle-orm";
import { locations } from "@turf/db";
import { DbService } from "../database/db-tokens.js";
import { Inject } from "@nestjs/common";
import { MAPS_PROVIDER } from "../maps/maps.module.js";
import type { MapsProvider } from "../maps/maps-provider.js";
import { audit } from "../audit-logs/audit.helper.js";

@Injectable()
export class LocationsService {
  constructor(
    private readonly db: DbService,
    @Inject(MAPS_PROVIDER) private readonly maps: MapsProvider,
  ) {}

  async list(tenantId: string) {
    return this.db.service
      .select()
      .from(locations)
      .where(eq(locations.tenantId, tenantId))
      .orderBy(desc(locations.createdAt));
  }

  async create(
    tenantId: string,
    actorId: string,
    input: { name: string; cityName: string; areaName?: string; addressLine1: string; addressLine2?: string; postalCode?: string; location: { lat: number; lng: number } },
    requestId: string,
  ) {
    const [row] = await this.db.service
      .insert(locations)
      .values({
        tenantId,
        name: input.name,
        cityName: input.cityName,
        areaName: input.areaName,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2,
        postalCode: input.postalCode,
        geog: input.location,
      })
      .returning();
    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "location.created", entityType: "location", entityId: row!.id,
      after: { name: row!.name, city: row!.cityName },
    });
    return row;
  }

  async update(tenantId: string, actorId: string, locationId: string, input: Partial<{ name: string; areaName?: string; addressLine1: string; addressLine2?: string; postalCode?: string }>, requestId: string) {
    const rows = await this.db.service
      .select()
      .from(locations)
      .where(sql`${locations.id} = ${locationId} AND ${locations.tenantId} = ${tenantId}`)
      .limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "location not found" });
    const [row] = await this.db.service
      .update(locations)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.areaName !== undefined ? { areaName: input.areaName } : {}),
        ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 } : {}),
        ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 } : {}),
        ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
      })
      .where(eq(locations.id, locationId))
      .returning();
    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "location.updated", entityType: "location", entityId: locationId,
    });
    return row;
  }

  async remove(tenantId: string, actorId: string, locationId: string, requestId: string) {
    const rows = await this.db.service
      .select({ id: locations.id })
      .from(locations)
      .where(sql`${locations.id} = ${locationId} AND ${locations.tenantId} = ${tenantId}`)
      .limit(1);
    if (rows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "location not found" });
    await this.db.service.delete(locations).where(eq(locations.id, locationId));
    await audit(this.db.service, {
      requestId, actorId, tenantId,
      action: "location.deleted", entityType: "location", entityId: locationId,
    });
    return { removed: true };
  }

  /** Convenience: geocode an address via the maps adapter. */
  async geocode(query: string) {
    return this.maps.geocode(query);
  }
}
