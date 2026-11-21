"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, CreditCard, TrendingUp, Wallet } from "lucide-react";
import { api } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { ErrorState } from "@/components/ui/states";
import { useTenantId } from "@/lib/use-tenant";
import { formatMoney } from "@/lib/utils";

interface Overview {
  financial: {
    bookedValueMinor: number; collectedOnlineMinor: number; collectedVenueMinor: number;
    collectedTotalMinor: number; pendingVenueMinor: number; pendingVenueCount: number;
  };
  daily: Array<{ day: string; bookedValueMinor: number; count: number }>;
}

export default function TenantRevenuePage() {
  const tenantId = useTenantId();
  const overview = useQuery({
    queryKey: ["tenant", "analytics", tenantId],
    queryFn: () => api.get<Overview>(`/tenants/${tenantId}/analytics/overview`),
    enabled: Boolean(tenantId),
  });

  if (overview.isLoading) return <Skeleton className="h-96" />;
  if (overview.isError || !overview.data) return <ErrorState onRetry={() => overview.refetch()} />;
  const f = overview.data.financial;
  const maxDaily = Math.max(1, ...overview.data.daily.map((x) => Number(x.bookedValueMinor)));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collected (online)" value={formatMoney(f.collectedOnlineMinor)} icon={<CreditCard className="h-4 w-4" />} tone="positive" hint="Gateway-verified" />
        <StatCard label="Collected (venue)" value={formatMoney(f.collectedVenueMinor)} icon={<Banknote className="h-4 w-4" />} tone="positive" hint="Counter collections" />
        <StatCard label="Pending venue" value={formatMoney(f.pendingVenueMinor)} icon={<Wallet className="h-4 w-4" />} tone="warning" hint={`${f.pendingVenueCount} to collect`} />
        <StatCard label="Booked value" value={formatMoney(f.bookedValueMinor)} icon={<TrendingUp className="h-4 w-4" />} tone="info" hint="Commitments, not cash" />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Daily booked value</CardTitle></CardHeader>
        <CardContent>
          <div className="flex h-40 items-end gap-1.5">
            {overview.data.daily.map((d) => (
              <div key={d.day} className="group relative flex flex-1 flex-col items-center justify-end">
                <div
                  className="w-full rounded-t bg-brand-emerald-500/70 group-hover:bg-brand-emerald-600"
                  style={{ height: `${Math.max(4, (Number(d.bookedValueMinor) / maxDaily) * 100)}%` }}
                  title={`${d.day}: ${formatMoney(Number(d.bookedValueMinor))} (${d.count} bookings)`}
                />
                <span className="mt-1 text-[9px] text-muted-foreground">{d.day.slice(5)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
