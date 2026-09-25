"use client";

import { useMemo, useRef, useState } from "react";
import { Download, FolderPlus, KeyRound, Lock, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/carnet/ui";
import { useToast } from "@/components/ui/toast";
import { FieldLabel, Panel } from "@/components/preop/ui";
import { MIN_PASSPHRASE_LENGTH, type SealedBackup } from "@/lib/preop/crypto";
import { dossierDate, type Dossier, type DossierStatus } from "@/lib/preop/dossier";
import { localDateIso, shiftDateIso } from "@/lib/carnet/logic";
import { cn } from "@/lib/utils";
import { consultationScores } from "@/lib/preop/consultation-scores";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { attentionPoints } from "@/lib/preop/attention";
import { pendingExams } from "@/lib/preop/exams";
import { evaluateConsultation } from "@/components/preop/consultation";
import { consultationTimeline, plannedIso, relativeDay, type TimelineItem } from "@/lib/preop/timeline";
import type { Rule } from "@/lib/preop/rules/types";
import { BellRing } from "lucide-react";

export const STATUS_LABELS: Record<DossierStatus, string> = {
  consultation: "Consultation",
  prepared: "Préparé",
  done: "Fait",
  cancelled: "Annulé",
};

const STATUS_STYLES: Record<DossierStatus, string> = {
  consultation: "bg-surface-muted text-foreground-muted",
  prepared: "bg-primary-tint text-primary-strong",
  done: "bg-success-tint text-success",
  cancelled: "bg-surface-muted text-foreground-subtle line-through",
};

export function StatusPill({ status }: { status: DossierStatus }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", STATUS_STYLES[status])}>{STATUS_LABELS[status]}</span>;
}

function dossierWhen(d: Dossier): string {
  if (!d.consultation.plannedAt) return "date à fixer";
  return new Date(d.consultation.plannedAt).toLocaleString("fr-BE", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function InitialsForm({ onCreate, label = "Nouveau dossier" }: { onCreate: (initials: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const [initials, setInitials] = useState("");
  const valid = /^[a-zA-ZÀ-ÿ]{2}$/.test(initials.trim());
  if (!open)
    return (
      <Button onClick={() => setOpen(true)}>
        <FolderPlus className="h-4 w-4" /> {label}
      </Button>
    );
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onCreate(initials.trim());
        setInitials("");
        setOpen(false);
      }}
    >
      <Input autoFocus value={initials} onChange={(e) => setInitials(e.target.value.slice(0, 2))} placeholder="Initiales (NP)" aria-label="Initiales : première lettre du nom puis du prénom" className="w-36 uppercase" />
      <Button type="submit" disabled={!valid}>
        Créer
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
        Annuler
      </Button>
    </form>
  );
}

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BackupPanel({ count, onExport, onImport }: { count: number; onExport: (passphrase: string) => Promise<SealedBackup>; onImport: (backup: SealedBackup, passphrase: string) => Promise<{ added: number; updated: number }> }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<"export" | "import" | null>(null);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<SealedBackup | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setMode(null);
    setPass("");
    setPass2("");
    setFile(null);
  };

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-foreground-subtle" /> Sur cet appareil
        </span>
      }
    >
      <p className="text-sm text-foreground-muted">
        Les dossiers sont chiffrés sur cet appareil avec une clé qui ne le quitte jamais ; rien n&apos;est envoyé au serveur. Pour changer d&apos;appareil ou garder une copie : une sauvegarde chiffrée par un mot de passe que vous seul connaissez.
      </p>
      {mode === null && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={count === 0} onClick={() => setMode("export")}>
            <Download className="h-3.5 w-3.5" /> Sauvegarder ({count})
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setMode("import")}>
            <Upload className="h-3.5 w-3.5" /> Restaurer une sauvegarde
          </Button>
        </div>
      )}
      {mode === "export" && (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const backup = await onExport(pass);
              download(`preox-preop-${localDateIso()}.json`, JSON.stringify(backup));
              toast("Sauvegarde chiffrée téléchargée. Sans le mot de passe, elle est illisible — même pour PreOx.", { variant: "success", durationMs: 6000 });
              close();
            } catch (err) {
              toast(err instanceof Error ? err.message : "Sauvegarde impossible.", { variant: "error" });
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
            <label className="block space-y-1">
              <FieldLabel>Mot de passe ({MIN_PASSPHRASE_LENGTH} caractères min.)</FieldLabel>
              <Input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} />
            </label>
            <label className="block space-y-1">
              <FieldLabel>Confirmer</FieldLabel>
              <Input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} />
            </label>
          </div>
          <p className="text-xs text-foreground-subtle">Il ne peut pas être récupéré : notez-le à part.</p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || pass.length < MIN_PASSPHRASE_LENGTH || pass !== pass2}>
              <KeyRound className="h-3.5 w-3.5" /> Chiffrer et télécharger
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={close}>
              Annuler
            </Button>
          </div>
        </form>
      )}
      {mode === "import" && (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!file) return;
            setBusy(true);
            try {
              const { added, updated } = await onImport(file, pass);
              toast(`${added} dossier(s) ajouté(s), ${updated} mis à jour.`, { variant: "success" });
              close();
            } catch (err) {
              toast(err instanceof Error ? err.message : "Restauration impossible.", { variant: "error" });
            } finally {
              setBusy(false);
            }
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="block w-full text-sm text-foreground-muted file:mr-3 file:rounded-[var(--radius-sm)] file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const parsed = JSON.parse(await f.text()) as SealedBackup;
                if (parsed.format !== "preox-preop-backup") throw new Error();
                setFile(parsed);
              } catch {
                setFile(null);
                toast("Ce fichier n'est pas une sauvegarde Préop.", { variant: "error" });
              }
            }}
          />
          <label className="block space-y-1">
            <FieldLabel>Mot de passe de la sauvegarde</FieldLabel>
            <Input type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </label>
          <p className="text-xs text-foreground-subtle">Les dossiers déjà présents gardent leur version la plus récente.</p>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !file || !pass}>
              Restaurer
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={close}>
              Annuler
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}

