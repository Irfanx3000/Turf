import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { turfSlots, turfs } from "@turf/db";
import type { PriceQuote } from "@turf/shared-types";
import { DbService } from "../database/db-tokens.js";

/**
 * Server-computed price quotes. The quote is advisory: booking creation
 * recomputes totals from slot rows and never trusts this response.
 */
@Injectable()
export class PricingService {
  constructor(private readonly db: DbService) {}

  async quote(turfId: string, slotIds: string[]): Promise<PriceQuote> {
    const turfRows = await this.db.service
      .select({ id: turfs.id, name: turfs.name, status: turfs.status, basePriceMinor: turfs.basePriceMinor })
      .from(turfs)
      .where(eq(turfs.id, turfId))
      .limit(1);
    if (turfRows.length === 0) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "turf not found" });
    if (turfRows[0]!.status !== "published") {
      throw new NotFoundException({ errorCode: "NOT_FOUND", message: "turf not found" });
    }

    const slots = await this.db.service
      .select()
      .from(turfSlots)
      .where(and(eq(turfSlots.turfId, turfId), inArray(turfSlots.id, slotIds)));
    if (slots.length !== new Set(slotIds).size) {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "one or more slots do not belong to this turf" });
    }
    const now = Date.now();
    const bookable = slots.filter((s) => s.status === "available" && s.startsAt.getTime() > now);
    if (bookable.length === 0) {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "no bookable slots in selection" });
    }

    const subtotal = bookable.reduce((sum, s) => sum + s.priceMinor, 0);
    const unavailable = slots.length - bookable.length;

    return {
      turfId,
      slotIds: bookable.map((s) => s.id),
      currency: "INR",
      subtotalMinor: subtotal,
      discountMinor: 0, // discounts arrive with promotions; never client-declared
      totalMinor: subtotal,
      breakdown: [
        { label: `${bookable.length} slot(s)`, amountMinor: subtotal },
        ...(unavailable > 0 ? [{ label: `${unavailable} slot(s) not bookable (excluded)`, amountMinor: 0 }] : []),
      ],
      quoteId: crypto.randomUUID(),
      expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
    };
  }
}
