"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { onNavigationStart } from "@/lib/navigation-events";
import { cn } from "@/lib/utils";

/**
 * Top progress bar for App Router navigations.
 *
 * Next soft-nav keeps the previous page painted until the next segment is
 * ready, which feels like a hang with no feedback. We start the bar on
 * same-origin link clicks / form navigations and finish when the URL settles.
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

  const clearTimers = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (hideRef.current) clearTimeout(hideRef.current);
    tickRef.current = null;
    hideRef.current = null;
  }, []);

  const finish = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    clearTimers();
    setValue(100);
    hideRef.current = setTimeout(() => {
      setVisible(false);
      setValue(0);
    }, 220);
  }, [clearTimers]);

  const start = useCallback(() => {
    if (activeRef.current) return;
    activeRef.current = true;
    clearTimers();
    setVisible(true);
    setValue(12);
    tickRef.current = setInterval(() => {
      setValue((current) => {
        if (current >= 92) return current;
        const step = current < 40 ? 10 : current < 70 ? 4 : 1.5;
        return Math.min(92, current + step);
      });
    }, 180);
  }, [clearTimers]);

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
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return true;
        if (`${url.pathname}${url.search}` === `${window.location.pathname}${window.location.search}`) {
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