function DossierCard({ d, onOpen }: { d: Dossier; onOpen: () => void }) {
  const { catalogs } = useCatalogs();
  const { asa, alerts, toRequest } = useMemo(() => {
    const scores = consultationScores(d.consultation, { plan: d.plan, catalogs });
    return {
      asa: scores.asa,
      alerts: attentionPoints(d.consultation, scores, d.plan).filter((p) => p.level === "high").length,
      toRequest: pendingExams(d.consultation, scores.exams).length,
    };
  }, [d, catalogs]);
  const chips = [
    asa ? `ASA ${["I", "II", "III", "IV", "V"][asa - 1]}` : "",
    alerts ? `${alerts} alerte${alerts > 1 ? "s" : ""}` : "",
    toRequest ? `${toRequest} examen${toRequest > 1 ? "s" : ""} à demander` : "",
    d.status !== "done" && d.status !== "cancelled" && d.plan.drugs.length === 0 ? "plan à faire" : "",
  ].filter(Boolean);
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-muted/50">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-tint font-mono text-sm font-semibold text-primary-strong">{d.initials}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{d.consultation.surgery.name || "Intervention à préciser"}</span>
          <span className="block truncate text-xs text-foreground-subtle">
            {dossierWhen(d)}
            {d.protocolName ? ` · ${d.protocolName}` : ""}
          </span>
          {chips.length > 0 && (
            <span className="mt-1 flex flex-wrap gap-1">
              {chips.map((c) => (
                <span key={c} className={cn("rounded px-1.5 py-0.5 text-[11px]", /alerte/.test(c) ? "bg-danger-tint text-danger" : "bg-surface-muted text-foreground-muted")}>
                  {c}
                </span>
              ))}
            </span>
          )}
        </span>
        <StatusPill status={d.status} />
      </button>
    </li>
  );
}

