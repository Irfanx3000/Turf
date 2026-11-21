"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface HealthResponse {
  status: string;
  checks: Record<string, string>;
  notes?: string;
}

export default function AdminSettingsPage() {
  const health = useQuery({ queryKey: ["health"], queryFn: () => api.get<HealthResponse>("/health") });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Platform configuration</CardTitle>
          <CardDescription>Live adapter status reported by the API&apos;s health check.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {health.isLoading && <Skeleton className="h-24" />}
          {health.data && (
            <>
              <div className="flex flex-wrap gap-2">
                {Object.entries(health.data.checks).map(([k, v]) => (
                  <Badge key={k} variant={v === "down" ? "destructive" : v.includes("mock") || v.includes("dev") ? "warning" : "success"}>
                    {k}: {v}
                  </Badge>
                ))}
              </div>
              {health.data.notes && <p className="text-xs text-muted-foreground">{health.data.notes}</p>}
              <p className="text-xs text-muted-foreground">
                Adapters switch to production providers when their credentials are present in the
                API environment. Configuration is environment-driven; there are no runtime secrets
                in the browser.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
