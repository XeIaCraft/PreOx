"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchLibrary, type SearchResult } from "@/app/apps/el-profesor/actions/search";

export function LibrarySearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const found = await searchLibrary(value);
        setResults(found);
      });
    }, 250);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher une notion, un médicament, une pathologie…"
          className="pl-9 pr-9"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-subtle hover:text-foreground"
            aria-label="Effacer la recherche"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1.5 w-full max-h-80 overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-surface shadow-lg">
          {isPending && <p className="px-4 py-3 text-sm text-foreground-subtle">Recherche…</p>}
          {!isPending && results.length === 0 && <p className="px-4 py-3 text-sm text-foreground-subtle">Aucun résultat.</p>}
          {!isPending &&
            results.map((r) => (
              <Link
                key={r.subEntityId}
                href={`/apps/el-profesor/chapters/${r.chapterId}?entity=${r.subEntityId}`}
                onClick={() => setOpen(false)}
                className="block border-b border-border px-4 py-2.5 last:border-0 hover:bg-surface-muted"
              >
                <p className="text-sm font-medium text-foreground">{r.subEntityName}</p>
                <p className="text-xs text-foreground-subtle">
                  {r.bookTitle} — {r.chapterTitle}
                </p>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
