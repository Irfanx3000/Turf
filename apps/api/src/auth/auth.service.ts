import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { notificationPreferences, passwordResetTokens, profiles, tenantMembers, tenants } from "@turf/db";
import type { ForgotPasswordInput, RegisterInput, ResetPasswordInput } from "@turf/validation";
import { ENV } from "../config/configuration.js";
import { DbService } from "../database/db-tokens.js";
import { EmailService } from "../email/email.service.js";
import { audit } from "../audit-logs/audit.helper.js";
import { logger } from "../common/logging/logger.service.js";
import { serviceUnavailableException, signInExceptionFor, signUpExceptionFor } from "./sign-in-errors.js";
import { DevJwtVerifier } from "./jwt-verifier.js";
import { authVerifier } from "./verifier-provider.js";
import { DevAuthAdapter } from "./adapters/dev-auth.adapter.js";
import { SupabaseAuthAdapter } from "./adapters/supabase-auth.adapter.js";
import type { AuthProviderAdapter } from "./adapters/auth-provider.js";

const RESET_TTL_MS = 60 * 60 * 1000;
const GENERIC_RESET_ACK = {
  ok: true as const,
  message: "If that email is registered, a reset link is on its way.",
};

export interface AuthResult {
  accessToken: string;
  expiresIn: string;
  user: { id: string; email: string; platformRole: string; fullName: string | null };
  emailConfirmationPending: boolean;
}

@Injectable()
export class AuthService {
  private provider: AuthProviderAdapter;

  constructor(
    private readonly db: DbService,
    private readonly email: EmailService,
  ) {
    // Provider selection is boot-time, explicit and reported by /health.
    this.provider =
      authVerifier() instanceof DevJwtVerifier && process.env.NODE_ENV !== "production"
        ? new DevAuthAdapter(db)
        : new SupabaseAuthAdapter();
  }

