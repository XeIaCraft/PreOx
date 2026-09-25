"use client";

import { useMemo, useState } from "react";
import { Check, ClipboardPaste, Mic, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/preop/ui";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { surgeryFromItem } from "@/components/preop/surgery-panel";
import { applyQuickEntry, isEmptyQuickEntry, parseQuickEntry, selectAll, type QuickSelection } from "@/lib/preop/quick-entry";
import { DRUGS, QUALIFIER_LABELS } from "@/lib/preop/history";
import { EXAM_LABELS, ecgSummary, type ConsultationState } from "@/lib/preop/dossier";
import { cn } from "@/lib/utils";

function Pick({ on, onToggle, children, tone = "default" }: { on: boolean; onToggle: () => void; children: React.ReactNode; tone?: "default" | "danger" | "muted" | "absent" }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-left text-xs transition-colors",
        !on && "border-dashed border-border-strong bg-surface text-foreground-subtle line-through",
        on && tone === "default" && "border-primary/40 bg-primary-tint text-primary-strong",
        on && tone === "danger" && "border-danger/40 bg-danger-tint text-danger",
        on && tone === "muted" && "border-border bg-surface-muted text-foreground",
        on && tone === "absent" && "border-success/40 bg-success-tint text-success"
      )}
    >
      {on ? <Check className="h-3 w-3 shrink-0" /> : null}
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}

