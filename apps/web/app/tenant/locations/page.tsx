"use client";

import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { api } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useTenantId } from "@/lib/use-tenant";

interface Location {
  id: string; name: string; cityName: string; areaName: string | null;
  addressLine1: string; postalCode: string | null;
}

export default function TenantLocationsPage() {
  const tenantId = useTenantId();
  const locations = useQuery({
    queryKey: ["tenant", "locations", tenantId],
    queryFn: () => api.get<Location[]>(`/tenants/${tenantId}/locations`),
    enabled: Boolean(tenantId),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Physical venues operated by your organization.</p>
      {locations.isLoading && [1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
      {locations.isError && <ErrorState onRetry={() => locations.refetch()} />}
      {locations.data && locations.data.length === 0 && (
        <EmptyState icon={<MapPin className="h-6 w-6" />} title="No locations yet" description="Add your first location before creating turfs." />
      )}
      {locations.data?.map((l) => (
        <Card key={l.id}>
          <CardContent className="p-4">
            <p className="font-semibold">{l.name}</p>
            <p className="text-sm text-muted-foreground">
              {l.addressLine1}{l.areaName ? `, ${l.areaName}` : ""}, {l.cityName} {l.postalCode ?? ""}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
