"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { registerSchema } from "@turf/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { AuthShell } from "@/components/customer/auth-shell";

export default function RegisterPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "" });

  const register = useMutation({
    mutationFn: () => {
      const input = registerSchema.parse({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        ...(form.phone ? { phone: form.phone } : {}),
      });
      return api.post("/auth/register", input);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["session"] });
      toast.success("Account created — welcome!");
      router.push("/explore");
    },
    onError: (err: Error) => toast.error(err.message || "Registration failed"),
  });

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Book turfs, track your games and get match reminders.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); register.mutate(); }}>
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" required minLength={2} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Priya Sharma" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="10+ chars, mixed case, a number" />
              <p className="text-xs text-muted-foreground">At least 10 characters with upper, lower and a number.</p>
            </div>
            <Button type="submit" className="w-full" loading={register.isPending}>Create account</Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Own a venue? <Link href="/register-owner" className="font-medium text-primary hover:underline">List your turf</Link>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
