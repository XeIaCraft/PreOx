// `type` (not `interface`) for every shape embedded in a jsonb column — see
// the note in src/lib/a-table/types.ts for why this matters for the
// Supabase client's structural `Json` typing.

export type BlockType =
  | "definition_mecanisme"
  | "valeurs_seuils"
  | "tableau_comparatif"
  | "protocole_paliers"
  | "mnemotechnique"
  | "perle_clinique"
  | "piege_erreur"
  | "formule"
  | "texte_libre";

export type Citation = {
  page: number;
  quote: string;
};

// content shape by block_type — a discriminated union would be ideal, but
// the column is typed loosely (BlockType is a free string check in SQL) so
// callers narrow on `block_type` before reading `content`.
export type TextBlockContent = { text: string };
export type TableBlockContent = { headers: string[]; rows: string[][] };
export type ProtocolStepContent = { label: string; detail: string; condition?: string };
export type ProtocolBlockContent = { steps: ProtocolStepContent[] };
export type BlockContent = TextBlockContent | TableBlockContent | ProtocolBlockContent;

export type FlashcardSide = { text: string };

export type ChapterStatus = "pending" | "queued" | "extracting" | "draft_ready" | "published" | "failed";
export type ContentStatus = "draft" | "published";
export type ReviewRating = "again" | "good";
export type ReviewSource = "scheduled" | "free" | "exam";

export type Book = {
  id: string;
  title: string;
  author: string | null;
  edition: string | null;
  coverUrl: string | null;
  theme: string | null;
  orderIndex: number;
  createdAt: string;
  archivedAt: string | null;
  previousEditionBookId: string | null;
};

export type ChapterSourceKind = "pdf" | "docx" | "pptx";

export type Chapter = {
  id: string;
  bookId: string;
  title: string;
  orderIndex: number;
  pdfStoragePath: string | null;
  pdfPageCount: number | null;
  status: ChapterStatus;
  extractionError: string | null;
  estimatedRemainingPasses: number | null;
  sourceKind: ChapterSourceKind;
  sourceText: string | null;
};

export type SubEntity = {
  id: string;
  chapterId: string;
  name: string;
  orderIndex: number;
  summary: string;
};

export type SupersededReason = "duplicate" | "outdated";

export type Fiche = {
  id: string;
  subEntityId: string;
  title: string;
  status: ContentStatus;
  shareToken: string | null;
  /** Set when this fiche was fused into (reason "duplicate") or replaced by (reason "outdated") another one — excluded from every review queue while set. */
  supersededByFicheId: string | null;
  supersededReason: SupersededReason | null;
  supersededNote: string;
};

export type FicheBlock = {
  id: string;
  ficheId: string;
  orderIndex: number;
  blockType: BlockType;
  content: BlockContent;
  citations: Citation[];
  needsReview: boolean;
  status: ContentStatus;
  /** Piste 2026-08-24 ("mode urgence / bloc") — hand-flagged by an admin on already-published content, never AI-set. Surfaces the block in the emergency quick-reference view. */
  isEmergency: boolean;
};

/** Alternate phrasing of a flashcard's front (item 47) — the back never varies, only how the question is asked. */
export type FlashcardVariant = { id: string; text: string };

/** One masked, labeled region on a flashcard's image (item 23 follow-up) — normalized 0-1 coordinates so it survives any display size. Front hides every region as a solid box ("retrouve la légende"); back reveals every label. */
export type ImageOcclusion = { id: string; x: number; y: number; width: number; height: number; label: string };

/** A blanked span of `front.text` (piste "flashcards à trous", 2026-08-24) — empty array means an ordinary Q&A card, unchanged. See cloze.ts for the {{...}} markup that produces these. */
export type ClozeRange = { start: number; end: number };

export type Flashcard = {
  id: string;
  ficheId: string;
  front: FlashcardSide;
  back: FlashcardSide;
  citations: Citation[];
  status: ContentStatus;
  needsReview: boolean;
  /** Image/schéma associé (item 23) — capturé depuis le PDF source ou envoyé manuellement, montré avec le recto pendant la révision. */
  imageUrl: string | null;
  imageAlt: string | null;
  variants: FlashcardVariant[];
  imageOcclusions: ImageOcclusion[];
  clozeRanges: ClozeRange[];
  /** Extraction-time hint ("there's a diagram worth capturing around here") — cleared once an image is actually attached. Never set for a Word/PowerPoint-sourced chapter (no page to point to). */
  suggestedImagePage: number | null;
  suggestedImageHint: string | null;
};

export type FlagTargetType = "block" | "flashcard";

export type Flag = {
  id: string;
  targetType: FlagTargetType;
  targetId: string;
  reason: string;
  status: "open" | "resolved";
};

export type FicheAnswer = {
  id: string;
  questionId: string;
  body: string;
  createdAt: string;
  isMine: boolean;
  flagged: boolean;
};

export type FicheQuestion = {
  id: string;
  ficheId: string;
  body: string;
  createdAt: string;
  isMine: boolean;
  flagged: boolean;
  answers: FicheAnswer[];
};

export type Notion = {
  id: string;
  name: string;
  createdAt: string;
};

/** One fiche linked to a notion, with enough book/chapter context to tell cross-book links apart at a glance. */
export type NotionLinkedFiche = {
  ficheId: string;
  ficheTitle: string;
  chapterId: string;
  chapterTitle: string;
  bookId: string;
  bookTitle: string;
};

