import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/components/layout/navbar";

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="container flex min-h-[75vh] flex-col items-center justify-center py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo /></div>
        {children}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          By continuing you agree to our <Link href="/about" className="underline">terms</Link>.
        </p>
      </div>
    </div>
  );
}
