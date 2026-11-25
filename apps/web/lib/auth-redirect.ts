/**
 * Build a /login URL that returns the user to `returnTo` after sign-in.
 * Only same-origin relative paths are accepted (open-redirect safe).
 */
export function loginHref(returnTo: string): string {
  const safe = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/";
  return `/login?next=${encodeURIComponent(safe)}`;
}

/** Current path + query for use as a post-login `next` target. */
export function currentReturnTo(pathname: string, search: string): string {
  const q = search.startsWith("?") || search === "" ? search : `?${search}`;
  return `${pathname}${q}`;
}
