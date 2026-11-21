"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LogOut, MapPin, Menu, Ticket, Trophy, User, Bell, X } from "lucide-react";
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
  { href: "/turfs", label: "Browse" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("group flex items-center gap-2", className)} aria-label="Turf home">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-soft transition-transform duration-200 group-hover:scale-105">
        <Trophy className="h-4 w-4" aria-hidden />
      </span>
      <span className="text-lg font-bold tracking-tight">
        Turf<span className="text-primary">.</span>
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
      <nav className="container flex h-16 items-center justify-between gap-3" aria-label="Main">
        <Logo />

        {/* Desktop links */}
        <div className="hidden items-center gap-1 md:flex">
          {publicLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-accent-foreground",
                pathname.startsWith(link.href) && "bg-accent text-accent-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/explore"
            className={cn(
              "ml-1 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 hover:bg-accent hover:text-accent-foreground",
              pathname === "/explore" && "bg-accent text-accent-foreground",
            )}
          >
            <MapPin className="h-4 w-4" aria-hidden /> Nearby
          </Link>
        </div>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="brand" className="gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold uppercase">
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
                  <Link href="/notifications"><Bell /> Notifications</Link>
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
            <div className="hidden items-center gap-2 sm:flex">
              <Link href="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
              <Link href="/register"><Button size="sm">Get started</Button></Link>
            </div>
          )}
          <button
            className="rounded-lg p-2 transition-colors hover:bg-accent md:hidden"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile menu — auth actions live here below sm so the bar never overflows at 320px */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden border-t md:hidden"
          >
            <div className="container flex flex-col gap-1 py-3">
              {publicLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/explore"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
              >
                <MapPin className="h-4 w-4" aria-hidden /> Nearby
              </Link>
              {!user && (
                <>
                  <div className="my-2 border-t" />
                  <div className="flex flex-col gap-2 px-3 pb-1">
                    <Link href="/login" onClick={() => setMobileOpen(false)}>
                      <Button variant="outline" className="w-full">Sign in</Button>
                    </Link>
                    <Link href="/register" onClick={() => setMobileOpen(false)}>
                      <Button className="w-full">Get started</Button>
                    </Link>
                  </div>
                </>
              )}
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
      <div className="container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">
            Find your game. Book your turf — live availability, honest payments, zero double bookings.
          </p>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold">Play</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link href="/explore" className="transition-colors hover:text-foreground">Explore nearby</Link></li>
            <li><Link href="/turfs" className="transition-colors hover:text-foreground">Browse turfs</Link></li>
            <li><Link href="/my-bookings" className="transition-colors hover:text-foreground">My bookings</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold">For owners</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link href="/register-owner" className="transition-colors hover:text-foreground">List your turf</Link></li>
            <li><Link href="/tenant/dashboard" className="transition-colors hover:text-foreground">Tenant dashboard</Link></li>
            <li><Link href="/about" className="transition-colors hover:text-foreground">How it works</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold">Company</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link href="/about" className="transition-colors hover:text-foreground">About</Link></li>
            <li><Link href="/contact" className="transition-colors hover:text-foreground">Contact</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="container flex flex-col items-center justify-between gap-2 py-5 text-xs text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} Turf. All rights reserved.</p>
          <p>Pay online or at the venue — your slot is yours.</p>
        </div>
      </div>
    </footer>
  );
}
