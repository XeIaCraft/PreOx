"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, ImageUp, KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { PlanningData, PlanningWeekSummary } from "@/lib/planning-tivoli/dal";
import type { ImportResult } from "@/lib/planning-tivoli/import";
import type { PlanningRoomRow } from "@/lib/planning-tivoli/types";
import { deleteOcrFix, deletePerson, generateShareLink, generateToken, importImage, refreshFromWeb, revokeShareLink, revokeToken, savePerson, saveRooms, undoPublicEdit } from "@/app/apps/planning-tivoli/actions";
import { frDate, WeekReview } from "./week-review";
import { RoleSelect } from "./role-select";
import type { Role } from "@/lib/planning-tivoli/initials";

type Tab = "help" | "weeks" | "people" | "rooms" | "export";
const TABS: { id: Tab; label: string }[] = [
  { id: "help", label: "Mode d'emploi" },
  { id: "weeks", label: "Semaines" },
  { id: "people", label: "Initiales" },
  { id: "rooms", label: "Salles" },
  { id: "export", label: "Export" },
];

const OUTCOME: Record<ImportResult["outcome"], string> = {
  unchanged: "Image inchangée : rien à relire.",
  new: "Nouvelle semaine lue : à vérifier.",
  updated: "Semaine relue : à vérifier.",
  changed_after_validation: "Le planning a changé depuis la validation : à revoir.",
};

function weekLabel(w: PlanningWeekSummary) {
  return w.week_start ? `Semaine du ${frDate(w.week_start)}` : "Semaine à dater";
}

export function PlanningApp({ data }: { data: PlanningData }) {
  const [tab, setTab] = useState<Tab>("weeks");
  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Planning Tivoli</h1>
        <p className="text-sm text-foreground-muted">Le planning du bloc lu dans l&apos;image publiée (OCR, sans IA), vérifié ici, puis exporté vers l&apos;onglet « Planning » du Sheet.</p>
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-current={tab === t.id ? "page" : undefined}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", tab === t.id ? "border-primary text-primary-strong" : "border-transparent text-foreground-muted hover:text-foreground")}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tab === "help" && <Help />}
      {tab === "weeks" && <Weeks data={data} />}
      {tab === "people" && <People data={data} />}
      {tab === "rooms" && <Rooms rooms={data.rooms} />}
      {tab === "export" && <Export hasToken={data.settings.hasToken} shareToken={data.settings.shareToken} edits={data.edits} />}
    </div>
  );
}

function Weeks({ data }: { data: PlanningData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string | null>(data.weeks[0]?.id ?? null);
  const file = useRef<HTMLInputElement>(null);
  const week = data.weeks.find((w) => w.id === selected) ?? data.weeks[0];

  const done = (r: { ok: true; data: ImportResult } | { ok: false; error: string }) => {
    if (!r.ok) return toast(r.error, { variant: "error" });
    toast(OUTCOME[r.data.outcome], { variant: r.data.outcome === "unchanged" ? "info" : "success" });
    setSelected(r.data.weekId);
    router.refresh();
  };

  async function upload(f: File) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(f);
    });
    start(async () => done(await importImage(base64)));
  }

  // Ctrl+V (⌘V) anywhere on the page imports a capture copied to the clipboard.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const img = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!img) return;
      e.preventDefault();
      void upload(img);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  return (
    <div
      className="space-y-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const img = [...e.dataTransfer.files].find((f) => f.type.startsWith("image/"));
        if (!img) return;
        e.preventDefault();
        void upload(img);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending} onClick={() => file.current?.click()}>
          <ImageUp className="h-4 w-4" /> Importer une capture
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => start(async () => done(await refreshFromWeb()))}>
          <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} /> Lire la page publiée
        </Button>
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </div>
      <p className="text-xs text-foreground-subtle">
        Le plus fiable : une capture d&apos;écran du planning publié, importée ici (bouton, glisser-déposer, ou Ctrl+V / ⌘V pour coller la capture copiée). Mise à jour à la demande, quand le planning de la semaine est publié.
        {data.settings.lastCheckedAt && ` Dernière mise à jour : ${new Date(data.settings.lastCheckedAt).toLocaleString("fr-BE")}.`}
        {pending && " Lecture en cours (quelques secondes)…"}
      </p>
      {data.settings.lastError && <p className="rounded-[var(--radius-md)] border border-danger/40 bg-danger-tint px-3 py-2 text-sm text-danger">Dernière mise à jour : {data.settings.lastError}</p>}

      {data.weeks.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-border p-6 text-center text-sm text-foreground-muted">Aucune semaine lue. Mettez à jour depuis le planning, ou importez l&apos;image (capture de la page publiée).</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {data.weeks.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setSelected(w.id)}
                className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm", w.id === week?.id ? "border-primary bg-primary-tint text-primary-strong" : "border-border text-foreground-muted hover:bg-surface-muted")}
              >
                {weekLabel(w)}
                <Badge variant={w.changed_since_validation ? "accent" : w.status === "validated" ? "success" : "neutral"} className="px-1.5 py-0">
                  {w.changed_since_validation ? "modifiée" : w.status === "validated" ? "validée" : "à vérifier"}
                </Badge>
              </button>
            ))}
          </div>
          {week && <WeekReview key={`${week.id}-${week.updated_at}`} week={week} data={data} />}
        </>
      )}
    </div>
  );
}

