"use client";

import type { LucideIcon } from "lucide-react";
import { motion } from "@/motion";
import { cn } from "@/lib/utils";

/**
 * Platform-benefit card. Deliberately plain document flow — the parent grid
 * controls layout (1 col mobile / 2 tablet / 3 desktop); no negative margins,
 * no absolute positioning, no fixed heights.
 */
export function FeatureCard({
  icon: Icon, title, description, className,
}: {
  icon: LucideIcon; title: string; description: string; className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className={cn(
        "rounded-2xl border bg-card p-6 shadow-card transition-shadow duration-200 hover:shadow-raise",
        className,
      )}
    >
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
    </motion.div>
  );
}
