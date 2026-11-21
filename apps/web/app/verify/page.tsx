import { MailCheck } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthShell } from "@/components/customer/auth-shell";

export const metadata = { title: "Verify your email" };

export default function VerifyPage() {
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Verify your email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-brand-emerald-600" />
          <p className="text-sm text-muted-foreground">
            We sent a verification link. Click it, then sign in. In local development with the dev
            auth adapter, accounts are active immediately.
          </p>
          <Button asChild variant="brand"><Link href="/login">Go to sign in</Link></Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
