"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, CircleAlert, Copy, ExternalLink, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ChipGroup, Textarea } from "@/components/carnet/ui";
import { RuleEditor, type RuleDraft } from "@/components/preop/rule-editor";
import { SourceBadge } from "@/components/preop/ui";
import { atcLabel } from "@/lib/preop/medications";
import { parseAnswer, type BlockCheck, type ParsedAnswer, type ParsedBlock } from "@/lib/preop/rules/parse-answer";
import { SEARCH_TOOLS, buildQuestion, type QuestionInput } from "@/lib/preop/rules/question";
import { suggestStructure } from "@/lib/preop/rules/structure";
import { samePoint, outranks } from "@/lib/preop/rules/engine";
import { describeAction } from "@/lib/preop/rules/describe";
import { SOURCE_LEVELS, TECHNIQUES, type Rule, type SourceLevel } from "@/lib/preop/rules/types";

type Use = "rule" | "explanation" | "ignore";

function reviewDate(year: number | null): string {
  // Guidelines are revised every few years: 5 years after publication by default.
  if (year) return `${year + 5}-12-31`;
  const d = new Date();
  return `${d.getFullYear() + 3}-12-31`;
}

function defaultTitle(draft: Pick<RuleDraft, "conditions">): string {
  const drugs = draft.conditions.flatMap((c) => (c.kind === "drug" ? [atcLabel(c.atc)] : []));
  const techniques = draft.conditions.flatMap((c) => (c.kind === "technique" ? c.in.map((t) => TECHNIQUES.find((x) => x.code === t)?.label.split(" (")[0].toLowerCase() ?? t) : []));
  return [drugs.join(", "), techniques.join(" / ")].filter(Boolean).join(" · ");
}

function draftFromBlock(b: ParsedBlock, explanations: string[], question: string, tool: string): RuleDraft {
  const s = suggestStructure(b.statement, b.conditions);
  const ref = b.reference;
  const draft: RuleDraft = {
    id: crypto.randomUUID(),
    title: "",
    statement: b.statement,
    conditions: s.conditions,
    action: s.action,
    source: {
      organisation: b.organisation,
      title: ref?.title || b.source.split(",").slice(1, -1).join(",").trim(),
      year: b.year ?? ref?.year ?? null,
      // The bibliography under the answer is more reliable than the identifier re-typed in the block.
      doi: ref?.doi || b.doi,
      pmid: b.pmid,
      quote: b.quote,
      grade: b.grade,
      level: b.level,
    },
    divergences: [],
    explanations,
    status: "draft",
    version: 1,
    verified_at: null,
    review_at: reviewDate(b.year ?? ref?.year ?? null),
    question,
    tool,
  };
  return { ...draft, title: defaultTitle(draft) };
}

