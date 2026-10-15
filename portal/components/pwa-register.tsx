"use client";

import { useEffect } from "react";

let registered = false;

export function PwaRegister() {
  useEffect(() => {
    if (registered) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    registered = true;

    let activeReg: ServiceWorkerRegistration | null = null;

    const registerSw = async () => {
      try {
        activeReg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
      } catch {
        // Service worker registration can fail in restricted browsing contexts;
        // ordinary portal operation continues unaffected.
      }
    };

    if (document.readyState === "complete") {
      void registerSw();
    } else {
      window.addEventListener("load", () => void registerSw(), { once: true });
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && activeReg) {
        activeReg.update().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
