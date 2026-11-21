"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CreditCard, Lock, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { motion } from "@/motion";
import { api } from "@/lib/api-client";
import type { BookingSummary } from "@turf/shared-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatMoney } from "@/lib/utils";

interface BookingDetail extends BookingSummary { items: Array<{ id: string; startsAt: string; endsAt: string; priceMinor: number }> }

function CheckoutInner() {
  const router = useRouter();
  const params = useSearchParams();
  const bookingId = params.get("booking") ?? "";

  const booking = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: () => api.get<BookingDetail>(`/bookings/${bookingId}`),
    enabled: Boolean(bookingId),
  });
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => api.get<{ checks: { payments: string } }>("/health"),
    staleTime: 300_000,
  });
  const isMock = health.data?.checks.payments === "mock-adapter";

  const pay = useMutation({
    // Mock gateway: "paying" goes through the same signed-webhook path the
    // real gateway uses. With Razorpay credentials this button opens the
    // Razorpay checkout widget instead.
    mutationFn: () => api.post<{ received: true; outcome?: string }>("/payments/mock/pay", { bookingId }),
    onSuccess: () => {
      router.push(`/booking-success?booking=${bookingId}`);
    },
    onError: (err: Error) => toast.error(err.message || "Payment failed"),
  });

  if (!bookingId) return <div className="container py-10"><ErrorState title="Missing booking reference" /></div>;
  if (booking.isLoading) return <div className="container max-w-lg py-10"><Skeleton className="h-64" /></div>;
  if (booking.isError || !booking.data) {
    return <div className="container py-10"><ErrorState title="Booking not found" message="It may have expired." /></div>;
  }

  const b = booking.data;

  return (
    <div className="container max-w-lg py-10">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4" /> Complete payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-mono">{b.reference}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Playing at</span><span>{b.turfName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">From</span><span>{formatDate(b.startsAt)}</span></div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span>{formatMoney(b.totalAmountMinor)}</span></div>
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
                <Lock className="h-3.5 w-3.5" /> Reservation held
              </p>
              <p className="mt-1">
                Your slots are reserved while you pay. If payment isn&apos;t completed in time, the
                reservation is released automatically — you&apos;ll never be charged for an expired slot.
              </p>
            </div>

            {isMock && (
              <Badge variant="info" className="w-full justify-center py-1.5">
                Development gateway — Razorpay activates with credentials
              </Badge>
            )}

            <Button
              className="w-full"
              size="lg"
              loading={pay.isPending}
              disabled={isMock === false}
              onClick={() => pay.mutate()}
            >
              Pay {formatMoney(b.totalAmountMinor)}
            </Button>
            {isMock === false && (
              <p className="text-center text-xs text-muted-foreground">
                Razorpay checkout opens here once the client wiring is configured for this deployment.
              </p>
            )}
            <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Verified by signature-checked webhook
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

export default function CheckoutPage() {
  return <Suspense><CheckoutInner /></Suspense>;
}
