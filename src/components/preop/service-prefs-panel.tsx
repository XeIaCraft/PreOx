"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChipGroup } from "@/components/carnet/ui";
import { useToast } from "@/components/ui/toast";
import { FieldLabel, Panel } from "@/components/preop/ui";
import { useCatalogs } from "@/components/preop/use-catalogs";
import { DEFAULT_SERVICE_PREFS, type ServicePrefs } from "@/lib/preop/service-prefs";

const PROTOCOL = "protocol";
type Opt<T extends string> = T | typeof PROTOCOL;

const FIO2: { code: string; label: string; value: [number, number] }[] = [
  { code: "0.3-0.4", label: "30–40 %", value: [0.3, 0.4] },
  { code: "0.4-0.5", label: "40–50 %", value: [0.4, 0.5] },
  { code: "0.5-0.6", label: "50–60 %", value: [0.5, 0.6] },
  { code: "0.8-0.8", label: "80 %", value: [0.8, 0.8] },
];
const FLOWS = [0.5, 1, 2];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <FieldLabel>{label}</FieldLabel>
      {children}
    </div>
  );
}

/** Réglages › Service : the department's habits, applied to every protocol when it becomes a plan. */
export function ServicePrefsPanel() {
  const { service, saveService } = useCatalogs();
  const { toast } = useToast();
  const [draft, setDraft] = useState<ServicePrefs | null>(null);
  const [busy, setBusy] = useState(false);
  const p = draft ?? service;
  const set = (patch: Partial<ServicePrefs>) => setDraft({ ...p, ...patch });
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(service);

  return (
    <Panel title="Habitudes du service">
      <p className="text-sm text-foreground-muted">
        Appliquées à chaque protocole quand il devient le plan d&apos;un patient adulte ; les protocoles eux-mêmes ne changent pas. Un protocole en AIVOC reste en AIVOC ; un enfant garde le plan pédiatrique. Halogéné : sévoflurane (le seul encore utilisé en Belgique).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Row label="FiO₂ d'entretien">
          <ChipGroup
            size="sm"
            options={[{ code: PROTOCOL, label: "Celle du protocole" }, ...FIO2.map((f) => ({ code: f.code, label: f.label }))]}
            value={p.fio2 ? `${p.fio2[0]}-${p.fio2[1]}` : PROTOCOL}
            onChange={(v) => set({ fio2: FIO2.find((f) => f.code === v)?.value ?? null })}
          />
        </Row>
        <Row label="Débit de gaz frais en entretien">
          <ChipGroup
            size="sm"
            options={[{ code: PROTOCOL, label: "Celui du protocole" }, ...FLOWS.map((f) => ({ code: String(f), label: `${String(f).replace(".", ",")} L/min` }))]}
            value={p.freshGasLMin === null ? PROTOCOL : String(p.freshGasLMin)}
            onChange={(v) => set({ freshGasLMin: !v || v === PROTOCOL ? null : Number(v) })}
          />
        </Row>
        <Row label="Sétron (NVPO)">
          <ChipGroup<Opt<NonNullable<ServicePrefs["setron"]>>>
            size="sm"
            options={[
              { code: PROTOCOL, label: "Celui du protocole" },
              { code: "ondansetron", label: "Ondansétron 4 mg" },
              { code: "granisetron", label: "Granisétron 1 mg" },
            ]}
            value={p.setron ?? PROTOCOL}
            onChange={(v) => set({ setron: !v || v === PROTOCOL ? null : v })}
          />
        </Row>
        <Row label="Dexaméthasone (NVPO)">
          <ChipGroup
            size="sm"
            options={[
              { code: PROTOCOL, label: "Celle du protocole" },
              { code: "4", label: "4 mg" },
              { code: "8", label: "8 mg" },
            ]}
            value={p.dexamethasoneMg === null ? PROTOCOL : String(p.dexamethasoneMg)}
            onChange={(v) => set({ dexamethasoneMg: v === "4" ? 4 : v === "8" ? 8 : null })}
          />
        </Row>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!dirty || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await saveService(p);
              setDraft(null);
              toast("Habitudes du service enregistrées : elles s'appliqueront aux prochains plans.", { variant: "success" });
            } catch (err) {
              toast(err instanceof Error ? err.message : "Enregistrement impossible.", { variant: "error" });
            } finally {
              setBusy(false);
            }
          }}
        >
          Enregistrer
        </Button>
        {JSON.stringify(p) !== JSON.stringify(DEFAULT_SERVICE_PREFS) && (
          <Button variant="ghost" disabled={busy} onClick={() => setDraft(DEFAULT_SERVICE_PREFS)}>
            Tout reprendre des protocoles
          </Button>
        )}
      </div>
    </Panel>
  );
}
