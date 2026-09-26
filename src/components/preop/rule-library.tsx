"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ChipGroup, EmptyState } from "@/components/carnet/ui";
import { RuleEditor, type RuleDraft } from "@/components/preop/rule-editor";
import { SourceBadge, TargetTag } from "@/components/preop/ui";
import { describeRule } from "@/lib/preop/rules/describe";
import type { Rule, RuleStatus } from "@/lib/preop/rules/types";
import { PROPOSED_GROUPS } from "@/lib/preop/rules/proposed";

function RuleEditModal({ rule, onSave, onClose }: { rule: Rule; onSave: (r: RuleDraft) => Promise<Rule>; onClose: () => void }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<RuleDraft>(rule);
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(activate: boolean) {
    setSaving(true);
    try {
      const changed = JSON.stringify({ ...draft, status: rule.status }) !== JSON.stringify(rule);
      await onSave({
        ...draft,
        explanations: draft.explanations.map((e) => e.trim()).filter(Boolean),
        // A changed rule is a new version; activating requires a fresh check against the source.
        version: changed ? rule.version + 1 : rule.version,
        status: activate ? "active" : draft.status === "active" && !changed ? "active" : "draft",
        verified_at: activate ? new Date().toISOString() : changed ? null : rule.verified_at,
      });
      toast("Règle enregistrée.", { variant: "success" });
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Enregistrement impossible.", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Modifier la règle" onClose={onClose} size="lg">
      <div className="space-y-4">
        <RuleEditor value={draft} onChange={setDraft} />
        <label className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm">
          <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="mt-1" />
          <span>J&apos;ai vérifié la règle dans sa source.</span>
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => save(false)} disabled={saving}>
            Enregistrer
          </Button>
          <Button onClick={() => save(true)} disabled={saving || !verified}>
            <Check className="h-4 w-4" /> Enregistrer et activer
          </Button>
        </div>
        <p className="text-xs text-foreground-subtle">Toute modification d&apos;une règle active la repasse en brouillon jusqu&apos;à une nouvelle vérification.</p>
      </div>
    </Modal>
  );
}

