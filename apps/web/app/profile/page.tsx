"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/use-session";

interface ProfileData { id: string; email: string; platformRole: string; fullName: string | null; phone: string | null; avatarUrl: string | null }

export default function ProfilePage() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => api.get<ProfileData>("/users/me") });
  const [form, setForm] = useState({ fullName: "", phone: "" });

  useEffect(() => {
    if (profile.data) setForm({ fullName: profile.data.fullName ?? "", phone: profile.data.phone ?? "" });
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () => api.patch<ProfileData>("/users/me", {
      fullName: form.fullName || undefined,
      phone: form.phone || undefined,
    }),
    onSuccess: () => {
      toast.success("Profile updated");
      qc.invalidateQueries({ queryKey: ["profile"] });
      qc.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (err: Error) => toast.error(err.message || "Update failed"),
  });

  return (
    <div className="container max-w-xl py-10">
      <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
      <p className="text-sm text-muted-foreground">Your identity across the platform.</p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>
            <span className="font-mono text-xs">{profile.data?.email ?? session?.email}</span>
            {session && <Badge className="ml-2" variant="navy">{session.platformRole.replace(/_/g, " ")}</Badge>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profile.isLoading ? (
            <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Full name</Label>
                <Input id="fullName" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91…" />
              </div>
              <Button type="submit" loading={save.isPending}>Save changes</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
