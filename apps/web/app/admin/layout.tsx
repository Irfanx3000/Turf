"use client";

import type { ReactNode } from "react";
import {
  Ban, CreditCard, LayoutDashboard, ScrollText, Settings, Ticket, Users, Zap,
} from "lucide-react";
import { DashboardShell, type NavItem } from "@/components/dashboard/shell";
import { DashboardPageSkeleton } from "@/components/loading/page-skeletons";
import { ErrorState } from "@/components/ui/states";
import { useSession } from "@/lib/use-session";

const NAV: NavItem[] = [
  { href: "/admin/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/tenants", label: "Tenants", icon: Ban },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/turfs", label: "Turfs", icon: Zap },
  { href: "/admin/bookings", label: "Bookings", icon: Ticket },
  { href: "/admin/payments", label: "Payments", icon: CreditCard },
  { href: "/admin/disputes", label: "Disputes", icon: ScrollText },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
  const { data: user, isPending } = useSession();

  // Keep the shell painted when a cached session exists; only skeleton on cold load.
  if (isPending && !user) {
    return (
      <DashboardShell title="Platform console" subtitle="Super admin" nav={NAV}>
        <DashboardPageSkeleton />
      </DashboardShell>
    );
  }

  if (user?.platformRole !== "super_admin") {
    return (
      <DashboardShell title="Platform console" subtitle="Super admin" nav={NAV}>
        <ErrorState title="Super admin access required" message="This console is restricted to platform administrators." />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Platform console" subtitle="Super admin" nav={NAV}>
      {children}
    </DashboardShell>
  );
}
