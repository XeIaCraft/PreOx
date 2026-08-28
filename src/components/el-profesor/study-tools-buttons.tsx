"use client";

import { useState } from "react";
import { Languages, Stethoscope, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/input";
import { getFicheTranslation, getClinicalCase, getExamQuestions } from "@/app/apps/el-profesor/actions/study-tools";
import { blockToPlainText } from "@/lib/el-profesor/block-text";
import type { FicheBlock } from "@/lib/el-profesor/types";

const TRANSLATION_LANGUAGES = ["Anglais", "Néerlandais", "Espagnol", "Allemand"];

function ficheText(blocks: FicheBlock[]): string {
  return blocks.map((b) => blockToPlainText(b.blockType, b.content)).join("\n\n");
}

/**
 * "Traduire" and "Cas clinique" — items 12 and 13 of the backlog, both
 * ephemeral (never persisted). `onOpen` (piste 2026-08-28) lets the fiche's
 * options menu close itself the moment one of these opens its own modal,
 * so the two never visually stack.
 */
export function StudyToolsButtons({
  ficheTitle,
  subEntityName,
  blocks,
  onOpen,
}: {
  ficheTitle: string;
  subEntityName: string;
  blocks: FicheBlock[];
  /** Called right before a tool's own modal opens — omit for the original standalone icon-row usage. */
  onOpen?: () => void;
}) {
  const [openTool, setOpenTool] = useState<"translate" | "case" | "exam" | null>(null);
  const [language, setLanguage] = useState(TRANSLATION_LANGUAGES[0]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runTranslation(targetLanguage: string) {
    setLanguage(targetLanguage);
    setLoading(true);
    setError(null);
    setText(null);
    getFicheTranslation(ficheTitle, ficheText(blocks), targetLanguage).then((result) => {
      setLoading(false);
      if ("error" in result) setError(result.error);
      else setText(result.text);
    });
  }

  function openTranslate() {
    onOpen?.();
    setOpenTool("translate");
    runTranslation(language);
  }

  function openCase() {
    onOpen?.();
    setOpenTool("case");
    setLoading(true);
    setError(null);
    setText(null);
    getClinicalCase(subEntityName, ficheText(blocks)).then((result) => {
      setLoading(false);
      if ("error" in result) setError(result.error);
      else setText(result.text);
    });
  }

  function openExam() {
    onOpen?.();
    setOpenTool("exam");
    setLoading(true);
    setError(null);
    setText(null);
    getExamQuestions(subEntityName, ficheText(blocks)).then((result) => {
      setLoading(false);
      if ("error" in result) setError(result.error);
      else setText(result.text);
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={openTranslate}>
        <Languages className="h-3.5 w-3.5" /> Traduire cette fiche
      </Button>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={openCase}>
        <Stethoscope className="h-3.5 w-3.5" /> Cas clinique d&apos;entraînement
      </Button>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={openExam}>
        <ListChecks className="h-3.5 w-3.5" /> Questions type concours
      </Button>

      {openTool === "translate" && (
        <Modal
          title="Traduction"
          description="Traduction à la volée, jamais enregistrée — ne remplace pas le contenu original."
          onClose={() => setOpenTool(null)}
          size="md"
        >
          <Select value={language} onChange={(e) => runTranslation(e.target.value)} className="mb-3 max-w-xs">
            {TRANSLATION_LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </Select>
          {loading && <p className="text-sm text-foreground-subtle">Traduction en cours…</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
          {text && <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</div>}
        </Modal>
      )}

      {openTool === "case" && (
        <Modal
          title="Cas clinique d'entraînement"
          description="Généré à partir du contenu de cette fiche, jamais enregistré."
          onClose={() => setOpenTool(null)}
          size="md"
        >
          {loading && <p className="text-sm text-foreground-subtle">Génération en cours…</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
          {text && <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</div>}
        </Modal>
      )}

      {openTool === "exam" && (
        <Modal
          title="Questions type concours"
          description="Générées à partir du contenu de cette fiche, jamais enregistrées."
          onClose={() => setOpenTool(null)}
          size="md"
        >
          {loading && <p className="text-sm text-foreground-subtle">Génération en cours…</p>}
          {error && <p className="text-sm text-danger">{error}</p>}
          {text && <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</div>}
        </Modal>
      )}
    </>
  );
}
