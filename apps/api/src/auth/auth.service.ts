import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { notificationPreferences, profiles, tenantMembers, tenants } from "@turf/db";
import type { RegisterInput } from "@turf/validation";
import { DbService } from "../database/db-tokens.js";
import { audit } from "../audit-logs/audit.helper.js";
import { logger } from "../common/logging/logger.service.js";
import { isInfrastructureError, serviceUnavailableException, signInExceptionFor } from "./sign-in-errors.js";
import { DevJwtVerifier } from "./jwt-verifier.js";
import { authVerifier } from "./verifier-provider.js";
import { DevAuthAdapter } from "./adapters/dev-auth.adapter.js";
import { SupabaseAuthAdapter } from "./adapters/supabase-auth.adapter.js";
import type { AuthProviderAdapter } from "./adapters/auth-provider.js";

export interface AuthResult {
  accessToken: string;
  expiresIn: string;
  user: { id: string; email: string; platformRole: string; fullName: string | null };
  emailConfirmationPending: boolean;
}

@Injectable()
export class AuthService {
  private provider: AuthProviderAdapter;

  constructor(private readonly db: DbService) {
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
      // Providers mark client errors (weak password, existing auth user) with
      // a 400; anything else is infrastructure and must not surface as one.
      if (isInfrastructureError(err) || (err.status !== undefined && err.status >= 500)) {
        logger.error({ requestId, err: err.message }, "register: auth provider unavailable");
        throw serviceUnavailableException("sign-up");
      }
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: err.message });
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

    if (signUp.pendingConfirmation) {
      return {
        accessToken: "",
        expiresIn: "0s",
        user: { id: signUp.id, email: signUp.email, platformRole: "customer", fullName: input.fullName ?? null },
        emailConfirmationPending: true,
      };
    }
    return this.issueFor(signUp.id, signUp.email, "customer", input.fullName ?? null, undefined);
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
      if (isInfrastructureError(err) || (err.status !== undefined && err.status >= 500)) {
        logger.error({ requestId, err: err.message }, "register-owner: auth provider unavailable");
        throw serviceUnavailableException("sign-up");
      }
      throw new BadRequestException({ errorCode: "BAD_REQUEST", message: err.message });
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

    if (signUp.pendingConfirmation) {
      return {
        auth: {
          accessToken: "",
          expiresIn: "0s",
          user: { id: signUp.id, email: signUp.email, platformRole: "tenant_owner", fullName: input.fullName },
          emailConfirmationPending: true,
        },
        tenantId,
      };
    }
    return {
      auth: await this.issueFor(signUp.id, signUp.email, "tenant_owner", input.fullName, undefined),
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
    // Dev mode: sign our own short-lived token.
    const verifier = authVerifier() as DevJwtVerifier;
    const token = await verifier.sign(id, email, role);
    return { accessToken: token, expiresIn: "12h", user: { id, email, platformRole: role, fullName }, emailConfirmationPending: false };
  }

  /** Used by the seed/tests to confirm a dev credential exists. */
  async devCredentialsAvailable(): Promise<boolean> {
    return this.provider instanceof DevAuthAdapter
      ? (this.provider as DevAuthAdapter).available()
      : Promise.resolve(false);
  }
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
