"use client";

import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { EmptyState, Field, SectionTitle } from "@/components/carnet/ui";
import { deleteRow, patchRow, putRow } from "@/lib/carnet/mutations";
import { supervisorName } from "@/lib/carnet/referentiel";
import type { CarnetSupervisor } from "@/lib/carnet/types";

const ROLES = ["Maître de stage coordinateur", "Maître de stage local", "S.C.T. (superviseur de formation)", "Chef de service", "Superviseur"];

function SupervisorModal({ initial, onClose }: { initial: CarnetSupervisor | null; onClose: () => void }) {
  const { commit } = useCarnet();
  const [s, setS] = useState<CarnetSupervisor>(
    initial ?? { id: crypto.randomUUID(), last_name: "", first_name: "", role: "", usual_hospital: "", archived: false, created_at: new Date().toISOString() }
  );
  const set = (patch: Partial<CarnetSupervisor>) => setS((x) => ({ ...x, ...patch }));
  return (
    <Modal title={initial ? "Modifier le superviseur" : "Nouveau superviseur"} onClose={onClose} size="sm">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!s.last_name.trim()) return;
          commit([putRow("supervisors", { ...s, last_name: s.last_name.trim(), first_name: s.first_name.trim() })]);
          onClose();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom">
            <Input value={s.last_name} onChange={(e) => set({ last_name: e.target.value })} required className="h-11" />
          </Field>
          <Field label="Prénom">
            <Input value={s.first_name} onChange={(e) => set({ first_name: e.target.value })} className="h-11" />
          </Field>
        </div>
        <Field label="Fonction">
          <Input value={s.role} onChange={(e) => set({ role: e.target.value })} list="carnet-roles" className="h-11" />
          <datalist id="carnet-roles">
            {ROLES.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>
        <Field label="Hôpital habituel" hint="Sert à le proposer en premier pendant les stages dans cet hôpital.">
          <Input value={s.usual_hospital} onChange={(e) => set({ usual_hospital: e.target.value })} className="h-11" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit">Enregistrer</Button>
        </div>
      </form>
    </Modal>
  );
}

/** Référentiel des superviseurs — shared by cases, duties and stages. Anyone referenced by a case can be archived (hidden from pickers) but not deleted. */
export function SupervisorsView() {
  const { data, commit } = useCarnet();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CarnetSupervisor | "new" | null>(null);
  const usage = useMemo(() => {
    const counts = new Map<string, number>();
    const add = (id: string | null) => id && counts.set(id, (counts.get(id) ?? 0) + 1);
    data.cases.forEach((c) => add(c.tutor_id));
    data.duties.forEach((d) => add(d.supervisor_id));
    data.stages.forEach((s) => add(s.coordinator_id));
    return counts;
  }, [data.cases, data.duties, data.stages]);
  const q = query.trim().toLowerCase();
  const list = data.supervisors
    .filter((s) => !q || `${s.first_name} ${s.last_name} ${s.role} ${s.usual_hospital}`.toLowerCase().includes(q))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.last_name.localeCompare(b.last_name));

  return (
    <div className="space-y-4">
      <SectionTitle
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        }
      >
        Superviseurs
      </SectionTitle>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher…" className="pl-9" />
      </div>
      {list.length === 0 ? (
        <EmptyState title="Aucun superviseur.">Ils se créent aussi directement depuis la saisie d&apos;un cas.</EmptyState>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          {list.map((s) => {
            const used = usage.get(s.id) ?? 0;
            return (
              <li key={s.id} className={`flex items-center gap-2 px-3 py-2.5 ${s.archived ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {supervisorName(s)} {s.archived && <span className="text-xs font-normal text-foreground-subtle">(archivé)</span>}
                  </p>
                  <p className="truncate text-xs text-foreground-subtle">
                    {[s.role, s.usual_hospital].filter(Boolean).join(" · ") || "—"} · {used} utilisation{used > 1 ? "s" : ""}
                  </p>
                </div>
                <Button variant="ghost" size="icon" aria-label="Modifier" onClick={() => setEditing(s)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={s.archived ? "Désarchiver" : "Archiver"}
                  title={s.archived ? "Désarchiver" : "Archiver (masqué des listes de choix)"}
                  onClick={() => commit([patchRow("supervisors", s.id, { archived: !s.archived })])}
                >
                  {s.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </Button>
                {used === 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Supprimer"
                    onClick={() => confirm(`Supprimer ${supervisorName(s)} ?`) && commit([deleteRow("supervisors", s.id)])}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing && <SupervisorModal initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
