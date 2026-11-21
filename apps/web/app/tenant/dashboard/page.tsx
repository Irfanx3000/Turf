"use client";

import { useQuery } from "@tanstack/react-query";
import { Banknote, CalendarClock, CreditCard, IndianRupee, TrendingUp, Wallet } from "lucide-react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { ErrorState } from "@/components/ui/states";
import { useTenantId } from "@/lib/use-tenant";
import { formatMoney } from "@/lib/utils";

interface Overview {
  window: { from: string; to: string };
  bookings: { total: number; byStatus: Record<string, { count: number; valueMinor: number }> };
  financial: {
    bookedValueMinor: number; collectedOnlineMinor: number; collectedVenueMinor: number;
    collectedTotalMinor: number; pendingVenueMinor: number; pendingVenueCount: number;
  };
  occupancy: { totalSlots: number; bookedSlots: number; percent: number };
  daily: Array<{ day: string; bookedValueMinor: number; count: number }>;
}

export default function TenantDashboardPage() {
  const tenantId = useTenantId();
  const overview = useQuery({
    queryKey: ["tenant", "analytics", tenantId],
    queryFn: () => api.get<Overview>(`/tenants/${tenantId}/analytics/overview`),
    enabled: Boolean(tenantId),
  });

  if (overview.isLoading) return <Skeleton className="h-96" />;
  if (overview.isError || !overview.data) return <ErrorState onRetry={() => overview.refetch()} message="Could not load metrics." />;
  const d = overview.data;
  const maxDaily = Math.max(1, ...d.daily.map((x) => Number(x.bookedValueMinor)));

  return (
    <div className="space-y-6">
      {/* Financial metrics — booked value vs money actually collected */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Booked value (30d)" value={formatMoney(d.financial.bookedValueMinor, { compact: true })}
          hint="What customers committed to" icon={<TrendingUp className="h-4 w-4" />} tone="info"
        />
        <StatCard
          label="Collected online" value={formatMoney(d.financial.collectedOnlineMinor, { compact: true })}
          hint="Verified gateway payments" icon={<CreditCard className="h-4 w-4" />} tone="positive"
        />
        <StatCard
          label="Collected at venue" value={formatMoney(d.financial.collectedVenueMinor, { compact: true })}
          hint="Marked collected at the counter" icon={<Banknote className="h-4 w-4" />} tone="positive"
        />
        <StatCard
          label="Pending at venue" value={formatMoney(d.financial.pendingVenueMinor, { compact: true })}
          hint={`${d.financial.pendingVenueCount} bookings to collect`} icon={<Wallet className="h-4 w-4" />} tone="warning"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Bookings by status */}
        <Card>
          <CardHeader><CardTitle className="text-base">Bookings (30 days)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-bold tabular-nums">{d.bookings.total}</p>
            {Object.entries(d.bookings.byStatus).map(([status, v]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <Badge variant={status === "confirmed" ? "success" : status === "pending_payment" ? "warning" : "secondary"}>
                  {status.replace(/_/g, " ")}
                </Badge>
                <span className="text-muted-foreground">{v.count} · {formatMoney(v.valueMinor, { compact: true })}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Occupancy */}
        <Card>
          <CardHeader><CardTitle className="text-base">Slot occupancy</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-2">
              <p className="text-4xl font-bold tabular-nums">{d.occupancy.percent}%</p>
              <p className="pb-1 text-sm text-muted-foreground">
                {d.occupancy.bookedSlots}/{d.occupancy.totalSlots} slots
              </p>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={d.occupancy.percent} aria-valuemin={0} aria-valuemax={100}>
              <div
                className="h-full rounded-full bg-brand-emerald-500 transition-all"
                style={{ width: `${Math.min(100, d.occupancy.percent)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Booked or reserved slots in the window.</p>
          </CardContent>
        </Card>

        {/* Daily chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <IndianRupee className="h-4 w-4" /> Booked value by day
            </CardTitle>
          </CardHeader>
          <CardContent>
            {d.daily.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No bookings in this window yet.</p>
            ) : (
              <div className="flex h-32 items-end gap-1" aria-hidden>
                {d.daily.map((day) => (
                  <div key={day.day} className="group relative flex-1">
                    <div
                      className="w-full rounded-t bg-brand-emerald-500/70 transition-colors group-hover:bg-brand-emerald-600"
                      style={{ height: `${Math.max(4, (Number(day.bookedValueMinor) / maxDaily) * 100)}%` }}
                      title={`${day.day}: ${formatMoney(Number(day.bookedValueMinor))}`}
                    />
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Daily booked value — hover bars for detail.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p>
            <span className="font-medium text-foreground">Booked value is not revenue.</span> Money counted
            above only comes from payments marked paid (gateway-verified online or collected at the venue).
            Pending venue collections are tracked separately so nothing slips through.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
