"use client";

import { useQuery } from "@tanstack/react-query";
import { Building2, CreditCard, IndianRupee, Ticket, Users } from "lucide-react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/dashboard/stat-card";
import { ErrorState } from "@/components/ui/states";
import { formatMoney, relativeTime } from "@/lib/utils";

interface AdminDashboard {
  tenants: Record<string, number>;
  users: number;
  bookings: Record<string, { count: number; valueMinor: number }>;
  financial: { gmvMinor: number; collectedOnlineMinor: number; collectedVenueMinor: number };
  recentAudit: Array<{ id: string; action: string; entityType: string; createdAt: string }>;
}

export default function AdminDashboardPage() {
  const data = useQuery({ queryKey: ["admin", "dashboard"], queryFn: () => api.get<AdminDashboard>("/admin/dashboard") });

  if (data.isLoading) return <Skeleton className="h-96" />;
  if (data.isError || !data.data) return <ErrorState onRetry={() => data.refetch()} />;
  const d = data.data;
  const totalBookings = Object.values(d.bookings).reduce((n, b) => n + b.count, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tenants" value={String(Object.values(d.tenants).reduce((a, b) => a + b, 0))} hint={`${d.tenants.active ?? 0} active · ${d.tenants.pending_verification ?? 0} pending`} icon={<Building2 className="h-4 w-4" />} tone="info" />
        <StatCard label="Users" value={String(d.users)} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Bookings" value={String(totalBookings)} icon={<Ticket className="h-4 w-4" />} />
        <StatCard label="Platform GMV" value={formatMoney(d.financial.gmvMinor, { compact: true })} icon={<IndianRupee className="h-4 w-4" />} tone="info" hint="All-time booked value" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">Money flow</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="flex items-center gap-1.5"><CreditCard className="h-4 w-4 text-brand-emerald-600" /> Collected online</span><span className="font-semibold">{formatMoney(d.financial.collectedOnlineMinor)}</span></div>
            <div className="flex justify-between"><span>Collected at venues</span><span className="font-semibold">{formatMoney(d.financial.collectedVenueMinor)}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Bookings by status</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {Object.entries(d.bookings).map(([status, v]) => (
              <div key={status} className="flex items-center justify-between text-sm">
                <Badge variant={status === "confirmed" ? "success" : status === "pending_payment" ? "warning" : "secondary"}>{status.replace(/_/g, " ")}</Badge>
                <span className="text-muted-foreground">{v.count} · {formatMoney(v.valueMinor, { compact: true })}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent audit</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {d.recentAudit.length === 0 && <p className="text-sm text-muted-foreground">No audit entries yet.</p>}
            {d.recentAudit.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs">
                <span className="font-mono">{a.action}</span>
                <span className="text-muted-foreground">{relativeTime(a.createdAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
