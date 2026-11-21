"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search, SlidersHorizontal } from "lucide-react";
import { api, qs } from "@/lib/api-client";
import type { TurfCard as TurfCardData } from "@turf/shared-types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { TurfCard } from "@/components/customer/turf-card";
import { todayYmd } from "@/lib/utils";

interface BrowseResponse { items: TurfCardData[]; total: number; page: number; pageSize: number; }
interface Sport { id: string; name: string; slug: string; }

function TurfsBrowser() {
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [sport, setSport] = useState(params.get("sport") ?? "");
  const [page, setPage] = useState(1);

  const sports = useQuery({ queryKey: ["sports"], queryFn: () => api.get<Sport[]>("/sports") });
  const turfs = useQuery({
    queryKey: ["turfs", "browse", search, sport, page],
    queryFn: () => api.get<BrowseResponse>(`/turfs${qs({ page, pageSize: 9, search: search || undefined, sport: sport || undefined })}`),
  });

  const totalPages = Math.max(1, Math.ceil((turfs.data?.total ?? 0) / 9));

  return (
    <div className="container py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">All turfs</h1>
        <p className="text-sm text-muted-foreground">{turfs.data?.total ?? "…"} venues published</p>
      </header>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or area…"
            className="pl-9"
            aria-label="Search turfs"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Button
            variant={sport === "" ? "default" : "outline"}
            size="sm"
            onClick={() => { setSport(""); setPage(1); }}
          >
            All sports
          </Button>
          {sports.data?.map((s) => (
            <Button
              key={s.id}
              variant={sport === s.slug ? "default" : "outline"}
              size="sm"
              onClick={() => { setSport(s.slug); setPage(1); }}
            >
              {s.name}
            </Button>
          ))}
        </div>
      </div>

      {turfs.isLoading && (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-64" />)}
        </div>
      )}
      {turfs.isError && <ErrorState message="Could not load turfs." onRetry={() => turfs.refetch()} />}
      {turfs.data && turfs.data.items.length === 0 && (
        <EmptyState icon={<SlidersHorizontal className="h-6 w-6" />} title="No turfs match" description="Try clearing filters or a different search." />
      )}
      {turfs.data && turfs.data.items.length > 0 && (
        <>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {turfs.data.items.map((turf) => <TurfCard key={turf.id} turf={turf} date={todayYmd()} />)}
          </div>
          {totalPages > 1 && (
            <div className="mt-8 flex justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className="flex items-center px-3 text-sm text-muted-foreground">Page {page} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function TurfsPage() {
  return <Suspense><TurfsBrowser /></Suspense>;
}
