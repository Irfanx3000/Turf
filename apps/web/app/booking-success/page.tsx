"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck, PartyPopper, Ticket } from "lucide-react";
import { motion } from "@/motion";
import { api } from "@/lib/api-client";
import type { BookingSummary } from "@turf/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { formatDate, formatMoney, formatTime } from "@/lib/utils";

interface BookingDetail extends BookingSummary { items: Array<{ id: string; startsAt: string; endsAt: string; priceMinor: number }> }

function SuccessInner() {
  const params = useSearchParams();
  const bookingId = params.get("booking") ?? "";
  const booking = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: () => api.get<BookingDetail>(`/bookings/${bookingId}`),
    enabled: Boolean(bookingId),
  });

  if (booking.isLoading) return <div className="container max-w-lg py-16"><Skeleton className="h-64" /></div>;
  if (booking.isError || !booking.data) return <div className="container py-10"><ErrorState title="Booking not found" /></div>;

  const b = booking.data;
  const confirmed = b.bookingStatus === "confirmed";

  return (
    <div className="container max-w-lg py-14 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-brand-emerald-500/15 text-brand-emerald-600"
      >
        {confirmed ? <PartyPopper className="h-9 w-9" /> : <Ticket className="h-9 w-9" />}
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="text-3xl font-bold tracking-tight"
      >
        {confirmed ? "You're booked!" : "Reservation placed"}
      </motion.h1>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mt-2 text-muted-foreground"
      >
        {confirmed
          ? b.paymentMethod === "pay_at_venue"
            ? "Pay at the venue counter — your slot is locked in."
            : "Payment verified. See you on the pitch."
          : "Complete the payment to confirm your slots."}
      </motion.p>

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <Card className="mt-8 text-left">
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center justify-between">
              <span className="font-mono text-sm font-semibold">{b.reference}</span>
              <Badge variant={confirmed ? "success" : "warning"}>
                {b.bookingStatus.replace(/_/g, " ")}
              </Badge>
            </div>
            <div className="space-y-1.5 border-t pt-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Turf</span><span>{b.turfName}</span></div>
              {b.items?.[0] && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Starts</span>
                  <span className="flex items-center gap-1"><CalendarCheck className="h-3.5 w-3.5" /> {formatDate(b.items[0].startsAt)} · {formatTime(b.items[0].startsAt)}</span>
                </div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Payment</span><span className="capitalize">{b.paymentMethod.replace(/_/g, " ")}</span></div>
              <div className="flex justify-between font-semibold"><span>Total</span><span>{formatMoney(b.totalAmountMinor)}</span></div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="mt-8 flex justify-center gap-3">
        <Button asChild variant="brand"><Link href="/my-bookings">My bookings</Link></Button>
        <Button asChild variant="outline"><Link href="/explore">Book another</Link></Button>
      </div>
    </div>
  );
}

export default function BookingSuccessPage() {
  return <Suspense><SuccessInner /></Suspense>;
}
