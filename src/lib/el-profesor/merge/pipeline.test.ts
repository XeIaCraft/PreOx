import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDb } from "@/test/fake-supabase";

// End-to-end run of the book fusion against an in-memory database and a
// fake AI that behaves like a real one on a bad day: it forgets a fiche at
// the répartition, a fiche at the chapter plan, a block and a card in each
// merged fiche, drops a value, and sometimes the « À retenir ». Whatever it
// does, every block, card and value of the sources must end up in the
// merged book, nothing duplicated, and the job must finish.

const h = vi.hoisted(() => ({
  db: null as unknown as FakeDb,
  prompts: [] as string[],
  batches: new Map<string, { customId: string; prompt: string; model: string }[]>(),
  creditGone: false,
  /** Like Haiku on lot 5: asked for « À retenir » in a repair, it doesn't write it. */
  lightModelSkipsKeyPoints: false,
}));
/** How a repair prompt asks for the missing « À retenir » (with other items to take up, or alone). */
const ASKS_KEY_POINTS = /n'a pas de bloc « À retenir »|Il lui manque son bloc final « À retenir »/;
const isRepairPrompt = (p: string) => !p.includes("Conçois les PARTIES") && !p.includes("Tu ranges") && !p.includes("Tu organises") && !p.includes("Tu rédiges");

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => h.db }));
vi.mock("@/lib/el-profesor/dal/shared", () => ({
  selectInChunks: async (ids: string[], run: (chunk: string[]) => PromiseLike<{ data: unknown[] | null }>) => (ids.length ? ((await run(ids)).data ?? []) : []),
  selectInChunksStrict: async (ids: string[], run: (chunk: string[]) => PromiseLike<{ data: unknown[] | null }>) => (ids.length ? ((await run(ids)).data ?? []) : []),
  selectAllPages: async (build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null }>) => {
    const all: unknown[] = [];
    for (let from = 0; ; from += 1000) {
      const rows = (await build(from, from + 999)).data ?? [];
      all.push(...rows);
      if (rows.length < 1000) return all;
    }
  },
}));
vi.mock("@/lib/el-profesor/dal/ai-config", () => ({
  getElProfesorGeminiConfig: async () => ({ apiKeys: ["k"], models: ["gemini-flash-latest"] }),
  getElProfesorClaudeConfig: async () => ({ apiKey: "k", model: "claude-sonnet-5" }),
}));
vi.mock("@/lib/el-profesor/gemini-queue", () => ({ quotaBackoffMinutes: () => 15 }));
vi.mock("@/lib/el-profesor/gemini", () => ({
  isQuotaOrCapacityError: () => false,
  callGeminiTextJson: async (_config: unknown, prompt: string) => {
    h.prompts.push(prompt);
    if (h.creditGone && isRepairPrompt(prompt)) throw new Error("Your credit balance is too low to access the API.");
    return { result: fakeAi(prompt), model: "gemini-flash-latest", inputTokens: Math.round(prompt.length / 4), outputTokens: 500 };
  },
}));
vi.mock("@/lib/el-profesor/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/el-profesor/anthropic")>();
  return {
    ...actual,
    submitClaudeToolBatch: async (config: { model: string }, requests: { customId: string; content: { text: string }[] }[]) => {
      const id = `batch-${h.batches.size + 1}`;
      h.batches.set(id, requests.map((r) => ({ customId: r.customId, prompt: r.content[0].text, model: config.model })));
      return id;
    },
    retrieveClaudeBatch: async () => ({ ended: true, succeeded: 1, errored: 0, processing: 0, canceled: 0, expired: 0 }),
    getClaudeBatchResults: async (_key: string, batchId: string) => {
      // Downloading results takes a while: an overlapping run can read the same batch meanwhile.
      await new Promise((resolve) => setTimeout(resolve, 5));
      return (h.batches.get(batchId) ?? []).map((r) => {
        h.prompts.push(r.prompt);
        if (h.creditGone && isRepairPrompt(r.prompt)) return { customId: r.customId, outcome: "errored" as const, message: "Your credit balance is too low to access the API.", usage: { inputTokens: 0, outputTokens: 0 } };
        const prompt = h.lightModelSkipsKeyPoints && r.model.includes("haiku") ? r.prompt.replace(ASKS_KEY_POINTS, "") : r.prompt;
        return { customId: r.customId, outcome: "succeeded" as const, output: fakeAi(prompt), usage: { inputTokens: 1000, outputTokens: 300 } };
      });
    },
  };
});

import { processMergeJobs } from "./pipeline";
import { redoFailedRepairs, releaseChapters } from "./stages";
import { flattenChapters } from "./plan";
import type { MergePlan, MergeStats } from "./types";
import type { ElProfesorMergeJobRow } from "@/lib/supabase/types";
import { numericFacts, missingFacts } from "./plan";
import { blockPromptText } from "./prompts";
import type { BlockContent } from "../types";

// -- The fake AI ------------------------------------------------------------

