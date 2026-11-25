import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "../../config/configuration.js";
import type { AuthProviderAdapter, SignInResult, SignUpResult } from "./auth-provider.js";

function toProviderError(error: { message: string; status?: number; code?: string }, fallbackStatus = 400): Error & {
  status?: number;
  code?: string;
} {
  // Preserve Supabase's status (400 invalid email, 422 validation, 429 rate
  // limit) so AuthService can classify client vs infrastructure failures.
  const err = new Error(error.message) as Error & { status?: number; code?: string };
  err.status = typeof error.status === "number" ? error.status : fallbackStatus;
  err.code = error.code;
  return err;
}

/**
 * Production adapter: credentials go through Supabase Auth.
 *
 * Sign-in uses the anon key. Sign-up prefers the service-role admin API when
 * available so we can create confirmed users without burning the free-tier
 * confirmation-email rate limit (which otherwise surfaces as opaque 503s).
 */
export class SupabaseAuthAdapter implements AuthProviderAdapter {
  readonly name = "supabase" as const;
  private client: SupabaseClient;
  private admin: SupabaseClient | null;

  constructor() {
    this.client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    this.admin = ENV.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(ENV.SUPABASE_URL, ENV.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      : null;
  }

  async signUp(email: string, password: string): Promise<SignUpResult> {
    if (this.admin) {
      const { data, error } = await this.admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw toProviderError(error);
      if (!data.user) throw new Error("signup returned no user");

      // Admin createUser does not return a session — sign in immediately so
      // AuthService can set the turf_session cookie (Supabase verifier cannot
      // mint JWTs itself).
      const session = await this.client.auth.signInWithPassword({ email, password });
      if (session.error || !session.data.session) {
        return { id: data.user.id, email, pendingConfirmation: false };
      }
      return {
        id: data.user.id,
        email,
        pendingConfirmation: false,
        accessToken: session.data.session.access_token,
      };
    }

    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw toProviderError(error);
    if (!data.user) throw new Error("signup returned no user");
    return {
      id: data.user.id,
      email,
      // Supabase returns a session immediately when email confirmation is off;
      // otherwise the user must confirm before signing in.
      pendingConfirmation: !data.session,
      accessToken: data.session?.access_token,
    };
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      throw toProviderError(
        { message: error?.message ?? "invalid credentials", status: error?.status ?? 401, code: error?.code },
        401,
      );
    }
    return { id: data.user!.id, email, accessToken: data.session.access_token };
  }

  async requestPasswordReset(email: string, redirectTo: string): Promise<void> {
    // Supabase owns the email template + delivery (Authentication → Emails).
    // Add redirectTo under Authentication → URL Configuration → Redirect URLs.
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw toProviderError(error, error.status ?? 400);
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    if (!this.admin) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to reset passwords");
    }
    const { error } = await this.admin.auth.admin.updateUserById(userId, { password });
    if (error) throw toProviderError(error);
  }
}
