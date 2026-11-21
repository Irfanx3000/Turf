import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ConflictException } from "@nestjs/common";
import type { DbPools } from "@turf/db";
import { cleanupVenue, insertSlot, probePools, realServices, seedVenue, skipTest, type TestVenue } from "./helpers.js";

/**
 * The concurrency proof: two customers race to book the SAME slot. Exactly one
 * wins; the loser gets a clean 409 conflict. Requires a real Postgres
 * (auto-skips without one — a fake pass would be worse than no pass).
 */
describe("booking engine concurrency (DB integration)", () => {
  let pools: DbPools | null = null;
  let venue: TestVenue | null = null;
  let bookings: ReturnType<typeof realServices>["bookings"] | null = null;

  beforeAll(async () => {
    pools = await probePools();
    if (!pools) return;
    venue = await seedVenue(pools);
    bookings = realServices(pools).bookings;
  });

  afterAll(async () => {
    if (pools && venue) await cleanupVenue(pools, venue);
    await pools?.end();
  });

  it("two concurrent bookings for the same slot: exactly one succeeds", async (ctx) => {
    if (!pools || !venue || !bookings) { skipTest(ctx); return; }
    const startsAt = new Date(Date.now() + 26 * 3600 * 1000); // tomorrow
    const slotId = await insertSlot(pools, venue.turfId, startsAt);

    const attempt = (customerId: string, key: string) =>
      bookings!.create(
        { id: customerId, email: `test-${customerId}@turf.test` },
        { turfId: venue!.turfId, slotIds: [slotId], paymentMethod: "pay_at_venue", idempotencyKey: key },
        "test-request-id",
      );

    const results = await Promise.allSettled([
      attempt(venue.customers[0]!, "concurrent-a"),
      attempt(venue.customers[1]!, "concurrent-b"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(ConflictException);

    // The winner's booking is confirmed; the slot is booked exactly once.
    const winner = fulfilled[0]!;
    expect(winner.value.booking.bookingStatus).toBe("confirmed");
    expect(winner.value.booking.totalAmountMinor).toBe(120000);

    const slot = await pools.servicePool.query(`SELECT status, booking_id FROM turf_slots WHERE id = $1`, [slotId]);
    expect(slot.rows[0]!.status).toBe("booked");
    expect(slot.rows[0]!.booking_id).toBe(winner.value.booking.id);

    const count = await pools.servicePool.query(
      `SELECT COUNT(*)::int AS n FROM booking_items WHERE slot_id = $1`,
      [slotId],
    );
    expect(count.rows[0]!.n).toBe(1);
  });

  it("sequential second attempt also gets a clean conflict (already booked)", async (ctx) => {
    if (!pools || !venue || !bookings) { skipTest(ctx); return; }
    const startsAt = new Date(Date.now() + 27 * 3600 * 1000);
    const slotId = await insertSlot(pools, venue.turfId, startsAt);

    const first = await bookings.create(
      { id: venue.customers[0]!, email: "a@turf.test" },
      { turfId: venue.turfId, slotIds: [slotId], paymentMethod: "pay_at_venue", idempotencyKey: "seq-1" },
      "test-request-id",
    );
    expect(first.booking.bookingStatus).toBe("confirmed");

    await expect(
      bookings.create(
        { id: venue.customers[1]!, email: "b@turf.test" },
        { turfId: venue.turfId, slotIds: [slotId], paymentMethod: "pay_at_venue", idempotencyKey: "seq-2" },
        "test-request-id",
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("idempotency: replaying the same key returns the original booking, not a second one", async (ctx) => {
    if (!pools || !venue || !bookings) { skipTest(ctx); return; }
    const startsAt = new Date(Date.now() + 28 * 3600 * 1000);
    const slotId = await insertSlot(pools, venue.turfId, startsAt);
    const input = {
      turfId: venue.turfId,
      slotIds: [slotId],
      paymentMethod: "pay_at_venue" as const,
      idempotencyKey: "idem-1",
    };

    const first = await bookings.create({ id: venue.customers[0]!, email: "a@turf.test" }, input, "test-request-id");
    const replay = await bookings.create({ id: venue.customers[0]!, email: "a@turf.test" }, input, "test-request-id");

    expect(replay.booking.id).toBe(first.booking.id);
    expect(replay.replayed).toBe(true);

    const count = await pools.servicePool.query(
      `SELECT COUNT(*)::int AS n FROM bookings WHERE turf_id = $1 AND idempotency_key = 'idem-1'`,
      [venue.turfId],
    );
    expect(count.rows[0]!.n).toBe(1);
  });

  it("rejects slots that already started", async (ctx) => {
    if (!pools || !venue || !bookings) { skipTest(ctx); return; }
    const pastSlot = await insertSlot(pools, venue.turfId, new Date(Date.now() - 2 * 3600 * 1000));
    await expect(
      bookings.create(
        { id: venue.customers[0]!, email: "a@turf.test" },
        { turfId: venue.turfId, slotIds: [pastSlot], paymentMethod: "pay_at_venue", idempotencyKey: "past-1" },
        "test-request-id",
      ),
    ).rejects.toThrow(/already started/);
  });
});
