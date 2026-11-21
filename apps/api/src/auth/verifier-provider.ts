import { DevJwtVerifier, SupabaseJwtVerifier, type JwtVerifier } from "./jwt-verifier.js";
import { authMode } from "../config/configuration.js";

let verifier: JwtVerifier | undefined;

/**
 * Lazily constructs the single active verifier based on configuration.
 * Exported as a function (not a provider) so guards and services share it.
 */
export function authVerifier(): JwtVerifier {
  if (!verifier) {
    verifier = authMode() === "supabase" ? new SupabaseJwtVerifier() : new DevJwtVerifier();
  }
  return verifier;
}

/** Test hook: reset the cached verifier between suites. */
export function resetAuthVerifier(): void {
  verifier = undefined;
}
