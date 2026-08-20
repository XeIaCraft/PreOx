"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Search, X, GraduationCap, ChefHat } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchLibrary, type SearchResult } from "@/app/apps/el-profesor/actions/search";
import { searchMyRecipeTitles, type RecipeSearchResult } from "@/app/apps/a-table/actions/recipes";

interface UnifiedSearchProps {
  hasElProfesor: boolean;
  hasATable: boolean;
}

export function UnifiedSearch({ hasElProfesor, hasATable }: UnifiedSearchProps) {
  const [query, setQuery] = useState("");
  const [ficheResults, setFicheResults] = useState<SearchResult[]>([]);
  const [recipeResults, setRecipeResults] = useState<RecipeSearchResult[]>([]);
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

  if (!hasElProfesor && !hasATable) return null;

  function handleChange(value: string) {
    setQuery(value);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setFicheResults([]);
      setRecipeResults([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const [fiches, recipes] = await Promise.all([
          hasElProfesor ? searchLibrary(value) : Promise.resolve([]),
          hasATable ? searchMyRecipeTitles(value) : Promise.resolve([]),
        ]);
        setFicheResults(fiches);
        setRecipeResults(recipes);
      });
    }, 250);
  }

  const hasResults = ficheResults.length > 0 || recipeResults.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher dans vos modules…"
          className="pl-9 pr-9"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFicheResults([]);
              setRecipeResults([]);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground-subtle hover:text-foreground"
            aria-label="Effacer la recherche"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute z-20 mt-1.5 max-h-96 w-full overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-surface shadow-lg">
          {isPending && <p className="px-4 py-3 text-sm text-foreground-subtle">Recherche…</p>}
          {!isPending && !hasResults && <p className="px-4 py-3 text-sm text-foreground-subtle">Aucun résultat.</p>}
          {!isPending &&
            recipeResults.map((r) => (
              <Link
                key={`recipe-${r.id}`}
                href="/apps/a-table"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 border-b border-border px-4 py-2.5 last:border-0 hover:bg-surface-muted"
              >
                <ChefHat className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.title}</p>
                  <p className="text-xs text-foreground-subtle">À table — Mes recettes</p>
                </div>
              </Link>
            ))}
          {!isPending &&
            ficheResults.map((r) => (
              <Link
                key={`fiche-${r.subEntityId}`}
                href={`/apps/el-profesor/chapters/${r.chapterId}?entity=${r.subEntityId}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 border-b border-border px-4 py-2.5 last:border-0 hover:bg-surface-muted"
              >
                <GraduationCap className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{r.subEntityName}</p>
                  <p className="truncate text-xs text-foreground-subtle">
                    El Profesor — {r.bookTitle} · {r.chapterTitle}
                  </p>
                </div>
              </Link>
            ))}
        </div>
      )}
    </div>
  );
}
