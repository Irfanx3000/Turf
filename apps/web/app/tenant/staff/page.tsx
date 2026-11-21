"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/states";
import { useTenantId } from "@/lib/use-tenant";

interface Member { id: string; userId: string; email: string; fullName: string | null; role: string }

export default function TenantStaffPage() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  const members = useQuery({
    queryKey: ["tenant", "members", tenantId],
    queryFn: () => api.get<Member[]>(`/tenants/${tenantId}/members`),
    enabled: Boolean(tenantId),
  });
  const [invite, setInvite] = useState({ email: "", role: "staff" });

  const addMember = useMutation({
    mutationFn: () => api.post(`/tenants/${tenantId}/members`, { email: invite.email, role: invite.role }),
    onSuccess: () => {
      toast.success("Member added");
      setInvite({ email: "", role: "staff" });
      qc.invalidateQueries({ queryKey: ["tenant", "members"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not add member"),
  });

  const removeMember = useMutation({
    mutationFn: (id: string) => api.delete(`/tenants/${tenantId}/members/${id}`),
    onSuccess: () => {
      toast.success("Member removed");
      qc.invalidateQueries({ queryKey: ["tenant", "members"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not remove member"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); addMember.mutate(); }}>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="invite-email">Add existing user by email</Label>
              <Input id="invite-email" type="email" required value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="staff.member@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Role</Label>
              <select
                id="invite-role"
                className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm sm:w-32"
                value={invite.role}
                onChange={(e) => setInvite({ ...invite, role: e.target.value })}
              >
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <Button type="submit" loading={addMember.isPending}><UserPlus /> Add</Button>
          </form>
        </CardContent>
      </Card>

      {members.isLoading && [1, 2].map((i) => <Skeleton key={i} className="h-16" />)}
      {members.isError && <ErrorState onRetry={() => members.refetch()} />}
      {members.data?.map((m) => (
        <Card key={m.id}>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="font-medium">{m.fullName ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{m.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={m.role === "owner" ? "navy" : m.role === "manager" ? "info" : "secondary"}>{m.role}</Badge>
              {m.role !== "owner" && (
                <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Remove ${m.email}?`)) removeMember.mutate(m.id); }}>
                  Remove
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
