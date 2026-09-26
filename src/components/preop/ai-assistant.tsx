"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpenCheck, ExternalLink, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { FieldLabel, NumberField, Panel } from "@/components/preop/ui";
import { request } from "@/components/preop/api";
import { outgoingText, privacyIssues } from "@/lib/preop/ai/privacy";
import type { AiStatus, ConsensusPaper } from "@/lib/preop/ai/types";

/** The assistant's configuration (never the keys themselves). null while loading or unavailable. */
export function useAiStatus() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const { status: s } = await request<{ status: AiStatus }>("/api/preop/ai");
      setStatus(s);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assistant indisponible.");
    }
  }, []);
  useEffect(() => {
    // Initial load; setState happens after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);
  return { status, error, setStatus, refresh };
}

/** Paramètres › Assistant IA: keys (stored encrypted on the server), model, monthly Consensus quota. */
export function AiSettings() {
  const { toast } = useToast();
  const { status, error, setStatus } = useAiStatus();
  const [geminiKey, setGeminiKey] = useState("");
  const [consensusKey, setConsensusKey] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [limit, setLimit] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  async function save(patch: Record<string, unknown>, message: string) {
    setSaving(true);
    try {
      const { status: s } = await request<{ status: AiStatus }>("/api/preop/ai", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      setStatus(s);
      setGeminiKey("");
      setConsensusKey("");
      toast(message, { variant: "success" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Enregistrement impossible.", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel title="Assistant IA">
        <p className="flex items-start gap-2 text-sm text-foreground-muted">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Sert à établir des règles et des protocoles généraux : seule une question générale part (médicament, dose, geste, type d&apos;intervention), jamais un dossier. Le serveur refuse tout texte qui
            contient une date, un nom, des initiales, un numéro ou une adresse, et les âges sont arrondis à la dizaine. Les clés sont chiffrées sur le serveur et ne reviennent jamais dans le navigateur.
          </span>
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </Panel>

      <Panel title="Consensus : trouver les sources">
        <p className="text-sm text-foreground-muted">
          Recherche dans les revues médicales et les recommandations (sans prépublications). Clé à créer dans le tableau de bord API &amp; MCP de votre compte Consensus.{" "}
          {status?.consensus.configured ? (
            <strong>
              Clé enregistrée · {status.consensus.used}/{status.consensus.limit} appels ce mois-ci.
            </strong>
          ) : (
            <strong>Aucune clé.</strong>
          )}
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
          <label className="block space-y-1">
            <FieldLabel>Clé API Consensus</FieldLabel>
            <Input type="password" autoComplete="off" value={consensusKey} onChange={(e) => setConsensusKey(e.target.value)} placeholder={status?.consensus.configured ? "•••••• (remplacer)" : "Collez la clé"} />
          </label>
          <NumberField label="Quota mensuel" value={limit ?? status?.consensus.limit} onChange={(v) => setLimit(v)} unit="appels" />
          <Button disabled={saving || (!consensusKey.trim() && limit === undefined)} onClick={() => save({ ...(consensusKey.trim() ? { consensusKey } : {}), ...(limit !== undefined ? { consensusLimit: Math.round(limit) } : {}) }, "Réglages Consensus enregistrés.")}>
            <KeyRound className="h-4 w-4" /> Enregistrer
          </Button>
        </div>
        {status?.consensus.configured && (
          <Button variant="ghost" size="sm" disabled={saving} onClick={() => save({ consensusKey: "" }, "Clé Consensus supprimée.")}>
            Supprimer la clé
          </Button>
        )}
      </Panel>

      <Panel title="Gemini : rédiger une proposition">
        <p className="text-sm text-foreground-muted">
          Rédige la réponse au format des règles à partir des sources trouvées. La clé gratuite de Google AI Studio suffit.{" "}
          {status?.gemini.configured ? (
            <strong>
              {status.gemini.from === "a-table" ? "Utilise la clé Gemini de votre module À table" : "Clé enregistrée"} · modèle {status.gemini.model}.
            </strong>
          ) : (
            <strong>Aucune clé.</strong>
          )}
        </p>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-[minmax(0,1fr)_14rem_auto] sm:items-end">
          <label className="block space-y-1">
            <FieldLabel>Clé API Gemini</FieldLabel>
            <Input type="password" autoComplete="off" value={geminiKey} onChange={(e) => setGeminiKey(e.target.value)} placeholder={status?.gemini.from === "preop" ? "•••••• (remplacer)" : "Collez la clé"} />
          </label>
          <label className="block space-y-1">
            <FieldLabel>Modèle</FieldLabel>
            <Input value={model ?? status?.gemini.model ?? ""} onChange={(e) => setModel(e.target.value)} placeholder="gemini-3.1-flash-lite" />
          </label>
          <Button disabled={saving || (!geminiKey.trim() && model === null)} onClick={() => save({ ...(geminiKey.trim() ? { geminiKey } : {}), ...(model !== null ? { geminiModel: model } : {}) }, "Réglages Gemini enregistrés.")}>
            <KeyRound className="h-4 w-4" /> Enregistrer
          </Button>
        </div>
        {status?.gemini.from === "preop" && (
          <Button variant="ghost" size="sm" disabled={saving} onClick={() => save({ geminiKey: "" }, "Clé Gemini supprimée.")}>
            Supprimer la clé
          </Button>
        )}
      </Panel>
    </div>
  );
}

/**
 * In the rule wizard: search the sources with Consensus, then let Gemini
 * draft the answer in the block format. Shows exactly what will be sent,
 * and refuses to send it when it may identify a patient.
 */
export function AiQuestionPanel({ query, prompt, onAnswer, mode = "rule" }: { query: string; prompt: string; onAnswer: (text: string, tool: string) => void; mode?: "rule" | "protocol" }) {
  const { toast } = useToast();
  const { status, setStatus } = useAiStatus();
  const [papers, setPapers] = useState<ConsensusPaper[] | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<"consensus" | "gemini" | null>(null);

  if (!status || (!status.consensus.configured && !status.gemini.configured)) {
    return (
      <p className="flex items-start gap-2 rounded-[var(--radius-md)] border border-dashed border-border p-2 text-xs text-foreground-subtle">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {status ? "Assistant IA : ajoutez une clé Consensus ou Gemini dans Paramètres › Assistant IA pour chercher les sources et rédiger une proposition ici." : "Assistant IA : chargement…"}
      </p>
    );
  }

  const issues = privacyIssues(outgoingText(`${query}\n${prompt}`));
  const blocked = issues.length > 0;

  async function search() {
    setBusy("consensus");
    try {
      const r = await request<{ papers: ConsensusPaper[]; used: number; limit: number }>("/api/preop/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "consensus", query }) });
      setPapers(r.papers);
      setChosen(new Set(r.papers.map((_, i) => i)));
      setStatus((s) => (s ? { ...s, consensus: { ...s.consensus, used: r.used, limit: r.limit } } : s));
      if (!r.papers.length) toast("Aucune source trouvée : reformulez la question.", { variant: "error" });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Recherche impossible.", { variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function draft() {
    setBusy("gemini");
    try {
      const selected = (papers ?? []).filter((_, i) => chosen.has(i));
      const r = await request<{ text: string; model: string }>("/api/preop/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "gemini", prompt, papers: selected, mode }) });
      onAnswer(
        [r.text.trim(), selected.length ? `\n\nSources trouvées (Consensus) :\n${selected.map((p, i) => `[${i + 1}] ${p.title} (${p.journal} ${p.year ?? ""}) ${p.doi ? `DOI ${p.doi}` : p.url}`).join("\n")}` : ""].join(""),
        selected.length ? `Gemini (${r.model}) + Consensus` : `Gemini (${r.model})`
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Rédaction impossible.", { variant: "error" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-primary/30 bg-primary-tint/40 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Sparkles className="h-4 w-4 text-primary" /> Assistant IA
      </p>
      {blocked ? (
        <p className="text-xs text-danger">
          Envoi bloqué : la question contient peut-être {issues.map((i) => `${i.label} (« ${i.excerpt} »)`).join(", ")}. Reformulez-la de façon générale.
        </p>
      ) : (
        <p className="text-xs text-foreground-muted">Seule la question ci-dessus part, sans aucune donnée du patient (âges arrondis à la dizaine).</p>
      )}
      <div className="flex flex-wrap gap-2">
        {status.consensus.configured && (
          <Button size="sm" variant="secondary" disabled={blocked || busy !== null || !query.trim() || status.consensus.used >= status.consensus.limit} onClick={search}>
            <BookOpenCheck className="h-4 w-4" /> {busy === "consensus" ? "Recherche…" : `Chercher les sources (${status.consensus.used}/${status.consensus.limit} ce mois)`}
          </Button>
        )}
        {status.gemini.configured && (
          <Button size="sm" disabled={blocked || busy !== null || !query.trim()} onClick={draft}>
            <Sparkles className="h-4 w-4" /> {busy === "gemini" ? "Rédaction…" : papers?.length ? (mode === "protocol" ? "Proposer le protocole à partir des sources" : "Rédiger la réponse à partir des sources") : mode === "protocol" ? "Proposer le protocole (Gemini)" : "Rédiger la réponse (Gemini)"}
          </Button>
        )}
      </div>
      {papers && papers.length > 0 && (
        <ul className="space-y-1.5">
          {papers.map((p, i) => (
            <li key={`${p.doi}-${i}`} className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border bg-surface p-2 text-xs">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={chosen.has(i)}
                onChange={(e) =>
                  setChosen((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(i);
                    else n.delete(i);
                    return n;
                  })
                }
                aria-label={`Utiliser ${p.title}`}
              />
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-foreground">{p.title}</p>
                <p className="text-foreground-subtle">
                  {[p.authors[0] && `${p.authors[0]}${p.authors.length > 1 ? " et al." : ""}`, p.journal, p.year, p.studyType, p.citations !== null ? `${p.citations} citations` : ""].filter(Boolean).join(" · ")}
                </p>
                {p.takeaway && <p className="text-foreground-muted">{p.takeaway}</p>}
                <p className="flex flex-wrap gap-2">
                  {p.doi && (
                    <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                      DOI <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
                      Consensus <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
