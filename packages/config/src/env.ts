import { existsSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

/**
 * Central environment validation. Both apps import this so a missing or
 * malformed variable fails fast at boot instead of at 2am in production.
 *
 * NOTE: the Supabase service-role key is validated here for the API only.
 * The web app must never load or import this schema for service values.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  API_URL: z.string().url().default("http://localhost:4000/api/v1"),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),

  // Redis / queues
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Razorpay — all optional: a deterministic mock adapter is used when absent.
  RAZORPAY_KEY_ID: z.string().optional(),
  PAYMENT_MOCK_SECRET: z.string().min(8).default("mock-webhook-secret"),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Maps provider abstraction
  MAPS_PROVIDER: z.enum(["google", "mapbox", "mock"]).default("mock"),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
  MAPBOX_ACCESS_TOKEN: z.string().optional(),

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:admin@example.com"),

  // Notification adapters
  EMAIL_PROVIDER: z.enum(["mock", "smtp", "resend"]).default("mock"),
  /** Resend API key — required when EMAIL_PROVIDER=resend. */
  RESEND_API_KEY: z.string().min(1).optional(),
  /** From address, e.g. "Turf <noreply@yourdomain.com>". Defaults to Resend's onboarding sender in mock/dev. */
  EMAIL_FROM: z.string().min(3).default("Turf <onboarding@resend.dev>"),
  SMS_PROVIDER: z.enum(["mock", "twilio", "msg91"]).default("mock"),

  // Dev-only JWT secret for the development auth adapter (never production).
  JWT_DEV_SECRET: z.string().min(16).default("turf-dev-secret-change-me"),

  // Platform
  PLATFORM_NAME: z.string().default("Turf"),
  SUPPORT_EMAIL: z.string().email().default("support@example.com"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),

  // Booking engine tuning
  RESERVATION_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
});

export type Env = z.infer<typeof envSchema>;

/** Values safe to expose to the browser. Never extend with secrets. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:4000/api/v1"),
  NEXT_PUBLIC_MAPS_PROVIDER: z.enum(["google", "mapbox", "mock"]).default("mock"),
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: z.string().optional(),
  NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN: z.string().optional(),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export function parsePublicEnv(raw: Record<string, string | undefined>): PublicEnv {
  const parsed = publicEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid public environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export function corsOrigins(env: Env): string[] {
  return env.CORS_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function razorpayConfigured(env: Env): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET);
}

export const isProd = (env: Env) => env.NODE_ENV === "production";
export const isTest = (env: Env) => env.NODE_ENV === "test";
export const isDev = (env: Env) => env.NODE_ENV === "development";

/**
 * Loads the first existing .env file from the candidates (repo root, app
 * dir, cwd). Called before parseEnv so scripts and apps share one source of
 * truth without relying on framework-specific env loading.
 */
export function loadEnvFile(candidates: string[] = []): void {
  const paths = [
    ...candidates,
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "..", ".env"),
    path.join(process.cwd(), "..", "..", ".env"),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      dotenv.config({ path: p });
      return;
    }
  }
}
