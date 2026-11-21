"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Banknote } from "lucide-react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useTenantId } from "@/lib/use-tenant";
import { formatDate, formatMoney } from "@/lib/utils";

interface TenantPayment {
  id: string; bookingReference: string; turfName: string; provider: string;
  method: string; status: string; amountMinor: number; paidAt: string | null; createdAt: string;
}

export default function TenantPaymentsPage() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | "pending" | "paid">("all");

  const payments = useQuery({
    queryKey: ["tenant", "payments", tenantId],
    queryFn: () => api.get<TenantPayment[]>(`/tenants/${tenantId}/payments`),
    enabled: Boolean(tenantId),
  });

  const collect = useMutation({
    mutationFn: (paymentId: string) => api.post(`/tenants/${tenantId}/payments/${paymentId}/collect`),
    onSuccess: () => {
      toast.success("Marked collected");
      qc.invalidateQueries({ queryKey: ["tenant", "payments"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed"),
  });

  const rows = (payments.data ?? []).filter((p) => filter === "all" || p.status === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["all", "pending", "paid"] as const).map((f) => (
            <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">{f}</Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Venue collections are marked at the counter; online payments are gateway-verified.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {payments.isLoading && <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
          {payments.isError && <div className="p-4"><ErrorState onRetry={() => payments.refetch()} /></div>}
          {payments.data && rows.length === 0 && <div className="p-6"><EmptyState title="No payments in this view" /></div>}
          {rows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking</TableHead>
                  <TableHead>Turf</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.bookingReference}</TableCell>
                    <TableCell className="text-sm">{p.turfName}</TableCell>
                    <TableCell className="text-sm capitalize">{p.method.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === "paid" ? "success" : p.status === "pending" ? "warning" : "destructive"}>
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(p.amountMinor)}</TableCell>
                    <TableCell className="text-right">
                      {p.method === "pay_at_venue" && p.status === "pending" ? (
                        <Button size="sm" variant="outline" loading={collect.isPending && collect.variables === p.id} onClick={() => collect.mutate(p.id)}>
                          <Banknote /> Mark collected
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{p.paidAt ? formatDate(p.paidAt) : "—"}</span>
                      )}
                    </TableCell>
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
