"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { onNavigationStart } from "@/lib/navigation-events";
import { cn } from "@/lib/utils";

/** Hard cap — never leave the bar stuck if the URL never settles. */
const SAFETY_MS = 6_000;
const HIDE_MS = 220;

/**
 * Top progress bar for App Router navigations.
 *
 * Next soft-nav keeps the previous page painted until the next segment is
 * ready, which feels like a hang with no feedback. We start the bar on
 * same-origin link clicks / form navigations and finish when the URL settles.
 * A safety timer always clears the bar even if navigation is cancelled or
 * the destination matches the current URL.
 */
function NavigationProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const url = `${pathname}?${searchParams.toString()}`;
  const [visible, setVisible] = useState(false);
  const [value, setValue] = useState(0);
  const activeRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (hideRef.current) clearTimeout(hideRef.current);
    if (safetyRef.current) clearTimeout(safetyRef.current);
    tickRef.current = null;
    hideRef.current = null;
    safetyRef.current = null;
  }, []);

  const finish = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    clearTimers();
    setValue(100);
    hideRef.current = setTimeout(() => {
      setVisible(false);
      setValue(0);
    }, HIDE_MS);
  }, [clearTimers]);

  const start = useCallback(() => {
    // Allow re-start while active so a second click resets the safety timer
    // instead of leaving a stuck bar from a cancelled first navigation.
    clearTimers();
    activeRef.current = true;
    setVisible(true);
    setValue(12);
    tickRef.current = setInterval(() => {
      setValue((current) => {
        if (current >= 92) return current;
        const step = current < 40 ? 10 : current < 70 ? 4 : 1.5;
        return Math.min(92, current + step);
      });
    }, 180);

    // Soft-nav finishes via the URL effect; this guarantees we never stick at 92%
    // when navigation is cancelled or the destination matches the current URL.
    safetyRef.current = setTimeout(() => {
      if (activeRef.current) finish();
    }, SAFETY_MS);
  }, [clearTimers, finish]);

  useEffect(() => {
    finish();
  }, [url, finish]);

  useEffect(() => {
    const shouldIgnore = (anchor: HTMLAnchorElement) => {
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return true;
      if (anchor.target && anchor.target !== "_self") return true;
      if (anchor.hasAttribute("download")) return true;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return true;
      try {
        const next = new URL(href, window.location.href);
        if (next.origin !== window.location.origin) return true;
        if (`${next.pathname}${next.search}` === `${window.location.pathname}${window.location.search}`) {
          return true;
        }
      } catch {
        return true;
      }
      return false;
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || shouldIgnore(anchor)) return;
      start();
    };

    const onPopState = () => start();
    const unsubscribe = onNavigationStart(start);

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
      unsubscribe();
      clearTimers();
      activeRef.current = false;
    };
  }, [start, clearTimers]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 overflow-hidden"
      aria-hidden={!visible}
      role="presentation"
    >
      <div
        className={cn(
          "h-full origin-left bg-primary shadow-[0_0_8px_hsl(var(--primary)/0.45)] transition-[width,opacity] duration-200 ease-out",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <NavigationProgressInner />
    </Suspense>
  );
}
