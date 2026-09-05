"use client";

import { useEffect } from "react";
import { shouldRegisterServiceWorker } from "@/lib/pwa/register";

/**
 * Registers the service worker once, on the client, after hydration.
 *
 * Why a component that renders null instead of an inline <script>: registration
 * has to happen in the browser and only under conditions the server cannot know,
 * and a null-rendering client island is the App Router's idiom for exactly that.
 * It adds no DOM, so it cannot affect layout or a hydration diff.
 *
 * The empty dependency array is the point: registering twice on a re-render
 * would be harmless but pointless, and the browser already de-duplicates.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!shouldRegisterServiceWorker(process.env.NODE_ENV, "serviceWorker" in navigator)) return;
    // Scope defaults to the script's directory, so a worker at the ORIGIN ROOT
    // is what gives it scope "/" — this is why sw.js lives in public/ and not
    // under a subfolder.
    void navigator.serviceWorker.register("/sw.js");
  }, []);

  return null;
}
