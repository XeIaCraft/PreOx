// New flashcards wait for their fiche to be read (asked 2026-10-22: with
// whole merged books published at once, thousands of never-seen cards were
// "due" — reviewing a card before reading what it tests is guessing, not
// learning). A card never reviewed enters the due queue once its fiche is
// read to NEW_CARD_READ_THRESHOLD %; a card already reviewed (its own
// history, or one carried over from the source books by a fusion) stays due
// on its own schedule. A per-reader setting, on by default. Free review
// (« réviser quand même ») is never gated.
//
// Pure and shared by the server queues (dal/review.ts) and the on-device
// ones (local-review-queue.ts), so the badge, the queue and the server can
// never disagree on what is due.

export const NEW_CARD_READ_THRESHOLD = 80;

export interface NewCardGate {
  enabled: boolean;
  /** Read percentage per fiche id (absent = not opened). */
  ficheReadPct: Record<string, number>;
}

/** No gating: every never-reviewed card is due (the setting turned off). */
export const OPEN_GATE: NewCardGate = { enabled: false, ficheReadPct: {} };

export function isFicheReadEnough(gate: NewCardGate | null | undefined, ficheId: string): boolean {
  return !gate?.enabled || (gate.ficheReadPct[ficheId] ?? 0) >= NEW_CARD_READ_THRESHOLD;
}

/** Due now: reviewed and its date has come, or never reviewed and its fiche read (when gated). */
export function isCardDue(ficheId: string, dueAt: string | null | undefined, now: number, gate?: NewCardGate | null): boolean {
  if (dueAt) return new Date(dueAt).getTime() <= now;
  return isFicheReadEnough(gate, ficheId);
}

/** Never-reviewed cards still waiting for their fiche to be read — shown as « N en attente de lecture ». */
export function isWaitingForReading(ficheId: string, dueAt: string | null | undefined, gate?: NewCardGate | null): boolean {
  return !dueAt && !isFicheReadEnough(gate, ficheId);
}
