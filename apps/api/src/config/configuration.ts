import { corsOrigins, loadEnvFile, parseEnv, razorpayConfigured, type Env } from "@turf/config";

// Runs before the first parseEnv below; also safe for any importer.
loadEnvFile();

/** Parsed + validated environment, provided as an app-wide constant. */
export const ENV = parseEnv(process.env);

export const appConfig = () => ENV;

export const corsOriginsFor = () => corsOrigins(ENV);
export const razorpayActive = () => razorpayConfigured(ENV);

export const authMode = (): "supabase" | "dev" =>
  ENV.SUPABASE_URL && ENV.SUPABASE_URL !== "https://your-project.supabase.co" && ENV.SUPABASE_ANON_KEY !== "your-anon-key"
    ? "supabase"
    : "dev";

export type { Env };
