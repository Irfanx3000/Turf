/**
 * Seed: realistic demo data for local development.
 *
 *   npm run db:seed            (from repo root; requires DATABASE_URL)
 *
 * Idempotent: safe to re-run; existing rows are looked up, not duplicated.
 * Demo credentials (DEV ONLY — dev_users / Supabase-less local auth):
 *   admin@turf.demo   / Admin#12345    (super admin)
 *   owner@turf.demo   / Owner#12345    (tenant owner)
 *   customer@turf.demo / Customer#12345 (customer)
 */
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import pg from "pg";
import { loadEnvFile } from "@turf/config";
loadEnvFile();

const DEMO_PASSWORD = {
  admin: "Admin#12345",
  owner: "Owner#12345",
  customer: "Customer#12345",
};

/** scrypt hash, same format the dev auth adapter verifies. */
function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

/** Local venue time -> UTC Date using the IANA timezone. */
function localToUtc(dateYmd: string, hhmm: string, timeZone: string): Date {
  const [y, m, d] = dateYmd.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  // Guess with the local server tz, then correct via the offset trick.
  const guess = new Date(Date.UTC(y!, m! - 1, d!, hh!, mm!));
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(guess).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour), Number(parts.minute),
  );
  return new Date(guess.getTime() + (guess.getTime() - asUTC));
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const SPORTS = [
  { name: "Football 5s", slug: "football-5s", icon: "circle-dot" },
  { name: "Football 7s", slug: "football-7s", icon: "circle-dot" },
  { name: "Football 11s", slug: "football-11s", icon: "circle-dot" },
  { name: "Cricket Box", slug: "cricket-box", icon: "zap" },
  { name: "Box Cricket", slug: "box-cricket", icon: "zap" },
  { name: "Badminton", slug: "badminton", icon: "wind" },
  { name: "Pickleball", slug: "pickleball", icon: "activity" },
];

