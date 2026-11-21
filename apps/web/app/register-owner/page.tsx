"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { registerOwnerSchema } from "@turf/validation";
import { FormError } from "@/components/ui/form-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { AuthShell } from "@/components/customer/auth-shell";

export default function RegisterOwnerPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "", organizationName: "", city: "Mumbai" });
  const [error, setError] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: (input: ReturnType<typeof registerOwnerSchema.parse>) => api.post("/auth/register-owner", input),
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries({ queryKey: ["session"] });
      toast.success("Organization created — let's set up your first venue");
      router.push("/tenant/dashboard");
    },
    onError: (err: unknown) => {
      const message = authErrorMessage(err, "We're having trouble creating your organization. Please try again shortly.");
      setError(message);
      toast.error("Registration failed", { description: message });
    },
  });

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-4 w-4" /> List your turf</CardTitle>
          <CardDescription>Create your organization — verification is quick, and you can start setting up venues immediately.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              const parsed = registerOwnerSchema.safeParse({
                fullName: form.fullName,
                email: form.email,
                password: form.password,
                ...(form.phone ? { phone: form.phone } : {}),
                organizationName: form.organizationName,
                city: form.city,
              });
              if (!parsed.success) {
                setError(parsed.error.issues[0]?.message ?? "Please check the highlighted fields.");
                return;
              }
              register.mutate(parsed.data);
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="orgName">Organization name</Label>
              <Input id="orgName" required minLength={2} value={form.organizationName} onChange={(e) => setForm({ ...form, organizationName: e.target.value })} placeholder="GreenArena Sports" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" required value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Your name</Label>
                <Input id="fullName" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="10+ chars, mixed case, a number" />
            </div>
            {error && <FormError message={error} />}
            <Button type="submit" className="w-full" loading={register.isPending}>Create organization</Button>
          </form>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
