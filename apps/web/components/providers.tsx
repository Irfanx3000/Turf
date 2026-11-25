"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Most screens are small reads; keep them fresh in memory so soft
            // navigations paint from cache instead of waiting on another proxy hop.
            staleTime: 5 * 60_000,
            gcTime: 30 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
        <Toaster richColors position="top-center" closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
