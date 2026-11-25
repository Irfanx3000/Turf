import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";

/**
 * Auth provider error classification.
 *
 * Providers throw plain errors with an optional `status` (adapters stamp
 * 4xx for client problems). Infrastructure failures (DB unreachable, network
 * error talking to Supabase, anything unexpected) have no usable 4xx status.
 * Treating those as credential / validation failures misleads customers —
 * this module maps every failure to the honest, user-safe exception.
 *
 * Pure + unit-tested (see sign-in-errors.spec.ts).
 */

export type SignInFailureKind = "invalid_credentials" | "email_unconfirmed" | "unavailable";
export type SignUpFailureKind =
  | "invalid_email"
  | "weak_password"
  | "already_registered"
  | "rate_limited"
  | "bad_request"
  | "unavailable";

/** Supabase returns this message for unconfirmed accounts trying to sign in. */
const UNCONFIRMED_PATTERNS = [/email not confirmed/i, /not.*confirmed/i];
const RATE_LIMIT_PATTERNS = [/rate limit/i, /too many requests/i, /email rate limit exceeded/i];
const INVALID_EMAIL_PATTERNS = [/email.*invalid/i, /invalid email/i];
const WEAK_PASSWORD_PATTERNS = [/password/i];
const ALREADY_REGISTERED_PATTERNS = [/already.*(registered|exists|been)/i, /user already/i];

function providerStatus(err: unknown): number | undefined {
  return (err as { status?: number } | undefined)?.status;
}

function providerMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "");
}

/** True when the provider marked this as a client-side (4xx) rejection. */
export function isProviderClientError(err: unknown): boolean {
  const status = providerStatus(err);
  return status !== undefined && status >= 400 && status < 500;
}

export function classifySignInError(err: unknown): { kind: SignInFailureKind; cause: string } {
  const status = providerStatus(err);
  const message = providerMessage(err);

  if (status === 401 || err instanceof UnauthorizedException) {
    // Credential rejections from the provider — Supabase distinguishes
    // unconfirmed accounts in the message; the dev adapter does not need to.
    if (UNCONFIRMED_PATTERNS.some((re) => re.test(message))) {
      return { kind: "email_unconfirmed", cause: message };
    }
    return { kind: "invalid_credentials", cause: message };
  }
  // Anything else (ECONNREFUSED, fetch failed, timeouts, unexpected shapes)
  // is an infrastructure problem, never a credential verdict.
  return { kind: "unavailable", cause: message };
}

export function signInExceptionFor(err: unknown): HttpException {
  const { kind, cause } = classifySignInError(err);
  switch (kind) {
    case "invalid_credentials":
      // Deliberately generic: no account-existence leakage.
      return new UnauthorizedException({
        errorCode: "INVALID_CREDENTIALS",
        message: "the email or password is incorrect",
      });
    case "email_unconfirmed":
      return new ForbiddenException({
        errorCode: "EMAIL_UNCONFIRMED",
        message: "please verify your email before signing in",
      });
    case "unavailable":
      return new ServiceUnavailableException({
        errorCode: "AUTH_SERVICE_UNAVAILABLE",
        message: "we're having trouble signing you in — please try again shortly",
        cause, // stripped by the exception filter; logged server-side only
      });
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function classifySignUpError(err: unknown): { kind: SignUpFailureKind; cause: string } {
  const status = providerStatus(err);
  const message = providerMessage(err);

  // No usable client status → infrastructure (network, 5xx, unknown).
  if (status === undefined || status >= 500) {
    return { kind: "unavailable", cause: message };
  }

  if (status === 429 || RATE_LIMIT_PATTERNS.some((re) => re.test(message))) {
    return { kind: "rate_limited", cause: message };
  }
  if (INVALID_EMAIL_PATTERNS.some((re) => re.test(message))) {
    return { kind: "invalid_email", cause: message };
  }
  if (ALREADY_REGISTERED_PATTERNS.some((re) => re.test(message))) {
    return { kind: "already_registered", cause: message };
  }
  if (WEAK_PASSWORD_PATTERNS.some((re) => re.test(message))) {
    return { kind: "weak_password", cause: message };
  }
  if (isProviderClientError(err)) {
    return { kind: "bad_request", cause: message };
  }
  return { kind: "unavailable", cause: message };
}

export function signUpExceptionFor(err: unknown): HttpException {
  const { kind, cause } = classifySignUpError(err);
  switch (kind) {
    case "invalid_email":
      return new BadRequestException({
        errorCode: "INVALID_EMAIL",
        message: "please enter a valid email address",
      });
    case "weak_password":
      return new BadRequestException({
        errorCode: "WEAK_PASSWORD",
        message: cause || "password does not meet the requirements",
      });
    case "already_registered":
      return new ConflictException({
        errorCode: "CONFLICT",
        message: "an account with this email already exists",
      });
    case "rate_limited":
      return new HttpException(
        {
          errorCode: "RATE_LIMITED",
          message: "too many sign-up attempts — please wait a minute and try again",
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    case "bad_request":
      return new BadRequestException({
        errorCode: "BAD_REQUEST",
        message: cause || "unable to create this account",
      });
    case "unavailable":
      return new ServiceUnavailableException({
        errorCode: "SERVICE_UNAVAILABLE",
        message: "sign-up is temporarily unavailable — please try again shortly",
        cause,
      });
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

/** True when an error is NOT an HttpException we chose to throw — i.e. an
 *  unexpected infrastructure failure that should surface as 503, not 500. */
export function isInfrastructureError(err: unknown): boolean {
  return !(err instanceof HttpException) && !isProviderClientError(err);
}

export function serviceUnavailableException(context: string): HttpException {
  return new ServiceUnavailableException({
    errorCode: "SERVICE_UNAVAILABLE",
    message: `${context} is temporarily unavailable — please try again shortly`,
  });
}