  async register(input: RegisterInput, requestId: string): Promise<AuthResult> {
    let existing: Array<{ id: string }>;
    try {
      existing = await this.db.service
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.email, input.email))
        .limit(1);
    } catch (err) {
      // DB unreachable — an infrastructure failure, not a client error.
      logger.error({ requestId, err }, "register: profile lookup failed");
      throw serviceUnavailableException("sign-up");
    }
    if (existing.length > 0) {
      throw new ConflictException({ errorCode: "CONFLICT", message: "an account with this email already exists" });
    }

    const signUp = await this.provider.signUp(input.email, input.password).catch((err: Error & { status?: number }) => {
      // Adapters stamp 4xx for client rejections (invalid email, weak password,
      // rate limits). Those must surface honestly — not as a fake 503.
      const failure = signUpExceptionFor(err);
      if (failure.getStatus() >= 500) {
        logger.error({ requestId, err: err.message }, "register: auth provider unavailable");
      } else {
        logger.warn({ requestId, status: failure.getStatus(), err: err.message }, "register: rejected");
      }
      throw failure;
    });

    await this.db.service.transaction(async (tx) => {
      await tx
        .insert(profiles)
        .values({
          id: signUp.id,
          email: signUp.email,
          platformRole: "customer",
          fullName: input.fullName,
          phone: input.phone,
        })
        .onConflictDoNothing();
      await tx.insert(notificationPreferences).values({ userId: signUp.id }).onConflictDoNothing();
    });

    await audit(this.db.service, {
      requestId,
      action: "auth.register",
      entityType: "profile",
      entityId: signUp.id,
      after: { email: signUp.email },
    });

    if (signUp.pendingConfirmation || !signUp.accessToken) {
      // Either email confirmation is required, or the provider created the
      // user without a session. Don't try to mint a JWT in Supabase mode.
      return {
        accessToken: signUp.accessToken ?? "",
        expiresIn: signUp.accessToken ? "1h" : "0s",
        user: { id: signUp.id, email: signUp.email, platformRole: "customer", fullName: input.fullName ?? null },
        emailConfirmationPending: Boolean(signUp.pendingConfirmation) || !signUp.accessToken,
      };
    }
    return this.issueFor(signUp.id, signUp.email, "customer", input.fullName ?? null, signUp.accessToken);
  }

  async login(email: string, password: string, requestId: string): Promise<AuthResult> {
    // 1. Credential verification via the provider. A DB outage or a network
    //    failure reaching Supabase used to be reported as "invalid
    //    credentials" — classify honestly instead. Passwords are never logged.
    let result;
    try {
      result = await this.provider.signIn(email, password);
    } catch (err) {
      const failure = signInExceptionFor(err);
      if (failure.getStatus() >= 500) {
        logger.error({ requestId, err }, "login: auth provider unreachable");
      } else {
        logger.warn({ requestId, status: failure.getStatus() }, "login: rejected");
      }
      throw failure;
    }

    // 2. Profile lookup — same honest classification for infrastructure
    //    failures; a missing profile is a generic credential error (no
    //    account-existence leakage).
    let profile: { id: string; email: string; platformRole: string; fullName: string | null; isActive: boolean } | undefined;
    try {
      const rows = await this.db.service
        .select({
          id: profiles.id,
          email: profiles.email,
          platformRole: profiles.platformRole,
          fullName: profiles.fullName,
          isActive: profiles.isActive,
        })
        .from(profiles)
        .where(eq(profiles.id, result.id))
        .limit(1);
      profile = rows[0];
    } catch (err) {
      logger.error({ requestId, err }, "login: profile lookup failed");
      throw serviceUnavailableException("sign-in");
    }
    if (!profile) {
      logger.warn({ requestId }, "login: authenticated user has no profile row");
      throw new UnauthorizedException({
        errorCode: "INVALID_CREDENTIALS",
        message: "the email or password is incorrect",
      });
    }
    if (!profile.isActive) {
      throw new ForbiddenException({
        errorCode: "ACCOUNT_DISABLED",
        message: "this account has been disabled — contact support",
      });
    }

    await audit(this.db.service, { requestId, action: "auth.login", entityType: "profile", entityId: profile.id });

    return this.issueFor(profile.id, profile.email, profile.platformRole, profile.fullName, result.accessToken);
  }

  /**
   * Owner onboarding: registers the account AND the first tenant. Runs in one
   * transaction; any failure rolls back the membership, tenant and profile.
   */
  async registerOwner(
    input: { email: string; password: string; fullName: string; phone?: string; organizationName: string; city: string },
    requestId: string,
  ): Promise<{ auth: AuthResult; tenantId: string }> {
    let existing: Array<{ id: string }>;
    try {
      existing = await this.db.service
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.email, input.email))
        .limit(1);
    } catch (err) {
      logger.error({ requestId, err }, "register-owner: profile lookup failed");
      throw serviceUnavailableException("sign-up");
    }
    if (existing.length > 0) {
      throw new ConflictException({ errorCode: "CONFLICT", message: "an account with this email already exists" });
    }

    const signUp = await this.provider.signUp(input.email, input.password).catch((err: Error & { status?: number }) => {
      const failure = signUpExceptionFor(err);
      if (failure.getStatus() >= 500) {
        logger.error({ requestId, err: err.message }, "register-owner: auth provider unavailable");
      } else {
        logger.warn({ requestId, status: failure.getStatus(), err: err.message }, "register-owner: rejected");
      }
      throw failure;
    });

    const slug = slugify(input.organizationName);
    const slugTaken = await this.db.service.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug)).limit(1);
    if (slugTaken.length > 0) {
      throw new ConflictException({ errorCode: "CONFLICT", message: "organization name already taken" });
    }

    const tenantId = crypto.randomUUID();
    await this.db.service.transaction(async (tx) => {
      await tx
        .insert(profiles)
        .values({
          id: signUp.id,
          email: signUp.email,
          platformRole: "tenant_owner",
          fullName: input.fullName,
          phone: input.phone,
        })
        .onConflictDoNothing();
      await tx.insert(notificationPreferences).values({ userId: signUp.id }).onConflictDoNothing();
      await tx.insert(tenants).values({
        id: tenantId,
        name: input.organizationName,
        slug,
        status: "pending_verification",
        createdBy: signUp.id,
      });
      await tx.insert(tenantMembers).values({ tenantId, userId: signUp.id, role: "owner" });
    });

    await audit(this.db.service, {
      requestId,
      action: "tenant.created",
      entityType: "tenant",
      entityId: tenantId,
      after: { name: input.organizationName, slug },
    });

    if (signUp.pendingConfirmation || !signUp.accessToken) {
      return {
        auth: {
          accessToken: signUp.accessToken ?? "",
          expiresIn: signUp.accessToken ? "1h" : "0s",
          user: { id: signUp.id, email: signUp.email, platformRole: "tenant_owner", fullName: input.fullName },
          emailConfirmationPending: Boolean(signUp.pendingConfirmation) || !signUp.accessToken,
        },
        tenantId,
      };
    }
    return {
      auth: await this.issueFor(signUp.id, signUp.email, "tenant_owner", input.fullName, signUp.accessToken),
      tenantId,
    };
  }

  private async issueFor(
    id: string,
    email: string,
    role: string,
    fullName: string | null,
    providerToken?: string,
  ): Promise<AuthResult> {
    // Supabase mode: return the provider session token (verified via JWKS).
    if (providerToken) {
      return { accessToken: providerToken, expiresIn: "1h", user: { id, email, platformRole: role, fullName }, emailConfirmationPending: false };
    }
    // Dev mode only: mint our own short-lived HS256 token. SupabaseJwtVerifier
    // cannot sign — callers must pass providerToken when authMode is supabase.
    const verifier = authVerifier();
    if (!(verifier instanceof DevJwtVerifier)) {
      return {
        accessToken: "",
        expiresIn: "0s",
        user: { id, email, platformRole: role, fullName },
        emailConfirmationPending: true,
      };
    }
    const token = await verifier.sign(id, email, role);
    return { accessToken: token, expiresIn: "12h", user: { id, email, platformRole: role, fullName }, emailConfirmationPending: false };
  }

  /**
   * Start a password reset. Always returns the same acknowledgement so the
   * response does not reveal whether the email exists.
   *
   * Supabase mode: delegates to Auth `resetPasswordForEmail` (Supabase sends
   * the mail). Dev-adapter mode: mints a local token and logs the link.
   */
  async requestPasswordReset(input: ForgotPasswordInput, requestId: string): Promise<typeof GENERIC_RESET_ACK> {
    const email = input.email.trim().toLowerCase();
    const redirectTo = `${ENV.APP_URL.replace(/\/$/, "")}/reset-password`;

    if (this.provider.name === "supabase") {
      try {
        // Supabase Auth sends the recovery email (and does not enumerate accounts).
        await this.provider.requestPasswordReset(email, redirectTo);
      } catch (err) {
        const status = (err as { status?: number } | undefined)?.status;
        const message = err instanceof Error ? err.message : String(err);
        if (status === 429 || /rate limit/i.test(message)) {
          throw new BadRequestException({
            errorCode: "RATE_LIMITED",
            message: "too many reset attempts — please wait a minute and try again",
          });
        }
        logger.error({ requestId, err: message, status }, "forgot-password: supabase unavailable");
        throw serviceUnavailableException("password reset");
      }
      await audit(this.db.service, {
        requestId,
        action: "auth.password_reset_requested",
        entityType: "profile",
        after: { email, provider: "supabase" },
      });
      return GENERIC_RESET_ACK;
    }

    // ── Dev-adapter path (no Supabase mail) ──────────────────────────────
    let profile: { id: string; email: string; fullName: string | null; isActive: boolean } | undefined;
    try {
      const rows = await this.db.service
        .select({
          id: profiles.id,
          email: profiles.email,
          fullName: profiles.fullName,
          isActive: profiles.isActive,
        })
        .from(profiles)
        .where(sql`lower(${profiles.email}) = ${email}`)
        .limit(1);
      profile = rows[0];
    } catch (err) {
      logger.error({ requestId, err }, "forgot-password: profile lookup failed");
      throw serviceUnavailableException("password reset");
    }

    if (!profile || !profile.isActive) {
      return GENERIC_RESET_ACK;
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TTL_MS);

    try {
      await this.db.service
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, profile.id), isNull(passwordResetTokens.usedAt)));
      await this.db.service.insert(passwordResetTokens).values({
        userId: profile.id,
        tokenHash,
        expiresAt,
      });
    } catch (err) {
      logger.error({ requestId, err }, "forgot-password: token persist failed");
      throw serviceUnavailableException("password reset");
    }

    const resetUrl = `${redirectTo}?token=${encodeURIComponent(rawToken)}`;
    try {
      await this.email.sendPasswordReset({
        to: profile.email,
        fullName: profile.fullName,
        resetUrl,
        requestId,
      });
    } catch (err) {
      logger.error({ requestId, err }, "forgot-password: email send failed");
      throw serviceUnavailableException("password reset");
    }

    await audit(this.db.service, {
      requestId,
      action: "auth.password_reset_requested",
      entityType: "profile",
      entityId: profile.id,
      after: { email: profile.email, provider: "dev" },
    });

    return GENERIC_RESET_ACK;
  }

  /**
   * Consume a *local* (dev-adapter) reset token and set a new password.
   * Supabase recovery links update the password in the browser via the
   * Supabase client — they do not hit this endpoint.
   */
  async resetPassword(input: ResetPasswordInput, requestId: string): Promise<{ ok: true }> {
    const tokenHash = hashResetToken(input.token);
    let row: { id: string; userId: string } | undefined;
    try {
      const rows = await this.db.service
        .select({
          id: passwordResetTokens.id,
          userId: passwordResetTokens.userId,
        })
        .from(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, new Date()),
          ),
        )
        .limit(1);
      row = rows[0];
    } catch (err) {
      logger.error({ requestId, err }, "reset-password: token lookup failed");
      throw serviceUnavailableException("password reset");
    }

    if (!row) {
      throw new BadRequestException({
        errorCode: "INVALID_RESET_TOKEN",
        message: "this reset link is invalid or has expired — request a new one",
      });
    }

    try {
      await this.provider.updatePassword(row.userId, input.password);
    } catch (err) {
      logger.error({ requestId, err }, "reset-password: provider update failed");
      throw serviceUnavailableException("password reset");
    }

    await this.db.service
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id));

    await audit(this.db.service, {
      requestId,
      action: "auth.password_reset_completed",
      entityType: "profile",
      entityId: row.userId,
    });

    return { ok: true };
  }

  /** Used by the seed/tests to confirm a dev credential exists. */
  async devCredentialsAvailable(): Promise<boolean> {
    return this.provider instanceof DevAuthAdapter
      ? (this.provider as DevAuthAdapter).available()
      : Promise.resolve(false);
  }
}

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug.length >= 2 ? slug : `org-${crypto.randomUUID().slice(0, 8)}`;
}
