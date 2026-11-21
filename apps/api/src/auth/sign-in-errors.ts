import { ForbiddenException, HttpException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";

/**
 * Sign-in error classification.
 *
 * Providers throw plain errors: adapters mark genuine credential failures with
 * `status: 401`, but infrastructure failures (DB unreachable, network error
 * talking to Supabase, anything unexpected) also surface as thrown errors.
 * Treating those as "invalid credentials" misleads customers and support —
 * this module maps every failure to the honest, user-safe exception.
 *
 * Pure + unit-tested (see sign-in-errors.spec.ts).
 */

export type SignInFailureKind = "invalid_credentials" | "email_unconfirmed" | "unavailable";

/** Supabase returns this message for unconfirmed accounts trying to sign in. */
const UNCONFIRMED_PATTERNS = [/email not confirmed/i, /not.*confirmed/i];

export function classifySignInError(err: unknown): { kind: SignInFailureKind; cause: string } {
  const status = (err as { status?: number } | undefined)?.status;
  const message = err instanceof Error ? err.message : String(err ?? "");

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
  }
}

/** True when an error is NOT an HttpException we chose to throw — i.e. an
 *  unexpected infrastructure failure that should surface as 503, not 500. */
export function isInfrastructureError(err: unknown): boolean {
  return !(err instanceof HttpException);
}

export function serviceUnavailableException(context: string): HttpException {
  return new ServiceUnavailableException({
    errorCode: "SERVICE_UNAVAILABLE",
    message: `${context} is temporarily unavailable — please try again shortly`,
  });
}
