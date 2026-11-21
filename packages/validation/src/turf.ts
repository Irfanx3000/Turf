import { z } from "zod";
import { DAY_OF_WEEK, PLATFORM_ROLES, TENANT_ROLES } from "@turf/shared-types";
import { geoPoint, hhmm, moneyMinor, pagination, phone, slug, uuid } from "./common.js";

export const createTenantSchema = z.object({
  name: z.string().min(2).max(160),
  slug: slug,
  city: z.string().min(2).max(80),
  supportEmail: z.string().email().optional(),
  supportPhone: phone.optional(),
  logoUrl: z.string().url().optional(),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(TENANT_ROLES).refine((r) => r !== "owner", "owners are transferred, not invited"),
});

export const createLocationSchema = z.object({
  name: z.string().min(2).max(160),
  cityName: z.string().min(2).max(80),
  areaName: z.string().max(120).optional(),
  addressLine1: z.string().min(4).max(255),
  addressLine2: z.string().max(255).optional(),
  postalCode: z.string().regex(/^\d{6}$/).optional(),
  location: geoPoint,
});

export const createTurfSchema = z.object({
  locationId: uuid,
  name: z.string().min(2).max(160),
  slug: slug,
  tagline: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  surfaceType: z.enum(["natural_grass", "artificial_turf", "hybrid", "clay", "concrete", "wood"]),
  sportIds: z.array(uuid).min(1),
  basePriceMinor: moneyMinor.refine((v) => v > 0, "base price must be positive"),
  slotDurationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120)]),
  cancellationPolicy: z.enum(["free_until_24h", "free_until_2h", "non_refundable", "custom"]),
  customRefundPercent: z.number().int().min(0).max(100).optional(),
  payAtVenueAllowed: z.boolean().default(true),
  capacity: z.number().int().min(1).max(500).optional(),
});

export const operatingHoursSchema = z.array(
  z
    .object({
      day: z.enum(DAY_OF_WEEK),
      opensAt: hhmm,
      closesAt: hhmm,
      closed: z.boolean().default(false),
    })
    .refine((d) => d.closed || d.opensAt < d.closesAt, "opensAt must precede closesAt"),
);

export const slotTemplateSchema = z.object({
  name: z.string().min(2).max(120),
  turfId: uuid,
  daysOfWeek: z.array(z.enum(DAY_OF_WEEK)).min(1),
  startTime: hhmm,
  endTime: hhmm,
  slotDurationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60), z.literal(90), z.literal(120)]),
  priceMinor: moneyMinor.refine((v) => v > 0, "price must be positive"),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().optional(),
});

export const nearbySearchSchema = pagination.extend({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(100).max(50000).default(5000),
  sport: z.string().max(40).optional(),
  search: z.string().max(120).optional(),
  maxPriceMinor: moneyMinor.optional(),
});

export type CreateTurfInput = z.infer<typeof createTurfSchema>;

export const updateTurfStatusSchema = z.object({
  status: z.enum(["draft", "published", "archived"]),
});

export const roleGuardSchema = z.object({ role: z.enum(PLATFORM_ROLES) });
