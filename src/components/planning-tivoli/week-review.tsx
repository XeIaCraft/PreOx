"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, RotateCcw, Save, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { cleanCell, matchCell, normInitials, parseAssignment } from "@/lib/planning-tivoli/initials";
import { addDays, roomLabelOf } from "@/lib/planning-tivoli/match";
import type { OcrCell } from "@/lib/planning-tivoli/ocr";
import type { PlanningCells } from "@/lib/planning-tivoli/types";
import type { PlanningData, PlanningWeekSummary } from "@/lib/planning-tivoli/dal";
import { deleteWeek, getWeekImage, reopenWeek, saveWeekCells, savePerson, setWeekStart, validateWeek } from "@/app/apps/planning-tivoli/actions";

const DAY_LABELS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
/** Below this, a reading is flagged « peu sûr ». */
const LOW_CONFIDENCE = 75;

export const frDate = (iso: string) => iso.split("-").reverse().join("/");

/** The cell as it is in the image, cut out of it (to compare with what was read). */
function Crop({ src, cell, size }: { src: string | null; cell: OcrCell | undefined; size: { w: number; h: number } }) {
  if (!cell || !src || !cell.box.w) return <div className="h-8 w-24 shrink-0 rounded border border-dashed border-border bg-surface-muted" aria-hidden />;
  const s = 32 / cell.box.h;
  return (
    <div
      role="img"
      aria-label={`Case de l'image : ${cell.text || "vide"}`}
      className="h-8 shrink-0 rounded border border-border bg-white"
      style={{
        width: Math.min(160, cell.box.w * s),
        backgroundImage: `url(${src})`,
        backgroundRepeat: "no-repeat",
        backgroundSize: `${size.w * s}px ${size.h * s}px`,
        backgroundPosition: `-${cell.box.x * s}px -${cell.box.y * s}px`,
      }}
    />
  );
}

