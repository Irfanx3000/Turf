"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarCheck, CreditCard, MapPin, Search, ShieldCheck, Zap } from "lucide-react";
import { motion } from "@/motion";
import { api, qs } from "@/lib/api-client";
import type { TurfCard } from "@turf/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TurfCard as TurfCardComponent } from "@/components/customer/turf-card";
import { todayYmd } from "@/lib/utils";

export default function HomePage() {
  const featured = useQuery({
    queryKey: ["turfs", "featured"],
    queryFn: () => api.get<{ items: TurfCard[] }>(`/turfs${qs({ page: 1, pageSize: 6 })}`),
  });

  return (
    <div className="pb-20">
      {/* Hero */}
      <section className="relative overflow-hidden bg-brand-navy-900 text-white">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent 0 79px, #10B98155 79px 81px), repeating-linear-gradient(0deg, transparent 0 59px, #10B98133 59px 61px)",
          }}
        />
        <div className="container relative grid gap-10 py-16 md:grid-cols-2 md:py-24">
          <div className="flex flex-col justify-center">
            <Badge variant="success" className="mb-4 w-fit bg-white/10 text-brand-emerald-400">
              <Zap className="h-3 w-3" /> Instant confirmation
            </Badge>
            <h1 className="text-balance text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              Book your game,
              <br />
              <span className="text-brand-emerald-400">not a queue.</span>
            </h1>
            <p className="mt-4 max-w-md text-balance text-white/70">
              Live slot availability across the city&apos;s best turfs. Reserve in seconds, pay online
              or at the venue — confirmation is instant.
            </p>
            <form action="/explore" className="mt-7 flex max-w-md gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" aria-hidden />
                <Input
                  name="search"
                  placeholder="Search turf, area or sport…"
                  className="border-white/15 bg-white/10 pl-9 text-white placeholder:text-white/50 focus-visible:ring-brand-emerald-500"
                  aria-label="Search turfs"
                />
              </div>
              <Button type="submit" size="default" className="bg-brand-emerald-600 text-white hover:bg-brand-emerald-500">
                Find turf
              </Button>
            </form>
            <div className="mt-6 flex flex-wrap gap-2 text-xs text-white/60">
              <span className="rounded-full border border-white/15 px-3 py-1">Football 5s</span>
              <span className="rounded-full border border-white/15 px-3 py-1">Box cricket</span>
              <span className="rounded-full border border-white/15 px-3 py-1">Badminton</span>
            </div>
          </div>
          <div className="relative hidden items-center justify-center md:flex">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-full max-w-sm rounded-2xl border border-white/12 bg-white/[0.06] p-6 backdrop-blur"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-emerald-600/20 text-brand-emerald-400">
                  <CalendarCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold">Tonight, 9:00 PM</p>
                  <p className="text-xs text-white/60">GreenArena Football 5s · Andheri West</p>
                </div>
              </div>
              <div className="mt-4 space-y-2 rounded-xl bg-brand-navy-900/60 p-4 text-sm">
                <div className="flex justify-between text-white/70"><span>Slot (60 min)</span><span>₹1,200</span></div>
                <div className="flex justify-between text-white/70"><span>Pay at venue</span><span>Available</span></div>
                <div className="flex justify-between font-semibold text-brand-emerald-400"><span>Confirmed instantly</span><span>✓</span></div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="container -mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { icon: MapPin, title: "Truly nearby", text: "PostGIS-powered distance search ranks venues around you." },
          { icon: CreditCard, title: "Pay your way", text: "Razorpay online or cash at the venue — same instant confirmation." },
          { icon: ShieldCheck, title: "No double bookings", text: "Database-enforced slot locks mean what you book is yours." },
        ].map((v) => (
          <motion.div
            key={v.title}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-lg border bg-card p-5 shadow-card"
          >
            <v.icon className="mb-3 h-5 w-5 text-brand-emerald-600" aria-hidden />
            <h3 className="font-semibold">{v.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{v.text}</p>
          </motion.div>
        ))}
      </section>

      {/* Featured */}
      <section className="container mt-14">
        <div className="mb-5 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Featured turfs</h2>
            <p className="text-sm text-muted-foreground">Hand-picked venues near you</p>
          </div>
          <Link href="/turfs" className="group flex items-center gap-1 text-sm font-medium text-primary">
            View all <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {featured.isLoading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[16/10] w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        )}
        {featured.isError && (
          <ErrorState message="Could not load turfs right now." onRetry={() => featured.refetch()} />
        )}
        {featured.data && featured.data.items.length === 0 && (
          <EmptyState
            title="No turfs published yet"
            description="Run the seed (npm run db:seed) or publish a turf from a tenant dashboard."
            action={<Button variant="outline" asChild><Link href="/register-owner">List your turf</Link></Button>}
          />
        )}
        {featured.data && featured.data.items.length > 0 && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.data.items.map((turf, i) => (
              <motion.div
                key={turf.id}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
              >
                <TurfCardComponent turf={turf} date={todayYmd()} />
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Owner CTA */}
      <section className="container mt-16">
        <div className="relative overflow-hidden rounded-2xl bg-brand-navy-800 px-6 py-12 text-white md:px-12">
          <div aria-hidden className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-emerald-600/20 blur-2xl" />
          <div className="relative max-w-xl">
            <h2 className="text-2xl font-bold">Own or manage a turf?</h2>
            <p className="mt-2 text-white/70">
              Slots, pricing rules, collections and analytics — run the whole venue from one dashboard.
              One organization, many locations, many turfs.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild className="bg-brand-emerald-600 text-white hover:bg-brand-emerald-500">
                <Link href="/register-owner">List your turf</Link>
              </Button>
              <Button variant="outline" asChild className="border-white/25 bg-transparent text-white hover:bg-white/10">
                <Link href="/about">How it works</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
