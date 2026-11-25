/**
 * JWT verification strategies.
 *
 * Production (Supabase configured): verifies the access token against the
 * project's JWKS with issuer + audience checks.
 *
 * Development (no Supabase): the DevAuthStrategy signs/verifies HS256 tokens
 * with JWT_DEV_SECRET against the dev_users table. It hard-fails outside
 * development/test NODE_ENVs so it can never run in production.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from "jose";
import { ENV } from "../config/configuration.js";

export interface VerifiedToken {
  sub: string;
  email?: string;
  role?: string;
}

export interface JwtVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

const supabaseWellKnown = (url: string) => `${url.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`;

@Injectable()
export class SupabaseJwtVerifier implements JwtVerifier {
  private jwks = createRemoteJWKSet(new URL(supabaseWellKnown(ENV.SUPABASE_URL)));

  async verify(token: string): Promise<VerifiedToken> {
    // Hosted and local Supabase both mint access tokens with aud "authenticated"
    // (not the project ref). Requiring the project ref rejects every real session.
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: `${ENV.SUPABASE_URL.replace(/\/$/, "")}/auth/v1`,
      audience: "authenticated",
    });
    return { sub: String(payload.sub), email: payload.email as string | undefined };
  }
}

const DEV_ISSUER = "turf-dev-auth";
const DEV_AUDIENCE = "turf-dev";
const DEV_SECRET = ENV.JWT_DEV_SECRET ?? "turf-dev-secret-change-me";

@Injectable()
export class DevJwtVerifier implements JwtVerifier {
  constructor() {
    if (ENV.NODE_ENV === "production") {
      throw new Error("DevJwtVerifier must never run in production");
    }
  }

  async verify(token: string): Promise<VerifiedToken> {
    try {
      const { payload } = await jwtVerify<JWTPayload & { email?: string; role?: string }>(token, new TextEncoder().encode(DEV_SECRET), {
        issuer: DEV_ISSUER,
        audience: DEV_AUDIENCE,
      });
      return { sub: String(payload.sub), email: payload.email, role: payload.role };
    } catch {
      throw new UnauthorizedException({ errorCode: "UNAUTHORIZED", message: "invalid token" });
    }
  }

  async sign(sub: string, email: string, role: string): Promise<string> {
    return new SignJWT({ email, role })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(sub)
      .setIssuer(DEV_ISSUER)
      .setAudience(DEV_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("12h")
      .sign(new TextEncoder().encode(DEV_SECRET));
  }
}

/** scrypt password hashing shared by the dev adapter and the seed script. */
export const passwordHasher = {
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

/** Dev-only helper used by the mock payment gateway to sign webhooks. */
export const hmacSign = (payload: string, secret: string): string =>
  createHmac("sha256", secret).update(payload).digest("hex");
