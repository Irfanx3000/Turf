"use client";

import { useSession } from "@/lib/use-session";

/**
 * Resolves the caller's first tenant id from the session memberships.
 * Avoids a second `/tenants/mine` round-trip on the critical path of every
 * tenant page (single-org starter; multi-org UI later).
 */
export function useTenantId(): string | undefined {
  const { data: user } = useSession();
  return user?.memberships[0]?.tenantId;
}
