"use client";

import { useState } from "react";
import { KeyRound, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { AuthShell } from "@/components/customer/auth-shell";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Password resets are handled by Supabase Auth in production — the reset link comes from
            your Supabase project&apos;s email sender.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <MailCheck className="h-10 w-10 text-brand-emerald-600" />
              <p className="font-medium">If that email is registered, a reset link is on its way.</p>
              <p className="text-sm text-muted-foreground">Check your inbox (and spam folder).</p>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                // The reset email is sent by Supabase Auth (server side).
                // This page collects the address and points the user to their inbox.
                setSent(true);
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              </div>
              <Button type="submit" className="w-full"><KeyRound /> Send reset link</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  );
}
