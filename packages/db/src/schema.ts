/**
 * Drizzle schema for the Turf Booking platform.
 *
 * The hand-authored SQL files in packages/db/migrations are the DDL source of
 * truth (they carry PostGIS, RLS and exclusion constraints Drizzle's DSL
 * cannot express). This file mirrors them so the API gets fully typed queries.
 * Keep both in sync when changing either.
 *
 * Conventions:
 *  - UUID primary keys (gen_random_uuid()).
 *  - All timestamps are timestamptz stored in UTC; columns end in _at.
 *  - All money is bigint minor units (paise). Never floats.
 *  - Booking status and payment status are separate lifecycles.
 */
import { sql } from "drizzle-orm";
import {
  bigint, boolean, customType, date, doublePrecision, index, integer, jsonb,
  pgEnum, pgTable, primaryKey, smallint, text, time, timestamp, unique, uuid, varchar,
} from "drizzle-orm/pg-core";

/** geography(Point, 4326) column (PostGIS). Stored as "lng lat" WKT on the wire. */
export const geographyPoint = customType<{ data: { lat: number; lng: number }; driverData: string }>({
  dataType() {
    return "geography(Point,4326)";
  },
  toDriver(value) {
    return `POINT(${value.lng} ${value.lat})`;
  },
  fromDriver(value) {
    const m = /POINT\((-?[\d.]+) (-?[\d.]+)\)/.exec(String(value));
    if (!m) throw new Error(`unparseable geography: ${String(value)}`);
    return { lng: Number(m[1]), lat: Number(m[2]) };
  },
});

/* ── Enums ─────────────────────────────────────────────────────────────── */

export const platformRoleEnum = pgEnum("platform_role", ["customer", "tenant_owner", "super_admin"]);
export const tenantRoleEnum = pgEnum("tenant_role", ["owner", "manager", "staff"]);
export const tenantStatusEnum = pgEnum("tenant_status", ["pending_verification", "active", "suspended"]);
export const turfStatusEnum = pgEnum("turf_status", ["draft", "published", "archived"]);
export const surfaceTypeEnum = pgEnum("surface_type", [
  "natural_grass", "artificial_turf", "hybrid", "clay", "concrete", "wood",
]);
export const dayOfWeekEnum = pgEnum("day_of_week", [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]);
export const slotStatusEnum = pgEnum("slot_status", ["available", "reserved", "booked", "blocked", "expired"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "pending_payment", "confirmed", "cancelled", "completed", "no_show", "expired",
]);
export const paymentMethodEnum = pgEnum("payment_method", ["online", "pay_at_venue"]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending", "authorized", "paid", "failed", "refunded", "partially_refunded",
]);
export const refundStatusEnum = pgEnum("refund_status", ["pending", "processed", "failed"]);
export const pricingRuleTypeEnum = pgEnum("pricing_rule_type", [
  "base", "weekend", "peak_hours", "special_date",
]);
export const notificationChannelEnum = pgEnum("notification_channel", ["push", "email", "sms", "whatsapp"]);
export const notificationKindEnum = pgEnum("notification_kind", [
  "booking_confirmed", "booking_reminder_24h", "booking_reminder_1h", "booking_cancelled",
  "payment_received", "refund_processed", "tenant_booking_alert",
]);
export const jobStatusEnum = pgEnum("job_status", ["queued", "processing", "completed", "failed"]);
export const cancellationPolicyEnum = pgEnum("cancellation_policy", [
  "free_until_24h", "free_until_2h", "non_refundable", "custom",
]);
export const reviewStatusEnum = pgEnum("review_status", ["published", "hidden"]);

/* ── Identity & tenancy ────────────────────────────────────────────────── */

/**
 * Profiles. `id` equals the Supabase auth.users.id in production (kept in
 * sync by a Supabase trigger bundled with the migrations). The table itself
 * does not hard-FK into auth.users so local development works without the
 * Supabase auth schema (dev auth adapter issues JWTs with the same sub).
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  platformRole: platformRoleEnum("platform_role").notNull().default("customer"),
  fullName: varchar("full_name", { length: 120 }),
  phone: varchar("phone", { length: 20 }),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/** Lookup of platform roles and their coarse permission sets. */
export const platformRoles = pgTable("platform_roles", {
  role: platformRoleEnum("role").primaryKey(),
  description: text("description").notNull(),
  permissions: jsonb("permissions").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
});