/** The library: every rule with its source level, what the app does with it, and its review status. */
export function RuleLibrary({
  rules,
  onSave,
  onRemove,
  onNew,
}: {
  rules: Rule[];
  onSave: (r: RuleDraft) => Promise<Rule>;
  onRemove: (id: string) => Promise<void>;
  onNew: () => void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState<RuleStatus>("active");
  const [editing, setEditing] = useState<Rule | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const shown = rules.filter((r) => r.status === status).sort((a, b) => a.title.localeCompare(b.title, "fr"));
  const count = (s: RuleStatus) => rules.filter((r) => r.status === s).length;

  async function setRuleStatus(rule: Rule, next: RuleStatus) {
    try {
      await onSave({ ...rule, status: next });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Modification impossible.", { variant: "error" });
    }
  }

  const proposalGroups = PROPOSED_GROUPS.map((g) => ({ ...g, rules: g.rules.filter((p) => !rules.some((r) => r.id === p.id)) })).filter((g) => g.rules.length > 0);
  const [importing, setImporting] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {proposalGroups.map((group) => (
        <div key={group.id} className="space-y-2 rounded-[var(--radius-md)] border border-accent/40 bg-accent-tint/50 p-3">
          <p className="text-sm font-medium text-foreground">
            {group.title} : {group.rules.length} règle(s) proposée(s)
          </p>
          <p className="text-xs text-foreground-muted">
            {group.verified ? (
              <>
                {group.description} Elles arrivent <strong>actives</strong> ; les brouillons qu&apos;elles remplacent sont archivés (une règle que vous avez activée vous-même n&apos;est jamais touchée).
              </>
            ) : (
              <>
                {group.description} Elles arrivent en <strong>brouillon</strong> : aucune ne s&apos;applique avant que vous l&apos;ayez vérifiée et activée. Chacune contient la question à poser à Consensus pour la
                vérifier.
              </>
            )}
          </p>
          <details className="text-xs text-foreground-muted">
            <summary className="cursor-pointer text-primary">Voir la liste</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {group.rules.map((p) => (
                <li key={p.id}>{p.title}</li>
              ))}
            </ul>
          </details>
          <Button
            size="sm"
            disabled={importing !== null}
            onClick={async () => {
              setImporting(group.id);
              let done = 0;
              try {
                for (const p of group.rules) {
                  await onSave(p);
                  done++;
                }
                if (group.verified) {
                  const replaced = new Set(group.rules.flatMap((p) => group.supersedes?.[p.id] ?? []));
                  let archived = 0;
                  for (const r of rules) {
                    if (r.status === "draft" && replaced.has(r.id)) {
                      await onSave({ ...r, status: "archived" });
                      archived++;
                    }
                  }
                  toast(`${done} règle(s) vérifiée(s) activée(s)${archived ? `, ${archived} brouillon(s) remplacé(s) archivé(s)` : ""}.`, { variant: "success" });
                  setStatus("active");
                } else {
                  toast(`${done} règle(s) ajoutée(s) en brouillon : ouvrez chacune pour la vérifier.`, { variant: "success" });
                  setStatus("draft");
                }
              } catch (err) {
                toast(`${done} ajoutée(s) ; ${err instanceof Error ? err.message : "échec"}`, { variant: "error" });
              } finally {
                setImporting(null);
              }
            }}
          >
            <Plus className="h-3.5 w-3.5" /> {importing === group.id ? "Ajout…" : group.verified ? "Ajouter et activer" : "Ajouter en brouillon"}
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ChipGroup
          size="sm"
          options={[
            { code: "active" as RuleStatus, label: `Actives (${count("active")})` },
            { code: "draft" as RuleStatus, label: `Brouillons (${count("draft")})` },
            { code: "archived" as RuleStatus, label: `Archivées (${count("archived")})` },
          ]}
          value={status}
          onChange={(v) => v && setStatus(v)}
        />
        <Button onClick={onNew}>
          <Plus className="h-4 w-4" /> Nouvelle règle
        </Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState title={status === "active" ? "Aucune règle active." : status === "draft" ? "Aucun brouillon." : "Aucune règle archivée."}>
          {status === "active" && "Les règles naissent quand vous en avez besoin : depuis une consultation (« Préparer la question ») ou avec « Nouvelle règle »."}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 lg:grid-cols-2">
          {shown.map((rule) => (
            <li key={rule.id} className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-surface p-3 sm:p-4">
              <div className="flex items-start gap-2">
                <SourceBadge level={rule.source.level} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{rule.title || rule.statement}</p>
                  <TargetTag rule={rule} />
                  <p className="text-xs text-foreground-subtle">
                    {[rule.source.organisation, rule.source.year, rule.source.grade && `grade ${rule.source.grade}`, `v${rule.version}`].filter(Boolean).join(" · ")}
                    {rule.review_at && rule.review_at < today && <span className="ml-1.5 rounded bg-accent-tint px-1 text-accent">à revérifier</span>}
                  </p>
                </div>
              </div>
              <p className="text-sm text-foreground-muted">{describeRule(rule)}</p>
              {rule.divergences.length > 0 && <p className="text-xs text-foreground-subtle">Divergence : {rule.divergences.map((d) => `${d.source} — ${d.summary}`).join(" ; ")}</p>}
              <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
                <Button variant="ghost" size="sm" onClick={() => setEditing(rule)}>
                  <Pencil className="h-3.5 w-3.5" /> Modifier
                </Button>
                {rule.status === "archived" ? (
                  <Button variant="ghost" size="sm" onClick={() => setRuleStatus(rule, "draft")}>
                    <ArchiveRestore className="h-3.5 w-3.5" /> Restaurer
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setRuleStatus(rule, "archived")}>
                    <Archive className="h-3.5 w-3.5" /> Archiver
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger"
                  onClick={async () => {
                    if (!confirm("Supprimer définitivement cette règle ?")) return;
                    try {
                      await onRemove(rule.id);
                    } catch (err) {
                      toast(err instanceof Error ? err.message : "Suppression impossible.", { variant: "error" });
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <RuleEditModal rule={editing} onSave={onSave} onClose={() => setEditing(null)} />}
    </div>
  );
}