function fakeAi(prompt: string): unknown {
  if (prompt.includes("Conçois les PARTIES")) {
    return {
      parts: [
        { title: "Pharmacologie", sub_parts: [{ title: "Curares et antagonisation", scope: "curares, sugammadex, néostigmine" }] },
        { title: "Ventilation", sub_parts: [{ title: "Ventilation mécanique", scope: "ventilation, PEEP, compliance" }] },
      ],
    };
  }
  if (prompt.includes("Tu ranges des fiches sources")) {
    const fiches = [...prompt.matchAll(/^(F\d+) — \[[^\]]*\] (.*)$/gm)];
    // Forgets the last fiche of the request.
    return { assignments: fiches.slice(0, -1).map(([, alias, title]) => ({ fiche: alias, sub_part: /ventil|compliance|peep|réglages/i.test(title) ? "S2" : "S1" })) };
  }
  if (prompt.includes("Tu organises la sous-partie")) {
    const fiches = [...prompt.matchAll(/^(F\d+) — \[[^\]]*\] (.*?) \(\d+ blocs/gm)].map(([, alias, title]) => ({ alias, title }));
    const pointed = fiches.filter((f) => f.title.includes(" : "));
    const broad = fiches.filter((f) => !f.title.includes(" : "));
    if (pointed.length) {
      // Pointed fiches each become a merged fiche; the broad fiche of the other book feeds all of them.
      return {
        chapters: [
          {
            title: "Antagonisation du bloc neuromusculaire",
            fiches: pointed.map((p) => ({ title: p.title.split(" : ")[1], objective: "Objectif", sources: [p.alias, ...broad.map((b) => b.alias)] })),
          },
        ],
      };
    }
    // Forgets every fiche but the first two.
    return { chapters: [{ title: "Réglages et mécanique", fiches: [{ title: "Compliance et réglages", objective: "Objectif", sources: fiches.slice(0, 2).map((f) => f.alias) }] }] };
  }
  if (prompt.includes("Tu rédiges UNE fiche")) {
    const blocks = [...prompt.matchAll(/^\[(B\d+)\] ([^:·\[]+?)(?: · p\. [\d, ]+)? : (.*)$/gm)].map(([, alias, , text]) => ({ alias, text }));
    const cards = [...prompt.matchAll(/^\[(K\d+)\] Q : (.*) — R : (.*)$/gm)].map(([, alias, front, back]) => ({ alias, front, back }));
    const images = [...prompt.matchAll(/^\[(B\d+)\] \[illustration/gm)].map(([, alias]) => alias);
    const kept = blocks.slice(0, -1); // forgets the last source block
    const merged = [];
    for (let i = 0; i < kept.length; i += 2) {
      const pair = kept.slice(i, i + 2);
      let text = pair.map((b) => b.text).join(" ");
      if (i === 0) text = text.replace(/\d+(?:[.,]\d+)?\s?mg/, "une dose"); // drops a value
      merged.push({ block_type: "definition_mecanisme", heading: `Partie ${i / 2 + 1}`, content: { text }, source_block_ids: pair.map((b) => b.alias) });
    }
    if (images.length) merged[0].source_block_ids.push(images[0]);
    const title = /fiche « ([^»]+) »\. Objectif/.exec(prompt)?.[1] ?? "";
    if (prompt.includes("Albrecht") && prompt.includes("Miller")) merged.push({ block_type: "divergence", heading: "Dose", content: { text: "• Miller : poids réel.\n• Albrecht : poids idéal." }, source_block_ids: [] });
    // Forgets « À retenir » on the ventilation fiche.
    if (!/Compliance/.test(title)) merged.push({ block_type: "a_retenir", content: { text: "• Point clé." }, source_block_ids: kept.slice(0, 1).map((b) => b.alias) });
    const keptCards = cards.slice(0, -1); // forgets the last card
    const flashcards = [];
    for (let i = 0; i < keptCards.length; i += 2) {
      const pair = keptCards.slice(i, i + 2);
      flashcards.push({ front: pair[0].front, back: pair.map((c) => c.back).join(" ; "), source_flashcard_ids: pair.map((c) => c.alias) });
    }
    flashcards.push({ front: "Nouvelle carte sur un point clé ?", back: "Réponse", source_flashcard_ids: [] });
    return { summary: "Chapeau de la fiche.", blocks: merged, flashcards };
  }
  if (prompt.includes("Le contrôle de couverture a trouvé") || prompt.includes("Il lui manque son bloc final")) {
    const blocks = [...prompt.matchAll(/^\[(B\d+)\] « [^»]* » — [^:]+ : (.*)$/gm)].map(([, alias, text]) => ({ alias, text }));
    const cards = [...prompt.matchAll(/^\[(K\d+)\] « [^»]* » — Q : (.*) — R : (.*?)(?: \(valeurs perdues : [^)]*\))?$/gm)].map(([, alias, front, back]) => ({ alias, front, back }));
    const insertions: unknown[] = blocks.map((b) => ({ after_block_index: 0, block_type: "texte_libre", heading: "Complément", content: { text: b.text }, source_block_ids: [b.alias] }));
    if (ASKS_KEY_POINTS.test(prompt)) insertions.push({ after_block_index: 99, block_type: "a_retenir", content: { text: "• Ajouté au rattrapage." }, source_block_ids: [] });
    return { replacements: [], insertions, already_covered: [], flashcards: cards.map((c) => ({ front: c.front, back: c.back, source_flashcard_ids: [c.alias] })) };
  }
  throw new Error(`Prompt inattendu : ${prompt.slice(0, 80)}`);
}

// -- The source library -----------------------------------------------------