export const cities = pgTable("cities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 80 }).notNull(),
  slug: varchar("slug", { length: 90 }).notNull().unique(),
  stateName: varchar("state_name", { length: 80 }).notNull(),
  timezone: varchar("timezone", { length: 60 }).notNull().default("Asia/Kolkata"),
  center: geographyPoint("center"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 160 }).notNull(),
  slug: varchar("slug", { length: 90 }).notNull().unique(),
  status: tenantStatusEnum("status").notNull().default("pending_verification"),
  cityId: uuid("city_id").references(() => cities.id),
  supportEmail: varchar("support_email", { length: 255 }),
  supportPhone: varchar("support_phone", { length: 20 }),
  logoUrl: text("logo_url"),
  verifiedAt: timestamp("verified_at", { withTimezone: true, mode: "date" }),
  suspendedAt: timestamp("suspended_at", { withTimezone: true, mode: "date" }),
  suspensionReason: text("suspension_reason"),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export const tenantMembers = pgTable(
  "tenant_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    role: tenantRoleEnum("role").notNull().default("staff"),
    invitedBy: uuid("invited_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    unique("tenant_members_tenant_user_uq").on(t.tenantId, t.userId),
    index("tenant_members_user_idx").on(t.userId),
  ],
);

/* ── Catalog: locations, turfs, sports, amenities ──────────────────────── */

export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    cityId: uuid("city_id").references(() => cities.id),
    cityName: varchar("city_name", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    areaName: varchar("area_name", { length: 120 }),
    addressLine1: varchar("address_line1", { length: 255 }).notNull(),
    addressLine2: varchar("address_line2", { length: 255 }),
    postalCode: varchar("postal_code", { length: 10 }),
    geog: geographyPoint("geog").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("locations_tenant_idx").on(t.tenantId),
    index("locations_city_idx").on(t.cityId),
  ],
);

export const sports = pgTable("sports", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 60 }).notNull().unique(),
  slug: varchar("slug", { length: 70 }).notNull().unique(),
  icon: varchar("icon", { length: 60 }),
  isActive: boolean("is_active").notNull().default(true),
});

export const amenities = pgTable("amenities", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 80 }).notNull().unique(),
  slug: varchar("slug", { length: 90 }).notNull().unique(),
  icon: varchar("icon", { length: 60 }),
});

export const turfs = pgTable(
  "turfs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 180 }).notNull().unique(),
    tagline: varchar("tagline", { length: 200 }),
    description: text("description"),
    surfaceType: surfaceTypeEnum("surface_type").notNull().default("artificial_turf"),
    basePriceMinor: bigint("base_price_minor", { mode: "number" }).notNull(),
    slotDurationMinutes: smallint("slot_duration_minutes").notNull().default(60),
    capacity: smallint("capacity"),
    cancellationPolicy: cancellationPolicyEnum("cancellation_policy").notNull().default("free_until_24h"),
    customRefundPercent: smallint("custom_refund_percent"),
    payAtVenueAllowed: boolean("pay_at_venue_allowed").notNull().default(true),
    status: turfStatusEnum("status").notNull().default("draft"),
    ratingAvg: doublePrecision("rating_avg"),
    ratingCount: integer("rating_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("turfs_tenant_idx").on(t.tenantId),
    index("turfs_location_idx").on(t.locationId),
    index("turfs_status_idx").on(t.status),
  ],
);

export const turfImages = pgTable(
  "turf_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turfId: uuid("turf_id").notNull().references(() => turfs.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: varchar("alt", { length: 200 }),
    sortOrder: smallint("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("turf_images_turf_idx").on(t.turfId, t.sortOrder)],
);

export const turfSports = pgTable(
  "turf_sports",
  {
    turfId: uuid("turf_id").notNull().references(() => turfs.id, { onDelete: "cascade" }),
    sportId: uuid("sport_id").notNull().references(() => sports.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.turfId, t.sportId] })],
);

export const turfAmenities = pgTable(
  "turf_amenities",
  {
    turfId: uuid("turf_id").notNull().references(() => turfs.id, { onDelete: "cascade" }),
    amenityId: uuid("amenity_id").notNull().references(() => amenities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.turfId, t.amenityId] })],
);

export const operatingHours = pgTable(
  "operating_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turfId: uuid("turf_id").notNull().references(() => turfs.id, { onDelete: "cascade" }),
    day: dayOfWeekEnum("day").notNull(),
    opensAt: time("opens_at").notNull().default("06:00"),
    closesAt: time("closes_at").notNull().default("23:00"),
    closed: boolean("closed").notNull().default(false),
  },
  (t) => [unique("operating_hours_turf_day_uq").on(t.turfId, t.day)],
);

/* ── Slots & pricing ───────────────────────────────────────────────────── */

