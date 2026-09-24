"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useCarnet } from "@/components/carnet/carnet-provider";
import { Field, SectionTitle, Textarea } from "@/components/carnet/ui";
import { SignaturePad } from "@/components/carnet/signature-pad";
import { putProfile } from "@/lib/carnet/mutations";
import type { CarnetProfile } from "@/lib/carnet/types";

const EMPTY: CarnetProfile = {
  last_name: "",
  first_name: "",
  nationality: "",
  birth_place: "",
  birth_date: null,
  addresses: [{ address: "", since: null }],
  email: "",
  phone: "",
  university: "",
  graduation_year: null,
  pre_training_activities: "",
  signature: "",
};

/** The carnet's "Identification" page (and the contact block of its last page). Filled once. */
export function ProfileView() {
  const { data, commit } = useCarnet();
  const { toast } = useToast();
  const [profile, setProfile] = useState<CarnetProfile>(() => data.profile ?? EMPTY);
  const [redraw, setRedraw] = useState(false);
  const set = (patch: Partial<CarnetProfile>) => setProfile((p) => ({ ...p, ...patch }));

  function save() {
    setRedraw(false);
    commit([putProfile({ ...profile, addresses: profile.addresses.filter((a) => a.address.trim()) })]);
    toast("Identification enregistrée.", { variant: "success" });
  }

  return (
    <form
      className="max-w-3xl space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <SectionTitle>Identification</SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom">
          <Input value={profile.last_name} onChange={(e) => set({ last_name: e.target.value })} className="h-11" />
        </Field>
        <Field label="Prénom(s)">
          <Input value={profile.first_name} onChange={(e) => set({ first_name: e.target.value })} className="h-11" />
        </Field>
        <Field label="Nationalité">
          <Input value={profile.nationality} onChange={(e) => set({ nationality: e.target.value })} className="h-11" />
        </Field>
        <Field label="Lieu de naissance">
          <Input value={profile.birth_place} onChange={(e) => set({ birth_place: e.target.value })} className="h-11" />
        </Field>
        <Field label="Date de naissance">
          <Input type="date" value={profile.birth_date ?? ""} onChange={(e) => set({ birth_date: e.target.value || null })} className="h-11" />
        </Field>
        <Field label="Téléphone">
          <Input type="tel" value={profile.phone} onChange={(e) => set({ phone: e.target.value })} className="h-11" />
        </Field>
        <Field label="Adresse mail" className="sm:col-span-2">
          <Input type="email" value={profile.email} onChange={(e) => set({ email: e.target.value })} className="h-11" />
        </Field>
      </div>

      <Field label="Adresse et changements éventuels" hint="La plus récente en dernier.">
        <div className="space-y-2">
          {profile.addresses.map((a, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto] gap-2">
              <Input
                value={a.address}
                onChange={(e) => set({ addresses: profile.addresses.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)) })}
                placeholder="Rue, numéro, code postal, ville"
                className="h-11"
              />
              <Input
                type="date"
                value={a.since ?? ""}
                onChange={(e) => set({ addresses: profile.addresses.map((x, j) => (j === i ? { ...x, since: e.target.value || null } : x)) })}
                aria-label="Depuis le"
                title="Depuis le"
                className="h-11 w-40"
              />
              <Button type="button" variant="ghost" size="icon" aria-label="Retirer cette adresse" onClick={() => set({ addresses: profile.addresses.filter((_, j) => j !== i) })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => set({ addresses: [...profile.addresses, { address: "", since: null }] })}>
            <Plus className="h-4 w-4" /> Ajouter une adresse
          </Button>
        </div>
      </Field>

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Field label="Diplôme de médecine de l'université de">
          <Input value={profile.university} onChange={(e) => set({ university: e.target.value })} className="h-11" />
        </Field>
        <Field label="Année de diplôme">
          <Input
            type="number"
            inputMode="numeric"
            value={profile.graduation_year ?? ""}
            onChange={(e) => set({ graduation_year: e.target.value ? Number(e.target.value) : null })}
            className="h-11 w-32"
          />
        </Field>
      </div>

      <Field label="Activités professionnelles depuis la fin de l'université jusqu'au début des stages" hint="Nature, lieu, date, examens, résultats.">
        <Textarea rows={5} value={profile.pre_training_activities} onChange={(e) => set({ pre_training_activities: e.target.value })} />
      </Field>

      <Field label="Votre signature" hint="Reportée sur la déclaration (page 2) et le rapport d'activité du carnet exporté.">
        {profile.signature && !redraw ? (
          <div className="flex flex-wrap items-end gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- stored data URL, nothing for next/image to optimize */}
            <img src={profile.signature} alt="Votre signature" className="h-20 rounded border border-border bg-white object-contain p-1" />
            <Button type="button" variant="ghost" size="sm" onClick={() => setRedraw(true)}>
              Refaire
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => set({ signature: "" })}>
              Effacer
            </Button>
          </div>
        ) : (
          <div className="max-w-md">
            <SignaturePad onChange={(png) => set({ signature: png ?? "" })} />
          </div>
        )}
      </Field>

      <div className="flex justify-end">
        <Button type="submit" size="lg">
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
