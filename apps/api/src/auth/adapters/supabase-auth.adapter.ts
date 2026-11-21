import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "../../config/configuration.js";
import type { AuthProviderAdapter, SignInResult, SignUpResult } from "./auth-provider.js";

/**
 * Production adapter: delegates credentials to Supabase Auth using the ANON
 * key (server-side only). The service-role key is never used for sign-in.
 */
export class SupabaseAuthAdapter implements AuthProviderAdapter {
  readonly name = "supabase" as const;
  private client: SupabaseClient;

  constructor() {
    this.client = createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async signUp(email: string, password: string): Promise<SignUpResult> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) {
      const err = new Error(error.message) as Error & { status?: number };
      err.status = 400;
      throw err;
    }
    if (!data.user) throw new Error("signup returned no user");
    return {
      id: data.user.id,
      email,
      // Supabase returns a session immediately when email confirmation is off;
      // otherwise the user must confirm before signing in.
      pendingConfirmation: !data.session,
    };
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      const err = new Error(error?.message ?? "invalid credentials") as Error & { status?: number };
      err.status = 401;
      throw err;
    }
    return { id: data.user!.id, email, accessToken: data.session.access_token };
  }
}
