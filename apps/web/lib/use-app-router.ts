"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { signalNavigationStart } from "@/lib/navigation-events";

/**
 * App Router wrapper that starts the global navigation progress bar for
 * programmatic navigations (`push` / `replace`).
 */
export function useAppRouter() {
  const router = useRouter();
  return useMemo(
    () => ({
      ...router,
      push: (...args: Parameters<typeof router.push>) => {
        signalNavigationStart();
        return router.push(...args);
      },
      replace: (...args: Parameters<typeof router.replace>) => {
        signalNavigationStart();
        return router.replace(...args);
      },
    }),
    [router],
  );
}
