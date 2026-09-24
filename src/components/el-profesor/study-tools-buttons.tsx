"use client";

import { useState } from "react";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/input";
import { getFicheTranslation } from "@/app/apps/el-profesor/actions/study-tools";
import { blockToPlainText } from "@/lib/el-profesor/block-text";
import type { FicheBlock } from "@/lib/el-profesor/types";

const TRANSLATION_LANGUAGES = ["Anglais", "Néerlandais", "Espagnol", "Allemand"];

function ficheText(blocks: FicheBlock[]): string {
  return blocks.map((b) => blockToPlainText(b.blockType, b.content)).join("\n\n");
}

/**
 * "Traduire" — item 12 of the backlog, ephemeral (never persisted). `onOpen`
 * (piste 2026-08-28) lets the fiche's options menu close itself the moment
 * this opens its own modal, so the two never visually stack.
 *
 * "Cas clinique d'entraînement" and "Questions type concours" (items 13/14)
 * removed 2026-09-24 at the user's request.
 */
export function StudyToolsButtons({
  ficheTitle,
  blocks,
  onOpen,
}: {
  ficheTitle: string;
  blocks: FicheBlock[];
  /** Called right before the translation modal opens — omit for the original standalone icon-row usage. */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
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
    setOpen(true);
    runTranslation(language);
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={openTranslate}>
        <Languages className="h-3.5 w-3.5" /> Traduire cette fiche
      </Button>

      {open && (
        <Modal
          title="Traduction"
          description="Traduction à la volée, jamais enregistrée — ne remplace pas le contenu original."
          onClose={() => setOpen(false)}
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
    </>
  );
}
