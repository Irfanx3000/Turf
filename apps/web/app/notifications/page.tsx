"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { cn, relativeTime } from "@/lib/utils";

interface NotificationItem {
  id: string; kind: string; title: string; body: string;
  data: Record<string, unknown> | null; readAt: string | null; createdAt: string;
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ items: NotificationItem[]; unreadCount: number }>("/notifications/mine"),
    refetchInterval: 60_000,
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/read-all"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  return (
    <div className="container max-w-2xl py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-sm text-muted-foreground">{notifications.data?.unreadCount ?? 0} unread</p>
        </div>
        <Button size="sm" variant="outline" loading={markAll.isPending} onClick={() => markAll.mutate()}>
          <CheckCheck /> Mark all read
        </Button>
      </div>

      <div className="mt-5 space-y-2">
        {notifications.isLoading && [1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        {notifications.isError && <ErrorState onRetry={() => notifications.refetch()} />}
        {notifications.data && notifications.data.items.length === 0 && (
          <EmptyState icon={<Bell className="h-6 w-6" />} title="Nothing yet" description="Booking confirmations and reminders land here." />
        )}
        {notifications.data?.items.map((n) => (
          <Card key={n.id} className={cn(!n.readAt && "border-primary/40 bg-primary/[0.04]")}>
            <CardContent className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{n.title}</p>
                  {!n.readAt && <Badge className="px-1.5">new</Badge>}
                </div>
                <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">{relativeTime(n.createdAt)}</p>
              </div>
              {!n.readAt && (
                <Button size="sm" variant="ghost" onClick={() => markRead.mutate(n.id)} aria-label="Mark read">
                  <CheckCheck />
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
