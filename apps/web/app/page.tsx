"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CreditCard, MapPin, ShieldCheck } from "lucide-react";
import { motion } from "@/motion";
import { api, qs } from "@/lib/api-client";
import type { TurfCard as TurfCardData } from "@turf/shared-types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TurfCard as TurfCardComponent } from "@/components/customer/turf-card";
import { SearchBar } from "@/components/customer/search-bar";
import { FeatureCard } from "@/components/customer/feature-card";
import { todayYmd } from "@/lib/utils";

interface Sport { id: string; name: string; slug: string }

const FALLBACK_SPORTS: Sport[] = [
  { id: "football", name: "Football", slug: "football-5s" },
  { id: "cricket", name: "Box cricket", slug: "box-cricket" },
  { id: "badminton", name: "Badminton", slug: "badminton" },
];

export default function HomePage() {
  const featured = useQuery({
    queryKey: ["turfs", "featured"],
    queryFn: () => api.get<{ items: TurfCardData[] }>(`/turfs${qs({ page: 1, pageSize: 6 })}`),
  });
  const sports = useQuery({
    queryKey: ["sports"],
    queryFn: () => api.get<Sport[]>("/sports"),
  });
  const sportChips = (sports.data?.length ? sports.data : FALLBACK_SPORTS).slice(0, 5);

  return (
    <div>
      {/* ── Hero — light, centered, no background grid, no overlap tricks ── */}
      <section className="border-b bg-gradient-to-b from-secondary/60 via-background to-background">
        <div className="container flex flex-col items-center py-16 text-center md:py-24">
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="text-balance text-4xl font-bold leading-tight tracking-tight md:text-6xl"
          >
            Find your game.
            <br />
            Book your turf.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25, delay: 0.08 }}
            className="mt-5 max-w-xl text-balance text-base text-muted-foreground md:text-lg"
          >
            Discover nearby sports venues, check live availability, and reserve your next game in
            just a few clicks.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.14 }}
            className="mt-8 flex w-full justify-center"
          >
            <SearchBar />
          </motion.div>

          {/* Popular sports filters */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {sportChips.map((s) => (
              <Link
                key={s.slug}
                href={`/turfs?sport=${s.slug}`}
                className="rounded-full border bg-card px-4 py-1.5 text-sm text-muted-foreground shadow-soft transition-all duration-200 hover:border-primary/40 hover:text-foreground"
              >
                {s.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured nearby turfs ── */}
      <section className="container py-14 md:py-16">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Featured turfs</h2>
            <p className="mt-1 text-sm text-muted-foreground">Hand-picked venues near you</p>
          </div>
          <Link href="/turfs" className="group flex shrink-0 items-center gap-1 text-sm font-medium text-primary">
            View all <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>

        {featured.isLoading && (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[16/10] w-full rounded-2xl" />
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
                viewport={{ once: true, margin: "-40px" }}
                transition={{ delay: Math.min(i * 0.05, 0.2), duration: 0.22, ease: "easeOut" }}
              >
                <TurfCardComponent turf={turf} date={todayYmd()} />
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* ── Platform benefits — plain flow, no negative margins, no overlap.
              Grid: 1 col mobile → 2 cols tablet → 3 cols desktop. ── */}
      <section className="border-t bg-secondary/40">
        <div className="container py-14 md:py-16">
          <div className="mb-8 max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight">Built for players</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Everything about booking a ground, without the phone calls and WhatsApp groups.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={MapPin}
              title="Truly nearby"
              description="Find sports venues around you using location-based discovery."
            />
            <FeatureCard
              icon={CreditCard}
              title="Pay your way"
              description="Choose online payment or pay at the venue."
            />
            <FeatureCard
              icon={ShieldCheck}
              title="No double bookings"
              description="Reliable slot reservations help ensure your selected time is yours."
            />
          </div>
        </div>
      </section>

      {/* ── How it works — typography and whitespace, not cards ── */}
      <section className="container py-14 md:py-16">
        <h2 className="text-2xl font-bold tracking-tight">How it works</h2>
        <ol className="mt-8 grid gap-8 sm:grid-cols-3">
          {[
            {
              step: "01",
              title: "Find a venue",
              text: "Search by name or area, or let Nearby rank venues around you by distance.",
            },
            {
              step: "02",
              title: "Pick your slot",
              text: "Live availability for the day you want — morning, afternoon or night game.",
            },
            {
              step: "03",
              title: "Book and play",
              text: "Pay online or at the venue. Your confirmation is instant and yours alone.",
            },
          ].map((s) => (
            <li key={s.step} className="relative">
              <span className="text-sm font-semibold tabular-nums text-primary">{s.step}</span>
              <h3 className="mt-2 font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Owner CTA — soft sage panel ── */}
      <section className="container pb-16">
        <div className="rounded-2xl border bg-secondary/60 px-6 py-12 md:px-12">
          <div className="max-w-xl">
            <h2 className="text-2xl font-bold tracking-tight">Own or manage a turf?</h2>
            <p className="mt-2 text-muted-foreground">
              Slots, pricing rules, collections and analytics — run the whole venue from one
              dashboard. One organization, many locations, many turfs.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="brand">
                <Link href="/register-owner">List your turf</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/about">How it works</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
