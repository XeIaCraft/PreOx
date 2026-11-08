import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { nameResolver, roleResolver, type ExportDay } from "@/lib/planning-tivoli/csv";
import { addDays } from "@/lib/planning-tivoli/import";
import { publicDays } from "@/lib/planning-tivoli/public-view";

export const metadata: Metadata = { title: "Planning Tivoli", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const DAYS_BEFORE = 7;
const DAYS_AFTER = 28;

const dayLabel = (iso: string) => new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/**
 * Public, read-only planning: anyone with the link sees the validated weeks
 * (names of staff only, no patient data). Same opaque-token model as the
 * shared vote link; editing stays in the module, behind the sign-in.
 */
export default async function PlanningSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminClient();
  const { data: settings } = await admin.from("planning_tivoli_settings").select("share_token").eq("share_token", token).maybeSingle();
  if (!settings) notFound();

  const today = new Date().toISOString().slice(0, 10);
  const from = addDays(today, -DAYS_BEFORE);
  const to = addDays(today, DAYS_AFTER);
  const [weeks, rooms, people] = await Promise.all([
    admin.from("planning_tivoli_weeks").select("cells").eq("status", "validated").gte("week_start", addDays(from, -6)).lte("week_start", to),
    admin.from("planning_tivoli_rooms").select("name, image_label, solo, part").eq("active", true).neq("image_label", "").order("sort_order"),
    admin.from("planning_tivoli_people").select("initials, name, role"),
  ]);
  const days: ExportDay[] = (weeks.data ?? []).flatMap((w) => Object.entries(w.cells ?? {}).map(([date, cells]) => ({ date, cells }))).filter((d) => d.date >= from && d.date <= to);
  const view = publicDays(
    days,
    (rooms.data ?? []).map((r) => ({ name: r.name, label: r.image_label, solo: r.solo, part: r.part })),
    nameResolver(people.data ?? []),
    roleResolver(people.data ?? [])
  ).filter((d) => d.entries.length);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Planning Tivoli</h1>
        <p className="text-sm text-foreground-muted">Anesthésie au bloc, semaines validées. Lecture seule.</p>
      </header>
      {view.length === 0 && <p className="text-sm text-foreground-muted">Aucun planning validé pour le moment.</p>}
      {view.map((d) => (
        <section key={d.date} aria-labelledby={`d-${d.date}`} className={d.date === today ? "rounded-[var(--radius-md)] border border-primary/40 p-3" : "p-1"}>
          <h2 id={`d-${d.date}`} className="mb-2 text-sm font-semibold capitalize text-foreground">
            {dayLabel(d.date)}
            {d.date === today && <span className="ml-2 text-xs font-normal text-primary-strong">aujourd&apos;hui</span>}
          </h2>
          <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border">
            {d.entries.map((e) => (
              <li key={e.room} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-foreground">{e.room}</span>
                <span className="text-right text-foreground-muted">
                  {[e.senior, e.pg].filter(Boolean).join(" · ")}
                  {e.note && <span className="text-foreground-muted"> {e.senior || e.pg ? "· " : ""}{e.note}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
