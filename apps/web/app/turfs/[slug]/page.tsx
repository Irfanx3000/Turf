"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock, CreditCard, Info, MapPin, ShieldCheck, Star, Wallet } from "lucide-react";

import { api, qs } from "@/lib/api-client";
import type { SlotView, TurfDetail } from "@turf/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TurfDetailSkeleton } from "@/components/loading/page-skeletons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppRouter } from "@/lib/use-app-router";
import { addDaysYmd, cn, dayLabel, formatMoney, formatTime, todayYmd } from "@/lib/utils";

interface AvailabilityResponse { turfId: string; turfName: string; date: string; timezone: string; slots: SlotView[]; }
interface ReviewItem { id: string; rating: number; title: string | null; body: string | null; createdAt: string; customerName: string | null; }

function TurfDetailInner() {
  const { slug } = useParams<{ slug: string }>();
  const router = useAppRouter();
  const params = useSearchParams();
  const [date, setDate] = useState(params.get("date") ?? todayYmd());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const detail = useQuery({
    queryKey: ["turf", slug],
    queryFn: () => api.get<TurfDetail>(`/turfs/${slug}`),
  });
  const availability = useQuery({
    queryKey: ["availability", slug, date],
    queryFn: () => api.get<AvailabilityResponse>(`/turfs/${slug}/availability${qs({ date })}`),
    refetchInterval: 60_000, // availability revalidates; cache is never authoritative
  });
  const reviews = useQuery({
    queryKey: ["reviews", detail.data?.id],
    queryFn: () => api.get<ReviewItem[]>(`/turfs/${detail.data!.id}/reviews`),
    enabled: Boolean(detail.data?.id),
  });

  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysYmd(todayYmd(), i)), []);

  const grouped = useMemo(() => {
    const slots = availability.data?.slots ?? [];
    const bucket = (h: number) => (h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening");
    const groups = new Map<string, SlotView[]>();
    for (const s of slots) {
      const local = new Date(s.startsAt).toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: availability.data?.timezone ?? "Asia/Kolkata" });
      const key = bucket(Number(local));
      groups.set(key, [...(groups.get(key) ?? []), s]);
    }
    return groups;
  }, [availability.data]);

  const selectedTotal = (availability.data?.slots ?? [])
    .filter((s) => selected.has(s.id))
    .reduce((sum, s) => sum + s.priceMinor, 0);

  function toggleSlot(slot: SlotView) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slot.id)) next.delete(slot.id);
      else next.add(slot.id);
      return next;
    });
  }

  if (detail.isLoading) {
    return (
      <div className="container space-y-4 py-10">
        <Skeleton className="aspect-[21/9] w-full" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return <div className="container py-10"><ErrorState title="Turf not found" message="It may have been unpublished." /></div>;
  }

  const turf = detail.data;

  return (
    <div className="container space-y-8 py-10">
      <Link href="/turfs" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All turfs
      </Link>

      {/* Gallery */}
      <div className="grid gap-3 md:grid-cols-[2fr_1fr]">
        <div className="relative aspect-[16/9] overflow-hidden rounded-2xl bg-brand-emerald-100 shadow-card">
          {turf.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={turf.heroImageUrl} alt={turf.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-primary/50"><MapPin className="h-10 w-10" /></div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-1">
          {turf.images.slice(1, 3).map((img) => (
            <div key={img.id} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-brand-navy-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt ?? turf.name} className="h-full w-full object-cover" loading="lazy" />
            </div>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {turf.sports.map((s) => <Badge key={s} variant="navy">{s}</Badge>)}
            {turf.ratingAvg !== null && (
              <Badge variant="success"><Star className="h-3 w-3 fill-current" /> {turf.ratingAvg.toFixed(1)} ({turf.ratingCount})</Badge>
            )}
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{turf.name}</h1>
          {turf.tagline && <p className="mt-1 text-muted-foreground">{turf.tagline}</p>}
          <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="h-4 w-4" /> {turf.areaName ? `${turf.areaName}, ` : ""}{turf.cityName}
          </p>
        </div>
        <Card className="w-full max-w-xs shrink-0">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Starts from</p>
            <p className="text-2xl font-bold">{formatMoney(turf.basePriceMinor)}<span className="text-sm font-normal text-muted-foreground"> / hour</span></p>
            <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> {turf.operatingHours.find((h) => !h.closed)?.opensAt} – {turf.operatingHours.find((h) => !h.closed)?.closesAt} daily</p>
              <p className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Cancellation: {turf.cancellationPolicy.replace(/_/g, " ")}</p>
              <p className="flex items-center gap-1.5">
                {turf.payAtVenueAllowed ? <><Wallet className="h-3.5 w-3.5" /> Pay online or at venue</> : <><CreditCard className="h-3.5 w-3.5" /> Online payment only</>}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: availability / details / reviews */}
      <Tabs defaultValue="availability">
        <TabsList>
          <TabsTrigger value="availability">Availability</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="reviews">Reviews</TabsTrigger>
        </TabsList>

        <TabsContent value="availability" className="mt-4 space-y-5">
          {/* Date strip */}
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Pick a date">
            {week.map((d) => {
              const label = dayLabel(d);
              const active = d === date;
              return (
                <button
                  key={d}
                  role="tab"
                  aria-selected={active}
                  onClick={() => { setDate(d); setSelected(new Set()); }}
                  className={cn(
                    "flex min-w-[68px] flex-col items-center rounded-lg border px-3 py-2 text-sm transition-colors",
                    active ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent",
                  )}
                >
                  <span className="text-xs text-muted-foreground">{label.weekday}</span>
                  <span className="font-semibold">{label.day}</span>
                  <span className="text-xs text-muted-foreground">{label.month}</span>
                </button>
              );
            })}
          </div>

          {availability.isLoading && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>}
          {availability.isError && <ErrorState message="Could not load availability." onRetry={() => availability.refetch()} />}
          {availability.data && availability.data.slots.length === 0 && (
            <EmptyState title="No slots for this date" description="The venue may not have generated slots yet — check another date." />
          )}

          {availability.data && grouped.size > 0 && (
            <div className="space-y-5">
              {[...grouped.entries()].map(([label, slots]) => (
                <div key={label}>
                  <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{label}</h3>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {slots.map((slot) => {
                      const isSelected = selected.has(slot.id);
                      const isAvailable = slot.status === "available";
                      return (
                        <button
                          key={slot.id}
                          disabled={!isAvailable}
                          onClick={() => toggleSlot(slot)}
                          aria-pressed={isSelected}
                          className={cn(
                            "rounded-lg border p-3 text-left text-sm transition-all",
                            !isAvailable && "cursor-not-allowed opacity-40",
                            isAvailable && !isSelected && "hover:border-primary/60 hover:bg-accent",
                            isSelected && "border-primary bg-primary text-primary-foreground shadow-soft",
                          )}
                        >
                          <span className="block font-semibold">{formatTime(slot.startsAt)}</span>
                          <span className={cn("block text-xs", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                            {formatMoney(slot.priceMinor)}
                          </span>
                          {!isAvailable && <span className="mt-0.5 block text-[10px] uppercase tracking-wide">{slot.status}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selection bar */}
          <Card className="sticky bottom-4 z-10 border-primary/25 bg-card/95 backdrop-blur">
            <CardContent className="flex flex-col items-stretch justify-between gap-3 p-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium">
                  {selected.size === 0 ? "Select slots to continue" : `${selected.size} slot${selected.size > 1 ? "s" : ""} · ${formatMoney(selectedTotal)}`}
                </p>
                <p className="text-xs text-muted-foreground">Total computed by the server at checkout</p>
              </div>
              <Button
                size="lg"
                disabled={selected.size === 0}
                onClick={() => {
                  if (!turf.id) return;
                  router.push(`/booking/${turf.id}?slots=${[...selected].join(",")}&date=${date}`);
                }}
              >
                Continue <Check />
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="details" className="mt-4 space-y-5">
          {turf.description && <p className="max-w-2xl leading-relaxed text-muted-foreground">{turf.description}</p>}
          <div>
            <h3 className="mb-2 font-semibold">Amenities</h3>
            <div className="flex flex-wrap gap-2">
              {turf.amenities.length === 0 && <p className="text-sm text-muted-foreground">No amenities listed.</p>}
              {turf.amenities.map((a) => (
                <Badge key={a} variant="secondary"><Check className="h-3 w-3" /> {a}</Badge>
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-2 font-semibold">Operating hours</h3>
            <div className="grid max-w-md gap-1.5 text-sm sm:grid-cols-2">
              {turf.operatingHours.map((h) => (
                <p key={h.day} className="flex justify-between rounded-md bg-muted/50 px-3 py-1.5">
                  <span className="capitalize">{h.day}</span>
                  <span className="text-muted-foreground">{h.closed ? "Closed" : `${h.opensAt}–${h.closesAt}`}</span>
                </p>
              ))}
            </div>
          </div>
          <p className="flex items-start gap-2 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
            Availability refreshes automatically while you browse, but is only guaranteed once your booking is confirmed.
          </p>
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          {reviews.isLoading && <Skeleton className="h-24" />}
          {reviews.data && reviews.data.length === 0 && <EmptyState title="No reviews yet" description="Book and play, then leave the first review." />}
          {reviews.data && reviews.data.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {reviews.data.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{r.customerName ?? "Player"}</p>
                      <span className="flex text-amber-500" aria-label={`${r.rating} out of 5`}>
                        {Array.from({ length: r.rating }, (_, i) => <Star key={i} className="h-3.5 w-3.5 fill-current" />)}
                      </span>
                    </div>
                    {r.title && <p className="mt-1 text-sm font-medium">{r.title}</p>}
                    {r.body && <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function TurfDetailPage() {
  return (
    <Suspense fallback={<TurfDetailSkeleton />}>
      <TurfDetailInner />
    </Suspense>
  );
}
