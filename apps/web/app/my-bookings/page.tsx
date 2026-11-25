"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarX2, Ticket } from "lucide-react";
import { toast } from "sonner";
import { api, qs } from "@/lib/api-client";
import type { BookingSummary } from "@turf/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { formatDate, formatMoney, formatTime } from "@/lib/utils";

interface BookingsList { items: BookingSummary[]; total: number; page: number; pageSize: number }

const STATUS_TABS = ["all", "confirmed", "pending_payment", "completed", "cancelled", "expired"] as const;

const statusVariant: Record<string, "success" | "warning" | "secondary" | "destructive" | "info"> = {
  confirmed: "success", pending_payment: "warning", completed: "info",
  cancelled: "destructive", expired: "secondary", no_show: "destructive",
};

export default function MyBookingsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>("all");
  const [pendingCancel, setPendingCancel] = useState<BookingSummary | null>(null);

  const bookings = useQuery({
    queryKey: ["bookings", "mine", status],
    queryFn: () => api.get<BookingsList>(`/bookings/mine${qs({ page: 1, pageSize: 20, status: status === "all" ? undefined : status })}`),
  });

  const cancel = useMutation({
    mutationFn: (bookingId: string) => api.post<{ refundDueMinor: number }>(`/bookings/${bookingId}/cancel`, {}),
    onSuccess: (result) => {
      setPendingCancel(null);
      toast.success("Booking cancelled", {
        description: result.refundDueMinor > 0 ? `Refund of ${formatMoney(result.refundDueMinor)} is being processed.` : undefined,
      });
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => toast.error(err.message || "Cancellation failed"),
  });

  return (
    <div className="container max-w-3xl py-10">
      <h1 className="text-2xl font-bold tracking-tight">My bookings</h1>
      <p className="text-sm text-muted-foreground">{bookings.data?.total ?? "…"} bookings</p>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab}
            size="sm"
            variant={status === tab ? "default" : "outline"}
            onClick={() => setStatus(tab)}
            className="capitalize"
          >
            {tab.replace(/_/g, " ")}
          </Button>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {bookings.isLoading && [1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}
        {bookings.isError && <ErrorState onRetry={() => bookings.refetch()} />}
        {bookings.data && bookings.data.items.length === 0 && (
          <EmptyState
            icon={<Ticket className="h-6 w-6" />}
            title="No bookings here yet"
            description="Find a turf and grab a slot — takes under a minute."
            action={<Button asChild variant="brand"><Link href="/explore">Explore turfs</Link></Button>}
          />
        )}
        {bookings.data?.items.map((b) => (
          <Card key={b.id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{b.reference}</span>
                  <Badge variant={statusVariant[b.bookingStatus] ?? "secondary"}>{b.bookingStatus.replace(/_/g, " ")}</Badge>
                </div>
                <Link href={`/turfs/${b.turfSlug}`} className="mt-1 block font-semibold hover:text-primary">{b.turfName}</Link>
                <p className="text-sm text-muted-foreground">{formatDate(b.startsAt)} · {formatTime(b.startsAt)}</p>
                <p className="mt-1 text-sm">
                  <span className="font-medium">{formatMoney(b.totalAmountMinor)}</span>
                  <span className="text-muted-foreground"> · paid {formatMoney(b.paidAmountMinor)} · {b.paymentMethod.replace(/_/g, " ")}</span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {b.bookingStatus === "pending_payment" && (
                  <Button size="sm" asChild><Link href={`/checkout?booking=${b.id}`}>Complete payment</Link></Button>
                )}
                {["confirmed", "pending_payment"].includes(b.bookingStatus) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPendingCancel(b)}
                  >
                    <CalendarX2 /> Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog
        open={pendingCancel !== null}
        onOpenChange={(open) => {
          if (!open && !cancel.isPending) setPendingCancel(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this booking?</DialogTitle>
            <DialogDescription>
              {pendingCancel ? (
                <>
                  You&apos;re about to cancel <span className="font-mono text-foreground">{pendingCancel.reference}</span>
                  {" "}at <span className="text-foreground">{pendingCancel.turfName}</span>
                  {" "}({formatDate(pendingCancel.startsAt)} · {formatTime(pendingCancel.startsAt)}).
                  The venue&apos;s cancellation policy still applies.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              disabled={cancel.isPending}
              onClick={() => setPendingCancel(null)}
            >
              Keep booking
            </Button>
            <Button
              variant="destructive"
              loading={cancel.isPending}
              disabled={!pendingCancel || cancel.isPending}
              onClick={() => {
                if (pendingCancel) cancel.mutate(pendingCancel.id);
              }}
            >
              <CalendarX2 /> Confirm cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
