import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { bookingItems, bookings, profiles, reviews, turfs } from "@turf/db";
import { DbService } from "../database/db-tokens.js";
import { audit } from "../audit-logs/audit.helper.js";

@Injectable()
export class ReviewsService {
  constructor(private readonly db: DbService) {}

  async create(
    userId: string,
    input: { turfId: string; bookingId: string; rating: number; title?: string; body?: string },
    requestId: string,
  ) {
    const rows = await this.db.service
      .select({ booking: bookings })
      .from(bookings)
      .where(and(eq(bookings.id, input.bookingId), eq(bookings.turfId, input.turfId)))
      .limit(1);
    const booking = rows[0]?.booking;
    if (!booking) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "booking not found for this turf" });
    if (booking.customerId !== userId) {
      throw new ForbiddenException({ errorCode: "FORBIDDEN", message: "only the booking owner can review it" });
    }
    if (!["completed", "confirmed"].includes(booking.bookingStatus)) {
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: "booking must be completed before reviewing" });
    }
    const existing = await this.db.service
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.bookingId, input.bookingId))
      .limit(1);
    if (existing.length > 0) {
      throw new ConflictException({ errorCode: "CONFLICT", message: "booking already reviewed" });
    }

    const [review] = await this.db.service
      .insert(reviews)
      .values({
        turfId: input.turfId,
        customerId: userId,
        bookingId: input.bookingId,
        rating: input.rating,
        title: input.title,
        body: input.body,
      })
      .returning();
    await audit(this.db.service, {
      requestId, actorId: userId, action: "review.created",
      entityType: "review", entityId: review!.id, after: { rating: input.rating },
    });
    return review;
  }

  async listForTurf(turfId: string) {
    return this.db.service
      .select({
        id: reviews.id,
        rating: reviews.rating,
        title: reviews.title,
        body: reviews.body,
        createdAt: reviews.createdAt,
        customerName: profiles.fullName,
      })
      .from(reviews)
      .innerJoin(profiles, eq(profiles.id, reviews.customerId))
      .where(and(eq(reviews.turfId, turfId), eq(reviews.status, "published")))
      .orderBy(desc(reviews.createdAt))
      .limit(50);
  }

  async moderate(tenantId: string, actorId: string, reviewId: string, status: "published" | "hidden", requestId: string) {
    const rows = await this.db.service
      .select({ review: reviews, tenantId: turfs.tenantId })
      .from(reviews)
      .innerJoin(turfs, eq(turfs.id, reviews.turfId))
      .where(eq(reviews.id, reviewId))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException({ errorCode: "NOT_FOUND", message: "review not found" });
    if (row.tenantId !== tenantId) {
      throw new ForbiddenException({ errorCode: "FORBIDDEN", message: "review belongs to another tenant" });
    }
    await this.db.service.update(reviews).set({ status }).where(eq(reviews.id, reviewId));
    await audit(this.db.service, {
      requestId, actorId, tenantId, action: "review.moderated",
      entityType: "review", entityId: reviewId, after: { status },
    });
    return { reviewId, status };
  }
}
