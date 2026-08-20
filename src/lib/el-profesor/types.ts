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

export type ChapterStatus = "pending" | "extracting" | "draft_ready" | "published" | "failed";
export type ContentStatus = "draft" | "published";
export type ReviewRating = "again" | "good";
export type ReviewSource = "scheduled" | "free";

export type Book = {
  id: string;
  title: string;
  author: string | null;
  edition: string | null;
  coverUrl: string | null;
  theme: string | null;
  orderIndex: number;
  createdAt: string;
};

export type Chapter = {
  id: string;
  bookId: string;
  title: string;
  orderIndex: number;
  pdfStoragePath: string;
  pdfPageCount: number | null;
  status: ChapterStatus;
  extractionError: string | null;
  estimatedRemainingPasses: number | null;
};

export type SubEntity = {
  id: string;
  chapterId: string;
  name: string;
  orderIndex: number;
  summary: string;
};

export type Fiche = {
  id: string;
  subEntityId: string;
  title: string;
  status: ContentStatus;
  shareToken: string | null;
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
};

export type Flashcard = {
  id: string;
  ficheId: string;
  front: FlashcardSide;
  back: FlashcardSide;
  citations: Citation[];
  status: ContentStatus;
  needsReview: boolean;
};

export type FlagTargetType = "block" | "flashcard";

export type Flag = {
  id: string;
  targetType: FlagTargetType;
  targetId: string;
  reason: string;
  status: "open" | "resolved";
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
