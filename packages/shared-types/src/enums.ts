/** Platform-level role stored on profiles.platform_role. */
export const PLATFORM_ROLES = ["customer", "tenant_owner", "super_admin"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Role a user holds inside a specific tenant organization. */
export const TENANT_ROLES = ["owner", "manager", "staff"] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

/**
 * Booking lifecycle. Kept strictly separate from payment status:
 * a pay-at-venue booking can be CONFIRMED while its payment is PENDING.
 */
export const BOOKING_STATUSES = [
  "pending_payment", // temporary reservation, waiting for verified payment
  "confirmed",       // slot reserved and visible to tenant
  "cancelled",       // cancelled by customer or policy
  "completed",       // slot time passed; used for analytics
  "no_show",         // tenant-marked; pay-at-venue money never collected
  "expired",         // reservation TTL elapsed without payment
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Payment lifecycle, independent from booking lifecycle. */
export const PAYMENT_STATUSES = [
  "pending",     // order created / awaiting money
  "authorized",  // money captured intent (rare for Razorpay captures)
  "paid",        // verified settled payment
  "failed",      // gateway reported failure
  "refunded",    // fully refunded
  "partially_refunded",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["online", "pay_at_venue"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const REFUND_STATUSES = ["pending", "processed", "failed"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const TENANT_STATUSES = ["pending_verification", "active", "suspended"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TURF_STATUSES = ["draft", "published", "archived"] as const;
export type TurfStatus = (typeof TURF_STATUSES)[number];

export const SLOT_STATUSES = ["available", "reserved", "booked", "blocked", "expired"] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

export const DAY_OF_WEEK = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
] as const;
export type DayOfWeek = (typeof DAY_OF_WEEK)[number];

export const PRICING_RULE_TYPES = [
  "base",           // baseline hourly price
  "weekend",        // weekend multiplier/override
  "peak_hours",     // time-of-day window
  "special_date",   // specific calendar date
] as const;
export type PricingRuleType = (typeof PRICING_RULE_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["push", "email", "sms", "whatsapp"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_KINDS = [
  "booking_confirmed",
  "booking_reminder_24h",
  "booking_reminder_1h",
  "booking_cancelled",
  "payment_received",
  "refund_processed",
  "tenant_booking_alert",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const JOB_STATUSES = ["queued", "processing", "completed", "failed"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Cancellation policy applied to a booking. */
export const CANCELLATION_POLICIES = [
  "free_until_24h",   // full refund if cancelled >= 24h before start
  "free_until_2h",    // full refund if cancelled >= 2h before start
  "non_refundable",   // no refund after confirmation
  "custom",           // tenant-defined; inspect percentage
] as const;
export type CancellationPolicy = (typeof CANCELLATION_POLICIES)[number];
