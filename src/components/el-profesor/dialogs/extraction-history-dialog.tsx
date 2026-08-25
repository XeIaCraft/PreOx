"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { getExtractionJobHistory, type ExtractionJobHistoryEntry } from "@/app/apps/el-profesor/actions/extraction";

const STATUS_VARIANT: Record<ExtractionJobHistoryEntry["status"], "success" | "danger" | "neutral"> = {
  succeeded: "success",
  failed: "danger",
  running: "neutral",
  pending: "neutral",
};

const STATUS_LABEL: Record<ExtractionJobHistoryEntry["status"], string> = {
  succeeded: "Réussi",
  failed: "Échoué",
  running: "En cours",
  pending: "En attente",
};

/** One request/response pair, collapsed by default since raw_response can be very long (a full chapter's worth of JSON). */
function EntryDetails({ entry }: { entry: ExtractionJobHistoryEntry }) {
  return (
    <li className="rounded-[var(--radius-sm)] border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[entry.status]}>{STATUS_LABEL[entry.status]}</Badge>
        {entry.provider && <span className="text-xs text-foreground-subtle">{entry.provider}</span>}
        {entry.model && <span className="text-xs text-foreground-subtle">· {entry.model}</span>}
        <span className="ml-auto text-xs text-foreground-subtle">{new Date(entry.createdAt).toLocaleString("fr-FR")}</span>
      </div>
      {entry.error && <p className="mt-1.5 text-xs text-danger">{entry.error}</p>}
      {entry.requestPrompt && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-foreground-muted">Requête envoyée</summary>
          <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-surface-muted p-2 text-xs">
            {entry.requestPrompt}
          </pre>
        </details>
      )}
      {entry.rawResponse && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-foreground-muted">Réponse brute reçue</summary>
          <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap rounded-[var(--radius-sm)] bg-surface-muted p-2 text-xs">
            {entry.rawResponse}
          </pre>
        </details>
      )}
      {!entry.requestPrompt && !entry.rawResponse && (
        <p className="mt-1.5 text-xs text-foreground-subtle">Aucun détail de requête enregistré pour cette tentative.</p>
      )}
    </li>
  );
}

export function ExtractionHistoryDialog({ chapterId, chapterTitle, onClose }: { chapterId: string; chapterTitle: string; onClose: () => void }) {
  const [entries, setEntries] = useState<ExtractionJobHistoryEntry[] | null>(null);

  useEffect(() => {
    getExtractionJobHistory(chapterId).then(setEntries);
  }, [chapterId]);

  return (
    <Modal
      title="Historique des tentatives IA"
      description={`${chapterTitle} — les 5 dernières tentatives d'extraction, avec ce qui a été envoyé et reçu (utile pour diagnostiquer une génération vide ou une erreur).`}
      onClose={onClose}
      size="lg"
    >
      {entries === null && <p className="text-sm text-foreground-muted">Chargement…</p>}
      {entries !== null && entries.length === 0 && <p className="text-sm text-foreground-muted">Aucune tentative enregistrée pour ce chapitre.</p>}
      {entries !== null && entries.length > 0 && (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <EntryDetails key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </Modal>
  );
}
