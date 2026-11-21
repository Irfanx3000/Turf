import Link from "next/link";
import { Building2, CalendarCheck, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="container max-w-3xl py-14">
      <h1 className="text-3xl font-bold tracking-tight">Built for the beautiful game — and every other one</h1>
      <p className="mt-4 leading-relaxed text-muted-foreground">
        Turf is a booking platform for sports venues: football turfs, box cricket, badminton courts and
        more. We started with one city and built the platform so it can grow to many. Venue owners get
        real tooling — slots, dynamic pricing, collections and analytics — and players get honest,
        instant bookings.
      </p>
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CalendarCheck className="h-4 w-4 text-primary" /> Instant, honest booking</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Slot locks are enforced in the database. When your booking confirms, the slot is yours —
            no overbooking, no &quot;someone else got there first&quot; phone calls.
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4 text-primary" /> Payment you can trust</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Online payments confirm only after the gateway&apos;s cryptographically verified webhook.
            Pay-at-venue bookings confirm immediately with payment tracked at the counter.
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Building2 className="h-4 w-4 text-primary" /> For venue owners</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            One organization, many locations, many turfs. Staff roles, pricing rules, blocks,
            no-show tracking and collections reporting — designed with venue operators.
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4 text-primary" /> Team access that&apos;s safe</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Manager and staff roles are enforced on every request, and every sensitive change is
            written to an audit log.
          </CardContent>
        </Card>
      </div>
      <div className="mt-10 flex gap-3">
        <Button asChild variant="brand"><Link href="/register-owner">List your turf</Link></Button>
        <Button asChild variant="outline"><Link href="/explore">Explore turfs</Link></Button>
      </div>
    </div>
  );
}
