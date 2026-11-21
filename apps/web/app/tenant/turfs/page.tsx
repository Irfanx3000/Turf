"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Plus, Zap } from "lucide-react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useTenantId } from "@/lib/use-tenant";
import { formatMoney } from "@/lib/utils";

interface TenantTurf {
  id: string; name: string; slug: string; status: string; basePriceMinor: number;
  locationName: string; cityName: string; sports: string[]; payAtVenueAllowed: boolean;
}

export default function TenantTurfsPage() {
  const tenantId = useTenantId();
  const turfs = useQuery({
    queryKey: ["tenant", "turfs", tenantId],
    queryFn: () => api.get<TenantTurf[]>(`/tenants/${tenantId}/turfs`),
    enabled: Boolean(tenantId),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{turfs.data?.length ?? "…"} turfs across your locations</p>
        <Button size="sm" variant="brand" asChild>
          <Link href="/tenant/slots"><Plus /> New turf</Link>
        </Button>
      </div>
      {turfs.isLoading && [1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
      {turfs.isError && <ErrorState onRetry={() => turfs.refetch()} />}
      {turfs.data && turfs.data.length === 0 && (
        <EmptyState
          icon={<Zap className="h-6 w-6" />}
          title="No turfs yet"
          description="Create a location first, then add turfs and generate slots."
        />
      )}
      {turfs.data?.map((t) => (
        <Card key={t.id}>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold">{t.name}</p>
                <Badge variant={t.status === "published" ? "success" : t.status === "draft" ? "warning" : "secondary"}>
                  {t.status}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{t.locationName} · {t.cityName} · {t.sports.join(", ")}</p>
              <p className="mt-1 text-sm">{formatMoney(t.basePriceMinor)}/h {t.payAtVenueAllowed && <span className="text-muted-foreground">· pay at venue allowed</span>}</p>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link href={`/tenant/slots?turf=${t.id}`}>Manage slots</Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
