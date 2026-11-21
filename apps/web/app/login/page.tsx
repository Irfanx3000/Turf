"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { authErrorMessage } from "@/lib/auth-errors";
import type { AuthenticatedUser } from "@turf/shared-types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { FormError } from "@/components/ui/form-error";
import { AuthShell } from "@/components/customer/auth-shell";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: async () => {
      await api.post("/auth/login", { email: email.trim(), password });
      // Cookie is set — read the authoritative identity (incl. memberships)
      // so routing is based on what the server says, not client guesses.
      return api.get<AuthenticatedUser>("/auth/me");
    },
    onSuccess: async (me) => {
      setError(null);
      qc.setQueryData(["session"], me);
      const next = params.get("next");
      if (next && next.startsWith("/") && !next.startsWith("//")) {
        router.push(next);
        return;
      }
      if (me.platformRole === "super_admin") {
        router.push("/admin/dashboard");
      } else if (me.memberships.length > 0) {
        router.push("/tenant/dashboard");
      } else {
        router.push("/explore");
      }
    },
    onError: (err: unknown) => {
      const message = authErrorMessage(err);
      setError(message);
      toast.error("Sign-in failed", { description: message });
    },
  });

  const emailValid = email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

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
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!emailValid || password === "") return;
              setError(null);
              login.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-invalid={!emailValid || undefined}
                aria-describedby={emailValid ? undefined : "email-error"}
              />
              {!emailValid && (
                <p id="email-error" className="text-xs text-destructive">
                  Please enter a valid email address.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>

            {error && <FormError message={error} />}

            <Button type="submit" className="w-full" loading={login.isPending} disabled={login.isPending}>
              Sign in
            </Button>
            <div className="text-right">
              <Link href="/forgot-password" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                Forgot your password?
              </Link>
            </div>
          </form>
          <div className="mt-5 space-y-2 border-t pt-5 text-center text-sm">
            <p className="text-muted-foreground">
              New here?{" "}
              <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
                Create an account
              </Link>
            </p>
            <p className="text-muted-foreground">
              Own a venue?{" "}
              <Link href="/register-owner" className="font-medium text-primary underline-offset-4 hover:underline">
                List your turf
              </Link>
            </p>
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
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
