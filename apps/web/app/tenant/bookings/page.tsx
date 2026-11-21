"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useTenantId } from "@/lib/use-tenant";
import { formatDate, formatMoney } from "@/lib/utils";

interface TenantBooking {
  id: string; reference: string; turfName: string; customerName: string | null; customerEmail: string;
  bookingStatus: string; paymentMethod: string; totalAmountMinor: number; paidAmountMinor: number;
  createdAt: string; startsAt?: string;
}

const STATUS_TABS = ["all", "confirmed", "pending_payment", "completed", "cancelled", "no_show", "expired"] as const;

const statusVariant: Record<string, "success" | "warning" | "secondary" | "destructive" | "info"> = {
  confirmed: "success", pending_payment: "warning", completed: "info",
  cancelled: "destructive", expired: "secondary", no_show: "destructive",
};

export default function TenantBookingsPage() {
  const tenantId = useTenantId();
  const [status, setStatus] = useState<(typeof STATUS_TABS)[number]>("all");

  const bookings = useQuery({
    queryKey: ["tenant", "bookings", tenantId, status],
    queryFn: () => api.get<{ items: TenantBooking[]; total: number }>(`/tenants/${tenantId}/bookings${qs({ page: 1, pageSize: 50, status: status === "all" ? undefined : status })}`),
    enabled: Boolean(tenantId),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_TABS.map((tab) => (
          <Button key={tab} size="sm" variant={status === tab ? "default" : "outline"} onClick={() => setStatus(tab)} className="capitalize">
            {tab.replace(/_/g, " ")}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {bookings.isLoading && <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
          {bookings.isError && <div className="p-4"><ErrorState onRetry={() => bookings.refetch()} /></div>}
          {bookings.data && bookings.data.items.length === 0 && (
            <div className="p-6"><EmptyState title="No bookings in this view" /></div>
          )}
          {bookings.data && bookings.data.items.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Turf</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bookings.data.items.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.reference}</TableCell>
                    <TableCell>{b.turfName}</TableCell>
                    <TableCell>
                      <p className="text-sm">{b.customerName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{b.customerEmail}</p>
                    </TableCell>
                    <TableCell className="text-sm">{formatDate(b.createdAt)}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant={statusVariant[b.bookingStatus] ?? "secondary"}>{b.bookingStatus.replace(/_/g, " ")}</Badge>
                        <span className="text-[11px] text-muted-foreground">{b.paymentMethod.replace(/_/g, " ")}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(b.totalAmountMinor)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(b.paidAmountMinor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
