"use client";

import type { QueryClient } from "@tanstack/react-query";
import { api, qs } from "@/lib/api-client";
import { todayYmd } from "@/lib/utils";

/** Warm turf detail (+ today's availability) before the user lands on the page. */
export function prefetchTurf(queryClient: QueryClient, slug: string, date = todayYmd()): void {
  void queryClient.prefetchQuery({
    queryKey: ["turf", slug],
    queryFn: () => api.get(`/turfs/${slug}`),
  });
  void queryClient.prefetchQuery({
    queryKey: ["availability", slug, date],
    queryFn: () => api.get(`/turfs/${slug}/availability${qs({ date })}`),
    staleTime: 30_000,
  });
}

/** Warm the default browse listing used by /turfs (empty filters, page 1). */
export function prefetchBrowse(queryClient: QueryClient): void {
  void queryClient.prefetchQuery({
    queryKey: ["turfs", "browse", "", "", 1],
    queryFn: () => api.get(`/turfs${qs({ page: 1, pageSize: 9 })}`),
  });
  void queryClient.prefetchQuery({
    queryKey: ["sports"],
    queryFn: () => api.get("/sports"),
  });
}

/** Warm tenant analytics for the dashboard landing page. */
export function prefetchTenantDashboard(queryClient: QueryClient, tenantId: string): void {
  void queryClient.prefetchQuery({
    queryKey: ["tenant", "analytics", tenantId],
    queryFn: () => api.get(`/tenants/${tenantId}/analytics/overview`),
  });
}