/** What falls due in the next two days across your dossiers: last doses, exams, your reminders. */
function DueSoon({ dossiers, rules, onOpen }: { dossiers: Dossier[]; rules: Rule[]; onOpen: (id: string) => void }) {
  const { catalogs } = useCatalogs();
  // The moment the list is shown (reopening the tab refreshes it).
  const [now] = useState(() => Date.now());
  const due = useMemo(() => {
    const horizon = new Date(now);
    horizon.setDate(horizon.getDate() + 2);
    horizon.setHours(23, 59, 59, 999);
    const out: { d: Dossier; it: TimelineItem; planned: string | null; late: boolean }[] = [];
    for (const d of dossiers) {
      if (d.status === "done" || d.status === "cancelled") continue;
      const planned = plannedIso(d.consultation);
      if (planned && new Date(planned).getTime() < now) continue;
      const items = consultationTimeline(d.consultation, evaluateConsultation(rules, { ...d.consultation, techniques: d.plan.techniques.length ? d.plan.techniques : d.consultation.techniques }, catalogs));
      for (const it of items) {
        if (it.kind === "surgery" || it.kind === "fasting" || it.kind === "resume" || it.reminder?.done || !it.at) continue;
        const t = new Date(it.at).getTime();
        // Overdue reminders stay until ticked; past last doses and exams drop off.
        if (t > horizon.getTime() || (t < now - 12 * 3_600_000 && it.kind !== "reminder")) continue;
        out.push({ d, it, planned, late: t < now && it.kind === "reminder" });
      }
    }
    return out.sort((a, b) => a.it.at!.localeCompare(b.it.at!));
  }, [dossiers, rules, catalogs, now]);
  if (due.length === 0) return null;
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <BellRing className="h-4 w-4 text-accent" /> À faire ces jours-ci
        </span>
      }
    >
      <ul className="space-y-1">
        {due.map(({ d, it, planned, late }) => (
          <li key={`${d.id}:${it.key}`}>
            <button type="button" onClick={() => onOpen(d.id)} className="flex w-full items-start gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left hover:bg-surface-muted">
              <span className="mt-0.5 shrink-0 rounded bg-primary-tint px-1.5 text-xs font-semibold uppercase text-primary-strong">{d.initials}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground">{it.text}</span>
                <span className={cn("block text-[11px] tabular-nums", late ? "text-danger" : "text-foreground-subtle")}>
                  {late ? "En retard · " : ""}
                  {new Date(it.at!).toLocaleString("fr-BE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {relativeDay(it, planned)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function DossierList({
  dossiers,
  rules = [],
  status,
  onOpen,
  onCreate,
  onRemoveMany,
  onExport,
  onImport,
}: {
  dossiers: Dossier[];
  rules?: Rule[];
  status: "loading" | "ready" | "error";
  onOpen: (id: string) => void;
  onCreate: (initials: string) => void;
  onRemoveMany: (ids: string[]) => Promise<void>;
  onExport: (passphrase: string) => Promise<SealedBackup>;
  onImport: (backup: SealedBackup, passphrase: string) => Promise<{ added: number; updated: number }>;
}) {
  const today = localDateIso();
  const yesterday = shiftDateIso(today, -1);
  const byDate = [...dossiers].sort((a, b) => (a.consultation.plannedAt || "9999").localeCompare(b.consultation.plannedAt || "9999") || b.updatedAt.localeCompare(a.updatedAt));
  const upcoming = byDate.filter((d) => !dossierDate(d) || dossierDate(d) >= today);
  const past = byDate.filter((d) => dossierDate(d) && dossierDate(d) < today).reverse();
  // Finished (or cancelled) and dated before yesterday: no longer needed for the handover.
  const stale = past.filter((d) => dossierDate(d) < yesterday && (d.status === "done" || d.status === "cancelled"));

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)] lg:items-start">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif-display text-xl font-medium text-foreground">Dossiers</h2>
          <InitialsForm onCreate={onCreate} />
        </div>
        {status === "error" && <p className="text-sm text-danger">Stockage local indisponible sur ce navigateur (navigation privée ?).</p>}
        {status === "ready" && dossiers.length === 0 && (
          <EmptyState title="Aucun dossier">
            Créez-en un ici, ou gardez une consultation. Un dossier suit le patient de la consultation à la transmission : préparation la veille, bloc, ISBAR.
          </EmptyState>
        )}
        {upcoming.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">À venir</p>
            <ul className="space-y-2">
              {upcoming.map((d) => (
                <DossierCard key={d.id} d={d} onOpen={() => onOpen(d.id)} />
              ))}
            </ul>
          </section>
        )}
        {past.length > 0 && (
          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Passés</p>
              {stale.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm(`Supprimer de cet appareil les ${stale.length} dossier(s) faits ou annulés avant hier ? (Pensez à sauvegarder si vous voulez les garder.)`)) return;
                    await onRemoveMany(stale.map((d) => d.id));
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Nettoyer ({stale.length})
                </Button>
              )}
            </div>
            <ul className="space-y-2">
              {past.map((d) => (
                <DossierCard key={d.id} d={d} onOpen={() => onOpen(d.id)} />
              ))}
            </ul>
          </section>
        )}
      </div>
      <div className="space-y-4">
        <DueSoon dossiers={dossiers} rules={rules} onOpen={onOpen} />
        <BackupPanel count={dossiers.length} onExport={onExport} onImport={onImport} />
      </div>
    </div>
  );
}
