"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, qs } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState } from "@/components/ui/states";
import { formatDate } from "@/lib/utils";

interface AdminUser {
  id: string; email: string; platformRole: string; fullName: string | null;
  phone: string | null; isActive: boolean; createdAt: string;
}

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const users = useQuery({
    queryKey: ["admin", "users", search],
    queryFn: () => api.get<AdminUser[]>(`/admin/users${qs({ search: search || undefined })}`),
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; isActive: boolean }) => api.patch(`/admin/users/${input.id}/status`, { isActive: input.isActive }),
    onSuccess: () => {
      toast.success("User updated");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed"),
  });

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by email or name…"
        className="max-w-sm"
        aria-label="Search users"
      />
      <Card>
        <CardContent className="p-0">
          {users.isLoading && <div className="space-y-2 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
          {users.isError && <div className="p-4"><ErrorState onRetry={() => users.refetch()} /></div>}
          {users.data && users.data.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No users match.</p>}
          {users.data && users.data.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <p className="font-medium">{u.fullName ?? "—"}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </TableCell>
                    <TableCell><Badge variant="navy">{u.platformRole.replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-sm">{formatDate(u.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? "success" : "destructive"}>{u.isActive ? "active" : "disabled"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant={u.isActive ? "destructive" : "outline"}
                        onClick={() => toggle.mutate({ id: u.id, isActive: !u.isActive })}
                      >
                        {u.isActive ? "Disable" : "Enable"}
                      </Button>
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
