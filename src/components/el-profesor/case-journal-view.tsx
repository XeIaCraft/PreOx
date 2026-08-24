"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Pencil, NotebookPen, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select, Label } from "@/components/ui/input";
import { addCaseJournalEntry, updateCaseJournalEntry, deleteCaseJournalEntry } from "@/app/apps/el-profesor/actions/case-journal";
import { useToast } from "@/components/ui/toast";
import type { CaseJournalEntryWithNotion } from "@/lib/el-profesor/dal";

const NO_NOTION = "__none__";

function EntryDialog({
  entry,
  notions,
  defaultNotionId,
  onClose,
  onSaved,
}: {
  entry?: CaseJournalEntryWithNotion;
  notions: { id: string; name: string }[];
  defaultNotionId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(entry?.title ?? "");
  const [body, setBody] = useState(entry?.body ?? "");
  const [notionId, setNotionId] = useState(entry?.notionId ?? defaultNotionId ?? NO_NOTION);

  function handleSave() {
    const resolvedNotionId = notionId === NO_NOTION ? null : notionId;
    startTransition(async () => {
      const result = entry
        ? await updateCaseJournalEntry(entry.id, title, body, resolvedNotionId)
        : await addCaseJournalEntry(title, body, resolvedNotionId);
      if (result.error) toast(result.error, { variant: "error" });
      else {
        toast(result.success ?? "", { variant: "success" });
        onSaved();
      }
    });
  }

  return (
    <Modal title={entry ? "Modifier ce cas" : "Nouveau cas"} onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="case-title">Titre</Label>
          <input
            id="case-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex. Décompensation cardiaque aux urgences, garde du 12/03"
            className="w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="case-notion">Notion liée (optionnel)</Label>
          <Select id="case-notion" value={notionId} onChange={(e) => setNotionId(e.target.value)}>
            <option value={NO_NOTION}>Aucune</option>
            {notions.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="case-body">Notes</Label>
          <textarea
            id="case-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            placeholder="Contexte, présentation clinique, ce que vous en retenez…"
            className="w-full rounded-[var(--radius-sm)] border border-border bg-surface p-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          />
        </div>
        <p className="text-xs text-foreground-subtle">
          Strictement privé — visible uniquement par vous, jamais par un administrateur ni utilisé pour générer du contenu.
        </p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleSave} disabled={isPending || !title.trim()}>
          {isPending ? "…" : "Enregistrer"}
        </Button>
      </div>
    </Modal>
  );
}

export function CaseJournalView({
  entries,
  notions,
  filterNotionId,
}: {
  entries: CaseJournalEntryWithNotion[];
  notions: { id: string; name: string }[];
  filterNotionId: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ mode: "new" } | { mode: "edit"; entry: CaseJournalEntryWithNotion } | null>(null);

  const visible = filterNotionId ? entries.filter((e) => e.notionId === filterNotionId) : entries;
  const filterNotionName = filterNotionId ? (notions.find((n) => n.id === filterNotionId)?.name ?? null) : null;

  function refresh() {
    setDialog(null);
    router.refresh();
  }

  function handleDelete(id: string) {
    if (!confirm("Supprimer ce cas de votre journal ?")) return;
    startTransition(async () => {
      const result = await deleteCaseJournalEntry(id);
      if (result.error) toast(result.error, { variant: "error" });
      else router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/apps/el-profesor" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à la bibliothèque
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif-display text-2xl font-medium text-foreground">Journal de cas</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {filterNotionName ? (
              <>
                Cas liés à « {filterNotionName} » —{" "}
                <Link href="/apps/el-profesor/journal" className="underline hover:text-foreground">
                  voir tout le journal
                </Link>
              </>
            ) : (
              "Vos cas cliniques rencontrés, reliés librement aux notions transversales — strictement privé."
            )}
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: "new" })}>
          <Plus className="h-4 w-4" /> Nouveau cas
        </Button>
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 text-sm text-foreground-subtle">
          {filterNotionId ? "Aucun cas lié à cette notion pour l'instant." : "Aucun cas enregistré pour l'instant."}
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {visible.map((entry) => (
            <div key={entry.id} className="rounded-[var(--radius-md)] border border-border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-medium text-foreground">
                    <NotebookPen className="h-3.5 w-3.5 shrink-0 text-foreground-subtle" /> {entry.title}
                  </p>
                  <p className="mt-0.5 text-xs text-foreground-subtle">
                    {new Date(entry.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    {entry.notionName && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-primary-tint px-2 py-0.5 text-primary-strong">
                        <Tag className="h-2.5 w-2.5" /> {entry.notionName}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setDialog({ mode: "edit", entry })}
                    className="text-foreground-subtle hover:text-primary-strong"
                    aria-label="Modifier ce cas"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(entry.id)}
                    disabled={isPending}
                    className="text-foreground-subtle hover:text-danger"
                    aria-label="Supprimer ce cas"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {entry.body && <p className="mt-2 whitespace-pre-wrap text-sm text-foreground-muted">{entry.body}</p>}
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <EntryDialog
          entry={dialog.mode === "edit" ? dialog.entry : undefined}
          notions={notions}
          defaultNotionId={filterNotionId ?? undefined}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
