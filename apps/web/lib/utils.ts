import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** ₹ formatting from integer paise — the only money formatter in the app. */
export function formatMoney(amountMinor: number, options?: { compact?: boolean }): string {
  const rupees = amountMinor / 100;
  if (options?.compact && rupees >= 100000) return `₹${(rupees / 100000).toFixed(1)}L`;
  if (options?.compact && rupees >= 1000) return `₹${(rupees / 1000).toFixed(1)}k`;
  return new Intl.NumberFormat("en-IN", {
    style: "currency", currency: "INR", maximumFractionDigits: rupees % 1 === 0 ? 0 : 2,
  }).format(rupees);
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDistance(meters: number | null): string {
  if (meters === null) return "";
  if (meters < 950) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function todayYmd(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + (5 * 60 + 30) * 60000);
  return ist.toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayLabel(ymd: string): { weekday: string; day: string; month: string } {
  const d = new Date(`${ymd}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }),
    day: d.toLocaleDateString("en-IN", { day: "numeric", timeZone: "UTC" }),
    month: d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" }),
  };
}
