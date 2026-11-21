import { describe, expect, it } from "vitest";
import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { classifySignInError, signInExceptionFor } from "./sign-in-errors.js";

/** Simulates the dev adapter's credential rejection. */
function credentialError(message = "invalid credentials") {
  const err = new Error(message) as Error & { status?: number };
  err.status = 401;
  return err;
}

/** Simulates what a DB outage looks like when it escapes Drizzle. */
function dbOutageError() {
  const cause = new Error("connect ECONNREFUSED 127.0.0.1:5432");
  return new Error("Failed query: SELECT …", { cause });
}

describe("classifySignInError", () => {
  it("classifies a provider 401 as invalid credentials", () => {
    expect(classifySignInError(credentialError()).kind).toBe("invalid_credentials");
  });

  it("classifies Supabase 'Email not confirmed' as unconfirmed, not invalid credentials", () => {
    const err = credentialError("Email not confirmed");
    expect(classifySignInError(err).kind).toBe("email_unconfirmed");
  });

  it("classifies a DB outage as unavailable — never invalid credentials", () => {
    expect(classifySignInError(dbOutageError()).kind).toBe("unavailable");
  });

  it("classifies a network failure reaching Supabase as unavailable", () => {
    expect(classifySignInError(new TypeError("fetch failed")).kind).toBe("unavailable");
  });

  it("classifies unexpected shapes as unavailable", () => {
    expect(classifySignInError(undefined).kind).toBe("unavailable");
    expect(classifySignInError("string error").kind).toBe("unavailable");
  });
});

describe("signInExceptionFor", () => {
  it("returns 401 with INVALID_CREDENTIALS and a generic message (no enumeration)", () => {
    const ex = signInExceptionFor(credentialError());
    expect(ex).toBeInstanceOf(UnauthorizedException);
    const body = ex.getResponse() as { errorCode: string; message: string };
    expect(body.errorCode).toBe("INVALID_CREDENTIALS");
    expect(body.message).not.toMatch(/exist|registered|user/i);
  });

  it("returns 403 with EMAIL_UNCONFIRMED for unconfirmed accounts", () => {
    const ex = signInExceptionFor(credentialError("Email not confirmed"));
    expect(ex).toBeInstanceOf(ForbiddenException);
    expect((ex.getResponse() as { errorCode: string }).errorCode).toBe("EMAIL_UNCONFIRMED");
  });

  it("returns 503 with AUTH_SERVICE_UNAVAILABLE for infrastructure failures", () => {
    const ex = signInExceptionFor(dbOutageError());
    expect(ex).toBeInstanceOf(ServiceUnavailableException);
    expect((ex.getResponse() as { errorCode: string }).errorCode).toBe("AUTH_SERVICE_UNAVAILABLE");
    // The internal cause must not be exposed through the public message.
    const body = ex.getResponse() as { message: string };
    expect(body.message).not.toMatch(/ECONNREFUSED|SELECT/i);
  });
});
