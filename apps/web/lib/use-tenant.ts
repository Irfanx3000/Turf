"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { TenantSummary } from "@turf/shared-types";
import { useSession } from "@/lib/use-session";

/** Resolves the caller's first tenant (single-org starter; multi-org UI later). */
export function useTenantId(): string | undefined {
  const { data: user } = useSession();
  const tenants = useQuery({
    queryKey: ["tenants", "mine"],
    queryFn: () => api.get<TenantSummary[]>("/tenants/mine"),
    enabled: Boolean(user),
  });
  return tenants.data?.[0]?.id;
}