function Group({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">
        {title}
        {hint ? <span className="ml-1 normal-case tracking-normal">— {hint}</span> : null}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

/**
 * Type, dictate or paste anything — a sentence, a previous consultation, a
 * discharge letter: what is recognised is shown by category, untick what's
 * wrong, add it all in one tap. Nothing leaves the device.
 */
export function QuickEntryPanel({ value, onChange, onClose }: { value: ConsultationState; onChange: (c: ConsultationState) => void; onClose: () => void }) {
  const { catalogs } = useCatalogs();
  const [text, setText] = useState("");
  const result = useMemo(() => parseQuickEntry(text, catalogs), [text, catalogs]);
  // Unticked keys; « notes » is ticked on demand (leftovers of a pasted document).
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<Set<string>>(new Set());
  const defaults = useMemo(() => selectAll(result), [result]);
  const on = (key: string) => (defaults.has(key) ? !excluded.has(key) : extra.has(key));
  const toggle = (key: string) => {
    const flip = (set: Set<string>) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    };
    if (defaults.has(key)) setExcluded(flip);
    else setExtra(flip);
  };
  const selection: QuickSelection = new Set([...[...defaults].filter((k) => !excluded.has(k)), ...extra]);
  const r = result;
  const s = r.substances;
  const substanceText = [
    s.tobacco === "current" ? "Fumeur" : s.tobacco === "former" ? "Ancien fumeur" : s.tobacco === "never" ? "Non-fumeur" : "",
    s.packYears ? `${s.packYears} PA` : "",
    s.alcoholUnitsPerWeek ? `alcool ${s.alcoholUnitsPerWeek} U/sem` : "",
    s.alcoholDependence ? "dépendance à l'alcool" : "",
    s.drugs?.length ? s.drugs.map((d) => DRUGS.find((x) => x.code === d)?.label.split(" (")[0]).join(", ") : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const examText = [r.exam.heart && EXAM_LABELS.heart[r.exam.heart], r.exam.lungs && EXAM_LABELS.lungs[r.exam.lungs], r.exam.edema && "OMI", r.exam.jvd && "turgescence jugulaire", r.exam.veins && EXAM_LABELS.veins[r.exam.veins], r.exam.ecg && `ECG : ${ecgSummary(r.exam.ecg)}`]
    .filter(Boolean)
    .join(" · ");
  const detailText = (id: string, details?: Record<string, string>) => {
    const item = catalogs.conditions.find((x) => x.id === id);
    return Object.entries(details ?? {})
      .map(([d, code]) => item?.details?.find((x) => x.id === d)?.options?.find((o) => o.code === code)?.label.split(" :")[0])
      .filter(Boolean)
      .join(", ");
  };

  const apply = () => {
    let next = applyQuickEntry(value, r, selection);
    if (r.surgery && on("surg")) {
      const item = catalogs.surgeries.find((x) => x.id === r.surgery!.id);
      if (item && !next.surgery.name) next = { ...next, surgery: { ...surgeryFromItem(next.surgery, item), side: next.surgery.side || r.surgery.side || "" } };
      if (r.surgery.plannedAt && !next.plannedAt) next = { ...next, plannedAt: r.surgery.plannedAt };
    }
    onChange(next);
    setText("");
    onClose();
  };

  return (
    <Panel
      title="Saisie rapide"
      actions={
        <button type="button" onClick={onClose} className="rounded p-1 text-foreground-subtle hover:text-foreground" aria-label="Fermer la saisie rapide">
          <X className="h-4 w-4" />
        </button>
      }
    >
      <p className="flex items-start gap-1.5 text-xs text-foreground-muted">
        <Mic className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Tapez, dictez (micro du clavier) ou collez ce que vous avez : une ancienne consultation, une lettre de sortie, un rapport, une liste de médicaments. Rien n&apos;est envoyé : tout est lu sur cet appareil.
      </p>
      <textarea
        autoFocus
        rows={6}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setExcluded(new Set());
          setExtra(new Set());
        }}
        placeholder={"ex. HTA mal contrôlée, diabète sous metformine 850 mg 2x/j, allergie pénicilline, fumeur 20 PA\n\n… ou tout un document : « Antécédents : … Traitement : … Biologie : … »"}
        className="block min-h-32 w-full resize-y rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              const pasted = await navigator.clipboard.readText();
              if (pasted) setText((t) => (t ? `${t}\n${pasted}` : pasted));
            } catch {
              // Clipboard blocked: the usual paste in the field still works.
            }
          }}
        >
          <ClipboardPaste className="h-3.5 w-3.5" /> Coller
        </Button>
        {text && (
          <Button size="sm" variant="ghost" onClick={() => setText("")}>
            Effacer
          </Button>
        )}
      </div>

      {text.trim() && !isEmptyQuickEntry(r) && (
        <div className="space-y-2.5">
          {r.surgery && (
            <Group title="Intervention prévue" hint={value.surgery.name ? "déjà renseignée : gardée" : undefined}>
              <Pick on={on("surg")} onToggle={() => toggle("surg")}>
                {r.surgery.name}
                {r.surgery.side ? ` ${r.surgery.side}` : ""}
                {r.surgery.plannedAt ? ` · ${new Date(r.surgery.plannedAt).toLocaleString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
              </Pick>
            </Group>
          )}
          {(r.values.length > 0 || r.sex || r.asa || r.mallampati) && (
            <Group title="Patient, constantes, biologie" hint="une valeur déjà saisie n'est pas remplacée">
              {r.sex && (
                <Pick on={on("sex")} onToggle={() => toggle("sex")}>
                  {r.sex === "F" ? "Femme" : "Homme"}
                </Pick>
              )}
              {r.values.map((v) => (
                <Pick key={v.key} on={on(`v:${v.key}`)} onToggle={() => toggle(`v:${v.key}`)}>
                  {v.label}
                </Pick>
              ))}
              {r.asa && (
                <Pick on={on("asa")} onToggle={() => toggle("asa")}>
                  ASA {["I", "II", "III", "IV", "V"][r.asa - 1]}
                </Pick>
              )}
              {r.mallampati && (
                <Pick on={on("mp")} onToggle={() => toggle("mp")}>
                  Mallampati {["I", "II", "III", "IV"][r.mallampati - 1]}
                </Pick>
              )}
            </Group>
          )}
          {examText && (
            <Group title="Examen clinique">
              <Pick on={on("x")} onToggle={() => toggle("x")}>
                {examText}
              </Pick>
            </Group>
          )}
          {r.conditions.length > 0 && (
            <Group title="Antécédents">
              {r.conditions.map((c) => (
                <Pick key={c.id} on={on(`c:${c.id}`)} onToggle={() => toggle(`c:${c.id}`)}>
                  {c.label}
                  {c.qualifiers.length ? ` · ${c.qualifiers.map((q) => catalogs.conditions.find((x) => x.id === c.id)?.qualifiers?.[q] ?? QUALIFIER_LABELS[q]).join(", ")}` : ""}
                  {c.details ? ` · ${detailText(c.id, c.details)}` : ""}
                </Pick>
              ))}
            </Group>
          )}
          {r.negated.length > 0 && (
            <Group title="Absents" hint="notés « non »">
              {r.negated.map((c) => (
                <Pick key={c.id} tone="absent" on={on(`n:${c.id}`)} onToggle={() => toggle(`n:${c.id}`)}>
                  pas de {c.label.toLowerCase()}
                </Pick>
              ))}
            </Group>
          )}
          {r.history.length > 0 && (
            <Group title="Autres antécédents (texte)">
              <Pick on={on("h")} onToggle={() => toggle("h")} tone="muted">
                {r.history.join(" ; ")}
              </Pick>
            </Group>
          )}
          {r.surgicalHistory.length > 0 && (
            <Group title="Antécédents chirurgicaux et anesthésiques">
              <Pick on={on("sh")} onToggle={() => toggle("sh")} tone="muted">
                {r.surgicalHistory.join(" ; ")}
              </Pick>
            </Group>
          )}
          {(r.treatments.length > 0 || r.freeTreatments.length > 0) && (
            <Group title="Traitements">
              {r.treatments.map((t) => (
                <Pick key={t.id} on={on(`t:${t.id}`)} onToggle={() => toggle(`t:${t.id}`)}>
                  {t.name}
                  {t.dailyDoseMg ? ` · ${t.dailyDoseMg} mg/j` : ""}
                </Pick>
              ))}
              {r.freeTreatments.map((t, i) => (
                <Pick key={`ft-${i}`} tone="muted" on={on(`ft:${i}`)} onToggle={() => toggle(`ft:${i}`)}>
                  {t} (non reconnu)
                </Pick>
              ))}
            </Group>
          )}
          {(r.allergies.length > 0 || r.noKnownAllergy) && (
            <Group title="Allergies">
              {r.allergies.map((a, i) => (
                <Pick key={i} tone="danger" on={on(`a:${i}`)} onToggle={() => toggle(`a:${i}`)}>
                  {a.label}
                  {a.reaction ? ` (${a.reaction})` : ""}
                  {a.allergenId ? "" : " · non reconnue"}
                </Pick>
              ))}
              {r.noKnownAllergy && r.allergies.length === 0 && (
                <Pick tone="absent" on={on("nka")} onToggle={() => toggle("nka")}>
                  Aucune allergie connue
                </Pick>
              )}
            </Group>
          )}
          {substanceText && (
            <Group title="Assuétudes">
              <Pick on={on("s")} onToggle={() => toggle("s")} tone="muted">
                {substanceText}
              </Pick>
            </Group>
          )}
          {r.ignored.length > 0 && <p className="text-[11px] text-foreground-subtle">Antécédents familiaux, non repris : {r.ignored.join(" ; ")}</p>}
          {r.unknown.length > 0 && (
            <Group title="Non reconnu" hint={r.document ? "ajoutez-le aux notes si utile" : "dans « Autres antécédents »"}>
              <Pick on={r.document ? on("notes") : on("u")} onToggle={() => toggle(r.document ? "notes" : "u")} tone="muted">
                {r.unknown.join(" ; ")}
              </Pick>
            </Group>
          )}
          <Button size="sm" onClick={apply}>
            <Check className="h-3.5 w-3.5" /> Ajouter à la consultation
          </Button>
        </div>
      )}
      {text.trim() && isEmptyQuickEntry(r) && <p className="text-xs text-foreground-subtle">Rien de reconnu pour l&apos;instant.</p>}
    </Panel>
  );
}
