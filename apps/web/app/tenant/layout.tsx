"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Banknote, BarChart3, CalendarClock, CreditCard, LayoutDashboard, MapPin, Settings, Users, Zap,
} from "lucide-react";
import { api } from "@/lib/api-client";
import type { TenantSummary } from "@turf/shared-types";
import { DashboardShell, type NavItem } from "@/components/dashboard/shell";
import { DashboardPageSkeleton } from "@/components/loading/page-skeletons";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/states";
import { useSession } from "@/lib/use-session";

const NAV: NavItem[] = [
  { href: "/tenant/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tenant/locations", label: "Locations", icon: MapPin },
  { href: "/tenant/turfs", label: "Turfs", icon: Zap },
  { href: "/tenant/slots", label: "Slots & pricing", icon: CalendarClock },
  { href: "/tenant/bookings", label: "Bookings", icon: BarChart3 },
  { href: "/tenant/customers", label: "Customers", icon: Users },
  { href: "/tenant/payments", label: "Collections", icon: CreditCard },
  { href: "/tenant/revenue", label: "Revenue", icon: Banknote },
  { href: "/tenant/staff", label: "Staff", icon: Users },
  { href: "/tenant/settings", label: "Settings", icon: Settings },
];

export default function TenantLayout({ children }: { children: ReactNode }) {
  const { data: user, isPending: sessionPending } = useSession();
  const membership = user?.memberships[0];

  // Status badge only — never blocks children. Tenant id comes from session.
  const tenants = useQuery({
    queryKey: ["tenants", "mine"],
    queryFn: () => api.get<TenantSummary[]>("/tenants/mine"),
    enabled: Boolean(membership?.tenantId),
    staleTime: 5 * 60_000,
  });
  const tenant = tenants.data?.[0];

  // Only block when we have no cached session yet.
  if (sessionPending && !user) {
    return (
      <DashboardShell title="Tenant dashboard" subtitle="Your organization" nav={NAV}>
        <DashboardPageSkeleton />
      </DashboardShell>
    );
  }

  if (!user) {
    return (
      <DashboardShell title="Tenant dashboard" subtitle="Your organization" nav={NAV}>
        <ErrorState title="Sign in required" message="Sign in with an owner or staff account to view this dashboard." />
      </DashboardShell>
    );
  }

  if (!membership) {
    return (
      <DashboardShell title="Tenant dashboard" subtitle="Your organization" nav={NAV}>
        <ErrorState
          title="No organization yet"
          message="Create an organization to start managing turfs."
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title={tenant?.name ?? membership.tenantName}
      subtitle={tenant ? `${tenant.city ?? ""} · ${tenant.status.replace(/_/g, " ")}`.trim() : "Your organization"}
      nav={NAV}
      badge={
        tenant ? (
          <Badge variant={tenant.status === "active" ? "success" : "warning"} className="w-full justify-center">
            {tenant.status.replace(/_/g, " ")}
          </Badge>
        ) : undefined
      }
    >
      {children}
    </DashboardShell>
  );
}
