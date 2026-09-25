"use client";

import { useState } from "react";
import { CalendarPlus, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Panel } from "@/components/preop/ui";
import { useToast } from "@/components/ui/toast";
import { relativeDay, timelineIcs, plannedIso, type ReminderSuggestion, type TimelineItem, type TimelineKind } from "@/lib/preop/timeline";
import type { Reminder } from "@/lib/preop/dossier";
import { cn } from "@/lib/utils";

const DAYS: { value: number; label: string }[] = [
  { value: 14, label: "J-14" },
  { value: 7, label: "J-7" },
  { value: 3, label: "J-3" },
  { value: 2, label: "J-2" },
  { value: 1, label: "J-1" },
  { value: 0, label: "Jour J" },
  { value: -1, label: "J+1" },
];

const TONE: Record<TimelineKind, string> = {
  stop: "bg-danger",
  exam: "bg-accent",
  fasting: "bg-primary",
  surgery: "bg-foreground",
  resume: "bg-success",
  reminder: "bg-border-strong",
};

const when = (iso: string) => new Date(iso).toLocaleString("fr-BE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * From the consultation to the day after: dated last doses, exams, fasting,
 * resumptions (from your rules) and your reminders — exportable to your
 * calendar. Nothing leaves the device unless you download the file.
 */
export function TimelinePanel({
  items,
  plannedAt,
  reminders,
  onReminders,
  suggestions,
  prefix,
}: {
  items: TimelineItem[];
  plannedAt: string;
  reminders: Reminder[];
  onReminders: (r: Reminder[]) => void;
  suggestions: ReminderSuggestion[];
  /** Shown before each calendar event (initials). */
  prefix?: string;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [days, setDays] = useState(1);
  const planned = plannedIso({ plannedAt });
  const add = (t: string, d: number) => {
    if (!t.trim()) return;
    onReminders([...reminders, { id: crypto.randomUUID(), text: t.trim(), daysBefore: d }]);
  };
  const dated = items.filter((i) => i.at && !i.reminder?.done).length;

  return (
    <Panel
      title="Échéancier"
      actions={
        <Button
          size="sm"
          variant="secondary"
          disabled={!planned || dated === 0}
          title={planned ? undefined : "Renseignez la date de l'intervention"}
          onClick={() => {
            const blob = new Blob([timelineIcs(items, prefix ?? "")], { type: "text/calendar;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `preop${prefix ? `-${prefix.replace(/[^A-Za-z0-9]/g, "")}` : ""}.ics`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            toast(`${dated} rappel(s) exporté(s) vers l'agenda.`, { variant: "success" });
          }}
        >
          <CalendarPlus className="h-3.5 w-3.5" /> Agenda
        </Button>
      }
    >
      {!planned && <p className="text-xs text-foreground-subtle">Renseignez la date de l&apos;intervention (étape Intervention) pour dater chaque étape.</p>}
      {items.length > 0 ? (
        <ol className="relative space-y-1.5 border-l border-border pl-4">
          {items.map((it) => {
            const done = !!it.reminder?.done;
            return (
              <li key={it.key} className="relative">
                <span className={cn("absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface", TONE[it.kind], done && "opacity-40")} aria-hidden />
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm text-foreground", it.kind === "surgery" && "font-semibold", done && "text-foreground-subtle line-through")}>{it.text}</p>
                    <p className="text-[11px] tabular-nums text-foreground-subtle">
                      {[relativeDay(it, planned), it.at ? when(it.at) : ""].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {it.reminder && (
                    <span className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => onReminders(reminders.map((r) => (r.id === it.reminder!.id ? { ...r, done: !r.done } : r)))}
                        className={cn("rounded p-1.5", done ? "text-success" : "text-foreground-subtle hover:text-foreground")}
                        aria-label={done ? "Marquer à faire" : "Marquer fait"}
                        aria-pressed={done}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button type="button" onClick={() => onReminders(reminders.filter((r) => r.id !== it.reminder!.id))} className="rounded p-1.5 text-foreground-subtle hover:text-danger" aria-label="Supprimer le rappel">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="text-xs text-foreground-subtle">Rien de daté pour l&apos;instant : les arrêts de traitement viennent de vos règles, les rappels de vous.</p>
      )}

      {suggestions.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-foreground-subtle">Rappels suggérés</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.slice(0, 8).map((s) => (
              <button
                key={s.text}
                type="button"
                onClick={() => add(s.text, s.daysBefore)}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-border-strong px-2.5 py-1 text-left text-xs text-foreground-muted hover:border-primary hover:text-primary-strong"
              >
                <Plus className="h-3 w-3 shrink-0" />
                <span className="min-w-0 truncate">
                  {s.text} · {s.daysBefore === 0 ? "Jour J" : s.daysBefore > 0 ? `J-${s.daysBefore}` : `J+${-s.daysBefore}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <form
        className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add(text, days);
          setText("");
        }}
      >
        <Input className="h-9" value={text} onChange={(e) => setText(e.target.value)} placeholder="Mon rappel (ex. appeler le patient)" aria-label="Texte du rappel" />
        <Select className="h-9 w-auto" value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Quand">
          {DAYS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" variant="secondary" disabled={!text.trim()} aria-label="Ajouter le rappel">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </form>
    </Panel>
  );
}
