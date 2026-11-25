"use client";

import { Suspense, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarCheck, CreditCard, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { CreateBookingResponse, SlotView } from "@turf/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { ContentPageSkeleton } from "@/components/loading/page-skeletons";
import { useSession } from "@/lib/use-session";
import { useAppRouter } from "@/lib/use-app-router";
import { cn, formatDate, formatMoney, formatTime } from "@/lib/utils";

interface AvailabilityResponse { turfId: string; turfName: string; date: string; timezone: string; slots: SlotView[]; }

function BookingInner() {
  const { turfId } = useParams<{ turfId: string }>();
  const router = useAppRouter();
  const params = useSearchParams();
  const slotIds = useMemo(() => (params.get("slots") ?? "").split(",").filter(Boolean), [params]);
  const date = params.get("date") ?? "";

  const { data: user } = useSession();

  const availability = useQuery({
    queryKey: ["availability", "booking", turfId, date],
    queryFn: () => api.get<AvailabilityResponse>(`/turfs/id/${turfId}/availability?date=${date}`),
  });

  const slots = (availability.data?.slots ?? []).filter((s) => slotIds.includes(s.id));
  const total = slots.reduce((sum, s) => sum + s.priceMinor, 0);

  const book = useMutation({
    mutationFn: (paymentMethod: "online" | "pay_at_venue") => {
      const idempotencyKey = `web-${user?.id ?? "anon"}-${slotIds.sort().join("_")}`.replace(/[^A-Za-z0-9_:-]/g, "").slice(0, 128);
      return api.post<CreateBookingResponse>("/bookings", {
        turfId,
        slotIds,
        paymentMethod,
        idempotencyKey,
      });
    },
    onSuccess: (result, paymentMethod) => {
      if (paymentMethod === "online" && result.payment) {
        router.push(`/checkout?booking=${result.booking.id}`);
      } else {
        router.push(`/booking-success?booking=${result.booking.id}`);
      }
    },
    onError: (err: Error & { status?: number }) => {
      toast.error(err.message || "Booking failed", {
        description: err.status === 409 ? "Someone just took one of those slots." : undefined,
      });
    },
  });

  if (availability.isLoading) {
    return (
      <div className="container max-w-2xl space-y-4 py-10">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (availability.isError || slots.length === 0) {
    return (
      <div className="container max-w-2xl py-10">
        <ErrorState
          title="These slots are no longer selectable"
          message="Availability may have changed — go back and pick again."
        />
        <div className="mt-4 text-center">
          <Button variant="outline" onClick={() => router.back()}><ArrowLeft /> Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-10">
      <LinkBack />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Review your booking</h1>
      <p className="text-sm text-muted-foreground">{formatDate(slots[0]!.startsAt)} · {availability.data!.turfName}</p>

      <Card className="mt-6">
        <CardHeader><CardTitle className="text-base">Selected slots</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {slots.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="flex items-center gap-2"><CalendarCheck className="h-4 w-4 text-primary" /> {formatTime(s.startsAt)} – {formatTime(s.endsAt)}</span>
              <span className="font-medium">{formatMoney(s.priceMinor)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-3 font-semibold">
            <span>Total</span><span>{formatMoney(total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">The server recomputes this total at booking time.</p>
        </CardContent>
      </Card>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <PaymentOption
          icon={<CreditCard />}
          title="Pay online"
          description="Razorpay — UPI, cards, netbanking. Confirms instantly after verified payment."
          onClick={() => book.mutate("online")}
          loading={book.isPending && book.variables === "online"}
        />
        {availability.data && (
          <PaymentOption
            icon={<Wallet />}
            title="Pay at venue"
            description="Reserve now, pay cash/UPI at the counter. Booking confirms immediately."
            onClick={() => book.mutate("pay_at_venue")}
            loading={book.isPending && book.variables === "pay_at_venue"}
          />
        )}
      </div>
    </div>
  );
}

function PaymentOption({
  icon, title, description, onClick, loading, disabled,
}: {
  icon: React.ReactNode; title: string; description: string; onClick: () => void; loading?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "group rounded-xl border p-5 text-left transition-all hover:border-primary/60 hover:shadow-raise disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {loading && <Badge className="mt-2">Confirming…</Badge>}
    </button>
  );
}

function LinkBack() {
  const router = useRouter();
  return (
    <button onClick={() => router.back()} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" /> Back
    </button>
  );
}

export default function BookingPage() {
  return (
    <Suspense fallback={<ContentPageSkeleton dense />}>
      <BookingInner />
    </Suspense>
  );
}
