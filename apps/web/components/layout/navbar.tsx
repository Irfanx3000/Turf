"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogOut, MapPin, Menu, Sparkles, Ticket, User, X } from "lucide-react";
import { useState } from "react";
import { AnimatePresence, motion } from "@/motion";
import { Button } from "@/components/ui/button";

import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useLogout, useSession } from "@/lib/use-session";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const publicLinks = [
  { href: "/explore", label: "Explore" },
  { href: "/turfs", label: "Turfs" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group flex items-center gap-2", className)} aria-label="Turf home">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-navy-800 text-white shadow-soft transition-transform group-hover:scale-105 dark:bg-brand-emerald-600">
        <Sparkles className="h-4 w-4" aria-hidden />
      </span>
      <span className="text-lg font-bold tracking-tight">
        Turf<span className="text-brand-emerald-600 dark:text-brand-emerald-400">.</span>
      </span>
    </Link>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const { data: user } = useSession();
  const logout = useLogout();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
      <nav className="container flex h-16 items-center justify-between gap-4" aria-label="Main">
        <Logo />
        <div className="hidden items-center gap-1 md:flex">
          {publicLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                pathname.startsWith(link.href) && "bg-accent text-accent-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Link href="/explore" className="hidden sm:block">
            <Button variant="outline" size="sm">
              <MapPin /> Nearby
            </Button>
          </Link>
          <ThemeToggle />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="brand" className="gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[11px] font-semibold uppercase">
                    {(user.fullName ?? user.email).charAt(0)}
                  </span>
                  <span className="hidden max-w-[90px] truncate sm:inline">{user.fullName ?? user.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs text-muted-foreground">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {user.memberships.length > 0 && (
                  <DropdownMenuItem onClick={() => (window.location.href = "/tenant/dashboard")}>
                    <LayoutDashboard /> Tenant dashboard
                  </DropdownMenuItem>
                )}
                {user.platformRole === "super_admin" && (
                  <DropdownMenuItem onClick={() => (window.location.href = "/admin/dashboard")}>
                    <LayoutDashboard /> Admin console
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/my-bookings"><Ticket /> My bookings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/notifications"><Sparkles /> Notifications</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/profile"><User /> Profile</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout.mutate()} className="text-destructive focus:text-destructive">
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
              <Link href="/register"><Button size="sm">Get started</Button></Link>
            </div>
          )}
          <button
            className="rounded-md p-2 hover:bg-accent md:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t md:hidden"
          >
            <div className="container flex flex-col gap-1 py-3">
              {publicLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium hover:bg-accent"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="border-t bg-card">
      <div className="container flex flex-col items-center justify-between gap-4 py-8 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Logo className="scale-90" />
          <span>· Book your game, not a queue.</span>
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground">
          <Link href="/about" className="hover:text-foreground">About</Link>
          <Link href="/contact" className="hover:text-foreground">Contact</Link>
          <Link href="/register-owner" className="hover:text-foreground">List your turf</Link>
        </div>
      </div>
    </footer>
  );
}
