import { Skeleton } from "@/components/ui/skeleton";

/** Customer browse / explore grid while the route or data is loading. */
export function TurfGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="container space-y-6 py-8">
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
        <Skeleton className="h-11 w-full max-w-xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border bg-card p-3 shadow-soft">
            <Skeleton className="aspect-[16/10] w-full rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Home hero + featured strip placeholder. */
export function HomePageSkeleton() {
  return (
    <div>
      <section className="border-b bg-gradient-to-b from-secondary/60 via-background to-background">
        <div className="container flex flex-col items-center py-16 text-center md:py-24">
          <Skeleton className="h-12 w-72 max-w-full md:h-16 md:w-[28rem]" />
          <Skeleton className="mt-5 h-5 w-96 max-w-full" />
          <Skeleton className="mt-8 h-12 w-full max-w-xl" />
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
        </div>
      </section>
      <div className="container py-12">
        <Skeleton className="mb-6 h-7 w-40" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="aspect-[16/10] w-full rounded-2xl" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Turf detail placeholder. */
export function TurfDetailSkeleton() {
  return (
    <div className="container space-y-6 py-8">
      <Skeleton className="aspect-[21/9] w-full rounded-2xl" />
      <Skeleton className="h-8 w-2/3 max-w-md" />
      <Skeleton className="h-4 w-1/3 max-w-xs" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

/** Generic stacked content for account / booking / form pages. */
export function ContentPageSkeleton({ dense = false }: { dense?: boolean }) {
  return (
    <div className={`container space-y-4 ${dense ? "max-w-lg py-10" : "max-w-3xl py-8"}`}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72 max-w-full" />
      <Skeleton className={dense ? "h-64" : "h-40"} />
      {!dense && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}
    </div>
  );
}

/** Tenant / admin dashboard content area. */
export function DashboardPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-48 rounded-xl lg:col-span-2" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

/** List / table pages inside dashboards. */
export function DashboardListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="space-y-2 p-4">
          {Array.from({ length: rows }, (_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
    </div>
  );
}
