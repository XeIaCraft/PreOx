"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { searchMyNotes, type NoteSearchResult } from "@/app/apps/el-profesor/actions/notes";

export function NotesSearchDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NoteSearchResult[] | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults(null);
      return;
    }
    startTransition(async () => {
      setResults(await searchMyNotes(value));
    });
  }

  return (
    <Modal title="Rechercher dans mes notes" onClose={onClose} size="md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
        <Input autoFocus value={query} onChange={(e) => handleChange(e.target.value)} placeholder="Chercher un mot dans mes notes…" className="pl-9" />
      </div>
      <div className="mt-4 space-y-2">
        {isPending && <p className="text-sm text-foreground-subtle">Recherche…</p>}
        {!isPending && results !== null && results.length === 0 && (
          <p className="text-sm text-foreground-subtle">Aucune note ne contient ce terme.</p>
        )}
        {!isPending &&
          results?.map((r) => (
            <Link
              key={r.subEntityId}
              href={`/apps/el-profesor/chapters/${r.chapterId}?entity=${r.subEntityId}`}
              onClick={onClose}
              className="block rounded-[var(--radius-sm)] border border-border p-3 hover:border-primary/40"
            >
              <p className="text-sm font-medium text-foreground">{r.subEntityName}</p>
              <p className="text-xs text-foreground-subtle">
                {r.bookTitle} — {r.chapterTitle}
              </p>
              <p className="mt-1 text-xs text-foreground-muted">{r.snippet}</p>
            </Link>
          ))}
      </div>
    </Modal>
  );
}
