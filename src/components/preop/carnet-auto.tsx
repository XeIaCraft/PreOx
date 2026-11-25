"use client";

import { useEffect, useRef } from "react";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { useToast } from "@/components/ui/toast";
import { putRow } from "@/lib/carnet/mutations";
import { autoPlanChoices, plannedCaseFromDossier } from "@/lib/preop/carnet-link";
import { dossierDate, type Dossier } from "@/lib/preop/dossier";

/**
 * Dossiers brought from CARE are planned in the carnet by themselves (counted nowhere until « Fait »),
 * with the supervisor of the day. Mounted only when the user has the carnet.
 */
export function CarnetAutoPlanner({ ids, dossiers, onPlanned }: { ids: string[]; dossiers: Dossier[]; onPlanned: (d: Dossier) => void }) {
  const { data, commit, status } = useCarnet();
  const { toast } = useToast();
  const done = useRef(new Set<string>());
  useEffect(() => {
    if (!status.ready) return;
    for (const id of ids) {
      if (done.current.has(id)) continue;
      const d = dossiers.find((x) => x.id === id);
      if (!d) continue;
      done.current.add(id);
      if (d.carnetCaseId) continue;
      const date = dossierDate(d);
      const choices = date ? autoPlanChoices(d, data, date) : null;
      if (!date || !choices) {
        toast(`Dossier ${d.initials} : pas planifié dans le carnet (${date ? "aucun stage ce jour-là" : "date de l'intervention inconnue"}).`);
        continue;
      }
      const row = plannedCaseFromDossier(d, choices, date);
      commit([putRow("cases", row)]);
      const tutor = choices.tutorId ? data.supervisors.find((s) => s.id === choices.tutorId) : undefined;
      onPlanned({ ...d, carnetCaseId: row.id });
      toast(`Dossier ${d.initials} planifié dans le carnet${tutor ? ` (superviseur : ${tutor.first_name} ${tutor.last_name})` : " — superviseur à choisir"}.`, { variant: "success" });
    }
  }, [ids, dossiers, data, commit, status.ready, toast, onPlanned]);
  return null;
}
