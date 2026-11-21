"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState } from "@/components/ui/states";
import { formatDate } from "@/lib/utils";

interface AdminTenant {
  id: string; name: string; slug: string; status: string; turfCount: number;
  supportEmail: string | null; createdAt: string; suspensionReason: string | null;
}

export default function AdminTenantsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const tenants = useQuery({
    queryKey: ["admin", "tenants", filter],
    queryFn: () => api.get<AdminTenant[]>(`/admin/tenants${filter !== "all" ? `?status=${filter}` : ""}`),
  });

  const act = useMutation({
    mutationFn: (input: { id: string; action: "verify" | "suspend" | "reactivate" }) =>
      api.patch(`/admin/tenants/${input.id}/status`, { action: input.action, reason: "console action" }),
    onSuccess: () => {
      toast.success("Tenant updated");
      qc.invalidateQueries({ queryKey: ["admin", "tenants"] });
    },
    onError: (err: Error) => toast.error(err.message || "Action failed"),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["all", "pending_verification", "active", "suspended"].map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">
            {f.replace(/_/g, " ")}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {tenants.isLoading && <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
          {tenants.isError && <div className="p-4"><ErrorState onRetry={() => tenants.refetch()} /></div>}
          {tenants.data && tenants.data.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No tenants in this view.</p>}
          {tenants.data && tenants.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Turfs</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.data.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <p className="font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.slug}{t.supportEmail ? ` · ${t.supportEmail}` : ""}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={t.status === "active" ? "success" : t.status === "suspended" ? "destructive" : "warning"}>
                        {t.status.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{t.turfCount}</TableCell>
                    <TableCell className="text-sm">{formatDate(t.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        {t.status !== "active" && (
                          <Button size="sm" variant="outline" onClick={() => act.mutate({ id: t.id, action: t.status === "suspended" ? "reactivate" : "verify" })}>
                            {t.status === "suspended" ? "Reactivate" : "Verify"}
                          </Button>
                        )}
                        {t.status === "active" && (
                          <Button size="sm" variant="destructive" onClick={() => { if (confirm(`Suspend ${t.name}?`)) act.mutate({ id: t.id, action: "suspend" }); }}>
                            Suspend
                          </Button>
                        )}
                      </div>
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
