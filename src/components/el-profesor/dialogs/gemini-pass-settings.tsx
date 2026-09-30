"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { readGeminiPassSettings, updateGeminiPassSettings } from "@/app/apps/el-profesor/actions/settings";
import { DEFAULT_GEMINI_PASS_SETTINGS, complementWindows } from "@/lib/el-profesor/gemini-passes";

const num = (s: string) => Number(s.replace(",", "."));

/** Réglages IA › how many Gemini passes a chapter gets from its page count. */
export function GeminiPassSettingsSection() {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [pagesPerPass, setPagesPerPass] = useState(String(DEFAULT_GEMINI_PASS_SETTINGS.pagesPerPass));
  const [maxPasses, setMaxPasses] = useState(String(DEFAULT_GEMINI_PASS_SETTINGS.maxPasses));
  const [minAdded, setMinAdded] = useState(String(DEFAULT_GEMINI_PASS_SETTINGS.minAddedPerPass));

  useEffect(() => {
    readGeminiPassSettings()
      .then((s) => {
        setPagesPerPass(String(s.pagesPerPass).replace(".", ","));
        setMaxPasses(String(s.maxPasses));
        setMinAdded(String(s.minAddedPerPass));
      })
      .catch(() => undefined);
  }, []);

  const current = { pagesPerPass: num(pagesPerPass), maxPasses: Math.round(num(maxPasses)), minAddedPerPass: Math.round(num(minAdded)) };
  const example = [5, 12, 25].map((p) => `${p} p. → 1 + ${complementWindows(p, current).length}`).join(" · ");

  return (
    <div className="mt-5 space-y-2 border-t border-border pt-4">
      <Label>Passes Gemini selon le nombre de pages</Label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-foreground-subtle">1 tranche de complément par … pages</span>
          <Input inputMode="decimal" value={pagesPerPass} onChange={(e) => setPagesPerPass(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-foreground-subtle">Passes max (extraction comprise)</span>
          <Input inputMode="numeric" value={maxPasses} onChange={(e) => setMaxPasses(e.target.value)} />
        </label>
      </div>
      <Button
        variant="secondary"
        size="sm"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const r = await updateGeminiPassSettings(current);
            toast(r.error ?? r.success ?? "Enregistré.", { variant: r.error ? "error" : "success" });
          })
        }
      >
        {isPending ? "…" : "Enregistrer"}
      </Button>
      <p className="text-xs text-foreground-subtle">
        Dans la file Gemini, une extraction est suivie d&apos;un balayage du chapitre par tranches de pages : chaque passe de complément doit extraire tout ce qui manque sur sa tranche (pages 1–3, puis 4–6…). Exemples (extraction + compléments) : {example}. Doublons retirés à l&apos;enregistrement. Réglage par défaut calé sur « Le livre de l&apos;interne » : invité à « chercher ce qui manque » dans tout le chapitre, Gemini lite répondait « rien » ; sur une tranche imposée, il extrait.
      </p>
    </div>
  );
}
