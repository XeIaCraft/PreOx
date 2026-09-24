"use client";

import { useEffect, useState } from "react";
import { CaseJournalView } from "@/components/el-profesor/case-journal-view";
import { getCachedCaseJournal } from "@/lib/el-profesor/local-db";
import { applyLocalAddCaseJournalEntry, applyLocalUpdateCaseJournalEntry, applyLocalDeleteCaseJournalEntry } from "@/lib/el-profesor/local-case-journal";
import type { CaseJournalSnapshot } from "@/lib/el-profesor/dashboard-types";

function JournalSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-8" aria-hidden="true">
      <div className="h-8 w-48 animate-pulse rounded-[var(--radius-md)] bg-surface-muted/60" />
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 animate-pulse rounded-[var(--radius-md)] bg-surface-muted/60" />
      ))}
    </div>
  );
}

/**
 * Same seam as DashboardWithLocalCache, for the case journal (piste
 * 2026-09-24 — "module 100% local", extension aux autres écrans):
 * cache-first render, falling back to the server's live promise only when
 * there's nothing cached yet. Unlike the read-only notions screens, this
 * also owns the local-first write path — entries/notions live in this
 * component's own state (not just page.tsx's props) so add/update/delete
 * can apply instantly, offline, without waiting on revalidatePath (which
 * only ever fires once the queued write actually reaches the server).
 */
export function CaseJournalWithLocalCache({
  initialDataPromise,
  filterNotionId,
}: {
  initialDataPromise: Promise<CaseJournalSnapshot>;
  filterNotionId: string | null;
}) {
  const [data, setData] = useState<CaseJournalSnapshot | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCachedCaseJournal().then((cached) => {
      if (cancelled) return;
      if (cached) {
        setData(cached);
        return;
      }
      initialDataPromise.then(
        (live) => {
          if (!cancelled) setData(live);
        },
        () => {
          if (!cancelled) setLoadError(true);
        }
      );
    });
    return () => {
      cancelled = true;
    };
    // Mount-only — a local write updates state directly via the handlers
    // below, no need to re-check the cache reactively.
  }, [initialDataPromise]);

  if (loadError) {
    return <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-danger">Impossible de charger le journal de cas — vérifiez votre connexion.</p>;
  }
  if (!data) return <JournalSkeleton />;

  function handleAdd(title: string, body: string, notionId: string | null) {
    const current = data!;
    const id = crypto.randomUUID();
    applyLocalAddCaseJournalEntry(current.entries, current.notions, id, title, body, notionId).then((entries) => {
      setData((d) => (d ? { ...d, entries } : d));
    });
  }

  function handleUpdate(id: string, title: string, body: string, notionId: string | null) {
    const current = data!;
    applyLocalUpdateCaseJournalEntry(current.entries, current.notions, id, title, body, notionId).then((entries) => {
      setData((d) => (d ? { ...d, entries } : d));
    });
  }

  function handleDelete(id: string) {
    const current = data!;
    applyLocalDeleteCaseJournalEntry(current.entries, current.notions, id).then((entries) => {
      setData((d) => (d ? { ...d, entries } : d));
    });
  }

  return (
    <CaseJournalView
      entries={data.entries}
      notions={data.notions}
      filterNotionId={filterNotionId}
      onAdd={handleAdd}
      onUpdate={handleUpdate}
      onDelete={handleDelete}
    />
  );
}
