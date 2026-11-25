"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Compass, LocateFixed } from "lucide-react";
import { toast } from "sonner";
import { api, qs } from "@/lib/api-client";
import type { TurfCard as TurfCardData } from "@turf/shared-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TurfGridSkeleton } from "@/components/loading/page-skeletons";
import { TurfCard } from "@/components/customer/turf-card";
import { useAppRouter } from "@/lib/use-app-router";
import { todayYmd } from "@/lib/utils";

interface NearbyResponse { items: TurfCardData[]; total: number; page: number; pageSize: number; }

const MUMBAI = { lat: 19.076, lng: 72.8777 };

function ExploreInner() {
  const router = useAppRouter();
  const params = useSearchParams();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [radius, setRadius] = useState(5000);

  // Default to the launch city until geolocation resolves.
  useEffect(() => {
    setCoords({ lat: Number(params.get("lat")) || MUMBAI.lat, lng: Number(params.get("lng")) || MUMBAI.lng });
  }, [params]);

  const nearby = useQuery({
    queryKey: ["turfs", "nearby", coords, radius, search],
    queryFn: () =>
      api.get<NearbyResponse>(
        `/turfs/nearby${qs({ ...(coords ?? MUMBAI), radiusMeters: radius, search: search || undefined, pageSize: 12 })}`,
      ),
    enabled: coords !== null,
  });

  function locate() {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocation is not supported on this device");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
        toast.success("Showing turfs around you");
      },
      () => {
        setLocating(false);
        toast.error("Could not get your location — showing the launch city instead");
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 120_000 },
    );
  }

  return (
    <div className="container py-10">
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Explore nearby</h1>
          <p className="text-sm text-muted-foreground">Sorted by real distance from you</p>
        </div>
        <Button variant="brand" onClick={locate} loading={locating}>
          <LocateFixed /> Use my location
        </Button>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_auto]">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by name or area…"
          aria-label="Filter nearby turfs"
        />
        <div className="flex items-center gap-2">
          {[2000, 5000, 10000].map((r) => (
            <Button key={r} size="sm" variant={radius === r ? "default" : "outline"} onClick={() => setRadius(r)}>
              {r / 1000} km
            </Button>
          ))}
        </div>
      </div>

      {nearby.isLoading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-64" />)}
        </div>
      )}
      {nearby.isError && <ErrorState message="Nearby search failed." onRetry={() => nearby.refetch()} />}
      {nearby.data && nearby.data.items.length === 0 && (
        <EmptyState
          icon={<Compass className="h-6 w-6" />}
          title="Nothing within this radius"
          description="Try a larger radius, or browse the full list."
          action={<Button variant="outline" onClick={() => router.push("/turfs")}>Browse all turfs</Button>}
        />
      )}
      {nearby.data && nearby.data.items.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {nearby.data.items.map((turf) => <TurfCard key={turf.id} turf={turf} date={todayYmd()} />)}
        </div>
      )}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<TurfGridSkeleton />}>
      <ExploreInner />
    </Suspense>
  );
}
