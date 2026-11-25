import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export interface SignUpResult {
  /** Auth user id (Supabase) or dev user id. */
  id: string;
  email: string;
  /** True when email verification is pending and no session can start yet. */
  pendingConfirmation?: boolean;
  /** Provider session token when sign-up also establishes a session. */
  accessToken?: string;
}

export interface SignInResult {
  id: string;
  email: string;
  /** Provider-issued access token (Supabase session). Dev adapter issues none. */
  accessToken?: string;
}

/**
 * Auth provider abstraction: Supabase Auth in production, a local credential
 * store in development. Both produce the same {id, email} identity that maps
 * to profiles.id.
 */
export interface AuthProviderAdapter {
  readonly name: "supabase" | "dev";
  signUp(email: string, password: string): Promise<SignUpResult>;
  signIn(email: string, password: string): Promise<SignInResult>;
  /**
   * Start a password reset for `email`.
   * Supabase: sends its Auth recovery email (redirectTo must be allow-listed).
   * Dev: no-op — AuthService mints a local token and logs the link via mock email.
   */
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  /** Replace the user's password after a verified local reset-token flow (dev). */
  updatePassword(userId: string, password: string): Promise<void>;
}

export const devPasswordHasher = {
  hash(password: string): string {
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, salt, 64).toString("hex");
    return `scrypt$${salt}$${hash}`;
  },
  verify(password: string, stored: string): boolean {
    const [scheme, salt, hash] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const candidate = scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, "hex");
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  },
};
