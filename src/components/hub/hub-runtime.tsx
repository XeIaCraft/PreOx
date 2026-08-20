"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { logPagePerformance } from "@/app/actions/performance";

/**
 * Small pieces of hub-wide runtime plumbing that don't need their own
 * visible UI:
 * - Registers the service worker unconditionally (PWA installability +
 *   offline shell fallback — see public/sw.js), not just when a user opts
 *   into push notifications.
 * - Prefetches the routes for the user's pinned/most-recent modules, so
 *   opening them from the grid feels instant instead of triggering a fresh
 *   navigation fetch.
 * - Samples real perceived load time (Navigation Timing API) per page,
 *   feeding the admin "Usage & santé" perceived-performance view.
 */
export function HubRuntime({ prefetchHrefs }: { prefetchHrefs: string[] }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    for (const href of prefetchHrefs) router.prefetch(href);
  }, [prefetchHrefs, router]);

  useEffect(() => {
    const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (entry) void logPagePerformance(pathname, entry.loadEventEnd - entry.startTime);
    // Only the initial document navigation is measurable this way — client-side
    // route changes inside the app don't produce a new PerformanceNavigationTiming
    // entry, so this intentionally samples first-load only, not every pathname visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
