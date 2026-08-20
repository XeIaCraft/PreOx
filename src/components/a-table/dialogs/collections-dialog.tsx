"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCollection,
  renameCollection,
  deleteCollection,
  toggleRecipeInCollection,
} from "@/app/apps/a-table/actions/collections";
import { useToast } from "@/components/ui/toast";
import type { Recipe, RecipeCollection } from "@/lib/a-table/types";

interface CollectionsDialogProps {
  collections: RecipeCollection[];
  recipes: Recipe[];
  onClose: () => void;
  onSaved: () => void;
}

export function CollectionsDialog({ collections, recipes, onClose, onSaved }: CollectionsDialogProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [newName, setNewName] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await createCollection(name);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        setNewName("");
        onSaved();
      }
    });
  }

  function handleRename(collectionId: string) {
    const name = renameValue.trim();
    if (!name) return;
    startTransition(async () => {
      const result = await renameCollection(collectionId, name);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        setRenamingId(null);
        onSaved();
      }
    });
  }

  function handleDelete(collectionId: string) {
    startTransition(async () => {
      const result = await deleteCollection(collectionId);
      if (result.error) toast(result.error, { variant: "error" });
      else onSaved();
    });
  }

  function handleToggleRecipe(collectionId: string, recipeId: string) {
    startTransition(async () => {
      const result = await toggleRecipeInCollection(collectionId, recipeId);
      if (result.error) toast(result.error, { variant: "error" });
      else onSaved();
    });
  }

  return (
    <Modal title="Collections" description="Regroupez vos recettes par thème, occasion ou envie." onClose={onClose} size="lg">
      <div className="mb-4 flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleCreate();
            }
          }}
          placeholder="Nouvelle collection (ex. Repas de fête)"
          className="flex-1"
        />
        <Button variant="secondary" onClick={handleCreate} disabled={isPending || !newName.trim()}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {collections.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground-subtle">Aucune collection pour l&rsquo;instant.</p>
      ) : (
        <ul className="divide-y divide-border">
          {collections.map((collection) => {
            const expanded = expandedId === collection.id;
            return (
              <li key={collection.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  {renamingId === collection.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        autoFocus
                        className="h-8"
                        onKeyDown={(e) => e.key === "Enter" && handleRename(collection.id)}
                      />
                      <Button size="sm" onClick={() => handleRename(collection.id)} disabled={isPending}>
                        OK
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : collection.id)}
                      className="flex flex-1 items-center gap-1.5 text-left text-sm font-medium text-foreground"
                    >
                      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {collection.name}
                      <span className="text-xs font-normal text-foreground-subtle">({collection.recipe_ids.length})</span>
                    </button>
                  )}
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingId(collection.id);
                        setRenameValue(collection.name);
                      }}
                      className="rounded p-1.5 text-foreground-subtle hover:bg-surface-muted"
                      title="Renommer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(collection.id)}
                      disabled={isPending}
                      className="rounded p-1.5 text-foreground-subtle hover:bg-danger-tint hover:text-danger"
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-2 ml-5 grid grid-cols-1 gap-1 sm:grid-cols-2">
                    {recipes.map((recipe) => (
                      <label key={recipe.id} className="flex items-center gap-2 text-sm text-foreground-muted">
                        <input
                          type="checkbox"
                          checked={collection.recipe_ids.includes(recipe.id)}
                          onChange={() => handleToggleRecipe(collection.id, recipe.id)}
                          disabled={isPending}
                          className="h-4 w-4 rounded border-border-strong text-primary focus-visible:ring-primary/30"
                        />
                        {recipe.title}
                      </label>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
