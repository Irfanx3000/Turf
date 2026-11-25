"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { resetPasswordSchema } from "@turf/validation";
import { api, ApiClientError } from "@/lib/api-client";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { AuthShell } from "@/components/customer/auth-shell";
import { ContentPageSkeleton } from "@/components/loading/page-skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/ui/form-error";
import { Input, Label } from "@/components/ui/input";
import { useAppRouter } from "@/lib/use-app-router";

type RecoveryMode = "loading" | "supabase" | "local-token" | "missing";

function ResetPasswordInner() {
  const router = useAppRouter();
  const params = useSearchParams();
  const localToken = params.get("token") ?? "";
  const [mode, setMode] = useState<RecoveryMode>("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function establishRecoverySession() {
      // Dev-adapter links carry ?token=… — handled by our API, not Supabase.
      if (localToken) {
        if (!cancelled) setMode("local-token");
        return;
      }

      try {
        const supabase = getSupabaseBrowser();
        const code = params.get("code");
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          if (!cancelled) setMode("supabase");
          return;
        }

        // Implicit / older recovery links put tokens in the URL hash.
        const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const type = hashParams.get("type");
        if (accessToken && refreshToken && (type === "recovery" || !type)) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
          if (!cancelled) setMode("supabase");
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (!cancelled) setMode("supabase");
          return;
        }
        if (!cancelled) setMode("missing");
      } catch (err) {
        if (!cancelled) {
          setMode("missing");
          setError(err instanceof Error ? err.message : "This reset link is invalid or has expired.");
        }
      }
    }

    void establishRecoverySession();
    return () => {
      cancelled = true;
    };
  }, [localToken, params]);

  const localReset = useMutation({
    mutationFn: (input: { token: string; password: string }) =>
      api.post<{ ok: true }>("/auth/reset-password", input),
    onSuccess: () => {
      setError(null);
      setDone(true);
      toast.success("Password updated — you can sign in now");
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiClientError
          ? err.message
          : "We're having trouble resetting your password. Please try again shortly.";
      setError(message);
      toast.error("Reset failed", { description: message });
    },
  });

  const supabaseReset = useMutation({
    mutationFn: async (newPassword: string) => {
      const supabase = getSupabaseBrowser();
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
    },
    onSuccess: () => {
      setError(null);
      setDone(true);
      toast.success("Password updated — you can sign in now");
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Could not update password.";
      setError(message);
      toast.error("Reset failed", { description: message });
    },
  });

  const pending = localReset.isPending || supabaseReset.isPending;

  if (mode === "loading") {
    return <ContentPageSkeleton dense />;
  }

  if (mode === "missing") {
    return (
      <AuthShell>
        <Card>
          <CardHeader>
            <CardTitle>Reset link missing or expired</CardTitle>
            <CardDescription>Open the latest link from your email, or request a new one.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && <FormError message={error} />}
            <Button asChild className="w-full">
              <Link href="/forgot-password">Request a new link</Link>
            </Button>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>Use at least 10 characters with upper, lower, and a number.</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-brand-emerald-600" />
              <p className="font-medium">Your password has been updated.</p>
              <Button className="mt-2 w-full" onClick={() => router.push("/login")}>
                Sign in
              </Button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                if (password !== confirm) {
                  setError("Passwords do not match.");
                  return;
                }
                if (mode === "local-token") {
                  const parsed = resetPasswordSchema.safeParse({ token: localToken, password });
                  if (!parsed.success) {
                    setError(parsed.error.issues[0]?.message ?? "Please check the password requirements.");
                    return;
                  }
                  localReset.mutate(parsed.data);
                  return;
                }
                const parsed = resetPasswordSchema.safeParse({ token: "supabase-recovery-session", password });
                if (!parsed.success) {
                  setError(parsed.error.issues[0]?.message ?? "Please check the password requirements.");
                  return;
                }
                supabaseReset.mutate(parsed.data.password);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="10+ chars, mixed case, a number"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && <FormError message={error} />}
              <Button type="submit" className="w-full" loading={pending}>
                <KeyRound /> Update password
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ContentPageSkeleton dense />}>
      <ResetPasswordInner />
    </Suspense>
  );
}