function CheckLine({ check }: { check: BlockCheck }) {
  const row = (tone: "ok" | "warn" | "bad", text: React.ReactNode) => (
    <p className={`flex items-start gap-1.5 text-xs ${tone === "ok" ? "text-success" : tone === "warn" ? "text-accent" : "text-danger"}`}>
      {tone === "ok" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : tone === "warn" ? <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span>{text}</span>
    </p>
  );
  switch (check.kind) {
    case "doi_matches_reference":
      return row("ok", "Le DOI correspond à la bibliographie de la réponse");
    case "doi_mismatch":
      return row(
        "bad",
        <>
          DOI différent de la bibliographie : {check.blockDoi} dans le bloc, <strong>{check.referenceDoi}</strong> dans la bibliographie (celui-ci sera retenu — à confirmer)
        </>
      );
    case "not_in_references":
      return row("warn", "Absent de la bibliographie de la réponse : vérifier que cette source existe");
    case "no_identifier":
      return row("warn", "Ni DOI ni PMID : identifiant à retrouver");
    case "quote_missing":
      return row("bad", "Pas de citation : impossible de vérifier dans la source");
  }
}

function SourceLinks({ b }: { b: ParsedBlock }) {
  const links = [
    b.reference?.doi && { href: `https://doi.org/${b.reference.doi}`, label: `DOI ${b.reference.doi}` },
    b.doi && b.doi !== b.reference?.doi && { href: `https://doi.org/${b.doi}`, label: `DOI du bloc ${b.doi}` },
    b.pmid && { href: `https://pubmed.ncbi.nlm.nih.gov/${b.pmid}/`, label: `PubMed ${b.pmid}` },
    { href: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(b.reference?.title || b.source)}`, label: "Chercher sur PubMed" },
  ].filter(Boolean) as { href: string; label: string }[];
  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-primary hover:bg-surface-muted">
          <ExternalLink className="h-3 w-3 shrink-0" /> <span className="min-w-0 break-all">{l.label}</span>
        </a>
      ))}
    </div>
  );
}

/**
 * Creating rules from a verified answer: 1. the question, ready to paste
 * into an AI search tool; 2. the answer pasted back; 3. each block checked
 * (identifiers against the bibliography, source level decided by PreOx),
 * marked as rule / explanation / ignored; 4. each rule put in structured
 * form, read back in plain words, and saved — active only once you've
 * found the quote in the source.
 */
export function RuleWizard({ initial, onSave, onDone }: { initial: QuestionInput | null; onSave: (r: RuleDraft) => Promise<Rule>; onDone: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [context, setContext] = useState(initial?.context ?? "");
  const [tool, setTool] = useState(SEARCH_TOOLS[0].name);
  const [answer, setAnswer] = useState("");
  const [parsed, setParsed] = useState<ParsedAnswer | null>(null);
  const [uses, setUses] = useState<Use[]>([]);
  const [levels, setLevels] = useState<SourceLevel[]>([]);
  const [drafts, setDrafts] = useState<RuleDraft[]>([]);
  const [current, setCurrent] = useState(0);
  const [verified, setVerified] = useState(false);
  const [saving, setSaving] = useState(false);

  const prompt = buildQuestion({ question: question || "…", context });

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      toast("Question copiée.", { variant: "success" });
    } catch {
      toast("Copie impossible : sélectionnez le texte à la main.", { variant: "error" });
    }
  }

  function analyse() {
    const result = parseAnswer(answer);
    if (result.blocks.length === 0) {
      toast("Aucun bloc « RÈGLE: » trouvé dans la réponse.", { variant: "error" });
      return;
    }
    setParsed(result);
    setUses(result.blocks.map((b) => b.suggestedUse));
    setLevels(result.blocks.map((b) => b.level));
    setStep(3);
  }

  function structure() {
    if (!parsed) return;
    const blocks = parsed.blocks.map((b, i) => ({ ...b, level: levels[i] }));
    const explanations = blocks
      .filter((_, i) => uses[i] === "explanation")
      .map((b) => `${b.statement}${b.organisation ? ` (${b.organisation}${b.year ? `, ${b.year}` : ""})` : ""}`);
    const questionText = buildQuestion({ question, context });
    const next = blocks.filter((_, i) => uses[i] === "rule").map((b) => draftFromBlock(b, explanations, questionText, tool));
    // Rules of the same answer on the same point: the lower source becomes a divergence of the higher one.
    for (const d of next) {
      d.divergences = next
        .filter((o) => o !== d && samePoint(o as Rule, d as Rule) && outranks(d as Rule, o as Rule))
        .map((o) => ({ summary: `${describeAction(o.action)} — ${o.statement}`, source: `${o.source.organisation}${o.source.year ? ` ${o.source.year}` : ""}`, level: o.source.level }));
    }
    if (next.length === 0) {
      toast("Aucun bloc marqué comme règle.", { variant: "error" });
      return;
    }
    setDrafts(next);
    setCurrent(0);
    setVerified(false);
    setStep(4);
  }

  async function saveCurrent(activate: boolean) {
    const d = drafts[current];
    setSaving(true);
    try {
      await onSave({
        ...d,
        explanations: d.explanations.map((e) => e.trim()).filter(Boolean),
        status: activate ? "active" : "draft",
        verified_at: activate ? new Date().toISOString() : null,
      });
      toast(activate ? "Règle enregistrée et active." : "Brouillon enregistré.", { variant: "success" });
      if (current + 1 < drafts.length) {
        setCurrent(current + 1);
        setVerified(false);
      } else onDone();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Enregistrement impossible.", { variant: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="Étapes">
        {["Question", "Réponse", "Vérification", "Mise en forme"].map((label, i) => (
          <li key={label} className={`rounded-full px-2.5 py-1 ${step === i + 1 ? "bg-primary text-primary-foreground" : step > i + 1 ? "bg-primary-tint text-primary-strong" : "bg-surface-muted text-foreground-subtle"}`}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3 sm:p-4">
          <label className="block space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-foreground-subtle">Question</span>
            <Textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="ex. Délai entre la dernière prise d'édoxaban et une rachianesthésie ?" />
          </label>
          <label className="block space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-foreground-subtle">Contexte (jamais d&apos;identité)</span>
            <Input value={context} onChange={(e) => setContext(e.target.value)} placeholder="ex. clairance 45 mL/min, chirurgie programmée" />
          </label>
          <div className="space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-foreground-subtle">Texte à coller</span>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-[var(--radius-md)] border border-border bg-surface-muted p-3 font-mono text-xs text-foreground">{prompt}</pre>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={copyPrompt} disabled={!question.trim()}>
              <Copy className="h-4 w-4" /> Copier la question
            </Button>
            {SEARCH_TOOLS.map((t) => (
              <a key={t.name} href={t.url} target="_blank" rel="noopener noreferrer" onClick={() => setTool(t.name)} className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-border px-2.5 py-1.5 text-sm text-foreground hover:bg-surface-muted">
                {t.name} <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setStep(2)} disabled={!question.trim()}>
              J&apos;ai la réponse <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Outil utilisé</span>
            <ChipGroup size="sm" options={[...SEARCH_TOOLS.map((t) => ({ code: t.name, label: t.name })), { code: "Autre", label: "Autre" }]} value={tool} onChange={(v) => v && setTool(v)} />
          </div>
          <label className="block space-y-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-foreground-subtle">Réponse complète, avec la bibliographie</span>
            <Textarea rows={12} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Collez ici toute la réponse, références comprises." />
          </label>
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="h-4 w-4" /> Question
            </Button>
            <Button onClick={analyse} disabled={!answer.trim()}>
              Analyser <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {step === 3 && parsed && (
        <section className="space-y-3">
          <p className="text-sm text-foreground-muted">
            {parsed.blocks.length} bloc(s), {parsed.references.length} référence(s) dans la bibliographie. Le niveau de chaque source est décidé par PreOx d&apos;après l&apos;organisme ; corrigez-le si besoin.
          </p>
          {parsed.blocks.map((b, i) => (
            <article key={i} className={`min-w-0 space-y-2 break-words rounded-[var(--radius-lg)] border bg-surface p-3 sm:p-4 ${uses[i] === "ignore" ? "border-border opacity-60" : "border-border"}`}>
              <div className="flex items-start gap-2">
                <SourceBadge level={levels[i]} />
                <p className="min-w-0 flex-1 text-sm font-medium text-foreground">{b.statement}</p>
              </div>
              {b.conditions && <p className="text-xs text-foreground-muted">Conditions : {b.conditions}</p>}
              <p className="text-xs text-foreground-muted">
                {b.source}
                {b.grade && ` · grade ${b.grade}`}
              </p>
              {b.quote && <blockquote className="border-l-2 border-border-strong pl-2 text-xs italic text-foreground-muted">{b.quote}</blockquote>}
              <div className="space-y-1">
                {b.checks.map((c, j) => (
                  <CheckLine key={j} check={c} />
                ))}
              </div>
              <SourceLinks b={b} />
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                <ChipGroup
                  size="sm"
                  options={[
                    { code: "rule" as Use, label: "Règle" },
                    { code: "explanation" as Use, label: "Explication" },
                    { code: "ignore" as Use, label: "Ignorer" },
                  ]}
                  value={uses[i]}
                  onChange={(v) => v && setUses(uses.map((u, j) => (j === i ? v : u)))}
                />
                <Select value={levels[i]} onChange={(e) => setLevels(levels.map((l, j) => (j === i ? (e.target.value as SourceLevel) : l)))} className="h-9 w-auto min-w-0 max-w-full text-xs" aria-label="Niveau de la source">
                  {SOURCE_LEVELS.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.short} · {l.label.split(" (")[0]}
                    </option>
                  ))}
                </Select>
              </div>
            </article>
          ))}
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setStep(2)}>
              <ArrowLeft className="h-4 w-4" /> Réponse
            </Button>
            <Button onClick={structure}>
              Mettre en forme <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {step === 4 && drafts[current] && (
        <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-3 sm:p-4">
          <p className="text-xs text-foreground-subtle">
            Règle {current + 1} sur {drafts.length} — vérifiez chaque champ : c&apos;est cette forme que l&apos;app appliquera.
          </p>
          <RuleEditor value={drafts[current]} onChange={(d) => setDrafts(drafts.map((x, j) => (j === current ? d : x)))} />
          {drafts[current].divergences.length > 0 && (
            <p className="text-xs text-foreground-muted">
              Divergence enregistrée avec la règle : {drafts[current].divergences.map((d) => `${d.source} — ${d.summary}`).join(" ; ")}
            </p>
          )}
          <label className="flex items-start gap-2 rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm">
            <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} className="mt-1" />
            <span>J&apos;ai ouvert la source et retrouvé la citation. La règle sera appliquée dans les consultations.</span>
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => saveCurrent(false)} disabled={saving}>
              Enregistrer en brouillon
            </Button>
            <Button onClick={() => saveCurrent(true)} disabled={saving || !verified}>
              <Check className="h-4 w-4" /> Enregistrer et activer
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