export function WeekReview({ week, data, initialImage = null }: { week: PlanningWeekSummary; data: PlanningData; initialImage?: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [cells, setCells] = useState<PlanningCells>(week.cells ?? {});
  const [dirty, setDirty] = useState(false);
  const [day, setDay] = useState(0);
  const [image, setImage] = useState<string | null>(initialImage);
  const [adding, setAdding] = useState<{ initials: string; name: string } | null>(null);
  const [startDate, setStartDate] = useState("");

  useEffect(() => {
    if (initialImage) return;
    let cancelled = false;
    getWeekImage(week.id).then((r) => {
      if (!cancelled && r.ok) setImage(`data:${r.data.type};base64,${r.data.base64}`);
    });
    return () => {
      cancelled = true;
    };
  }, [week.id, initialImage]);

  const known = useMemo(() => data.people.map((p) => p.initials), [data.people]);
  const nameOf = useMemo(() => new Map(data.people.map((p) => [normInitials(p.initials), p.name])), [data.people]);
  const roomOrder = useMemo(() => new Map(data.rooms.filter((r) => r.image_label).map((r, i) => [r.image_label, { i, active: r.active, name: r.name }])), [data.rooms]);

  // What the OCR read, by date and room label.
  const read = useMemo(() => {
    const out = new Map<string, Map<string, OcrCell>>();
    if (!week.week_start) return out;
    for (const d of week.ocr?.days ?? []) {
      const m = new Map<string, OcrCell>();
      for (const c of d.cells) m.set(roomLabelOf(c.column, data.rooms), c);
      out.set(addDays(week.week_start, d.index), m);
    }
    return out;
  }, [week, data.rooms]);

  const dates = week.week_start ? [0, 1, 2, 3, 4].map((i) => addDays(week.week_start!, i)) : [];
  const date = dates[day];
  const labels = date ? [...new Set([...Object.keys(cells[date] ?? {}), ...(read.get(date)?.keys() ?? [])])].sort((a, b) => (roomOrder.get(a)?.i ?? 999) - (roomOrder.get(b)?.i ?? 999)) : [];

  /** What makes a cell worth a look. */
  const flagsOf = (d: string, label: string) => {
    const value = cells[d]?.[label] ?? "";
    const ocr = read.get(d)?.get(label);
    const a = parseAssignment(value);
    const proposed = ocr && !ocr.empty ? matchCell(ocr.text, known, data.learned) : null;
    const unknown = a.kind === "ok" ? [a.pg, a.senior].filter((x): x is string => !!x && !nameOf.has(normInitials(x))) : [];
    return {
      value,
      ocr,
      a,
      low: !!ocr && !ocr.empty && ocr.confidence < LOW_CONFIDENCE,
      matched: proposed && cleanCell(value) === proposed.text ? proposed.changes : [],
      edited: !!proposed && cleanCell(value) !== proposed.text,
      reread: week.changed_since_validation && proposed && cleanCell(value) !== proposed.text ? proposed.text : null,
      unknown,
    };
  };
  const toCheck = (d: string) =>
    [...new Set([...Object.keys(cells[d] ?? {}), ...(read.get(d)?.keys() ?? [])])].filter((l) => {
      const f = flagsOf(d, l);
      return f.low || f.matched.length > 0 || f.unknown.length > 0 || f.a.kind === "invalid" || !!f.reread;
    }).length;

  const set = (d: string, label: string, v: string) => {
    setCells((c) => ({ ...c, [d]: { ...(c[d] ?? {}), [label]: v } }));
    setDirty(true);
  };
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error ?? "Échec.", { variant: "error" });
      toast(done, { variant: "success" });
      setDirty(false);
      router.refresh();
    });

  const corrections = () =>
    dates.flatMap((d) =>
      [...(read.get(d)?.entries() ?? [])]
        .filter(([, c]) => !c.empty && c.text)
        .map(([label, c]) => ({ read: cleanCell(c.text), kept: cleanCell(cells[d]?.[label] ?? "") }))
        .filter((x) => x.read !== x.kept)
    );

  if (!week.week_start)
    return (
      <div className="space-y-3 rounded-[var(--radius-lg)] border border-accent/40 bg-accent-tint p-4">
        <p className="text-sm text-foreground">La période du titre n&apos;a pas pu être lue{week.ocr?.titleText ? ` (« ${week.ocr.titleText} »)` : ""}. De quelle semaine s&apos;agit-il ?</p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="block text-xs font-medium text-foreground-muted">Un jour de la semaine</span>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9 w-auto" />
          </label>
          <Button size="sm" disabled={!startDate || pending} onClick={() => run(() => setWeekStart(week.id, startDate), "Semaine enregistrée.")}>
            Dater la semaine
          </Button>
        </div>
      </div>
    );

  return (
    <div className="space-y-3">
      {(week.ocr?.warnings ?? []).map((w) => (
        <p key={w} className="flex items-start gap-2 rounded-[var(--radius-md)] border border-accent/40 bg-accent-tint px-3 py-2 text-sm text-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" /> {w}
        </p>
      ))}
      {week.changed_since_validation && (
        <p className="rounded-[var(--radius-md)] border border-accent/40 bg-accent-tint px-3 py-2 text-sm text-foreground">
          Le planning publié a changé depuis la validation. Le Sheet garde la version validée ; les cases qui diffèrent de la nouvelle lecture sont signalées.
        </p>
      )}

      {/* Days: one at a time (usable on a phone), with what is left to look at. */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Jours">
        {dates.map((d, i) => {
          const n = toCheck(d);
          return (
            <button
              key={d}
              role="tab"
              aria-selected={day === i}
              onClick={() => setDay(i)}
              className={cn("min-h-9 rounded-full border px-3 text-sm font-medium", day === i ? "border-primary bg-primary-tint text-primary-strong" : "border-border text-foreground-muted hover:bg-surface-muted")}
            >
              {DAY_LABELS[i].slice(0, 3)} {frDate(d).slice(0, 5)}
              {n > 0 && <span className="ml-1.5 rounded-full bg-accent px-1.5 text-[11px] text-white">{n}</span>}
            </button>
          );
        })}
      </div>

      <datalist id="planning-initials">
        {data.people.map((p) => (
          <option key={p.id} value={p.initials}>
            {p.name}
          </option>
        ))}
      </datalist>

      <ul className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-surface">
        {labels.map((label) => {
          const f = flagsOf(date, label);
          const room = roomOrder.get(label);
          return (
            <li key={label} className={cn("space-y-1.5 px-3 py-2.5", room && !room.active && "opacity-60")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 shrink-0 text-xs font-semibold uppercase tracking-wide text-foreground-muted" title={room?.name}>
                  {label}
                </span>
                <Crop src={image} cell={f.ocr} size={{ w: week.image_width ?? 0, h: week.image_height ?? 0 }} />
                <Input
                  value={f.value}
                  onChange={(e) => set(date, label, e.target.value)}
                  list="planning-initials"
                  placeholder="vide"
                  aria-label={`${DAY_LABELS[day]}, ${label}`}
                  className={cn("h-9 w-28 font-mono", (f.a.kind === "invalid" || f.unknown.length > 0) && "border-accent")}
                />
                {f.ocr && !f.ocr.empty && <span className="text-[11px] tabular-nums text-foreground-subtle">lu « {f.ocr.text} » · {f.ocr.confidence} %</span>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 pl-0 sm:pl-[5.5rem]">
                <span className="text-sm text-foreground">
                  {f.a.kind === "empty" ? (
                    <span className="text-foreground-subtle">Personne</span>
                  ) : f.a.kind === "invalid" ? (
                    <span className="text-accent">Non interprétable : {f.a.reason}</span>
                  ) : (
                    <>
                      {f.a.pg && <>PG : {nameOf.get(normInitials(f.a.pg)) ?? `${f.a.pg} (?)`} · </>}
                      Sénior : {nameOf.get(normInitials(f.a.senior)) ?? `${f.a.senior} (?)`}
                    </>
                  )}
                </span>
                {f.low && <Badge variant="accent">Lecture peu sûre</Badge>}
                {f.matched.map((m) => (
                  <Badge key={m.read} variant="primary">
                    « {m.read} » → « {m.value} » {m.kind === "learned" ? "(appris)" : "(rapproché)"}
                  </Badge>
                ))}
                {f.edited && <Badge variant="neutral">Corrigé</Badge>}
                {f.reread && (
                  <button type="button" onClick={() => set(date, label, f.reread!)} className="rounded-full border border-accent px-2 py-0.5 text-xs text-accent">
                    Nouvelle lecture « {f.reread} » : reprendre
                  </button>
                )}
                {f.unknown.map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setAdding({ initials: u, name: "" })}
                    className="inline-flex items-center gap-1 rounded-full bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent"
                  >
                    <UserPlus className="h-3 w-3" /> « {u} » inconnu : ajouter
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>

      {adding && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-[var(--radius-md)] border border-primary/30 bg-primary-tint/40 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => savePerson({ initials: adding.initials, name: adding.name }), `« ${adding.initials} » ajouté.`);
            setAdding(null);
          }}
        >
          <label className="space-y-1">
            <span className="block text-xs font-medium text-foreground-muted">Initiales</span>
            <Input value={adding.initials} onChange={(e) => setAdding({ ...adding, initials: e.target.value })} className="h-9 w-24" />
          </label>
          <label className="min-w-0 flex-1 space-y-1">
            <span className="block text-xs font-medium text-foreground-muted">Nom (tel qu&apos;écrit dans le Sheet)</span>
            <Input autoFocus value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} className="h-9" />
          </label>
          <Button size="sm" type="submit" disabled={!adding.initials.trim() || !adding.name.trim() || pending}>
            Ajouter
          </Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => setAdding(null)}>
            Annuler
          </Button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending} onClick={() => run(() => validateWeek(week.id, cells, corrections()), "Semaine validée : elle part vers le Sheet.")}>
          <Check className="h-4 w-4" /> {week.status === "validated" ? "Valider à nouveau" : "Valider la semaine"}
        </Button>
        <Button variant="secondary" disabled={!dirty || pending} onClick={() => run(() => saveWeekCells(week.id, cells), "Enregistré (à valider).")}>
          <Save className="h-4 w-4" /> Enregistrer sans valider
        </Button>
        {week.status === "validated" && (
          <Button variant="ghost" disabled={pending} onClick={() => run(() => reopenWeek(week.id), "Semaine rouverte : elle n'est plus exportée.")}>
            <RotateCcw className="h-4 w-4" /> Rouvrir
          </Button>
        )}
        <Button variant="ghost" disabled={pending} onClick={() => confirm("Supprimer cette semaine ?") && run(() => deleteWeek(week.id), "Semaine supprimée.")}>
          <Trash2 className="h-4 w-4" /> Supprimer
        </Button>
      </div>
      <p className="text-xs text-foreground-subtle">Rien n&apos;est exporté vers le Sheet avant la validation. Les initiales sont gardées telles quelles : un nom ajouté plus tard s&apos;applique aussi aux semaines déjà validées.</p>
    </div>
  );
}
