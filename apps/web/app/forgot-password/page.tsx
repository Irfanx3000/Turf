"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api-client";
import { forgotPasswordSchema } from "@turf/validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/ui/form-error";
import { Input, Label } from "@/components/ui/input";
import { AuthShell } from "@/components/customer/auth-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const requestReset = useMutation({
    mutationFn: (input: { email: string }) =>
      api.post<{ ok: true; message: string }>("/auth/forgot-password", input),
    onSuccess: (result) => {
      setError(null);
      setSent(true);
      toast.success("Check your inbox", { description: result.message });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiClientError
          ? err.message
          : "We're having trouble sending a reset email. Please try again shortly.";
      setError(message);
      toast.error("Could not send reset email", { description: message });
    },
  });

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            We&apos;ll email you a one-time link via Supabase Auth. The link opens this app so you can
            choose a new password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <MailCheck className="h-10 w-10 text-brand-emerald-600" />
              <p className="font-medium">If that email is registered, a reset link is on its way.</p>
              <p className="text-sm text-muted-foreground">
                Check your inbox (and spam). Links expire after about an hour.
              </p>
              <Button asChild variant="outline" className="mt-2">
                <Link href="/login">Back to sign in</Link>
              </Button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                const parsed = forgotPasswordSchema.safeParse({ email: email.trim() });
                if (!parsed.success) {
                  setError(parsed.error.issues[0]?.message ?? "Enter a valid email.");
                  return;
                }
                requestReset.mutate(parsed.data);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              {error && <FormError message={error} />}
              <Button type="submit" className="w-full" loading={requestReset.isPending}>
                <KeyRound /> Send reset link
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                Remembered it?{" "}
                <Link href="/login" className="font-medium text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
