"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { useTenantId } from "@/lib/use-tenant";
import { addDaysYmd, todayYmd } from "@/lib/utils";

interface TenantTurf { id: string; name: string; status: string }
interface SlotTemplate {
  id: string; name: string; daysOfWeek: string[]; startTime: string; endTime: string;
  slotDurationMinutes: number; priceMinor: number; effectiveFrom: string;
}

export default function TenantSlotsPage() {
  const tenantId = useTenantId();
  const qc = useQueryClient();
  const turfs = useQuery({
    queryKey: ["tenant", "turfs", tenantId],
    queryFn: () => api.get<TenantTurf[]>(`/tenants/${tenantId}/turfs`),
    enabled: Boolean(tenantId),
  });

  const [turfId, setTurfId] = useState<string>("");
  const activeTurf = turfId || turfs.data?.[0]?.id || "";

  const templates = useQuery({
    queryKey: ["tenant", "templates", activeTurf],
    queryFn: () => api.get<SlotTemplate[]>(`/tenants/${tenantId}/turfs/${activeTurf}/slot-templates`),
    enabled: Boolean(tenantId && activeTurf),
  });

  const [form, setForm] = useState({
    name: "Standard hourly", startTime: "06:00", endTime: "23:30",
    slotDurationMinutes: "60", priceRupees: "1200",
  });
  const [range, setRange] = useState({ from: todayYmd(), to: addDaysYmd(todayYmd(), 7) });

  const createTemplate = useMutation({
    mutationFn: () => api.post(`/tenants/${tenantId}/turfs/${activeTurf}/slot-templates`, {
      name: form.name,
      daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      startTime: form.startTime,
      endTime: form.endTime,
      slotDurationMinutes: Number(form.slotDurationMinutes),
      priceMinor: Math.round(Number(form.priceRupees) * 100),
      effectiveFrom: todayYmd(),
    }),
    onSuccess: () => {
      toast.success("Template created");
      qc.invalidateQueries({ queryKey: ["tenant", "templates"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed"),
  });

  const generate = useMutation({
    mutationFn: () => api.post<{ created: number; skipped: number }>(`/tenants/${tenantId}/turfs/${activeTurf}/slots/generate`, range),
    onSuccess: (result) => {
      toast.success(`Generated ${result.created} slots (${result.skipped} already existed)`);
    },
    onError: (err: Error) => toast.error(err.message || "Generation failed"),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api.delete(`/tenants/${tenantId}/turfs/${activeTurf}/slot-templates/${id}`),
    onSuccess: () => {
      toast.success("Template removed");
      qc.invalidateQueries({ queryKey: ["tenant", "templates"] });
    },
  });

  if (!tenantId) return <Skeleton className="h-64" />;
  if (turfs.isLoading) return <Skeleton className="h-64" />;
  if (turfs.data?.length === 0) {
    return <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="Create a turf first" description="Slots belong to a turf — add one under Turfs." />;
  }

  return (
    <div className="space-y-6">
      {/* Turf selector */}
      <div className="flex flex-wrap gap-2">
        {turfs.data?.map((t) => (
          <Button key={t.id} size="sm" variant={activeTurf === t.id ? "default" : "outline"} onClick={() => setTurfId(t.id)}>
            {t.name}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Template creation */}
        <Card>
          <CardHeader><CardTitle className="text-base">Slot template</CardTitle></CardHeader>
          <CardContent>
            <form
              className="grid grid-cols-2 gap-3"
              onSubmit={(e) => { e.preventDefault(); createTemplate.mutate(); }}
            >
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="tpl-name">Name</Label>
                <Input id="tpl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-start">Opens</Label>
                <Input id="tpl-start" type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-end">Closes</Label>
                <Input id="tpl-end" type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-dur">Slot minutes</Label>
                <select
                  id="tpl-dur"
                  className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm"
                  value={form.slotDurationMinutes}
                  onChange={(e) => setForm({ ...form, slotDurationMinutes: e.target.value })}
                >
                  {["30", "45", "60", "90", "120"].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-price">Price (₹/slot)</Label>
                <Input id="tpl-price" type="number" min={1} value={form.priceRupees} onChange={(e) => setForm({ ...form, priceRupees: e.target.value })} />
              </div>
              <Button type="submit" className="col-span-2" loading={createTemplate.isPending}>
                <Plus /> Create daily template
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Generation */}
        <Card>
          <CardHeader><CardTitle className="text-base">Generate slots</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Materializes slot rows from templates. Idempotent — existing or booked slots are skipped.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="gen-from">From</Label>
                <Input id="gen-from" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gen-to">To</Label>
                <Input id="gen-to" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
              </div>
            </div>
            <Button className="w-full" loading={generate.isPending} onClick={() => generate.mutate()}>
              <CalendarClock /> Generate for range
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Templates list */}
      <Card>
        <CardHeader><CardTitle className="text-base">Templates</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {templates.isLoading && <Skeleton className="h-16" />}
          {templates.isError && <ErrorState onRetry={() => templates.refetch()} />}
          {templates.data && templates.data.length === 0 && <p className="text-sm text-muted-foreground">No templates yet.</p>}
          {templates.data?.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.startTime}–{t.endTime} · {t.slotDurationMinutes}min · ₹{(t.priceMinor / 100).toFixed(0)} · from {t.effectiveFrom}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{t.daysOfWeek.length} days</Badge>
                <Button size="icon" variant="ghost" aria-label="Delete template" onClick={() => deleteTemplate.mutate(t.id)}>
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
