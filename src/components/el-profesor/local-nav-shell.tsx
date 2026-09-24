"use client";

// The local navigation shell (piste 2026-09-24 — "module 100% local"):
// mounted once in layout.tsx, this is what makes dashboard/book/chapter/
// review transitions genuinely instant once the library is synced — not
// just "renders fast once the page arrives" (the existing *WithLocalCache
// components already did that) but "never asks the server for a new page
// at all". Every El Profesor navigation otherwise pays ~6 sequential
// Supabase round trips (auth, MFA, profile, app access, admin/preview
// check) before Next.js can even start streaming HTML — unavoidable for a
// dynamic, cookie-gated route (see Next's own docs: dynamic routes get no
// prefetching benefit). Bypassing Next's router entirely for these four
// screens via window.history.pushState (a pattern Next's docs explicitly
// document and support — pushState/replaceState integrate with
// usePathname/useSearchParams) means that cost is paid once per session
// instead of once per click.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { matchLocalRoute, localViewKey, type LocalView } from "@/lib/el-profesor/local-nav-routes";
import { getCachedDashboard } from "@/lib/el-profesor/local-db";
import { getLastChapter } from "@/lib/el-profesor/local-prefs";
import { DashboardWithLocalCache } from "@/components/el-profesor/dashboard-with-local-cache";
import { BookTocWithLocalCache } from "@/components/el-profesor/book-toc-with-local-cache";
import { ChapterViewWithLocalCache } from "@/components/el-profesor/chapter-view-with-local-cache";
import { ReviewQueueWithLocalCache } from "@/components/el-profesor/review-queue-with-local-cache";
import { ToastProvider } from "@/components/ui/toast";

interface LocalNavContextValue {
  navigateLocally: (href: string) => void;
}

const LocalNavContext = createContext<LocalNavContextValue | null>(null);

/** Used by LocalNavLink to attempt a local (server-round-trip-free) navigation instead of a normal Next.js one. Returns null outside of LocalNavShell — callers should fall back to plain <Link> behavior in that case. */
export function useLocalNav(): LocalNavContextValue | null {
  return useContext(LocalNavContext);
}

export function LocalNavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  // Only engages after an actual local navigation (see navigateLocally
  // below) — never on the very first render of a genuinely fresh page load
  // or a hard reload (piste 2026-09-24 — suite au retour "je dois
  // synchroniser pour que mes changements s'affichent"). A hard load has
  // ALREADY paid the full server round trip to produce that HTML by the
  // time this hydrates, so there's no speed to gain by discarding it — and
  // discarding it was actively wrong: matching on pathname alone meant
  // *every* load of a covered route replaced the fresh, correctly-computed
  // server render (e.g. right after a Server Action that just changed
  // something — a role/preview toggle, any admin mutation not yet
  // converted to update its own local cache) with a stale IndexedDB
  // snapshot from whenever "Synchroniser" last ran, making genuinely
  // successful changes look like they'd silently failed until the next
  // manual sync. The shell's actual speed benefit — skipping the server
  // round trip — only applies to navigation that happens after the page is
  // already loaded, which is exactly what navigateLocally's pushState
  // covers; gating on it costs nothing.
  const [hasNavigatedLocally, setHasNavigatedLocally] = useState(false);
  // Derived purely from the URL once engaged — Next's router hooks pick up
  // window.history.pushState/replaceState calls (documented and supported,
  // see the file's top comment), so this recomputes on its own after
  // navigateLocally below, exactly like it does after a real navigation or
  // the browser's back/forward buttons.
  const view = useMemo(() => (hasNavigatedLocally ? matchLocalRoute(pathname, searchParams) : null), [hasNavigatedLocally, pathname, searchParams]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname, searchParams]);

  const navigateLocally = useCallback((href: string) => {
    history.pushState(null, "", href);
    setHasNavigatedLocally(true);
  }, []);

  const currentHref = `${pathname}${searchParams.size > 0 ? `?${searchParams}` : ""}`;
  const bail = useCallback(() => router.push(currentHref), [router, currentHref]);

  return (
    <LocalNavContext.Provider value={{ navigateLocally }}>
      {view?.kind === "dashboard" && (
        <ToastProvider>
          <ShellDashboard onCacheMiss={bail} />
        </ToastProvider>
      )}
      {view?.kind === "book" && (
        <ToastProvider>
          <BookTocWithLocalCache key={localViewKey(view)} bookId={view.bookId} tocPromise={null} onCacheMiss={bail} />
        </ToastProvider>
      )}
      {view?.kind === "chapter" && (
        <ShellChapter key={localViewKey(view)} view={view} onCacheMiss={bail} />
      )}
      {view?.kind === "review" && (
        <ToastProvider>
          <ReviewQueueWithLocalCache
            key={localViewKey(view)}
            chapterId={view.chapterId}
            source={view.source}
            limit={view.limit}
            all={view.all}
            queuePromise={null}
            onCacheMiss={bail}
          />
        </ToastProvider>
      )}
      {!view && children}
    </LocalNavContext.Provider>
  );
}

/**
 * Learns isAdmin/preview status from the cached dashboard snapshot instead
 * of a fresh server check — see DashboardSnapshot.effectiveIsAdmin's doc
 * comment for why a brief staleness window here is harmless. No cache at
 * all yet means this can't be rendered locally — bail immediately.
 */
type ShellDashboardReady = {
  isAdmin: boolean;
  realIsAdmin: boolean;
  previewingAsUser: boolean;
};

function ShellDashboard({ onCacheMiss }: { onCacheMiss: () => void }) {
  const [ready, setReady] = useState<ShellDashboardReady | "miss" | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCachedDashboard().then((cached) => {
      if (cancelled) return;
      if (!cached) {
        setReady("miss");
        return;
      }
      setReady({
        isAdmin: cached.effectiveIsAdmin,
        realIsAdmin: cached.realIsAdmin,
        previewingAsUser: cached.previewingAsUser,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (ready === "miss") onCacheMiss();
  }, [ready, onCacheMiss]);

  if (!ready || ready === "miss") return null;

  return (
    <DashboardWithLocalCache
      initialSnapshotPromise={null}
      isAdmin={ready.isAdmin}
      realIsAdmin={ready.realIsAdmin}
      previewingAsUser={ready.previewingAsUser}
      serverResumeChapterId={getLastChapter()}
      onCacheMiss={onCacheMiss}
    />
  );
}

function ShellChapter({ view, onCacheMiss }: { view: Extract<LocalView, { kind: "chapter" }>; onCacheMiss: () => void }) {
  const [isAdmin, setIsAdmin] = useState<boolean | "miss" | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCachedDashboard().then((cached) => {
      if (cancelled) return;
      setIsAdmin(cached ? cached.effectiveIsAdmin : "miss");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isAdmin === "miss") onCacheMiss();
  }, [isAdmin, onCacheMiss]);

  if (isAdmin === null || isAdmin === "miss") return null;

  return (
    <ToastProvider>
      <ChapterViewWithLocalCache
        chapterId={view.chapterId}
        initialEntityId={view.entityId}
        isAdmin={isAdmin}
        contentPromise={null}
        onCacheMiss={onCacheMiss}
      />
    </ToastProvider>
  );
}
