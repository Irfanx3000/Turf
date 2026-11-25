import { describe, expect, it } from "vitest";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { classifySignInError, classifySignUpError, signInExceptionFor, signUpExceptionFor } from "./sign-in-errors.js";

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

  it("classifies Supabase 400 invalid_credentials as invalid credentials (not unavailable)", () => {
    const err = new Error("Invalid login credentials") as Error & { status?: number; code?: string };
    err.status = 400;
    err.code = "invalid_credentials";
    expect(classifySignInError(err).kind).toBe("invalid_credentials");
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

function providerError(message: string, status: number) {
  const err = new Error(message) as Error & { status?: number };
  err.status = status;
  return err;
}

describe("classifySignUpError", () => {
  it("classifies invalid email as invalid_email, not unavailable", () => {
    expect(classifySignUpError(providerError('Email address "haw@gmail.com" is invalid', 400)).kind).toBe(
      "invalid_email",
    );
  });

  it("classifies email rate limit as rate_limited", () => {
    expect(classifySignUpError(providerError("email rate limit exceeded", 429)).kind).toBe("rate_limited");
    expect(classifySignUpError(providerError("email rate limit exceeded", 400)).kind).toBe("rate_limited");
  });

  it("classifies already-registered as already_registered", () => {
    expect(classifySignUpError(providerError("User already registered", 422)).kind).toBe("already_registered");
  });

  it("classifies a network failure as unavailable", () => {
    expect(classifySignUpError(new TypeError("fetch failed")).kind).toBe("unavailable");
  });
});

describe("signUpExceptionFor", () => {
  it("returns 400 INVALID_EMAIL for rejected addresses", () => {
    const ex = signUpExceptionFor(providerError('Email address "haw@gmail.com" is invalid', 400));
    expect(ex).toBeInstanceOf(BadRequestException);
    expect((ex.getResponse() as { errorCode: string }).errorCode).toBe("INVALID_EMAIL");
  });

  it("returns 429 RATE_LIMITED for signup email throttling", () => {
    const ex = signUpExceptionFor(providerError("email rate limit exceeded", 429));
    expect(ex).toBeInstanceOf(HttpException);
    expect(ex.getStatus()).toBe(429);
    expect((ex.getResponse() as { errorCode: string }).errorCode).toBe("RATE_LIMITED");
  });

  it("returns 409 CONFLICT for existing accounts", () => {
    const ex = signUpExceptionFor(providerError("User already registered", 422));
    expect(ex).toBeInstanceOf(ConflictException);
  });

  it("returns 503 for infrastructure failures — never for provider 4xx", () => {
    const ex = signUpExceptionFor(new TypeError("fetch failed"));
    expect(ex).toBeInstanceOf(ServiceUnavailableException);
  });
});