export type NotionSummary = {
  notion: Notion;
  fiches: NotionLinkedFiche[];
};

/** Manual link to an official guideline source (HAS, SPILF, société savante...) attached to a notion — never AI-generated, see the migration comment. */
export type NotionRecommendation = {
  id: string;
  notionId: string;
  title: string;
  url: string;
  source: string;
  note: string;
  createdAt: string;
};

/**
 * Piste 2026-08-24 ("calculateur de doses contextuel") — an admin-authored
 * weight-based dosing entry (mg/kg style), never AI-generated. The only
 * computation ever performed on this is `min(dosePerKg * weightKg,
 * maxDose)` — deliberately no formula engine, no free-form expression.
 */
export type DoseCalculator = {
  id: string;
  notionId: string;
  label: string;
  dosePerKg: number;
  doseUnit: string;
  maxDose: number | null;
  frequency: string;
  note: string;
  createdAt: string;
};

/**
 * Piste 2026-08-24 ("journal de cas relié aux notions") — a personal,
 * private clinical-case note, optionally tagged to a cross-book notion.
 * Entirely user-authored, never AI-generated, never visible to anyone but
 * its author (same RLS as el_profesor_notes).
 */
export type CaseJournalEntry = {
  id: string;
  notionId: string | null;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type ContradictionStatus = "pending" | "dismissed" | "resolved";

export type Contradiction = {
  id: string;
  notionId: string | null;
  notionName: string | null;
  ficheA: NotionLinkedFiche;
  ficheB: NotionLinkedFiche;
  explanation: string;
  status: ContradictionStatus;
  resolutionNote: string;
  createdAt: string;
};

export type SupersededFicheEntry = {
  fiche: NotionLinkedFiche;
  supersededBy: NotionLinkedFiche;
  reason: "duplicate" | "outdated";
  note: string;
};

/** Near-identical flashcards belonging to two different fiches under the same notion — item 53 of the backlog, the cross-book counterpart of the existing per-book duplicate detection. */
export type CrossBookDuplicateFlashcards = {
  notionId: string;
  notionName: string;
  ficheA: NotionLinkedFiche;
  ficheB: NotionLinkedFiche;
  pairs: { frontA: string; frontB: string; similarity: number }[];
};

export type ReviewState = {
  flashcardId: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: "new" | "learning" | "review" | "relearning";
  lastReview: string | null;
};

// -- Extraction pipeline output (Gemini responseSchema shape) ---------------

export type ExtractedFicheBlock = {
  block_type: BlockType;
  content: BlockContent;
  citations: Citation[];
};

export type ExtractedFlashcard = {
  front: string;
  back: string;
  citations: Citation[];
  /** Set by Gemini when a nearby diagram/schema would meaningfully help this flashcard — PDF sources only, see suggestedImagePage on Flashcard. */
  suggested_image_page?: number | null;
  suggested_image_hint?: string | null;
};

export type ExtractedFiche = {
  title: string;
  blocks: ExtractedFicheBlock[];
  flashcards: ExtractedFlashcard[];
};

export type ExtractedSubEntity = {
  name: string;
  summary: string;
  fiche: ExtractedFiche;
};

export type ExtractionResult = {
  sub_entities: ExtractedSubEntity[];
  estimated_remaining_passes: number;
};

export type VerificationFlag = {
  sub_entity_index: number;
  block_index: number | null;
  flashcard_index: number | null;
  needs_review: boolean;
  reason: string;
};

export type VerificationResult = {
  flags: VerificationFlag[];
};

// -- Complementary ("gap-fill") extraction pass ------------------------------

export type ComplementaryAddition = {
  sub_entity_name: string;
  blocks: ExtractedFicheBlock[];
  flashcards: ExtractedFlashcard[];
};

export type ComplementaryResult = {
  additions_for_existing: ComplementaryAddition[];
  new_sub_entities: ExtractedSubEntity[];
  estimated_remaining_passes: number;
};

// -- User-selected passage → single block/flashcard proposal ----------------

export type SelectionResult = {
  block: ExtractedFicheBlock;
  flashcard?: ExtractedFlashcard;
};

// -- Notion categorization + cross-fiche contradiction detection ------------

export type NotionCategorizationResult = {
  notions: string[];
};

export type ContradictionCheckResult = {
  contradictory: boolean;
  explanation: string;
};

// -- Notion update from an external source (pasted text or an uploaded article) --

export type NotionUpdateSourceKind = "pasted_text" | "article";
export type NotionUpdateProposalStatus = "pending" | "applied" | "dismissed";

export type NotionUpdateCheckResult = {
  needs_update: boolean;
  explanation: string;
  blocks: ExtractedFicheBlock[];
  flashcards: ExtractedFlashcard[];
};

/** One fiche flagged as needing an update in light of an external source, awaiting admin review — see checkNotionForUpdatesFromText/Article in actions/notion-updates.ts. */
export type NotionUpdateProposal = {
  id: string;
  notionId: string;
  notionName: string;
  fiche: NotionLinkedFiche;
  sourceKind: NotionUpdateSourceKind;
  sourceExcerpt: string;
  explanation: string;
  additions: { blocks: ExtractedFicheBlock[]; flashcards: ExtractedFlashcard[] };
  status: NotionUpdateProposalStatus;
  createdAt: string;
};
