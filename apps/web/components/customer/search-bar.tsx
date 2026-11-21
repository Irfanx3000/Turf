"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Prominent turf search. Plain GET form → /turfs (the browse page picks up
 * ?search= as its initial state). Works without JavaScript.
 */
export function SearchBar({ className, defaultValue = "" }: { className?: string; defaultValue?: string }) {
  return (
    <form
      action="/turfs"
      method="get"
      role="search"
      className={cn("flex w-full max-w-xl items-center gap-2", className)}
      onSubmit={() => {
        /* native GET submit — no JS needed */
      }}
    >
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          name="search"
          defaultValue={defaultValue}
          type="search"
          placeholder="Search turf, area or sport…"
          aria-label="Search turfs"
          className="h-12 rounded-xl pl-10 text-base shadow-card"
        />
      </div>
      <Button type="submit" size="lg" className="h-12 rounded-xl px-6">
        Search
      </Button>
    </form>
  );
}
