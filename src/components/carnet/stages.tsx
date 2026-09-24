"use client";

import { useState } from "react";
import { ClipboardCheck, FileDown, MessageSquareText, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { SupervisorPicker } from "@/components/carnet/supervisor-picker";
import { ChipGroup, EmptyState, Field, SectionTitle, Textarea } from "@/components/carnet/ui";
import { deleteRow, putRow } from "@/lib/carnet/mutations";
import { STAGE_SECTORS, supervisorName } from "@/lib/carnet/referentiel";
import { defaultCoordinatorId, defaultStageSupervisorId, formatDateFr, localDateIso, sortStages } from "@/lib/carnet/logic";
import type { CarnetStage, CarnetStageReview } from "@/lib/carnet/types";

const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6].map((y) => ({ code: y, label: `${y}${y === 1 ? "re" : "e"} année` }));

export function StageFormModal({ initial, onClose, onSaved }: { initial?: CarnetStage | null; onClose: () => void; onSaved?: (stage: CarnetStage) => void }) {
  const { data, commit } = useCarnet();
  const last = sortStages(data.stages)[0];
  const [hospital, setHospital] = useState(initial?.hospital ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [sector, setSector] = useState(initial?.sector ?? "Anesthésie");
  const [year, setYear] = useState<number | null>(initial?.training_year ?? last?.training_year ?? 1);
  const [start, setStart] = useState(initial?.start_date ?? localDateIso());
  const [end, setEnd] = useState(initial?.end_date ?? "");
  // The coordinator is the same for the whole training unless it changes: carried over, shown compactly with a "Changer" link.
  const [coordinatorId, setCoordinatorId] = useState<string | null>(initial ? initial.coordinator_id : defaultCoordinatorId(data.stages));
  const [editCoordinator, setEditCoordinator] = useState(!coordinatorId);
  // The stage's own maître de stage depends on hospital + department: suggested from a previous stage there until picked by hand.
  const [pickedSupervisor, setPickedSupervisor] = useState<{ id: string | null } | null>(initial ? { id: initial.supervisor_id } : null);
  const supervisorId = pickedSupervisor ? pickedSupervisor.id : defaultStageSupervisorId(data.stages, hospital, sector);
  const [error, setError] = useState<string | null>(null);
  const knownHospitals = [...new Set(data.stages.map((s) => s.hospital))];
  const knownSectors = [...new Set([...STAGE_SECTORS, ...data.stages.map((s) => s.sector).filter(Boolean)])];
  const coordinator = data.supervisors.find((s) => s.id === coordinatorId);

  function changeHospital(value: string) {
    setHospital(value);
    // Same hospital as a previous stage: its city too.
    const known = data.stages.find((s) => s.hospital.trim().toLowerCase() === value.trim().toLowerCase());
    if (known && !city.trim()) setCity(known.city);
  }

  function save() {
    if (!hospital.trim()) return setError("Indiquez le lieu de stage.");
    if (!year) return setError("Indiquez l'année de formation.");
    if (end && end < start) return setError("La date de fin précède la date de début.");
    const stage: CarnetStage = {
      id: initial?.id ?? crypto.randomUUID(),
      hospital: hospital.trim(),
      city: city.trim(),
      sector: sector.trim(),
      coordinator_id: coordinatorId,
      supervisor_id: supervisorId,
      training_year: year,
      start_date: start,
      end_date: end || null,
      created_at: initial?.created_at ?? new Date().toISOString(),
    };
    commit([putRow("stages", stage)]);
    onSaved?.(stage);
    onClose();
  }

  return (
    <Modal title={initial ? "Modifier le stage" : "Nouveau stage"} onClose={onClose} size="md">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Lieu de stage (hôpital)">
            <Input value={hospital} onChange={(e) => changeHospital(e.target.value)} list="carnet-hospitals" placeholder="ex. CHU Saint-Pierre" className="h-11" />
            <datalist id="carnet-hospitals">
              {knownHospitals.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
          </Field>
          <Field label="Ville">
            <Input value={city} onChange={(e) => setCity(e.target.value)} className="h-11" />
          </Field>
        </div>
        <Field label="Secteur / activité">
          <Input value={sector} onChange={(e) => setSector(e.target.value)} list="carnet-sectors" placeholder="ex. Anesthésie, Soins intensifs, Algologie…" className="h-11" />
          <datalist id="carnet-sectors">
            {knownSectors.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Field>
        <Field label="Année de formation">
          <ChipGroup options={YEAR_OPTIONS} value={year} onChange={setYear} size="sm" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Début">
            <Input type="date" value={start} onChange={(e) => e.target.value && setStart(e.target.value)} className="h-11" />
          </Field>
          <Field label="Fin (si connue)">
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-11" />
          </Field>
        </div>
        <Field label="Maître de stage du service" hint="Celui qui évalue ce stage (grille d'évaluation) — propre à l'hôpital et au service.">
          <SupervisorPicker value={supervisorId} onChange={(id) => setPickedSupervisor({ id })} hospital={hospital} defaultRole="Maître de stage" />
        </Field>
        {editCoordinator ? (
          <Field label="Maître de stage coordinateur" hint="Le même pendant toute la formation : il sera repris automatiquement pour les stages suivants.">
            <SupervisorPicker value={coordinatorId} onChange={setCoordinatorId} hospital={hospital} defaultRole="Maître de stage coordinateur" />
          </Field>
        ) : (
          <p className="text-sm text-foreground-muted">
            Coordinateur : <span className="font-medium text-foreground">{supervisorName(coordinator) || "—"}</span>{" "}
            <button type="button" onClick={() => setEditCoordinator(true)} className="ml-1 text-xs font-medium text-primary hover:underline">
              Changer
            </button>
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit">Enregistrer</Button>
        </div>
      </form>
    </Modal>
  );
}

function ScoreRow({ label, value, onChange, min, max }: { label: string; value: number | null; onChange: (v: number | null) => void; min: number; max: number }) {
  const options = Array.from({ length: max - min + 1 }, (_, i) => ({ code: min + i, label: `${min + i > 0 && min < 0 ? "+" : ""}${min + i}` }));
  return (
    <Field label={label}>
      <ChipGroup options={options} value={value} onChange={onChange} allowClear size="sm" />
    </Field>
  );
}

/** The candidate's own evaluation of the stage — the carnet's "Evaluation personnelle" page, one per stage. */
function ReviewModal({ stage, onClose }: { stage: CarnetStage; onClose: () => void }) {
  const { data, commit } = useCarnet();
  const { toast } = useToast();
  const existing = data.stage_reviews.find((r) => r.stage_id === stage.id);
  const [review, setReview] = useState<CarnetStageReview>(
    existing ?? {
      id: crypto.randomUUID(),
      stage_id: stage.id,
      global_impression: "",
      liked: "",
      disliked: "",
      would_change: "",
      would_return: null,
      score_interest: null,
      score_clinical_guidance: null,
      score_atmosphere: null,
      score_theoretical_guidance: null,
      score_responsibilities: null,
    }
  );
  const set = (patch: Partial<CarnetStageReview>) => setReview((r) => ({ ...r, ...patch }));

  return (
    <Modal title="Évaluation personnelle du stage" description={`${stage.hospital} — ${formatDateFr(stage.start_date)}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <Field label="Impression globale du stage">
          <Textarea rows={3} value={review.global_impression} onChange={(e) => set({ global_impression: e.target.value })} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ce que vous avez aimé">
            <Textarea rows={3} value={review.liked} onChange={(e) => set({ liked: e.target.value })} />
          </Field>
          <Field label="Ce que vous n'avez pas aimé">
            <Textarea rows={3} value={review.disliked} onChange={(e) => set({ disliked: e.target.value })} />
          </Field>
        </div>
        <Field label="Que changeriez-vous résolument si on vous en donnait la possibilité ?">
          <Textarea rows={2} value={review.would_change} onChange={(e) => set({ would_change: e.target.value })} />
        </Field>
        <Field label="Si vous en aviez l'occasion, y retourneriez-vous en stage ?">
          <ChipGroup
            options={[
              { code: "oui", label: "Oui" },
              { code: "non", label: "Non" },
            ]}
            value={review.would_return === null ? null : review.would_return ? "oui" : "non"}
            onChange={(v) => set({ would_return: v === null ? null : v === "oui" })}
            allowClear
          />
        </Field>
        <ScoreRow label="Intérêt du travail clinique (0 pas du tout – 10 exceptionnel)" value={review.score_interest} onChange={(v) => set({ score_interest: v })} min={0} max={10} />
        <ScoreRow label="Guidance clinique des encadrants (0 insuffisante – 10 excellente)" value={review.score_clinical_guidance} onChange={(v) => set({ score_clinical_guidance: v })} min={0} max={10} />
        <ScoreRow label="Ambiance de travail (0 exécrable – 10 idyllique)" value={review.score_atmosphere} onChange={(v) => set({ score_atmosphere: v })} min={0} max={10} />
        <ScoreRow label="Guidance théorique (0 jamais – 10 en permanence)" value={review.score_theoretical_guidance} onChange={(v) => set({ score_theoretical_guidance: v })} min={0} max={10} />
        <ScoreRow label="Responsabilités cliniques confiées (−5 beaucoup trop peu, 0 idéal, +5 beaucoup trop)" value={review.score_responsibilities} onChange={(v) => set({ score_responsibilities: v })} min={-5} max={5} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            onClick={() => {
              commit([putRow("stage_reviews", review)]);
              toast("Évaluation enregistrée.", { variant: "success" });
              onClose();
            }}
          >
            Enregistrer
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function StagesView({ activeStageId, onActivate, onDownloadGrid }: { activeStageId: string | null; onActivate: (id: string) => void; onDownloadGrid: (stage: CarnetStage) => void }) {
  const { data, commit } = useCarnet();
  const { toast } = useToast();
  const [editing, setEditing] = useState<CarnetStage | "new" | null>(null);
  const [reviewing, setReviewing] = useState<CarnetStage | null>(null);
  const stages = sortStages(data.stages);

  return (
    <div className="space-y-4">
      <SectionTitle
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Nouveau stage
          </Button>
        }
      >
        Stages
      </SectionTitle>
      {stages.length === 0 ? (
        <EmptyState title="Aucun stage.">Créez votre stage en cours pour commencer à loguer vos cas.</EmptyState>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {stages.map((stage) => {
            const cases = data.cases.filter((c) => c.stage_id === stage.id).length;
            const duties = data.duties.filter((d) => d.stage_id === stage.id).length;
            const supervisor = data.supervisors.find((s) => s.id === stage.supervisor_id);
            const hasReview = data.stage_reviews.some((r) => r.stage_id === stage.id);
            const isActive = stage.id === activeStageId;
            return (
              <div key={stage.id} className={`rounded-[var(--radius-lg)] border bg-surface p-4 ${isActive ? "border-primary" : "border-border"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{stage.hospital}</p>
                    <p className="text-sm text-foreground-muted">{[stage.sector, stage.city].filter(Boolean).join(" · ")}</p>
                    <p className="mt-1 text-xs text-foreground-subtle">
                      {stage.training_year}
                      {stage.training_year === 1 ? "re" : "e"} année · du {formatDateFr(stage.start_date)}
                      {stage.end_date ? ` au ${formatDateFr(stage.end_date)}` : " (en cours)"}
                    </p>
                    <p className="text-xs text-foreground-subtle">Maître de stage : {supervisorName(supervisor) || "—"}</p>
                    <p className="mt-1 text-xs text-foreground-muted">
                      {cases} cas · {duties} garde{duties > 1 ? "s" : ""}
                    </p>
                  </div>
                  {isActive ? (
                    <span className="shrink-0 rounded-full bg-primary-tint px-2 py-0.5 text-xs font-medium text-primary-strong">Actif</span>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => onActivate(stage.id)}>
                      Activer
                    </Button>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(stage)}>
                    <Pencil className="h-3.5 w-3.5" /> Modifier
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setReviewing(stage)}>
                    <MessageSquareText className="h-3.5 w-3.5" /> {hasReview ? "Mon évaluation" : "Évaluer le stage"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDownloadGrid(stage)} title="Grille à faire remplir à la main par le maître de stage">
                    <FileDown className="h-3.5 w-3.5" /> Grille d&apos;évaluation
                  </Button>
                  {cases === 0 && duties === 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={() => {
                        if (!confirm("Supprimer ce stage ?")) return;
                        commit([deleteRow("stages", stage.id)]);
                        toast("Stage supprimé.", { variant: "success" });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Supprimer
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="flex items-start gap-1.5 text-xs text-foreground-subtle">
        <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> La grille d&apos;évaluation du maître de stage reste sur papier : elle est générée avec
        l&apos;en-tête déjà rempli, à imprimer et faire compléter.
      </p>
      {editing && <StageFormModal initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(s) => editing === "new" && onActivate(s.id)} />}
      {reviewing && <ReviewModal stage={reviewing} onClose={() => setReviewing(null)} />}
    </div>
  );
}