const AMENITIES = [
  { name: "Floodlights", slug: "floodlights", icon: "lightbulb" },
  { name: "Changing Rooms", slug: "changing-rooms", icon: "door-open" },
  { name: "Washrooms", slug: "washrooms", icon: "bath" },
  { name: "Parking", slug: "parking", icon: "car" },
  { name: "Drinking Water", slug: "drinking-water", icon: "droplets" },
  { name: "First Aid", slug: "first-aid", icon: "cross" },
  { name: "Cafeteria", slug: "cafeteria", icon: "coffee" },
  { name: "Equipment Rental", slug: "equipment-rental", icon: "backpack" },
  { name: "CCTV Surveillance", slug: "cctv", icon: "video" },
  { name: "Coach Available", slug: "coach", icon: "graduation-cap" },
];

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = new pg.Client({ connectionString: url, application_name: "turf-seed" });
  await client.connect();
  const q = client.query.bind(client);

  try {
    await q("BEGIN");

    /* platform role catalog */
    await q(
      `INSERT INTO platform_roles (role, description, permissions) VALUES
       ('customer','End user who discovers and books turfs','["bookings:create","reviews:create"]'),
       ('tenant_owner','Owns one or more tenant organizations','["tenants:manage","bookings:manage","payouts:view"]'),
       ('super_admin','Platform operator','["*"]')
       ON CONFLICT (role) DO NOTHING`,
    );

    /* city */
    const city = (
      await q(
        `INSERT INTO cities (name, slug, state_name, timezone, center)
         VALUES ('Mumbai','mumbai','Maharashtra','Asia/Kolkata',
                 ST_SetSRID(ST_MakePoint(72.8777,19.0760),4326)::geography)
         ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
      )
    ).rows[0]!.id as string;

    /* sports & amenities */
    for (const s of SPORTS) {
      await q(
        `INSERT INTO sports (name, slug, icon) VALUES ($1,$2,$3) ON CONFLICT (slug) DO NOTHING`,
        [s.name, s.slug, s.icon],
      );
    }
    for (const a of AMENITIES) {
      await q(
        `INSERT INTO amenities (name, slug, icon) VALUES ($1,$2,$3) ON CONFLICT (slug) DO NOTHING`,
        [a.name, a.slug, a.icon],
      );
    }
    const sportId = (slug: string) => q(`SELECT id FROM sports WHERE slug=$1`, [slug]).then((r) => r.rows[0]!.id as string);
    const amenityId = (slug: string) => q(`SELECT id FROM amenities WHERE slug=$1`, [slug]).then((r) => r.rows[0]!.id as string);

    /* users */
    interface SeedUser {
      key: keyof typeof DEMO_PASSWORD;
      email: string;
      fullName: string;
      platformRole: "customer" | "tenant_owner" | "super_admin";
      phone: string;
    }
    const users: SeedUser[] = [
      { key: "admin", email: "admin@turf.demo", fullName: "Platform Admin", platformRole: "super_admin", phone: "+919000000001" },
      { key: "owner", email: "owner@turf.demo", fullName: "Aarav Mehta", platformRole: "tenant_owner", phone: "+919000000002" },
      { key: "customer", email: "customer@turf.demo", fullName: "Priya Sharma", platformRole: "customer", phone: "+919000000003" },
    ];
    const userIds: Record<string, string> = {};
    for (const u of users) {
      const existing = await q(`SELECT id FROM profiles WHERE email=$1`, [u.email]);
      if (existing.rows.length > 0) {
        userIds[u.key] = existing.rows[0]!.id as string;
      } else {
        const id = randomUUID();
        await q(
          `INSERT INTO profiles (id, email, platform_role, full_name, phone)
           VALUES ($1,$2,$3,$4,$5)`,
          [id, u.email, u.platformRole, u.fullName, u.phone],
        );
        userIds[u.key] = id;
      }
      await q(
        `INSERT INTO notification_preferences (user_id, channels, booking_reminders, marketing)
         VALUES ($1, ARRAY['push','email'], true, false) ON CONFLICT (user_id) DO NOTHING`,
        [userIds[u.key]!],
      );
      // Dev-only credential store (table exists only in dev deployments).
      const hasDevUsers = await q(`SELECT 1 FROM information_schema.tables WHERE table_name='dev_users'`);
      if (hasDevUsers.rows.length > 0) {
        await q(
          `INSERT INTO dev_users (email, password_hash) VALUES ($1,$2)
           ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
          [u.email, hashPassword(DEMO_PASSWORD[u.key])],
        );
      }
    }

    /* tenant + membership */
    const tenantId = (
      await q(
        `INSERT INTO tenants (name, slug, status, city_id, support_email, support_phone, verified_at, created_by)
         VALUES ('GreenArena Sports','greenarena-sports','active',$1,'bookings@greenarena.example','+912266001100', now(), $2)
         ON CONFLICT (slug) DO UPDATE SET status='active' RETURNING id`,
        [city, userIds.owner],
      )
    ).rows[0]!.id as string;
    await q(
      `INSERT INTO tenant_members (tenant_id, user_id, role)
       VALUES ($1,$2,'owner') ON CONFLICT (tenant_id, user_id) DO NOTHING`,
      [tenantId, userIds.owner],
    );

    /* location */
    const locationId = (
      await q(
        `INSERT INTO locations (tenant_id, city_id, city_name, name, area_name, address_line1, postal_code, geog)
         VALUES ($1,$2,'Mumbai','GreenArena Andheri','Andheri West','Plot 14, Lokhandwala Complex, Andheri West','400053',
                 ST_SetSRID(ST_MakePoint(72.8360,19.1360),4326)::geography)
         ON CONFLICT DO NOTHING RETURNING id`,
      )
    ).rows[0]?.id as string | undefined;
    let locId = locationId;
    if (!locId) {
      locId = (
        await q(
          `SELECT id FROM locations WHERE tenant_id=$1 AND name='GreenArena Andheri'`,
          [tenantId],
        )
      ).rows[0]!.id as string;
    }

    /* turfs */
    interface TurfSpec {
      name: string; slug: string; tagline: string; surface: string;
      sports: string[]; amenities: string[]; price: number; duration: number;
      description: string;
    }
    const turfSpecs: TurfSpec[] = [
      {
        name: "GreenArena Football 5s",
        slug: "greenarena-football-5s-andheri",
        tagline: "FIFA-quality artificial turf under pro floodlights",
        surface: "artificial_turf",
        sports: ["football-5s"],
        amenities: ["floodlights", "changing-rooms", "washrooms", "parking", "drinking-water", "cctv"],
        price: 120000, // ₹1200/h in paise
        duration: 60,
        description:
          "A full-size 5-a-side pitch with 50mm monofilament turf, broadcast-grade floodlights and secure lockers. Walking distance from Lokhandwala market. Referee and ball hire available at the counter.",
      },
      {
        name: "GreenArena Box Cricket",
        slug: "greenarena-box-cricket-andheri",
        tagline: "Net-enclosed box cricket with bowling machine",
        surface: "concrete",
        sports: ["box-cricket", "cricket-box"],
        amenities: ["floodlights", "washrooms", "parking", "equipment-rental", "cafeteria"],
        price: 90000, // ₹900/h
        duration: 60,
        description:
          "Turf-wicket box cricket with side nets, alcohol-stitched balls included and an optional bowling machine. Ideal for 6–8 players. Café on site for post-match plans.",
      },
    ];

    for (const spec of turfSpecs) {
      const existing = await q(`SELECT id FROM turfs WHERE slug=$1`, [spec.slug]);
      let turfId: string;
      if (existing.rows.length > 0) {
        turfId = existing.rows[0]!.id as string;
      } else {
        turfId = (
          await q(
            `INSERT INTO turfs (tenant_id, location_id, name, slug, tagline, description, surface_type,
                                base_price_minor, slot_duration_minutes, cancellation_policy,
                                pay_at_venue_allowed, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'free_until_24h',true,'published') RETURNING id`,
            [tenantId, locId, spec.name, spec.slug, spec.tagline, spec.description, spec.surface,
             spec.price, spec.duration],
          )
        ).rows[0]!.id as string;
      }
      for (const s of spec.sports) {
        await q(`INSERT INTO turf_sports (turf_id, sport_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [turfId, await sportId(s)]);
      }
      for (const a of spec.amenities) {
        await q(`INSERT INTO turf_amenities (turf_id, amenity_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [turfId, await amenityId(a)]);
      }
      const hasImages = await q(`SELECT 1 FROM turf_images WHERE turf_id=$1 LIMIT 1`, [turfId]);
      if (hasImages.rows.length === 0) {
        for (let i = 1; i <= 3; i++) {
          await q(
            `INSERT INTO turf_images (turf_id, url, alt, sort_order) VALUES ($1,$2,$3,$4)`,
            [turfId, `/placeholders/turf-${i}.svg`, `${spec.name} photo ${i}`, i],
          );
        }
      }
      for (const [i, day] of DAYS.entries()) {
        await q(
          `INSERT INTO operating_hours (turf_id, day, opens_at, closes_at, closed)
           VALUES ($1,$2,'06:00','23:30',false) ON CONFLICT (turf_id, day) DO NOTHING`,
          [turfId, day],
        );
      }
      /* slot template: every day 06:00–23:30, hourly */
      const tpl = await q(`SELECT id FROM slot_templates WHERE turf_id=$1 AND name='Standard hourly'`, [turfId]);
      if (tpl.rows.length === 0) {
        await q(
          `INSERT INTO slot_templates (turf_id, name, days_of_week, start_time, end_time, slot_duration_minutes, price_minor, effective_from)
           VALUES ($1,'Standard hourly', $2, '06:00', '23:30', $3, $4, (CURRENT_DATE - INTERVAL '1 day')::date)`,
          [turfId, DAYS as unknown as string[], spec.duration, spec.price],
        );
      }
      /* weekend peak pricing rule: +20% Sat/Sun after 17:00 */
      const rule = await q(`SELECT id FROM pricing_rules WHERE turf_id=$1 AND name='Weekend evening peak'`, [turfId]);
      if (rule.rows.length === 0) {
        await q(
          `INSERT INTO pricing_rules (turf_id, rule_type, name, days_of_week, start_time, end_time, multiplier_percent, priority)
           VALUES ($1,'peak_hours','Weekend evening peak', ARRAY['saturday','sunday'], '17:00', '23:30', 120, 10)`,
          [turfId],
        );
      }

      /* materialize slots for the next 14 days honoring the pricing rule */
      const today = new Date();
      let created = 0;
      for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
        const date = new Date(today.getTime() + dayOffset * 86_400_000);
        const dayName = DAYS[(date.getUTCDay() + 6) % 7]!;
        const dateStr = ymd(date);
        let minute = 6 * 60;
        while (minute + spec.duration <= 23 * 60 + 30) {
          const hh = String(Math.floor(minute / 60)).padStart(2, "0");
          const mm = String(minute % 60).padStart(2, "0");
          const startsAt = localToUtc(dateStr, `${hh}:${mm}`, "Asia/Kolkata");
          const endsAt = new Date(startsAt.getTime() + spec.duration * 60_000);
          // base price with weekend-evening +20%
          const isWeekendEvening = (dayName === "saturday" || dayName === "sunday") && minute >= 17 * 60;
          const price = isWeekendEvening ? Math.round((spec.price * 120) / 100) : spec.price;
          const res = await q(
            `INSERT INTO turf_slots (turf_id, starts_at, ends_at, price_minor, status)
             VALUES ($1,$2,$3,$4,'available') ON CONFLICT DO NOTHING RETURNING id`,
            [turfId, startsAt.toISOString(), endsAt.toISOString(), price],
          );
          created += res.rowCount ?? 0;
          minute += spec.duration;
        }
      }
      console.log(`seeded ${spec.slug}: +${created} slots`);
    }

    await q("COMMIT");
    console.log("\nSeed complete.");
    console.log("  admin@turf.demo / Admin#12345     (super admin)");
    console.log("  owner@turf.demo / Owner#12345     (tenant owner)");
    console.log("  customer@turf.demo / Customer#12345 (customer)");
    console.log("\n(Passwords apply to the dev-only auth adapter; on Supabase, create matching users in Auth.)");
  } catch (err) {
    await q("ROLLBACK");
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