function seed(db: FakeDb, provider: "gemini" | "claude") {
  const miller = db.insertRow("el_profesor_books", { title: "Miller's Anesthesia", kind: "book" });
  const albrecht = db.insertRow("el_profesor_books", { title: "Manuel pratique d'anesthésie (Albrecht)", kind: "book" });
  const merged = db.insertRow("el_profesor_books", { title: "Référentiel", kind: "merged" });
  const chapter = (book: Record<string, unknown>, title: string, order: number) => db.insertRow("el_profesor_chapters", { book_id: book.id, title, order_index: order, status: "published", source_kind: "pdf" });
  let order = 0;
  const fiche = (chapterRow: Record<string, unknown>, title: string, blocks: { type: string; content: BlockContent; image?: boolean }[], cards: { front: string; back: string; occlusion?: boolean }[], status = "published") => {
    const sub = db.insertRow("el_profesor_sub_entities", { chapter_id: chapterRow.id, name: title, order_index: order++, summary: `Résumé de ${title}` });
    const f = db.insertRow("el_profesor_fiches", { sub_entity_id: sub.id, title, status });
    blocks.forEach((b, i) =>
      db.insertRow("el_profesor_fiche_blocks", {
        fiche_id: f.id,
        order_index: i,
        block_type: b.type,
        content: b.content,
        citations: [{ page: 800 + i, quote: "q" }],
        status,
        image_url: b.image ? "https://img/figure.png" : null,
        image_alt: b.image ? "Schéma de l'encapsulation" : null,
      })
    );
    cards.forEach((c) =>
      db.insertRow("el_profesor_flashcards", { fiche_id: f.id, front: { text: c.front }, back: { text: c.back }, status, citations: [{ page: 801, quote: "q" }], image_occlusions: c.occlusion ? [{ x: 1 }] : [] })
    );
    return f;
  };
  const cM1 = chapter(miller, "28 - Reversal of Neuromuscular Blockade", 0);
  const cA1 = chapter(albrecht, "Anticholinestérasiques et sugammadex", 0);
  const cM2 = chapter(miller, "Mechanical ventilation", 1);
  const cA2 = chapter(albrecht, "Ventilation mécanique", 1);
  fiche(cM1, "Sugammadex : mécanisme", [
    { type: "definition_mecanisme", content: { text: "γ-cyclodextrine modifiée qui encapsule le rocuronium en complexe 1:1." } },
    { type: "valeurs_seuils", content: { text: "Volume de distribution 18 L, demi-vie 1,8 h." } },
  ], [
    { front: "Mécanisme du sugammadex ?", back: "Encapsulation 1:1" },
    { front: "Demi-vie du sugammadex ?", back: "1,8 h" },
  ]);
  fiche(cM1, "Sugammadex : posologie", [
    { type: "valeurs_seuils", content: { text: "2 mg/kg si TOF ≥ 2 ; 4 mg/kg si PTC 1–2 ; 16 mg/kg en urgence." } },
    { type: "tableau_comparatif", content: { headers: ["Agent", "Délai TOF 0,9"], rows: [["Sugammadex 4 mg/kg", "107 secondes"], ["Néostigmine 70 µg/kg", "1044 secondes"]] } },
    { type: "perle_clinique", content: { text: "En cannot intubate cannot ventilate, 16 mg/kg après rocuronium 1,2 mg/kg." } },
  ], [
    { front: "Dose si PTC 1–2 ?", back: "4 mg/kg" },
    { front: "Dose d'urgence ?", back: "16 mg/kg" },
    { front: "Image annotée de la jonction", back: "—", occlusion: true },
  ]);
  fiche(cM1, "Sugammadex : effets secondaires", [{ type: "piege_erreur", content: { text: "Anaphylaxie : incidence 0,039 %, tryptase VPP 93 %." } }], [{ front: "Incidence de l'anaphylaxie ?", back: "0,039 %" }]);
  fiche(cA1, "Sugammadex (Bridion®)", [
    { type: "definition_mecanisme", content: { text: "Encapsulation des aminostéroïdes dans la cavité de la cyclodextrine." }, image: true },
    { type: "valeurs_seuils", content: { text: "Posologie 2 à 4 mg/kg ; urgence 16 mg/kg ; sur le poids idéal + 40 %." } },
    { type: "piege_erreur", content: { text: "Anaphylaxie ; contraceptifs oraux : équivalent d'un oubli de 7 jours." } },
  ], [
    { front: "Posologie standard ?", back: "2 à 4 mg/kg" },
    { front: "Contraception après sugammadex ?", back: "Oubli de pilule, 7 jours" },
  ]);
  fiche(cM2, "Compliance pulmonaire", [
    { type: "definition_mecanisme", content: { text: "Compliance statique = VT / (Pplat − PEP), normale 50 à 100 mL/cmH2O." } },
    { type: "valeurs_seuils", content: { text: "Pression de plateau < 30 cmH2O ; driving pressure < 15 cmH2O." } },
  ], [{ front: "Compliance normale ?", back: "50 à 100 mL/cmH2O" }]);
  fiche(cA2, "Réglages du ventilateur", [
    { type: "protocole_paliers", content: { steps: [{ label: "VT", detail: "6 à 8 mL/kg de poids idéal" }, { label: "PEP", detail: "5 cmH2O minimum" }] } },
    { type: "valeurs_seuils", content: { text: "FiO2 pour SpO2 92 à 96 %." } },
  ], [{ front: "VT protecteur ?", back: "6 à 8 mL/kg de poids idéal" }]);
  fiche(cA2, "PEEP et recrutement", [{ type: "definition_mecanisme", content: { text: "La PEP de 5 à 10 cmH2O limite les atélectasies." } }], [{ front: "PEP habituelle ?", back: "5 à 10 cmH2O" }], "draft");

  // Same rule as migration 098: a published merged card takes over from the published sources it lists.
  db.rpcs.el_profesor_replace_source_cards = (args) => {
    const ficheIds = new Set(args.p_fiche_ids as string[]);
    let replaced = 0;
    for (const merged of db.table("el_profesor_flashcards").filter((c) => ficheIds.has(c.fiche_id as string) && c.status === "published"))
      for (const src of db.table("el_profesor_flashcards").filter((c) => ((merged.source_flashcard_ids as string[] | null) ?? []).includes(c.id as string) && c.id !== merged.id && c.status === "published")) {
        src.status = "replaced";
        src.replaced_by_flashcard_id = merged.id;
        replaced++;
      }
    return [{ replaced, histories: 0 }];
  };
  db.rpcs.el_profesor_merge_source_fiches = (args) => {
    const bookIds = args.p_book_ids as string[];
    const drafts = args.p_include_drafts as boolean;
    return db.table("el_profesor_fiches")
      .filter((f) => f.superseded_by_fiche_id == null && (drafts || f.status === "published"))
      .map((f) => {
        const sub = db.table("el_profesor_sub_entities").find((s) => s.id === f.sub_entity_id)!;
        const chap = db.table("el_profesor_chapters").find((c) => c.id === sub.chapter_id)!;
        const blocks = db.table("el_profesor_fiche_blocks").filter((b) => b.fiche_id === f.id && (drafts || b.status === "published"));
        const cards = db.table("el_profesor_flashcards").filter((c) => c.fiche_id === f.id && c.status !== "replaced" && (drafts || c.status === "published"));
        return {
          fiche_id: f.id,
          book_id: chap.book_id,
          chapter_id: chap.id,
          chapter_title: chap.title,
          chapter_order: chap.order_index,
          sub_entity_order: sub.order_index,
          title: f.title,
          summary: sub.summary,
          fiche_status: f.status,
          block_count: blocks.length,
          card_count: cards.length,
          chars: [...blocks.map((b) => JSON.stringify(b.content).length), ...cards.map((c) => JSON.stringify(c.front).length + JSON.stringify(c.back).length)].reduce((a, b) => a + b, 0),
        };
      })
      .filter((r) => bookIds.includes(r.book_id as string));
  };

  // Migration 102: the same rows in reading order, in one call.
  db.rpcs.el_profesor_merge_source_catalog = (args) =>
    [db.rpcs.el_profesor_merge_source_fiches(args)].flat().sort((a, b) =>
      String(a.book_id).localeCompare(String(b.book_id)) ||
      (a.chapter_order as number) - (b.chapter_order as number) ||
      (a.sub_entity_order as number) - (b.sub_entity_order as number) ||
      String(a.fiche_id).localeCompare(String(b.fiche_id))
    );

  const job = db.insertRow("el_profesor_merge_jobs", { book_id: merged.id, source_book_ids: [miller.id, albrecht.id], include_drafts: true, provider, model: provider === "claude" ? "claude-sonnet-5" : "gemini-flash-latest" });
  return { job, merged, sourceBookIds: [miller.id, albrecht.id] };
}

