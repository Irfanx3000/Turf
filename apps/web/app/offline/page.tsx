import { WifiOff } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "You're offline" };

export default function OfflinePage() {
  return (
    <div className="container flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary text-primary">
        <WifiOff className="h-8 w-8" />
      </div>
      <h1 className="text-2xl font-bold">You&apos;re offline</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        Browsing works from cache, but availability, booking and payment need a live connection —
        we never book or charge from cached data.
      </p>
      <Button className="mt-6" asChild variant="brand">
        <Link href="/">Try again</Link>
      </Button>
    </div>
  );
}
