import { z } from "zod";

export const uuid = z.string().uuid();
export const slug = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase kebab-case slug");

/** ISO-8601 UTC timestamp. */
export const isoDateTimeUtc = z
  .string()
  .datetime({ offset: false })
  .refine((v) => v.endsWith("Z"), "must be UTC (end with Z)");

/** "HH:MM" 24h local time (venue-local operating hours). */
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM");

/** Latitude/longitude pair. */
export const geoPoint = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/**
 * Money is always an integer number of minor units (paise for INR).
 * Floating point money is never accepted anywhere in the platform.
 */
export const moneyMinor = z
  .number()
  .int("money must be integer minor units (paise)")
  .min(0)
  .max(10_000_000_00); // ₹10,00,000 hard sanity ceiling

export const phone = z.string().regex(/^\+?[1-9]\d{6,14}$/, "E.164-ish phone");
export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const idempotencyKey = z.string().min(8).max(128).regex(/^[A-Za-z0-9_:-]+$/);
