"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { signalNavigationStart } from "@/lib/navigation-events";

function sameLocation(href: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const next = new URL(href, window.location.href);
    return `${next.pathname}${next.search}` === `${window.location.pathname}${window.location.search}`;
  } catch {
    return false;
  }
}

/**
 * App Router wrapper that starts the global navigation progress bar for
 * programmatic navigations (`push` / `replace`). Skips the bar when the
 * target is already the current URL so it cannot get stuck at 92%.
 */
export function useAppRouter() {
  const router = useRouter();
  return useMemo(
    () => ({
      ...router,
      push: (...args: Parameters<typeof router.push>) => {
        const href = args[0];
        if (typeof href === "string" && !sameLocation(href)) signalNavigationStart();
        else if (typeof href !== "string") signalNavigationStart();
        return router.push(...args);
      },
      replace: (...args: Parameters<typeof router.replace>) => {
        const href = args[0];
        if (typeof href === "string" && !sameLocation(href)) signalNavigationStart();
        else if (typeof href !== "string") signalNavigationStart();
        return router.replace(...args);
      },
    }),
    [router],
  );
}
