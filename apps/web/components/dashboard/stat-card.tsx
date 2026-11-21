"use client";

import type { ReactNode } from "react";
import { motion } from "@/motion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label, value, hint, icon, tone = "default",
}: {
  label: string; value: string; hint?: string; icon?: ReactNode; tone?: "default" | "positive" | "warning" | "info";
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            {icon && <span className={cn("rounded-lg p-1.5", tone === "positive" && "bg-brand-emerald-500/12 text-brand-emerald-600", tone === "warning" && "bg-amber-500/12 text-amber-600", tone === "info" && "bg-sky-500/12 text-sky-600", tone === "default" && "bg-primary/10 text-primary")}>{icon}</span>}
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </CardContent>
      </Card>
    </motion.div>
  );
}
