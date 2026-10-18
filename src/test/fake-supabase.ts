// In-memory stand-in for the subset of the Supabase client the book fusion
// pipeline uses (select / insert / upsert / update / delete with simple
// filters, counts, ranges, and the two RPCs of migration 098), so the whole
// pipeline can run end to end in a unit test against a fake AI.

import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

const DEFAULTS: Record<string, () => Row> = {
  el_profesor_merge_tasks: () => ({ status: "waiting", attempts: 0, next_attempt_at: new Date(0).toISOString(), started_at: null, claude_batch_id: null, error: null, input_tokens: null, output_tokens: null, output: null, input: {} }),
  el_profesor_merge_jobs: () => ({ stage: "plan", plan: null, stats: {}, error: null, locked_until: null, finished_at: null, include_drafts: true }),
  el_profesor_fiche_blocks: () => ({ needs_review: false, status: "draft", is_emergency: false, image_url: null, image_alt: null, suggested_image: null, citations: [] }),
  el_profesor_flashcards: () => ({ status: "draft", needs_review: false, image_url: null, image_alt: null, variants: [], image_occlusions: [], cloze_ranges: [], suggested_image_page: null, suggested_image_hint: null, source_flashcard_ids: [], replaced_by_flashcard_id: null, citations: [] }),
  el_profesor_sub_entities: () => ({ summary: "", source_fiche_ids: [] }),
  el_profesor_fiches: () => ({ status: "draft", share_token: null, superseded_by_fiche_id: null, superseded_reason: null, superseded_note: "" }),
  el_profesor_chapters: () => ({ status: "pending", part_title: null, sub_part_title: null, extraction_error: null }),
};

let clock = 0;
const stamp = () => new Date(Date.UTC(2026, 9, 18) + clock++).toISOString();

export class FakeDb {
  tables: Record<string, Row[]> = {};
  rpcs: Record<string, (args: Record<string, unknown>) => Row[]> = {};

  table(name: string): Row[] {
    return (this.tables[name] ??= []);
  }

  insertRow(name: string, row: Row): Row {
    const full = { ...(DEFAULTS[name]?.() ?? {}), id: randomUUID(), created_at: stamp(), updated_at: stamp(), ...row };
    this.table(name).push(full);
    return full;
  }

  from(name: string) {
    return new Query(this, name);
  }

  rpc(name: string, args: Record<string, unknown>) {
    const q = new Query(this, `rpc:${name}`);
    q.rows = () => this.rpcs[name](args);
    return q;
  }
}

class Query implements PromiseLike<{ data: unknown; error: null; count?: number }> {
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private from_ = 0;
  private to_ = Infinity;
  private mode: "select" | "update" | "insert" | "upsert" | "delete" = "select";
  private payload: unknown;
  private returning = false;
  private single: "maybe" | "one" | null = null;
  private countOnly = false;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  rows: (() => Row[]) | null = null;

  constructor(
    private db: FakeDb,
    private name: string
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode !== "select") this.returning = true;
    if (opts?.head) this.countOnly = true;
    return this;
  }
  update(patch: Row) {
    this.mode = "update";
    this.payload = patch;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.mode = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.upsertOpts = opts;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== v);
    return this;
  }
  in(col: string, vs: unknown[]) {
    const set = new Set(vs);
    this.filters.push((r) => set.has(r[col]));
    return this;
  }
  lt(col: string, v: string) {
    this.filters.push((r) => r[col] != null && String(r[col]) < v);
    return this;
  }
  lte(col: string, v: string) {
    this.filters.push((r) => r[col] != null && String(r[col]) <= v);
    return this;
  }
  is(col: string, v: null) {
    this.filters.push((r) => r[col] === v || r[col] === undefined);
    return this;
  }
  not(col: string, op: string, v: unknown) {
    if (op === "is" && v === null) this.filters.push((r) => r[col] != null);
    return this;
  }
  /** Only the "a.is.null,a.lt.X" shape the pipeline uses. */
  or(expr: string) {
    const parts = expr.split(",").map((p) => {
      const [col, op, ...rest] = p.split(".");
      const value = rest.join(".");
      return (r: Row) => (op === "is" && value === "null" ? r[col] == null : op === "lt" ? r[col] != null && String(r[col]) < value : false);
    });
    this.filters.push((r) => parts.some((f) => f(r)));
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orders.push({ col, asc: opts.ascending !== false });
    return this;
  }
  range(from: number, to: number) {
    this.from_ = from;
    this.to_ = to;
    return this;
  }
  limit(n: number) {
    this.to_ = this.from_ + n - 1;
    return this;
  }
  maybeSingle() {
    this.single = "maybe";
    return this;
  }
  then<T1, T2>(onfulfilled?: ((v: { data: unknown; error: null; count?: number }) => T1 | PromiseLike<T1>) | null, onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null) {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }

  private matching(): Row[] {
    const source = this.rows ? this.rows() : this.db.table(this.name);
    let out = source.filter((r) => this.filters.every((f) => f(r)));
    for (const { col, asc } of [...this.orders].reverse())
      out = [...out].sort((a, b) => {
        const x = a[col] as string | number;
        const y = b[col] as string | number;
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
      });
    return out;
  }

  private shape(rows: Row[]) {
    const copy = rows.map((r) => structuredClone(r));
    if (this.single) return { data: copy[0] ?? null, error: null };
    return { data: copy, error: null };
  }

  private run(): { data: unknown; error: null; count?: number } {
    const table = this.db.table(this.name);
    if (this.mode === "select") {
      const all = this.matching();
      if (this.countOnly) return { data: null, error: null, count: all.length };
      return this.shape(all.slice(this.from_, this.to_ === Infinity ? undefined : this.to_ + 1));
    }
    if (this.mode === "update") {
      const hit = this.matching();
      for (const r of hit) Object.assign(r, structuredClone(this.payload as Row), { updated_at: stamp() });
      return this.returning ? this.shape(hit) : { data: null, error: null };
    }
    if (this.mode === "delete") {
      const hit = new Set(this.matching());
      const kept = table.filter((r) => !hit.has(r));
      // Same as the database: deleting a merged card gives its replaced sources back (trigger, migration 098).
      if (this.name === "el_profesor_flashcards")
        for (const gone of hit) for (const r of kept) if (r.replaced_by_flashcard_id === gone.id) Object.assign(r, { status: "published", replaced_by_flashcard_id: null });
      table.length = 0;
      table.push(...kept);
      return { data: null, error: null };
    }
    const rows = this.payload as Row[];
    const inserted: Row[] = [];
    for (const row of rows) {
      if (this.mode === "upsert") {
        const keys = (this.upsertOpts.onConflict ?? "id").split(",");
        const existing = table.find((r) => keys.every((k) => r[k] === row[k]));
        if (existing) {
          if (!this.upsertOpts.ignoreDuplicates) Object.assign(existing, structuredClone(row));
          continue;
        }
      }
      inserted.push(this.db.insertRow(this.name, structuredClone(row)));
    }
    return this.returning ? this.shape(inserted) : { data: null, error: null };
  }
}
