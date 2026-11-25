import { ApiClientError } from "@/lib/api-client";

/**
 * Friendly, non-leaking messages for auth failures. Backend error codes are
 * the contract (see apps/api/src/auth/sign-in-errors.ts):
 *   401 INVALID_CREDENTIALS | 403 EMAIL_UNCONFIRMED / ACCOUNT_DISABLED |
 *   429 RATE_LIMITED | 503 AUTH_SERVICE_UNAVAILABLE | network-level failures
 */
export function authErrorMessage(err: unknown, fallback = "We're having trouble signing you in. Please try again shortly."): string {
  if (err instanceof ApiClientError) {
    if (err.errorCode === "NETWORK" || err.status === 0) {
      return "Unable to connect. Please check your internet connection.";
    }
    if (err.status === 401) {
      return "The email or password is incorrect. Please try again.";
    }
    if (err.status === 403 && err.errorCode === "EMAIL_UNCONFIRMED") {
      return "Please verify your email before signing in.";
    }
    if (err.status === 403 && err.errorCode === "ACCOUNT_DISABLED") {
      return "This account has been disabled. Contact support for help.";
    }
    if (err.status === 409 || err.errorCode === "CONFLICT") {
      return "An account with this email already exists. Try signing in instead.";
    }
    if (err.status === 429 || err.errorCode === "RATE_LIMITED") {
      return "Too many sign-up attempts. Please wait a minute and try again.";
    }
    if (err.errorCode === "INVALID_EMAIL") {
      return "Please enter a valid email address.";
    }
    if (err.errorCode === "WEAK_PASSWORD") {
      return err.message || "Password does not meet the requirements.";
    }
    if (err.status >= 500) {
      return fallback;
    }
    // Validation and other 4xx: the API's message is safe to show.
    return err.message || fallback;
  }
  if (err instanceof TypeError) {
    return "Unable to connect. Please check your internet connection.";
  }
  return fallback;
}
