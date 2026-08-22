"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import { MessageCircle, Plus, Send } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import {
  listSharedRecipes,
  copySharedRecipeToLibrary,
  listRecipeComments,
  addRecipeComment,
} from "@/app/apps/a-table/actions/sharing";
import { useToast } from "@/components/ui/toast";
import type { Recipe, RecipeComment } from "@/lib/a-table/types";

/** Hub-wide recipe directory (items 24/25/29) — recipes other members opted to share, browsable and copyable, with anonymous comments. */
export function DiscoverDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [recipes, setRecipes] = useState<Recipe[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, RecipeComment[]>>({});
  const [draft, setDraft] = useState("");

  useEffect(() => {
    listSharedRecipes().then(setRecipes);
  }, []);

  function handleCopy(recipeId: string) {
    startTransition(async () => {
      const result = await copySharedRecipeToLibrary(recipeId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onSaved();
      }
    });
  }

  function handleExpand(recipeId: string) {
    if (expanded === recipeId) {
      setExpanded(null);
      return;
    }
    setExpanded(recipeId);
    setDraft("");
    if (!comments[recipeId]) {
      listRecipeComments(recipeId).then((list) => setComments((prev) => ({ ...prev, [recipeId]: list })));
    }
  }

  function handleAddComment(recipeId: string) {
    if (!draft.trim()) return;
    startTransition(async () => {
      const result = await addRecipeComment(recipeId, draft);
      if (result.error) {
        toast(result.error, { variant: "error" });
        return;
      }
      setDraft("");
      listRecipeComments(recipeId).then((list) => setComments((prev) => ({ ...prev, [recipeId]: list })));
    });
  }

  return (
    <Modal title="Découvrir" description="Recettes partagées par les autres utilisateurs du hub." onClose={onClose} size="lg">
      {recipes === null ? (
        <p className="py-8 text-center text-sm text-foreground-subtle">Chargement…</p>
      ) : recipes.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground-subtle">Personne n&rsquo;a encore partagé de recette.</p>
      ) : (
        <ul className="space-y-3">
          {recipes.map((recipe) => (
            <li key={recipe.id} className="overflow-hidden rounded-[var(--radius-md)] border border-border">
              <div className="flex items-center gap-3 p-3">
                {recipe.image_url && (
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[var(--radius-sm)]">
                    <Image src={recipe.image_url} alt={recipe.title} fill sizes="56px" className="object-cover" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{recipe.title}</p>
                  <p className="text-xs text-foreground-subtle">
                    {recipe.servings} pers.{recipe.cooking_minutes != null ? ` · ${recipe.cooking_minutes} min` : ""}
                  </p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => handleCopy(recipe.id)} disabled={isPending}>
                  <Plus className="h-3.5 w-3.5" /> Copier
                </Button>
                <button
                  type="button"
                  onClick={() => handleExpand(recipe.id)}
                  className="rounded p-1.5 text-foreground-subtle hover:bg-surface-muted"
                  title="Commentaires"
                >
                  <MessageCircle className="h-4 w-4" />
                </button>
              </div>

              {expanded === recipe.id && (
                <div className="border-t border-border bg-surface-muted/40 p-3">
                  {(comments[recipe.id]?.length ?? 0) === 0 ? (
                    <p className="text-xs text-foreground-subtle">Aucun commentaire pour l&rsquo;instant.</p>
                  ) : (
                    <ul className="mb-2 space-y-1.5">
                      {comments[recipe.id].map((c) => (
                        <li key={c.id} className="text-sm text-foreground-muted">
                          <span className="text-xs font-medium text-foreground-subtle">{c.isMine ? "Vous" : "Un membre du hub"} — </span>
                          {c.body}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Ajouter un commentaire…"
                      className="flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-2.5 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAddComment(recipe.id);
                      }}
                    />
                    <Button size="sm" onClick={() => handleAddComment(recipe.id)} disabled={isPending || !draft.trim()}>
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
