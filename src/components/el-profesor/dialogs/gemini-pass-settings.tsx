"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { readGeminiPassSettings, updateGeminiPassSettings } from "@/app/apps/el-profesor/actions/settings";
import { DEFAULT_GEMINI_PASS_SETTINGS, plannedGeminiPasses } from "@/lib/el-profesor/gemini-passes";

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
  const example = [5, 12, 25].map((p) => `${p} p. → ${plannedGeminiPasses(p, current)}`).join(" · ");

  return (
    <div className="mt-5 space-y-2 border-t border-border pt-4">
      <Label>Passes Gemini selon le nombre de pages</Label>
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-foreground-subtle">1 passe par … pages</span>
          <Input inputMode="decimal" value={pagesPerPass} onChange={(e) => setPagesPerPass(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-foreground-subtle">Passes max</span>
          <Input inputMode="numeric" value={maxPasses} onChange={(e) => setMaxPasses(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-foreground-subtle">Arrêt si &lt; … ajouts</span>
          <Input inputMode="numeric" value={minAdded} onChange={(e) => setMinAdded(e.target.value)} />
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
        Dans la file Gemini, une extraction est suivie de passes de complément jusqu&apos;à ce total (extraction comprise) : {example}. La série s&apos;arrête plus tôt si une passe ajoute moins
        d&apos;éléments nouveaux que le seuil (doublons retirés). Réglage par défaut (1 passe / 3 pages) calé sur « Le livre de l&apos;interne » : Gemini lite rend ≈ 25–30 éléments par appel, Claude ≈ 8 par page.
      </p>
    </div>
  );
}