type PersonDraft = { initials: string; name: string; role: Role | null };

function People({ data }: { data: PlanningData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<PersonDraft>({ initials: "", name: "", role: null });
  const [editing, setEditing] = useState<(PersonDraft & { id: string }) | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error ?? "Échec.", { variant: "error" });
      toast(ok, { variant: "success" });
      after?.();
      router.refresh();
    });
  const fixes = Object.entries(data.learned);

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-muted">Initiales du planning → nom tel qu&apos;écrit dans le Sheet. Comparaison sans tenir compte de la casse ni des espaces. Un nom ajouté s&apos;applique aussi aux semaines déjà validées.</p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => savePerson(draft), `« ${draft.initials} » ajouté.`, () => setDraft({ initials: "", name: "", role: null }));
        }}
      >
        <label className="space-y-1">
          <span className="block text-xs font-medium text-foreground-muted">Initiales</span>
          <Input value={draft.initials} onChange={(e) => setDraft({ ...draft, initials: e.target.value })} placeholder="He" className="h-9 w-24" />
        </label>
        <label className="min-w-0 flex-1 space-y-1">
          <span className="block text-xs font-medium text-foreground-muted">Nom</span>
          <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-9" />
        </label>
        <RoleSelect value={draft.role} onChange={(role) => setDraft({ ...draft, role })} />
        <Button size="sm" type="submit" disabled={!draft.initials.trim() || !draft.name.trim() || pending}>
          <Plus className="h-4 w-4" /> Ajouter
        </Button>
      </form>
      <ul className="divide-y divide-border rounded-[var(--radius-lg)] border border-border bg-surface">
        {data.people.length === 0 && <li className="p-4 text-sm text-foreground-muted">Aucune correspondance : ajoutez-les ici ou depuis l&apos;écran de vérification.</li>}
        {data.people.map((p) =>
          editing?.id === p.id ? (
            <li key={p.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Input value={editing.initials} onChange={(e) => setEditing({ ...editing, initials: e.target.value })} className="h-9 w-24" aria-label="Initiales" />
              <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-9 min-w-0 flex-1" aria-label="Nom" />
              <RoleSelect value={editing.role} onChange={(role) => setEditing({ ...editing, role })} />
              <Button size="sm" disabled={pending} onClick={() => run(() => savePerson(editing), "Modifié.", () => setEditing(null))}>
                Enregistrer
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                Annuler
              </Button>
            </li>
          ) : (
            <li key={p.id} className="flex items-center gap-2 px-3 py-2">
              <span className="w-16 font-mono text-sm font-semibold">{p.initials}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              {p.role && <Badge variant="neutral">{p.role === "pg" ? "PG" : "Sénior"}</Badge>}
              <Button size="sm" variant="ghost" onClick={() => setEditing({ id: p.id, initials: p.initials, name: p.name, role: p.role })}>
                Modifier
              </Button>
              <Button size="icon" variant="ghost" aria-label={`Supprimer ${p.initials}`} disabled={pending} onClick={() => confirm(`Supprimer « ${p.initials} » ?`) && run(() => deletePerson(p.id), "Supprimé.")}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          )
        )}
      </ul>
      {fixes.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Erreurs de lecture apprises</h2>
          <p className="text-xs text-foreground-muted">Apprises de vos corrections : la prochaine lecture les corrige d&apos;elle-même (et le signale).</p>
          <ul className="flex flex-wrap gap-1.5">
            {fixes.map(([read, fixed]) => (
              <li key={read} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs">
                « {read} » → « {fixed} »
                <button type="button" aria-label={`Oublier ${read}`} onClick={() => run(() => deleteOcrFix(read), "Oublié.")} className="text-foreground-subtle hover:text-danger">
                  <Trash2 className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type RoomDraft = Pick<PlanningRoomRow, "name" | "image_label" | "sort_order" | "active" | "solo" | "part"> & { id?: string; key: string };

function Rooms({ rooms }: { rooms: PlanningRoomRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [list, setList] = useState<RoomDraft[]>(rooms.map((r) => ({ ...r, key: r.id })));
  const [removed, setRemoved] = useState<string[]>([]);
  const set = (key: string, patch: Partial<RoomDraft>) => setList((l) => l.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (i: number, by: -1 | 1) =>
    setList((l) => {
      const out = [...l];
      const j = i + by;
      if (j < 0 || j >= out.length) return l;
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-muted">
        L&apos;ordre est celui des colonnes du Sheet (deux colonnes par salle : sénior, PG). « Colonne de l&apos;image » : le titre de la colonne dans le planning (SALLE 1, END, H.B.…) ; vide, la salle est exportée vide. Inactive : pas exportée. « Seul » : la personne seule dans la salle est le sénior, ou bien un PG ou un sénior (CON) — son rôle dans « Initiales » décide alors. « Prend » : la case entière, ou une seule de ses personnes (END : la 1re pour Endo C24, la 2e pour Endo 3).
      </p>
      <ul className="space-y-2">
        {list.map((r, i) => (
          <li key={r.key} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface p-2">
            <span className="w-6 text-center text-xs tabular-nums text-foreground-subtle">{i + 1}</span>
            <Input value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} aria-label="Nom de la salle" className="h-9 min-w-0 flex-1" />
            <Input value={r.image_label} onChange={(e) => set(r.key, { image_label: e.target.value })} aria-label="Colonne de l'image" placeholder="Colonne de l'image" className="h-9 w-32 font-mono" />
            <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
              Prend :
              <select
                value={r.part ?? ""}
                onChange={(e) => set(r.key, { part: e.target.value ? (Number(e.target.value) as 1 | 2) : null })}
                aria-label="Quelle personne de la case"
                className="h-9 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-xs text-foreground"
              >
                <option value="">la case</option>
                <option value="1">1re personne</option>
                <option value="2">2e personne</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
              Seul :
              <select
                value={r.solo}
                onChange={(e) => set(r.key, { solo: e.target.value as RoomDraft["solo"] })}
                aria-label="Qui est la personne seule"
                className="h-9 rounded-[var(--radius-sm)] border border-border bg-surface px-2 text-xs text-foreground"
              >
                <option value="senior">sénior</option>
                <option value="either">PG ou sénior</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-foreground-muted">
              <Switch checked={r.active} onCheckedChange={(active) => set(r.key, { active })} aria-label="Exportée" /> Exportée
            </label>
            <Button size="icon" variant="ghost" aria-label="Monter" disabled={i === 0} onClick={() => move(i, -1)}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Descendre" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Supprimer la salle"
              onClick={() => {
                if (r.id) setRemoved((x) => [...x, r.id!]);
                setList((l) => l.filter((x) => x.key !== r.key));
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setList((l) => [...l, { key: crypto.randomUUID(), name: "Nouvelle salle", image_label: "", sort_order: l.length + 1, active: true, solo: "senior", part: null }])}>
          <Plus className="h-4 w-4" /> Ajouter une salle
        </Button>
        <Button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveRooms(
                list.map(({ id, name, image_label, active, solo, part }, i) => ({ ...(id ? { id } : {}), name, image_label, active, solo, part, sort_order: i + 1 })),
                removed
              );
              if (!r.ok) return toast(r.error, { variant: "error" });
              toast("Salles enregistrées.", { variant: "success" });
              setRemoved([]);
              router.refresh();
            })
          }
        >
          Enregistrer les salles
        </Button>
      </div>
    </div>
  );
}

function Export({ hasToken, shareToken, edits }: { hasToken: boolean; shareToken: string | null; edits: PlanningData["edits"] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [token, setToken] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const formula = `=IMPORTDATA("${origin}/api/planning-tivoli/export?token=${token ?? "<jeton>"}")`;

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-muted">
        Dans l&apos;onglet « Planning » du Sheet, cellule <b>A3</b> : la formule ci-dessous. Elle remplit une ligne par jour (date, puis sénior et PG de chaque salle, dans l&apos;ordre des salles), pour les semaines validées de J-7 à J+28. Noms résolus ; initiales inconnues telles quelles.
      </p>
      <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-surface-muted p-3">
        <code className="min-w-0 flex-1 break-all text-xs">{formula}</code>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Copier la formule"
          disabled={!token}
          onClick={() => {
            void navigator.clipboard.writeText(formula);
            toast("Formule copiée.", { variant: "success" });
          }}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      {token ? (
        <p className="rounded-[var(--radius-md)] border border-accent/40 bg-accent-tint px-3 py-2 text-sm text-foreground">Jeton affiché une seule fois : copiez la formule maintenant. Il n&apos;est gardé que sous forme hachée.</p>
      ) : (
        <p className="text-sm text-foreground-muted">{hasToken ? "Un jeton est actif (il ne peut pas être réaffiché). En générer un nouveau désactive l'ancien : la formule du Sheet sera à mettre à jour." : "Aucun jeton : l'export répond 401 tant qu'il n'y en a pas."}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            (!hasToken || confirm("Remplacer le jeton actuel ? L'ancienne formule cessera de fonctionner.")) &&
            start(async () => {
              const r = await generateToken();
              if (!r.ok) return toast(r.error, { variant: "error" });
              setToken(r.data.token);
              router.refresh();
            })
          }
        >
          <KeyRound className="h-4 w-4" /> {hasToken ? "Régénérer le jeton" : "Générer un jeton"}
        </Button>
        {hasToken && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() =>
              confirm("Révoquer le jeton ? Le Sheet ne recevra plus le planning.") &&
              start(async () => {
                const r = await revokeToken();
                if (!r.ok) return toast(r.error, { variant: "error" });
                setToken(null);
                toast("Jeton révoqué.", { variant: "success" });
                router.refresh();
              })
            }
          >
            Révoquer
          </Button>
        )}
      </div>
      <ShareLink shareToken={shareToken} edits={edits} />
    </div>
  );
}

function ShareLink({ shareToken, edits }: { shareToken: string | null; edits: PlanningData["edits"] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const link = shareToken ? `${origin}/share/planning-tivoli/${shareToken}` : "";

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <h2 className="text-sm font-semibold text-foreground">Lien public (modifiable par tous)</h2>
      <p className="text-sm text-foreground-muted">Toute personne qui a ce lien voit le planning validé (J-7 à J+28) et peut corriger une case, sans compte ni connexion. Chaque modification est notée ci-dessous et peut être annulée. Si le lien circule trop, désactivez-le ou régénérez-le. Noms de soignants uniquement, aucune donnée patient.</p>
      {link && (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-surface-muted p-3">
          <code className="min-w-0 flex-1 break-all text-xs">{link}</code>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Copier le lien"
            onClick={() => {
              void navigator.clipboard.writeText(link);
              toast("Lien copié.", { variant: "success" });
            }}
          >
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            (!shareToken || confirm("Remplacer le lien ? L'ancien cessera de fonctionner.")) &&
            start(async () => {
              const r = await generateShareLink();
              if (!r.ok) return toast(r.error, { variant: "error" });
              router.refresh();
            })
          }
        >
          <KeyRound className="h-4 w-4" /> {shareToken ? "Régénérer le lien" : "Créer le lien public"}
        </Button>
        {shareToken && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() =>
              confirm("Désactiver le lien public ?") &&
              start(async () => {
                const r = await revokeShareLink();
                if (!r.ok) return toast(r.error, { variant: "error" });
                toast("Lien désactivé.", { variant: "success" });
                router.refresh();
              })
            }
          >
            Désactiver
          </Button>
        )}
      </div>
      {edits.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground-muted">Dernières modifications depuis le lien</h3>
          <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border text-sm">
            {edits.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0">
                  <span className="text-foreground-muted">{new Date(e.created_at).toLocaleString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {frDate(e.day)} · {e.label} :</span> <s className="text-foreground-muted">{e.old_value || "vide"}</s> → <b>{e.new_value || "vide"}</b>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await undoPublicEdit(e.id);
                      if (!r.ok) return toast(r.error, { variant: "error" });
                      toast("Modification annulée.", { variant: "success" });
                      router.refresh();
                    })
                  }
                >
                  Annuler
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: "1. Régler une fois pour toutes",
    body: (
      <>
        <b>Initiales</b> : pour chaque personne, ses initiales, son nom et son rôle (PG ou sénior). Le rôle sert surtout en salle « CON », où une personne seule peut être l&apos;un ou l&apos;autre. Une initiale inconnue peut aussi être ajoutée au moment de la vérification. <b>Salles</b> : l&apos;ordre des colonnes exportées vers le Sheet, les salles actives, et pour END : « Endo C24 » prend la 1re personne, « Endo 3 » la 2e.
      </>
    ),
  },
  {
    title: "2. Quand le planning de la semaine est publié",
    body: (
      <>
        Fais une capture d&apos;écran de la page publiée (tout le tableau, titre avec les dates compris). Dans l&apos;onglet <b>Semaines</b>, importe-la : bouton « Importer une capture », glisser-déposer, ou <b>Ctrl+V / ⌘V</b> pour coller. Le texte est lu par OCR (pas d&apos;IA) en quelques secondes. Le bouton « Lire la page publiée » tente la même chose directement depuis la page, mais la capture reste le plus fiable.
      </>
    ),
  },
  {
    title: "3. Vérifier",
    body: (
      <>
        Chaque jour a son onglet avec le nombre de cases à revoir. Une case montre le texte lu à côté du morceau d&apos;image. Les badges disent ce qui a été touché : <i>Lecture peu sûre</i>, <i>rapproché</i> (une lettre corrigée vers des initiales connues), <i>appris</i> (une erreur déjà corrigée une fois), <i>inconnu</i> (initiales à ajouter). Corrige ce qui est faux : « Ze-He », « Ze+He » et « Ze/He » veulent tous dire PG puis sénior.
      </>
    ),
  },
  {
    title: "4. Valider",
    body: <>« Valider » rend la semaine visible dans l&apos;export et sur le lien public. Tes corrections sont retenues pour les prochaines lectures. Si la même image est importée de nouveau, rien ne change.</>,
  },
  {
    title: "5. Le Google Sheet",
    body: (
      <>
        Onglet <b>Export</b> : génère le jeton et recopie la formule en <b>A3</b> de l&apos;onglet « Planning ». Pour forcer une actualisation, ajoute <code>&amp;v=&quot;&amp;B1</code> à la fin de l&apos;adresse (avant la parenthèse) et change le chiffre en B1.
      </>
    ),
  },
  {
    title: "6. Le lien public",
    body: (
      <>
        Toujours dans <b>Export</b> : « Créer le lien public ». Toute personne qui a le lien voit le planning validé et peut corriger une case, sans compte. Chaque modification est notée dans l&apos;historique (« Annuler » pour la défaire). Lien qui circule trop : régénère-le ou désactive-le.
      </>
    ),
  },
  {
    title: "Si le planning change en cours de semaine",
    body: (
      <>
        Soit on corrige la case sur le lien public, soit tu réimportes la nouvelle capture : la semaine passe en « modifiée », l&apos;export garde la version validée jusqu&apos;à ce que tu aies relu et revalidé. Pour corriger toi-même une semaine validée, « Rouvrir » puis « Valider ».
      </>
    ),
  },
];

function Help() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground-muted">Le planning du bloc, de l&apos;image publiée jusqu&apos;au Sheet et au lien partagé.</p>
      <ol className="space-y-3">
        {STEPS.map((st) => (
          <li key={st.title} className="rounded-[var(--radius-lg)] border border-border p-4">
            <h2 className="mb-1 text-sm font-semibold text-foreground">{st.title}</h2>
            <p className="text-sm text-foreground-muted">{st.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