export const slotTemplates = pgTable(
  "slot_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turfId: uuid("turf_id").notNull().references(() => turfs.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    daysOfWeek: text("days_of_week").array().notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    slotDurationMinutes: smallint("slot_duration_minutes").notNull().default(60),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("slot_templates_turf_idx").on(t.turfId, t.isActive)],
);

export const slotBlocks = pgTable(
  "slot_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turfId: uuid("turf_id").notNull().references(() => turfs.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    reason: varchar("reason", { length: 200 }),
    createdBy: uuid("created_by").references(() => profiles.id),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("slot_blocks_turf_idx").on(t.turfId, t.startsAt)],
);

/**
 * Materialized slots for a turf. The active-slot exclusion constraint
 * (turf_id WITH =, slot_period WITH &&) in migration 0003 prevents two
 * overlapping active slots for the same turf at the DATABASE level; the
 * booking engine additionally flips status with a conditional UPDATE so
 * concurrent bookings cannot both claim the same slot row.
 */
export const turfSlots = pgTable(
  "turf_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turfId: uuid("turf_id").notNull().references(() => turfs.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => slotTemplates.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
    status: slotStatusEnum("status").notNull().default("available"),
    /** Set while a booking holds the slot (reserved/booked). */
    bookingId: uuid("booking_id"),
    /** Guard against stuck reservations: the row auto-releases after this. */
    reservationExpiresAt: timestamp("reservation_expires_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("turf_slots_turf_start_idx").on(t.turfId, t.startsAt),
    index("turf_slots_status_idx").on(t.status),
    index("turf_slots_expiry_idx").on(t.status, t.reservationExpiresAt),
  ],
);

export const pricingRules = pgTable(
  "pricing_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turfId: uuid("turf_id").notNull().references(() => turfs.id, { onDelete: "cascade" }),
    ruleType: pricingRuleTypeEnum("rule_type").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    daysOfWeek: text("days_of_week").array(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    specialDate: date("special_date"),
    /** Either multiply the base price or override it outright. */
    multiplierPercent: smallint("multiplier_percent"),
    priceOverrideMinor: bigint("price_override_minor", { mode: "number" }),
    priority: smallint("priority").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("pricing_rules_turf_idx").on(t.turfId, t.isActive)],
);

/* ── Bookings ──────────────────────────────────────────────────────────── */

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Human-shareable reference, e.g. TRF-2026-000123. */
    reference: varchar("reference", { length: 24 }).notNull().unique(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    turfId: uuid("turf_id").notNull().references(() => turfs.id),
    customerId: uuid("customer_id").notNull().references(() => profiles.id),
    bookingStatus: bookingStatusEnum("booking_status").notNull().default("pending_payment"),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    totalAmountMinor: bigint("total_amount_minor", { mode: "number" }).notNull(),
    paidAmountMinor: bigint("paid_amount_minor", { mode: "number" }).notNull().default(0),
    refundedAmountMinor: bigint("refunded_amount_minor", { mode: "number" }).notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    notes: varchar("notes", { length: 500 }),
    /** Per-customer idempotency: retries of the same intent reuse the booking. */
    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
    reservationExpiresAt: timestamp("reservation_expires_at", { withTimezone: true, mode: "date" }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    cancelledBy: uuid("cancelled_by").references(() => profiles.id),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    unique("bookings_customer_idem_uq").on(t.customerId, t.idempotencyKey),
    index("bookings_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("bookings_customer_idx").on(t.customerId, t.createdAt),
    index("bookings_turf_start_idx").on(t.turfId, t.bookingStatus),
    index("bookings_reservation_expiry_idx").on(t.bookingStatus, t.reservationExpiresAt),
  ],
);

export const bookingItems = pgTable(
  "booking_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    slotId: uuid("slot_id").notNull().references(() => turfSlots.id),
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
  },
  (t) => [
    /** One slot can ever belong to at most one booking — the hard uniqueness
     *  guarantee behind "two customers cannot book the same slot". */
    unique("booking_items_slot_uq").on(t.slotId),
    index("booking_items_booking_idx").on(t.bookingId),
  ],
);

export const bookingStatusHistory = pgTable(
  "booking_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    fromStatus: bookingStatusEnum("from_status"),
    toStatus: bookingStatusEnum("to_status").notNull(),
    changedBy: uuid("changed_by").references(() => profiles.id),
    reason: varchar("reason", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("booking_history_booking_idx").on(t.bookingId, t.createdAt)],
);

