"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { AuthShell } from "@/components/customer/auth-shell";

interface AuthResult { accessToken: string; emailConfirmationPending: boolean; user: { platformRole: string } }

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: () => api.post<AuthResult>("/auth/login", { email, password }),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["session"] });
      const next = params.get("next");
      const roleHome = result.user.platformRole === "super_admin" ? "/admin/dashboard" : result.user.platformRole === "tenant_owner" ? "/tenant/dashboard" : "/explore";
      router.push(next || roleHome);
    },
    onError: (err: Error) => toast.error(err.message || "Sign-in failed"),
  });

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
          <CardDescription>Sign in to book, manage venues or administer the platform.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); login.mutate(); }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••" />
            </div>
            <Button type="submit" className="w-full" loading={login.isPending}>Sign in</Button>
          </form>
          <div className="mt-4 space-y-1 text-center text-sm text-muted-foreground">
            <p>New here? <Link href="/register" className="font-medium text-primary hover:underline">Create an account</Link></p>
            <p><Link href="/forgot-password" className="hover:underline">Forgot your password?</Link></p>
          </div>
        </CardContent>
      </Card>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Demo: customer@turf.demo / Customer#12345 · owner@turf.demo / Owner#12345
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}
