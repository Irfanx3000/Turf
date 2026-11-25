"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, MapPin, Star } from "lucide-react";
import { motion } from "@/motion";
import type { TurfCard as TurfCardData } from "@turf/shared-types";
import { Badge } from "@/components/ui/badge";
import { prefetchTurf } from "@/lib/prefetch";
import { formatDistance, formatMoney } from "@/lib/utils";

export function TurfCard({ turf, date, className }: { turf: TurfCardData; date?: string; className?: string }) {
  const queryClient = useQueryClient();
  const href = date ? `/turfs/${turf.slug}?date=${date}` : `/turfs/${turf.slug}`;
  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={className}
      onPointerEnter={() => prefetchTurf(queryClient, turf.slug, date)}
      onFocusCapture={() => prefetchTurf(queryClient, turf.slug, date)}
    >
      <Link
        href={href}
        className="group block overflow-hidden rounded-2xl border bg-card shadow-card transition-shadow duration-200 hover:shadow-raise focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative aspect-[16/9] overflow-hidden bg-brand-navy-800">
          {turf.heroImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={turf.heroImageUrl}
              alt={turf.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-emerald-100 to-brand-emerald-200 text-primary/60">
              <MapPin className="h-8 w-8" aria-hidden />
            </div>
          )}
          {turf.sports[0] && (
            <Badge variant="navy" className="absolute left-3 top-3 bg-black/45 text-white backdrop-blur-sm">
              {turf.sports[0]}
              {turf.sports.length > 1 ? ` +${turf.sports.length - 1}` : ""}
            </Badge>
          )}
          {turf.ratingAvg !== null && (
            <Badge variant="success" className="absolute right-3 top-3 bg-black/45 text-white backdrop-blur-sm">
              <Star className="h-3 w-3 fill-current" /> {turf.ratingAvg.toFixed(1)}
            </Badge>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate font-semibold leading-tight group-hover:text-primary">{turf.name}</h3>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">
                  {turf.areaName ? `${turf.areaName}, ` : ""}{turf.cityName}
                  {turf.distanceMeters !== null && <span className="text-primary"> · {formatDistance(turf.distanceMeters)}</span>}
                </span>
              </p>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatMoney(turf.basePriceMinor)}</p>
              <p className="text-[11px] text-muted-foreground">per hour</p>
            </div>
          </div>
          {date && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden /> Check slots for {date}
            </p>
          )}
        </div>
      </Link>
    </motion.div>
  );
}