export const bookingCancellations = pgTable("booking_cancellations", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookingId: uuid("booking_id").notNull().unique().references(() => bookings.id, { onDelete: "cascade" }),
  cancelledBy: uuid("cancelled_by").notNull().references(() => profiles.id),
  reason: varchar("reason", { length: 500 }),
  policyApplied: cancellationPolicyEnum("policy_applied").notNull(),
  refundDueMinor: bigint("refund_due_minor", { mode: "number" }).notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/* ── Payments & refunds ────────────────────────────────────────────────── */

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    provider: varchar("provider", { length: 30 }).notNull().default("razorpay"),
    providerOrderId: varchar("provider_order_id", { length: 80 }).notNull().unique(),
    providerPaymentId: varchar("provider_payment_id", { length: 80 }),
    method: paymentMethodEnum("method").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("INR"),
    orderedBy: uuid("ordered_by").references(() => profiles.id),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_booking_idx").on(t.bookingId),
    index("payments_status_idx").on(t.status),
    unique("payments_provider_payment_uq").on(t.provider, t.providerPaymentId),
  ],
);

/** Raw webhook receipt. event_id uniqueness gives duplicate-webhook idempotency. */
export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 30 }).notNull(),
    eventId: varchar("event_id", { length: 120 }).notNull(),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    payload: jsonb("payload").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    unique("payment_events_provider_event_uq").on(t.provider, t.eventId),
    index("payment_events_unprocessed_idx").on(t.processedAt),
  ],
);

export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id").notNull().references(() => payments.id),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    providerRefundId: varchar("provider_refund_id", { length: 80 }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    status: refundStatusEnum("status").notNull().default("pending"),
    reason: varchar("reason", { length: 255 }),
    initiatedBy: uuid("initiated_by").references(() => profiles.id),
    processedAt: timestamp("processed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("refunds_payment_idx").on(t.paymentId), index("refunds_booking_idx").on(t.bookingId)],
);

/* ── Notifications ─────────────────────────────────────────────────────── */

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    kind: notificationKindEnum("kind").notNull(),
    title: varchar("title", { length: 160 }).notNull(),
    body: text("body").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>(),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const notificationJobs = pgTable(
  "notification_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
    channel: notificationChannelEnum("channel").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: "date" }).notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    attempts: smallint("attempts").notNull().default(0),
    lastError: text("last_error"),
    idempotencyKey: varchar("idempotency_key", { length: 140 }).notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    unique("notification_jobs_idem_uq").on(t.idempotencyKey),
    index("notification_jobs_due_idx").on(t.status, t.scheduledFor),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: varchar("p256dh", { length: 255 }).notNull(),
    auth: varchar("auth", { length: 255 }).notNull(),
    userAgent: varchar("user_agent", { length: 400 }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id").primaryKey().references(() => profiles.id, { onDelete: "cascade" }),
  channels: text("channels").array().notNull().default(sql`ARRAY['push']::text[]`),
  bookingReminders: boolean("booking_reminders").notNull().default(true),
  marketing: boolean("marketing").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

/* ── Reviews ───────────────────────────────────────────────────────────── */

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    turfId: uuid("turf_id").notNull().references(() => turfs.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").notNull().unique().references(() => bookings.id),
    rating: smallint("rating").notNull(),
    title: varchar("title", { length: 120 }),
    body: varchar("body", { length: 2000 }),
    status: reviewStatusEnum("status").notNull().default("published"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("reviews_turf_idx").on(t.turfId, t.status)],
);

/* ── Audit ─────────────────────────────────────────────────────────────── */

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => profiles.id),
    actorType: varchar("actor_type", { length: 20 }).notNull().default("user"),
    action: varchar("action", { length: 80 }).notNull(),
    entityType: varchar("entity_type", { length: 60 }).notNull(),
    entityId: varchar("entity_id", { length: 80 }),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: varchar("ip", { length: 45 }),
    userAgent: varchar("user_agent", { length: 400 }),
    requestId: varchar("request_id", { length: 64 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_entity_idx").on(t.entityType, t.entityId, t.createdAt),
    index("audit_logs_actor_idx").on(t.actorId, t.createdAt),
    index("audit_logs_tenant_idx").on(t.tenantId, t.createdAt),
  ],
);

/* ── Password resets ──────────────────────────────────────────────────── */

/**
 * Single-use password reset tokens. The opaque token is emailed; only a
 * SHA-256 hash is stored. turf_service owns this table (BYPASSRLS).
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("password_reset_tokens_user_idx").on(t.userId, t.createdAt),
    index("password_reset_tokens_expiry_idx").on(t.expiresAt),
  ],
);

/* ── Local dev auth (NOT used in production) ───────────────────────────── */

/**
 * Development-only credential store so the stack runs without Supabase Auth.
 * In production the API verifies Supabase JWTs and never reads this table;
 * migrations create it only when `turf.dev_auth` is enabled (see 0002).
 */
export const devUsers = pgTable("dev_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
