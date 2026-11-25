"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { TenantSummary } from "@turf/shared-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenantId } from "@/lib/use-tenant";

export default function TenantSettingsPage() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  const tenant = useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: () => api.get<TenantSummary>(`/tenants/${tenantId}`),
    enabled: Boolean(tenantId),
  });
  const [form, setForm] = useState({ name: "", supportEmail: "" });

  useEffect(() => {
    if (tenant.data) setForm({ name: tenant.data.name, supportEmail: "" });
  }, [tenant.data]);

  const save = useMutation({
    mutationFn: () => api.patch(`/tenants/${tenantId}`, {
      name: form.name || undefined,
      ...(form.supportEmail ? { supportEmail: form.supportEmail } : {}),
    }),
    onSuccess: () => {
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["tenant"] });
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (err: Error) => toast.error(err.message || "Save failed"),
  });

  if (tenant.isLoading || !tenant.data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization</CardTitle>
          <CardDescription>Public identity and contact details.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="max-w-md space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Name</Label>
              <Input id="org-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-email">Support email</Label>
              <Input id="org-email" type="email" value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} placeholder="bookings@yourorg.example" />
            </div>
            <Button type="submit" loading={save.isPending}>Save</Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            Slug <span className="font-mono">{tenant.data.slug}</span> · status {tenant.data.status.replace(/_/g, " ")}.
            Verification and suspension are managed by platform admins.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