async function runUntil(db: FakeDb, jobId: unknown, stages: string[]) {
  for (let i = 0; i < 12; i++) {
    await processMergeJobs({ budgetMs: 280_000, startBeforeMs: 270_000 });
    const job = db.table("el_profesor_merge_jobs").find((j) => j.id === jobId)!;
    if (stages.includes(job.stage as string)) return job;
  }
  return db.table("el_profesor_merge_jobs").find((j) => j.id === jobId)!;
}

/** Table of contents first, then the chapters in two lots: the first chapter alone, then all the others. */
async function runToEnd(db: FakeDb, jobId: unknown) {
  const ready = await runUntil(db, jobId, ["ready", "failed"]);
  if (ready.stage !== "ready") return ready;
  const chapterIds = flattenChapters(ready.plan as unknown as MergePlan).map((c) => c.chapterId);
  await releaseChapters(db as never, ready as unknown as ElProfesorMergeJobRow, chapterIds.slice(0, 1));
  const afterFirst = await runUntil(db, jobId, ["ready", "done", "failed"]);
  if (afterFirst.stage !== "ready") return afterFirst;
  await releaseChapters(db as never, afterFirst as unknown as ElProfesorMergeJobRow, chapterIds.slice(1));
  return runUntil(db, jobId, ["done", "failed"]);
}

function mergedContent(db: FakeDb, bookId: unknown) {
  const chapters = db.table("el_profesor_chapters").filter((c) => c.book_id === bookId);
  const subs = db.table("el_profesor_sub_entities").filter((s) => chapters.some((c) => c.id === s.chapter_id));
  const fiches = db.table("el_profesor_fiches").filter((f) => subs.some((s) => s.id === f.sub_entity_id));
  const ficheIds = new Set(fiches.map((f) => f.id));
  return {
    chapters,
    subs,
    fiches,
    blocks: db.table("el_profesor_fiche_blocks").filter((b) => ficheIds.has(b.fiche_id)),
    cards: db.table("el_profesor_flashcards").filter((c) => ficheIds.has(c.fiche_id)),
  };
}

