"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AuthenticatedUser } from "@turf/shared-types";

export function useSession() {
  return useQuery<AuthenticatedUser | null>({
    queryKey: ["session"],
    queryFn: async () => {
      try {
        return await api.get<AuthenticatedUser>("/auth/me");
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 401) return null;
        throw err;
      }
    },
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => {
      qc.setQueryData(["session"], null);
      qc.clear();
      window.location.href = "/";
    },
  });
}
