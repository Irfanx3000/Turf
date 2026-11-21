"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { api } from "@/lib/api-client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useTenantId } from "@/lib/use-tenant";
import { formatMoney } from "@/lib/utils";

interface TenantBooking {
  id: string; customerName: string | null; customerEmail: string;
  totalAmountMinor: number; bookingStatus: string; createdAt: string;
}

export default function TenantCustomersPage() {
  const tenantId = useTenantId();
  const bookings = useQuery({
    queryKey: ["tenant", "bookings", tenantId, "all"],
    queryFn: () => api.get<{ items: TenantBooking[] }>(`/tenants/${tenantId}/bookings?page=1&pageSize=100`),
    enabled: Boolean(tenantId),
  });

  const customers = useMemo(() => {
    const map = new Map<string, { name: string; email: string; bookings: number; valueMinor: number }>();
    for (const b of bookings.data?.items ?? []) {
      const existing = map.get(b.customerEmail) ?? { name: b.customerName ?? "—", email: b.customerEmail, bookings: 0, valueMinor: 0 };
      existing.bookings += 1;
      existing.valueMinor += b.totalAmountMinor;
      map.set(b.customerEmail, existing);
    }
    return [...map.values()].sort((a, b) => b.valueMinor - a.valueMinor);
  }, [bookings.data]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Customers derived from your bookings.</p>
      <Card>
        <CardContent className="p-0">
          {bookings.isLoading && <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
          {bookings.isError && <div className="p-4"><ErrorState onRetry={() => bookings.refetch()} /></div>}
          {bookings.data && customers.length === 0 && (
            <div className="p-6"><EmptyState icon={<Users className="h-6 w-6" />} title="No customers yet" /></div>
          )}
          {customers.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Booked value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((c) => (
                  <TableRow key={c.email}>
                    <TableCell>
                      <p className="text-sm font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.email}</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.bookings}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(c.valueMinor)}</TableCell>
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
