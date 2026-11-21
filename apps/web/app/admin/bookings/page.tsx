"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState } from "@/components/ui/states";
import { formatDate, formatMoney } from "@/lib/utils";

export default function AdminBookingsPage() {
  const [status, setStatus] = useState("all");
  const data = useQuery({
    queryKey: ["admin", "bookings", status],
    queryFn: () => api.get<unknown[]>(`/admin/bookings${status !== "all" ? `?status=${status}` : ""}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["all", "confirmed", "pending", "paid", "failed"].map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)} className="capitalize">{s.replace(/_/g, " ")}</Button>
        ))}
      </div>
      <Card>
        <CardContent className="p-0">
          {data.isLoading && <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
          {data.isError && <div className="p-4"><ErrorState onRetry={() => data.refetch()} /></div>}
          {data.data && (data.data as unknown[]).length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">Nothing in this view.</p>}
          {data.data && (data.data as unknown[]).length > 0 && (
            <AdminTable rows={data.data as Record<string, unknown>[]} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function AdminTable({ rows }: { rows: Record<string, unknown>[] }) {
  const page: string = "bookings";
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {page === "bookings" && (<><TableHead>Reference</TableHead><TableHead>Tenant</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Value</TableHead></>)}
          {page === "payments" && (<><TableHead>Booking</TableHead><TableHead>Tenant</TableHead><TableHead>Method</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead></>)}
          {page === "turfs" && (<><TableHead>Turf</TableHead><TableHead>Tenant</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Base price</TableHead></>)}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => {
          const b = (row.booking ?? row.turf ?? row) as Record<string, unknown>;
          return (
            <TableRow key={String(b.id ?? i)}>
              {page === "bookings" && (<>
                <TableCell className="font-mono text-xs">{String(b.reference)}</TableCell>
                <TableCell className="text-sm">{String(row.tenantName ?? "")}</TableCell>
                <TableCell><Badge>{String(b.bookingStatus).replace(/_/g, " ")}</Badge></TableCell>
                <TableCell className="text-sm">{formatDate(String(b.createdAt))}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(Number(b.totalAmountMinor ?? 0))}</TableCell>
              </>)}
              {page === "payments" && (<>
                <TableCell className="font-mono text-xs">{String(row.reference ?? "")}</TableCell>
                <TableCell className="text-sm">{String(row.tenantName ?? "")}</TableCell>
                <TableCell className="text-sm capitalize">{String(b.method).replace(/_/g, " ")}</TableCell>
                <TableCell><Badge variant={b.status === "paid" ? "success" : "warning"}>{String(b.status)}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(Number(b.amountMinor ?? 0))}</TableCell>
              </>)}
              {page === "turfs" && (<>
                <TableCell>
                  <p className="font-medium">{String(b.name)}</p>
                  <p className="text-xs text-muted-foreground">{String(b.slug)}</p>
                </TableCell>
                <TableCell className="text-sm">{String(row.tenantName ?? "")}</TableCell>
                <TableCell><Badge>{String(b.status)}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(Number(b.basePriceMinor ?? 0))}</TableCell>
              </>)}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
