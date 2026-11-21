import { randomUUID } from "node:crypto";
import { createDbPools, type DbPools } from "@turf/db";
import { DbService } from "../src/database/db-tokens.js";
import { BookingsService } from "../src/bookings/bookings.service.js";
import { PaymentsService } from "../src/payments/payments.service.js";

/**
 * DB integration harness. Tests that need Postgres call `pools(ctx)` first:
 * it returns null (and skips the test) when no database is reachable, so the
 * suite stays honest in environments without infrastructure — it never fakes
 * a pass.
 */
/** Probes Postgres; returns null when unreachable (caller skips the test). */
export async function probePools(): Promise<DbPools | null> {
  const pools = createDbPools();
  try {
    await Promise.race([
      pools.servicePool.query("SELECT 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("db probe timeout")), 2500)),
    ]);
    return pools;
  } catch {
    await pools.end().catch(() => undefined);
    return null;
  }
}

/** vitest's runtime test context has skip(); its exported type is narrower. */
export function skipTest(ctx: unknown): void {
  (ctx as { skip(): void }).skip();
}

export interface TestVenue {
  suffix: string;
  cityId: string;
  tenantId: string;
  locationId: string;
  turfId: string;
  ownerId: string;
  customers: string[];
}

/** Creates an isolated venue (city/tenant/location/turf + users). */
export async function seedVenue(pools: DbPools, customerCount = 2): Promise<TestVenue> {
  const suffix = randomUUID().slice(0, 8);
  const q = (text: string, params: unknown[] = []) => pools.servicePool.query(text, params);
  const one = async (text: string, params: unknown[] = []) =>
    (await q(text, params)).rows[0] as { id: string };

  const ownerId = randomUUID();
  const city = await one(
    `INSERT INTO cities (name, slug, state_name, timezone, center)
     VALUES ($1, $2, 'Maharashtra', 'Asia/Kolkata', ST_SetSRID(ST_MakePoint(72.8, 19.1), 4326)::geography)
     RETURNING id`,
    [`Test City ${suffix}`, `test-city-${suffix}`],
  );
  const tenant = await one(
    `INSERT INTO tenants (name, slug, status, city_id, created_by)
     VALUES ($1, $2, 'active', $3, $4) RETURNING id`,
    [`Test Org ${suffix}`, `test-org-${suffix}`, city.id, ownerId],
  );
  await q(`INSERT INTO tenant_members (tenant_id, user_id, role) VALUES ($1, $2, 'owner')`, [tenant.id, ownerId]);
  const location = await one(
    `INSERT INTO locations (tenant_id, city_id, city_name, name, address_line1, geog)
     VALUES ($1, $2, 'Test City', $3, 'Test Address 1', ST_SetSRID(ST_MakePoint(72.8, 19.1), 4326)::geography)
     RETURNING id`,
    [tenant.id, city.id, `Test Location ${suffix}`],
  );
  const turf = await one(
    `INSERT INTO turfs (tenant_id, location_id, name, slug, tagline, base_price_minor, cancellation_policy, pay_at_venue_allowed, status)
     VALUES ($1, $2, $3, $4, 'test turf', 120000, 'free_until_24h', true, 'published')
     RETURNING id`,
    [tenant.id, location.id, `Test Turf ${suffix}`, `test-turf-${suffix}`],
  );
  const owner = await one(
    `INSERT INTO profiles (id, email, platform_role, full_name) VALUES ($1, $2, 'tenant_owner', 'Test Owner') RETURNING id`,
    [ownerId, `test-owner-${suffix}@turf.test`],
  );
  const customers: string[] = [];
  for (let i = 0; i < customerCount; i++) {
    const row = await one(
      `INSERT INTO profiles (email, platform_role, full_name) VALUES ($1, 'customer', $2) RETURNING id`,
      [`test-customer-${suffix}-${i}@turf.test`, `Test Customer ${i}`],
    );
    customers.push(row.id);
  }
  void owner;
  return { suffix, cityId: city.id, tenantId: tenant.id, locationId: location.id, turfId: turf.id, ownerId, customers };
}

/** Removes everything the fixture created (safe, scoped by ids/suffix). */
export async function cleanupVenue(pools: DbPools, v: TestVenue): Promise<void> {
  const q = (text: string, params: unknown[] = []) => pools.servicePool.query(text, params).catch(() => undefined);
  await q(`DELETE FROM payment_events WHERE payload->>'eventId' LIKE $1`, [`testevt-${v.suffix}%`]);
  await q(`DELETE FROM refunds WHERE booking_id IN (SELECT id FROM bookings WHERE turf_id = $1)`, [v.turfId]);
  await q(`DELETE FROM payments WHERE booking_id IN (SELECT id FROM bookings WHERE turf_id = $1)`, [v.turfId]);
  await q(`DELETE FROM booking_cancellations WHERE booking_id IN (SELECT id FROM bookings WHERE turf_id = $1)`, [v.turfId]);
  await q(`DELETE FROM bookings WHERE turf_id = $1`, [v.turfId]);
  await q(`DELETE FROM turf_slots WHERE turf_id = $1`, [v.turfId]);
  await q(`DELETE FROM turfs WHERE id = $1`, [v.turfId]);
  await q(`DELETE FROM locations WHERE id = $1`, [v.locationId]);
  await q(`DELETE FROM tenant_members WHERE tenant_id = $1`, [v.tenantId]);
  await q(`DELETE FROM tenants WHERE id = $1`, [v.tenantId]);
  await q(`DELETE FROM profiles WHERE email LIKE $1`, [`%-${v.suffix}%@turf.test`]);
  await q(`DELETE FROM cities WHERE slug = $1`, [`test-city-${v.suffix}`]);
}

/** Inserts one future slot and returns its id. */
export async function insertSlot(pools: DbPools, turfId: string, startsAt: Date, priceMinor = 120000): Promise<string> {
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
  const res = await pools.servicePool.query(
    `INSERT INTO turf_slots (turf_id, starts_at, ends_at, price_minor, status)
     VALUES ($1, $2, $3, $4, 'available') RETURNING id`,
    [turfId, startsAt.toISOString(), endsAt.toISOString(), priceMinor],
  );
  return res.rows[0].id as string;
}

/** Real service instances wired to the real pools (no Nest container needed). */
export function realServices(pools: DbPools) {
  const db = new DbService(pools);
  const bookings = new BookingsService(db);
  const payments = new PaymentsService(db, bookings);
  return { db, bookings, payments };
}
