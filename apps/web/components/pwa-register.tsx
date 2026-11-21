"use client";

import { useEffect } from "react";

/**
 * Registers the service worker after load (never blocks the browser's native
 * PWA launch). Also surfaces installability via a custom event the UI can
 * subscribe to.
 */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "SW_OFFLINE_FALLBACK") {
        window.dispatchEvent(new CustomEvent("turf:offline"));
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          reg.addEventListener("updatefound", () => window.dispatchEvent(new CustomEvent("turf:sw-updating")));
        })
        .catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
  return null;
}
