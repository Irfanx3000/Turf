"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export interface NavItem { href: string; label: string; icon: LucideIcon }

/**
 * Desktop-first dashboard shell (tenant + admin) with a collapsible mobile
 * drawer. Content areas render their own data states.
 */
export function DashboardShell({
  title, subtitle, nav, badge, children,
}: {
  title: string; subtitle?: string; nav: NavItem[]; badge?: ReactNode; children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="container flex gap-6 py-8">
      {/* Sidebar */}
      <aside className="sticky top-20 hidden h-fit w-60 shrink-0 lg:block" aria-label="Dashboard sections">
        <nav className="space-y-1 rounded-xl border bg-card p-2 shadow-card">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {badge && <div className="mt-3 px-3">{badge}</div>}
      </aside>

      <div className="min-w-0 flex-1">
        {/* Mobile nav */}
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
                  active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <header className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <ThemeToggle />
        </header>
        {children}
      </div>
    </div>
  );
}
