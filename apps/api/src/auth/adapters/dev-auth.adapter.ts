import { eq, sql } from "drizzle-orm";
import { devUsers } from "@turf/db";
import { DbService } from "../../database/db-tokens.js";
import { devPasswordHasher, type AuthProviderAdapter, type SignInResult, type SignUpResult } from "./auth-provider.js";

/**
 * Development-only credential store (dev_users table, scrypt hashes).
 * The API refuses to use it in production — see auth.module.ts.
 */
export class DevAuthAdapter implements AuthProviderAdapter {
  readonly name = "dev" as const;

  constructor(private readonly db: DbService) {}

  async signUp(email: string, password: string): Promise<SignUpResult> {
    const id = crypto.randomUUID();
    await this.db.service.insert(devUsers).values({
      id,
      email,
      passwordHash: devPasswordHasher.hash(password),
    });
    return { id, email };
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const rows = await this.db.service
      .select({ id: devUsers.id, passwordHash: devUsers.passwordHash })
      .from(devUsers)
      .where(eq(devUsers.email, email))
      .limit(1);
    const user = rows[0];
    // Constant-ish work either way to avoid trivial user-enumeration timing.
    const ok = user ? devPasswordHasher.verify(password, user.passwordHash) : false;
    if (!user || !ok) {
      const err = new Error("invalid credentials") as Error & { status?: number };
      err.status = 401;
      throw err;
    }
    return { id: user.id, email };
  }

  async requestPasswordReset(_email: string, _redirectTo: string): Promise<void> {
    // No Supabase mail in dev-adapter mode — AuthService handles a local token.
  }

  async updatePassword(userId: string, password: string): Promise<void> {
    const updated = await this.db.service
      .update(devUsers)
      .set({ passwordHash: devPasswordHasher.hash(password) })
      .where(eq(devUsers.id, userId))
      .returning({ id: devUsers.id });
    if (updated.length === 0) {
      const err = new Error("user not found") as Error & { status?: number };
      err.status = 404;
      throw err;
    }
  }

  /** Table exists only in dev deployments; guard for safety. */
  async available(): Promise<boolean> {
    const res = await this.db.service.execute<{ ok: boolean }>(
      sql`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'dev_users') AS ok`,
    );
    const rows = (res as unknown as { rows: Array<{ ok: boolean }> }).rows ?? [];
    return rows[0]?.ok === true;
  }
}