function sourceContent(db: FakeDb, sourceBookIds: unknown[]) {
  const chapters = db.table("el_profesor_chapters").filter((c) => sourceBookIds.includes(c.book_id));
  const subs = db.table("el_profesor_sub_entities").filter((s) => chapters.some((c) => c.id === s.chapter_id));
  const fiches = db.table("el_profesor_fiches").filter((f) => subs.some((s) => s.id === f.sub_entity_id));
  const ficheIds = new Set(fiches.map((f) => f.id));
  return {
    blocks: db.table("el_profesor_fiche_blocks").filter((b) => ficheIds.has(b.fiche_id)),
    cards: db.table("el_profesor_flashcards").filter((c) => ficheIds.has(c.fiche_id)),
  };
}

describe.each(["gemini", "claude"] as const)("fusion de bout en bout (%s)", (provider) => {
  beforeEach(() => {
    h.db = new FakeDb();
    h.prompts = [];
    h.batches = new Map();
    h.creditGone = false;
    h.lightModelSkipsKeyPoints = false;
  });

  it("redoes the repairs the AI couldn't do: copies out, missing items integrated, nothing lost or doubled", async () => {
    const { job, merged, sourceBookIds } = seed(h.db, provider);
    const ready = await runUntil(h.db, job.id, ["ready", "failed"]);
    const chapterIds = flattenChapters(ready.plan as unknown as MergePlan).map((c) => c.chapterId);
    h.creditGone = true;
    await releaseChapters(h.db as never, ready as unknown as ElProfesorMergeJobRow, chapterIds);
    // A refused call is retried a few minutes later (three tries): time is fast-forwarded between runs.
    for (let i = 0; i < 20; i++) {
      await processMergeJobs({ budgetMs: 280_000, startBeforeMs: 270_000 });
      for (const t of h.db.table("el_profesor_merge_tasks")) if (t.status === "waiting") t.next_attempt_at = new Date(0).toISOString();
      if (h.db.table("el_profesor_merge_jobs").find((j) => j.id === job.id)!.stage === "done") break;
    }
    const afterFail = h.db.table("el_profesor_merge_jobs").find((j) => j.id === job.id)!;
    expect(afterFail.stage).toBe("done");
    const failedRepairs = h.db.table("el_profesor_merge_tasks").filter((t) => t.job_id === job.id && t.stage === "repair" && t.status === "failed");
    expect(failedRepairs.length).toBeGreaterThan(0);
    const before = mergedContent(h.db, merged.id);
    const verbatimBefore = before.blocks.filter((b) => b.needs_review).length + before.cards.filter((c) => c.needs_review).length;
    expect(verbatimBefore).toBeGreaterThan(0);

    h.creditGone = false;
    const redo = await redoFailedRepairs(h.db as never, afterFail as unknown as ElProfesorMergeJobRow);
    expect(redo.fiches).toBe(failedRepairs.length);
    expect(redo.blocksRemoved + redo.cardsRemoved).toBeGreaterThan(0);
    // The queue waits two minutes before taking the repairs again: let time pass.
    for (const t of h.db.table("el_profesor_merge_tasks")) if (t.status === "waiting") t.next_attempt_at = new Date(0).toISOString();
    const done = await runUntil(h.db, job.id, ["done", "failed"]);
    expect(done.stage).toBe("done");
    expect(h.db.table("el_profesor_merge_tasks").filter((t) => t.job_id === job.id && t.stage === "repair" && t.status === "failed")).toHaveLength(0);
    expect(((done.stats as { rounds?: { kind?: string }[] }).rounds ?? []).some((r) => r.kind === "repair")).toBe(true);

    const out = mergedContent(h.db, merged.id);
    const src = sourceContent(h.db, sourceBookIds);
    const cited = new Set(out.blocks.flatMap((b) => (b.citations as { sourceBlockId?: string }[]).map((c) => c.sourceBlockId)));
    for (const b of src.blocks) expect(cited.has(b.id as string), `bloc source non repris : ${JSON.stringify(b.content)}`).toBe(true);
    for (const c of src.cards) {
      const holders = out.cards.filter((m) => (m.source_flashcard_ids as string[]).includes(c.id as string));
      expect(holders.length, `carte source non reprise : ${JSON.stringify(c.front)}`).toBeGreaterThanOrEqual(1);
      expect(holders.length).toBeLessThanOrEqual(2);
    }
    for (const f of out.fiches) {
      const blocks = out.blocks.filter((b) => b.fiche_id === f.id).sort((a, b) => (a.order_index as number) - (b.order_index as number));
      expect(blocks[blocks.length - 1].block_type, `fiche sans À retenir : ${f.title}`).toBe("a_retenir");
    }
  });

  it("writes a lot with another model and keeps each one's tokens apart", async () => {
    const { job } = seed(h.db, provider);
    const tocModel = job.model;
    const ready = await runUntil(h.db, job.id, ["ready", "failed"]);
    const chapterIds = flattenChapters(ready.plan as unknown as MergePlan).map((c) => c.chapterId);
    const other = provider === "claude" ? { provider: "gemini" as const, model: "gemini-flash-latest" } : { provider: "claude" as const, model: "claude-haiku-5-5" };
    await releaseChapters(h.db as never, ready as unknown as ElProfesorMergeJobRow, chapterIds.slice(0, 1), other);
    const after = await runUntil(h.db, job.id, ["ready", "done", "failed"]);
    expect(after.provider).toBe(other.provider);
    const stats = after.stats as unknown as MergeStats;
    expect(stats.toc).toMatchObject({ provider, model: tocModel });
    expect(stats.toc!.inputTokens).toBeGreaterThan(0);
    const lot = stats.rounds!.find((r) => r.round === 1)!;
    expect(lot).toMatchObject(other);
    // The table of contents and the lot share out every token spent, nothing counted twice.
    expect(stats.toc!.inputTokens + lot.inputTokens).toBe(stats.inputTokens);
  });

  it("gives « À retenir » a second try with a stronger model when a light one skips it", async () => {
    if (provider !== "claude") return;
    const { job, merged } = seed(h.db, provider);
    const ready = await runUntil(h.db, job.id, ["ready", "failed"]);
    const chapterIds = flattenChapters(ready.plan as unknown as MergePlan).map((c) => c.chapterId);
    h.lightModelSkipsKeyPoints = true;
    await releaseChapters(h.db as never, ready as unknown as ElProfesorMergeJobRow, chapterIds, { provider: "claude", model: "claude-haiku-5-5" });
    const done = await runUntil(h.db, job.id, ["done", "failed"]);
    expect(done.stage).toBe("done");
    const retries = h.db.table("el_profesor_merge_tasks").filter((t) => t.job_id === job.id && String(t.ref_key).startsWith("keypoints:"));
    expect(retries.length).toBeGreaterThan(0);
    for (const t of retries) expect((t.input as { model?: string }).model).toBe("claude-sonnet-5");
    const out = mergedContent(h.db, merged.id);
    for (const f of out.fiches) {
      const blocks = out.blocks.filter((b) => b.fiche_id === f.id).sort((a, b) => (a.order_index as number) - (b.order_index as number));
      expect(blocks[blocks.length - 1].block_type, `fiche sans À retenir : ${f.title}`).toBe("a_retenir");
    }
  });

  it("applies each answer once when two runs overlap", async () => {
    const { job } = seed(h.db, provider);
    const ready = await runUntil(h.db, job.id, ["ready", "failed"]);
    const chapterIds = flattenChapters(ready.plan as unknown as MergePlan).map((c) => c.chapterId);
    await releaseChapters(h.db as never, ready as unknown as ElProfesorMergeJobRow, chapterIds);
    for (let i = 0; i < 12; i++) {
      // The cron fires every minute and a run lasts longer: two collect the same finished batches.
      await Promise.all([processMergeJobs({ budgetMs: 280_000, startBeforeMs: 270_000 }), processMergeJobs({ budgetMs: 280_000, startBeforeMs: 270_000 })]);
      if (h.db.table("el_profesor_merge_jobs").find((j) => j.id === job.id)!.stage === "done") break;
    }
    expect(h.db.table("el_profesor_merge_jobs").find((j) => j.id === job.id)!.stage).toBe("done");
    const written = h.db.table("el_profesor_merge_tasks").filter((t) => t.job_id === job.id && (t.stage === "fiche" || t.stage === "repair"));
    expect(written.length).toBeGreaterThan(0);
    for (const t of written) {
      expect(t.status).toBe("done");
      expect(t.attempts, `${t.stage} refaite : ${t.error}`).toBe(0);
    }
  });

  it("stops at the table of contents: every fiche placed, nothing written yet", async () => {
    const { job, merged } = seed(h.db, provider);
    const ready = await runUntil(h.db, job.id, ["ready", "failed"]);
    expect(ready.stage).toBe("ready");
    const stats = ready.stats as Record<string, number>;
    expect(stats.unusedFiches).toBe(0);
    expect(mergedContent(h.db, merged.id).chapters).toHaveLength(0);
    const ficheTasks = h.db.table("el_profesor_merge_tasks").filter((t) => t.job_id === job.id && t.stage === "fiche");
    expect(ficheTasks.length).toBe(stats.fichesPlanned);
    expect(ficheTasks.every((t) => t.status === "held")).toBe(true);
    expect(h.prompts.some((p) => p.includes("Tu rédiges"))).toBe(false);

    // One chapter: only its fiches are written, then the fusion waits again.
    const chapterIds = flattenChapters(ready.plan as unknown as MergePlan).map((c) => c.chapterId);
    await releaseChapters(h.db as never, ready as unknown as ElProfesorMergeJobRow, chapterIds.slice(0, 1));
    const again = await runUntil(h.db, job.id, ["ready", "done", "failed"]);
    expect(again.stage).toBe(chapterIds.length > 1 ? "ready" : "done");
    const out = mergedContent(h.db, merged.id);
    expect(out.chapters.map((c) => c.id)).toEqual(chapterIds.slice(0, 1));
    expect(out.chapters[0].status).toBe("draft_ready");
    expect((again.stats as { rounds?: unknown[] }).rounds).toHaveLength(1);
    await expect(releaseChapters(h.db as never, again as unknown as ElProfesorMergeJobRow, chapterIds.slice(0, 1))).rejects.toThrow();
  });

  it("takes the sources as they are when a lot is written, months later", async () => {
    const { job, merged } = seed(h.db, provider);
    const ready = await runUntil(h.db, job.id, ["ready", "failed"]);
    // Since the table of contents: a block added to the broad (shared) Albrecht fiche, a source fiche emptied.
    const bridion = h.db.table("el_profesor_fiches").find((f) => f.title === "Sugammadex (Bridion®)")!;
    const added = h.db.insertRow("el_profesor_fiche_blocks", {
      fiche_id: bridion.id,
      block_type: "perle_clinique",
      content: { text: "Recurarisation exceptionnelle après 2 mg/kg sur bloc profond." },
      order_index: 9,
      status: "published",
      citations: [{ page: 812, quote: "q" }],
      needs_review: false,
    });
    const peep = h.db.table("el_profesor_fiches").find((f) => f.title === "PEEP et recrutement")!;
    for (const table of ["el_profesor_fiche_blocks", "el_profesor_flashcards"] as const)
      for (const row of h.db.table(table).filter((r) => r.fiche_id === peep.id)) h.db.table(table).splice(h.db.table(table).indexOf(row), 1);

    const chapterIds = flattenChapters(ready.plan as unknown as MergePlan).map((c) => c.chapterId);
    await releaseChapters(h.db as never, ready as unknown as ElProfesorMergeJobRow, chapterIds);
    const done = await runUntil(h.db, job.id, ["done", "failed"]);
    expect(done.stage).toBe("done");
    const out = mergedContent(h.db, merged.id);
    const cited = new Set(out.blocks.flatMap((b) => (b.citations as { sourceBlockId?: string }[]).map((c) => c.sourceBlockId)));
    expect(cited.has(added.id as string)).toBe(true);
    for (const s of out.subs) expect(s.source_fiche_ids as string[]).not.toContain(peep.id);
  });

  it("gives a fiche to shared-source items the table of contents missed", async () => {
    const { job, merged } = seed(h.db, provider);
    const ready = await runUntil(h.db, job.id, ["ready", "failed"]);
    // As if a chunk of content had not been read: the routed ids of one shared source are dropped everywhere.
    const tasks = h.db.table("el_profesor_merge_tasks").filter((t) => t.job_id === job.id && t.stage === "fiche");
    const routedSource = tasks.flatMap((t) => (t.input as { sources: { ficheId: string; blockIds?: string[] }[] }).sources).find((s) => s.blockIds?.length);
    expect(routedSource).toBeTruthy();
    const lost = new Set(tasks.flatMap((t) => (t.input as { sources: { ficheId: string; blockIds?: string[] }[] }).sources).filter((s) => s.ficheId === routedSource!.ficheId).flatMap((s) => s.blockIds ?? []));
    for (const t of tasks)
      for (const s of (t.input as { sources: { ficheId: string; blockIds?: string[]; cardIds?: string[] }[] }).sources)
        if (s.ficheId === routedSource!.ficheId) {
          s.blockIds = [];
          s.cardIds = [];
        }

    const chapterIds = flattenChapters(ready.plan as unknown as MergePlan).map((c) => c.chapterId);
    await releaseChapters(h.db as never, ready as unknown as ElProfesorMergeJobRow, chapterIds);
    expect((await runUntil(h.db, job.id, ["done", "failed"])).stage).toBe("done");
    const out = mergedContent(h.db, merged.id);
    const cited = new Set(out.blocks.flatMap((b) => (b.citations as { sourceBlockId?: string }[]).map((c) => c.sourceBlockId)));
    const heldCards = new Set(out.cards.flatMap((c) => c.source_flashcard_ids as string[]));
    for (const id of lost) expect(cited.has(id) || heldCards.has(id), `élément sans fiche : ${id}`).toBe(true);
  });

  it("finishes, loses nothing, duplicates nothing, and builds a readable book", async () => {
    const { job, merged, sourceBookIds } = seed(h.db, provider);
    const done = await runToEnd(h.db, job.id);
    expect(done.stage).toBe("done");

    const out = mergedContent(h.db, merged.id);
    const src = sourceContent(h.db, sourceBookIds);

    // Table of contents: parts and sub-parts on every chapter, every chapter ready to review.
    expect(out.chapters.length).toBeGreaterThan(0);
    for (const c of out.chapters) {
      expect(c.status).toBe("draft_ready");
      expect(c.source_kind).toBe("merged");
      expect(c.part_title).toBeTruthy();
    }
    expect(new Set(out.chapters.map((c) => c.part_title))).toEqual(new Set(["Pharmacologie", "Ventilation"]));

    // Every source block is taken up somewhere (cited by a merged block).
    const cited = new Set(out.blocks.flatMap((b) => (b.citations as { sourceBlockId?: string }[]).map((c) => c.sourceBlockId)));
    for (const b of src.blocks) expect(cited.has(b.id as string), `bloc source non repris : ${JSON.stringify(b.content)}`).toBe(true);

    // Every value of every source block is still stated in the merged book.
    const bookFacts = numericFacts(out.blocks.map((b) => blockPromptText(b.block_type as string, b.content as BlockContent)).join("\n"));
    for (const b of src.blocks) expect(missingFacts(blockPromptText(b.block_type as string, b.content as BlockContent), bookFacts), JSON.stringify(b.content)).toEqual([]);

    // Every source card lives on in a merged card, at most twice (a card re-written for a lost value).
    for (const c of src.cards) {
      const holders = out.cards.filter((m) => (m.source_flashcard_ids as string[]).includes(c.id as string));
      expect(holders.length, `carte source non reprise : ${JSON.stringify(c.front)}`).toBeGreaterThanOrEqual(1);
      expect(holders.length).toBeLessThanOrEqual(2);
    }

    // Every merged fiche ends with « À retenir »; a divergence is written where books differ.
    for (const f of out.fiches) {
      const blocks = out.blocks.filter((b) => b.fiche_id === f.id).sort((a, b) => (a.order_index as number) - (b.order_index as number));
      expect(blocks.some((b) => b.block_type === "a_retenir"), `fiche sans À retenir : ${f.title}`).toBe(true);
      const last = blocks[blocks.length - 1];
      expect(last.block_type).toBe("a_retenir");
      expect(new Set(blocks.map((b) => b.order_index)).size).toBe(blocks.length);
    }
    expect(out.blocks.some((b) => b.block_type === "divergence")).toBe(true);

    // The broad Albrecht fiche was shared out by subject: dosing to the dosing fiche, side effects to the side-effects fiche.
    const ficheOf = (needle: string) => {
      const source = src.blocks.find((b) => JSON.stringify(b.content).includes(needle))!;
      const holder = out.blocks.find((b) => (b.citations as { sourceBlockId?: string }[]).some((c) => c.sourceBlockId === source.id))!;
      return out.fiches.find((f) => f.id === holder.fiche_id)!.title;
    };
    expect(ficheOf("poids idéal + 40 %")).toBe("posologie");
    expect(ficheOf("contraceptifs oraux")).toBe("effets secondaires");
    expect(ficheOf("cavité de la cyclodextrine")).toBe("mécanisme");

    // The source figure and the image-occlusion card came over; merged citations point at the source chapters.
    expect(out.blocks.some((b) => b.image_url === "https://img/figure.png")).toBe(true);
    expect(out.cards.some((c) => (c.image_occlusions as unknown[]).length > 0)).toBe(true);
    const sourceChapterIds = new Set(h.db.table("el_profesor_chapters").filter((c) => sourceBookIds.includes(c.book_id)).map((c) => c.id));
    for (const b of out.blocks)
      for (const c of b.citations as { chapterId?: string; page: number }[]) if (c.page > 0) expect(sourceChapterIds.has(c.chapterId)).toBe(true);

    // Stats for the Notions page.
    const stats = done.stats as Record<string, number>;
    expect(stats.sourceFiches).toBe(7);
    expect(stats.fichesPlanned).toBe(out.fiches.length);
    expect(stats.fichesRepaired).toBeGreaterThan(0);
    expect(stats.inputTokens).toBeGreaterThan(0);
    expect(stats.unusedFiches).toBe(0);
    // Written in two lots, each with its own token count.
    const rounds = (done.stats as { rounds?: { round: number; chapters: number; inputTokens: number }[] }).rounds ?? [];
    expect(rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(rounds.reduce((s, r) => s + r.chapters, 0)).toBe(out.chapters.length);
    expect(rounds.every((r) => r.inputTokens > 0)).toBe(true);

    if (process.env.MERGE_DEBUG) {
      const fs = await import("node:fs");
      const kinds = h.prompts.map((p) => (p.includes("Conçois les PARTIES") ? "plan" : p.includes("Tu ranges") ? "assign" : p.includes("Tu organises") ? "outline" : p.includes("Tu rédiges") ? "fiche" : "repair"));
      const tasks = h.db.table("el_profesor_merge_tasks").map((t) => ({ stage: t.stage, ref: t.ref_key, status: t.status, input: t.stage === "repair" ? t.input : undefined, output: t.stage === "fiche" ? t.output : undefined }));
      const fichesDump = out.fiches.map((f) => ({
        title: f.title,
        blocks: out.blocks.filter((b) => b.fiche_id === f.id).sort((a, b) => (a.order_index as number) - (b.order_index as number)).map((b) => `${b.block_type}${b.needs_review ? " [à vérifier]" : ""}: ${blockPromptText(b.block_type as string, b.content as BlockContent).slice(0, 90)}`),
        cards: out.cards.filter((c) => c.fiche_id === f.id).map((c) => `${(c.front as { text: string }).text} → ${(c.back as { text: string }).text}${c.needs_review ? " [à vérifier]" : ""}`),
      }));
      fs.writeFileSync(`${process.env.MERGE_DEBUG}/${provider}.json`, JSON.stringify({ kinds, stats: done.stats, plan: done.plan, tasks, fichesDump, firstFichePrompt: h.prompts.find((p) => p.includes("Tu rédiges")) }, null, 2));
    }

    // Running the queue again changes nothing (no duplicate blocks or cards).
    const before = { blocks: out.blocks.length, cards: out.cards.length };
    await processMergeJobs({ budgetMs: 280_000, startBeforeMs: 270_000 });
    const after = mergedContent(h.db, merged.id);
    expect({ blocks: after.blocks.length, cards: after.cards.length }).toEqual(before);
  });
});
