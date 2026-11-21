import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { and, eq } from "drizzle-orm";
import { profiles, tenantMembers, tenants } from "@turf/db";
import type { AuthenticatedUser } from "@turf/shared-types";
import { IS_PUBLIC_KEY } from "./public.decorator.js";
import { DbService } from "../../database/db-tokens.js";
import { authVerifier } from "../../auth/verifier-provider.js";

/**
 * Verifies the Bearer token (Supabase JWKS or dev adapter), then loads the
 * database-backed profile and tenant memberships. Client-supplied roles are
 * never trusted: platformRole comes from the profiles table only.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DbService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest();
    if (isPublic) {
      // Optional identity: attach user when a valid token is present.
      const token = extractToken(req);
      if (token) req.user = await this.loadUser(token).catch(() => undefined);
      return true;
    }

    const token = extractToken(req);
    if (!token) {
      throw new UnauthorizedException({ errorCode: "UNAUTHORIZED", message: "missing bearer token" });
    }
    req.user = await this.loadUser(token);
    return true;
  }

  private async loadUser(token: string): Promise<AuthenticatedUser> {
    const verified = await authVerifier().verify(token);

    const rows = await this.db.service
      .select({
        id: profiles.id,
        email: profiles.email,
        platformRole: profiles.platformRole,
        fullName: profiles.fullName,
        phone: profiles.phone,
        avatarUrl: profiles.avatarUrl,
        isActive: profiles.isActive,
      })
      .from(profiles)
      .where(eq(profiles.id, verified.sub))
      .limit(1);

    const profile = rows[0];
    if (!profile || !profile.isActive) {
      throw new UnauthorizedException({ errorCode: "UNAUTHORIZED", message: "account not found or disabled" });
    }

    const memberships = await this.db.service
      .select({
        tenantId: tenantMembers.tenantId,
        tenantName: tenants.name,
        role: tenantMembers.role,
      })
      .from(tenantMembers)
      .innerJoin(tenants, eq(tenants.id, tenantMembers.tenantId))
      .where(and(eq(tenantMembers.userId, profile.id), eq(tenants.status, "active")));

    return {
      id: profile.id,
      email: profile.email,
      platformRole: profile.platformRole,
      fullName: profile.fullName,
      phone: profile.phone,
      avatarUrl: profile.avatarUrl,
      memberships: memberships.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenantName,
        role: m.role,
      })),
    };
  }
}

function extractToken(req: { headers?: { authorization?: string; cookie?: string } }): string | null {
  const header = req.headers?.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token.length > 0) return token;
  }
  // Fallback: the httpOnly session cookie set by /auth/login.
  const cookie = req.headers?.cookie;
  if (cookie) {
    const match = /(?:^|;\s*)turf_session=([^;]+)/.exec(cookie);
    if (match?.[1]) return decodeURIComponent(match[1]);
  }
  return null;
}
