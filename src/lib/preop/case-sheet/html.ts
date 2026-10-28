// The day's case sheet as printed: A5, one card per patient, numbered,
// never split across two pages — the same markup for the screen's preview
// (where every line can be touched) and for the print window, so what is
// checked is what is printed. What it shows and how much it says follow
// the sheet's settings (SheetSettings), kept on the device.

import type { CaseSheet, ItemSection, SheetItem, SheetKinetics, SheetRow } from "./build";

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** What the sheet shows, and how much it says — chosen once, kept on the device. */
export interface SheetSettings {
  /** What an antecedent in bold implies: not written, in short, in full. */
  detail: "none" | "short" | "full";
  /** Every treatment, or only those to stop, adapt or check. */
  treatments: "all" | "action";
  /** The main alerts, all of them, or none. */
  alerts: "main" | "all" | "none";
  habits: boolean;
  surgical: boolean;
  postop: boolean;
  planB: boolean;
  notes: boolean;
  /** The tests needed: the recommended ones, those to consider too, or none. */
  workup: "required" | "all" | "off";
  /** The « Pharmaco » list at the end: off, onset and half-times, or with the duration and the awakening. */
  pharmaco: "off" | "short" | "full";
  size: "compact" | "normal" | "large";
}

export const DEFAULT_SETTINGS: SheetSettings = {
  detail: "short",
  treatments: "all",
  alerts: "main",
  habits: true,
  surgical: true,
  postop: true,
  planB: true,
  notes: true,
  workup: "required",
  pharmaco: "off",
  size: "normal",
};

/**
 * Lines taken off the sheet, by key: « row:Analgésie » (a whole line of the
 * plan), « Analgésie:Kétorolac 30 mg » (one product), an item's key
 * (« atcd:… », « ttt:… », « alert:… », « add:… »), « pk:Propofol »…
 */
export type HiddenLines = ReadonlySet<string>;

export interface SheetHtmlOptions {
  hidden?: HiddenLines;
  /** The preview: every line can be touched (a menu opens), hidden ones shown struck through. */
  editable?: boolean;
  settings?: SheetSettings;
  /** Products' text corrected on the sheet, by key (« Analgésie:Kétorolac 30 mg »). */
  edits?: Record<string, string>;
}

const SECTION_LABEL: Record<ItemSection, string> = { atcd: "ATCD", habit: "Habitus", chir: "Chir.", ttt: "TTT", allergy: "Allergies", alert: "", note: "" };

/** « Propofol 200 mg » → the dose in bold: what is read at a glance in theatre. */
const withDose = (t: string) => esc(t).replace(/(\d[\d,]*(?:–[\d,]+)?\s?(?:mg|µg|g|mL|UI|ng\/mL|µg\/mL)(?:\/kg)?)/g, "<b>$1</b>");

export function caseSheetHtml(sheet: CaseSheet, index: number, opts: SheetHtmlOptions = {}): string {
  const st = opts.settings ?? DEFAULT_SETTINGS;
  const hidden = opts.hidden ?? new Set<string>();
  const edit = !!opts.editable;
  const edits = opts.edits ?? {};
  /** One piece that can be touched: left out of the print when hidden, struck through in the preview. */
  const piece = (key: string, html: string, tag = "span", cls = "", data = "") => {
    const off = hidden.has(key);
    if (off && !edit) return "";
    const classes = [cls, off ? "off" : ""].filter(Boolean).join(" ");
    return `<${tag}${classes ? ` class="${classes}"` : ""}${edit ? ` data-k="${esc(key)}"${data} role="button" tabindex="0" aria-pressed="${off}"` : ""}>${html}</${tag}>`;
  };
  /** A labelled line of the grid: « Induction | Propofol 200 mg · … ». */
  const gridLine = (key: string, label: string, body: string, cls = "") => (body ? piece(key, `<span class="lb">${esc(label)}</span><span class="vl">${body}</span>`, "div", `ln ${cls}`.trim()) : "");

  const planRow = (r: SheetRow, prefix = "") => {
    const parts = r.parts
      .map((t) => {
        const key = `${prefix}${r.label}:${t.text}`;
        return piece(key, withDose(edits[key] ?? t.text));
      })
      .filter(Boolean);
    if (!parts.length) return "";
    if (!edit && r.parts.every((t) => hidden.has(`${prefix}${r.label}:${t.text}`))) return "";
    return gridLine(`row:${prefix}${r.label}`, r.label, parts.join('<span class="sep"> · </span>'));
  };

  const rows = sheet.rows.filter((r) => st.postop || r.label !== "Post-op");
  const b = st.planB ? sheet.fallback : undefined;
  const planB = b
    ? piece(
        "planb",
        `<div class="ln"><span class="lb">Plan B</span><span class="vl"><b>${esc({ general: "AG", neuraxial: "Rachi", regional: "ALR", sedation: "Sédation" }[b.mode])}</b> si refus / échec${b.technique.includes(",") ? ` — ${esc(b.technique.replace(/^[^,]+,\s*/, ""))}` : ""}</span></div>${b.rows.map((r) => planRow(r, "B ")).join("")}`,
        "div",
        "planb"
      )
    : "";

  // The patient.
  const shown = (s: ItemSection) =>
    sheet.items.filter((i) => {
      if (i.section !== s) return false;
      if (s === "ttt" && st.treatments === "action" && i.conduct === "continue") return false;
      if (s === "alert" && (st.alerts === "none" || (st.alerts === "main" && i.minor))) return false;
      return true;
    });
  const itemHtml = (i: SheetItem) => {
    const text = i.strong ? `<b>${esc(i.text)}</b>` : esc(i.text);
    const detail = i.section === "ttt" && i.detail ? ` <span class="cd${i.conduct === "stop" ? " stop" : ""}">→ ${esc(i.detail)}</span>` : "";
    return piece(i.key, text + detail, "span", "", ` data-s="${i.section}"`);
  };
  const itemLine = (s: ItemSection, sep: string, empty?: string) => {
    const list = shown(s);
    const html = list.map(itemHtml).filter(Boolean);
    if (!html.length && !empty) return "";
    if (!edit && list.length && list.every((i) => hidden.has(i.key))) return "";
    return gridLine(`row:${SECTION_LABEL[s]}`, SECTION_LABEL[s], html.length ? html.join(`<span class="sep">${sep}</span>`) : esc(empty!));
  };
  // The work-up: what is there, what is asked for, what is to plan (in red).
  const work = st.workup === "off" ? [] : (sheet.workup ?? []).filter((w) => st.workup === "all" || w.strength === "recommended");
  const workPiece = (w: (typeof work)[number]) =>
    piece(
      `bilan:${w.code}`,
      w.status === "todo"
        ? `<b>${esc(w.label)}</b>${w.strength === "consider" ? " ?" : ""}${st.detail !== "none" && w.reason ? ` <span class="why">(${esc(w.reason)})</span>` : ""}`
        : w.status === "asked"
          ? `${esc(w.label)} <i>demandé</i>`
          : esc(w.value ?? w.label)
    );
  const workLine = (label: string, list: typeof work, cls = "") => {
    const html = list.map(workPiece).filter(Boolean);
    if (!html.length) return "";
    return gridLine(`row:${label}`, label, html.join('<span class="sep"> · </span>'), cls);
  };
  const workup = workLine("Bilan", work.filter((w) => w.status !== "todo")) + workLine("À prévoir", work.filter((w) => w.status === "todo"), "todo");

  const implications =
    st.detail === "none"
      ? ""
      : shown("atcd")
          .filter((i) => i.strong && i.detail && !hidden.has(i.key))
          .map((i) => piece(`imp:${i.key}`, `<b>${esc(i.text.replace(/\s*[.;:]$/, ""))}</b> → ${esc(st.detail === "full" ? (i.detailFull ?? i.detail!) : i.detail!)}`, "div", "imp"))
          .join("");
  const alerts = shown("alert")
    .map((i) => piece(i.key, esc(i.text), "li"))
    .filter(Boolean);
  const notes = st.notes
    ? shown("note")
        .map((i) => piece(i.key, esc(i.text), "div", "note", ` data-s="note"`))
        .join("")
    : "";

  const tags = sheet.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  return `<article class="case">
<header class="hd"><span class="no">${index}</span><span class="who"><b>${esc(sheet.initials)}</b> — ${esc(sheet.surgery)}</span>${tags}</header>
<p class="body">${esc(sheet.body)}</p>
<section class="blk">
${piece("tech", esc(sheet.technique), "div", "tech")}
${rows.map((r) => planRow(r)).join("")}
${planB}
</section>
<section class="blk pt">
${itemLine("atcd", ", ", "RAS")}
${implications}
${st.habits ? itemLine("habit", " ; ") : ""}
${st.surgical ? itemLine("chir", ", ") : ""}
${itemLine("ttt", " ; ", "aucun")}
${itemLine("allergy", ", ")}
${workup}
</section>
${alerts.length ? `<ul class="alerts">${alerts.join("")}</ul>` : ""}
${notes}
</article>`;
}

/** Styles of the sheet, scoped under `scope` (the preview) or the page (print). */
export function caseSheetCss(scope = "", settings: SheetSettings = DEFAULT_SETTINGS): string {
  const s = (sel: string) => (scope ? `${scope} ${sel}` : sel);
  const size = { compact: 7.8, normal: 8.6, large: 9.6 }[settings.size];
  return `
${s(".case")}{break-inside:avoid;page-break-inside:avoid;margin:0 0 3.2mm;padding:0 0 2.6mm;border-bottom:0.25mm solid #cfd6d9;font:${size}pt/1.34 "Helvetica Neue",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#14191b}
${s(".case:last-of-type")}{border-bottom:0}
${s(".case .hd")}{display:flex;align-items:center;gap:1.6mm;margin:0 0 0.6mm;font-size:1.1em}
${s(".case .no")}{display:inline-flex;align-items:center;justify-content:center;min-width:5mm;height:5mm;padding:0 1mm;border-radius:1mm;background:#1f4f53;color:#fff;font-weight:700;font-size:.9em}
${s(".case .who")}{flex:1;min-width:0;text-transform:uppercase;letter-spacing:.01em}
${s(".case .tag")}{border:0.25mm solid #1f4f53;color:#1f4f53;border-radius:5mm;padding:0 1.4mm;font-size:.82em;font-weight:600;white-space:nowrap}
${s(".case .body")}{margin:0 0 1mm;color:#3c4549}
${s(".case .blk")}{margin:0 0 1mm}
${s(".case .blk.pt")}{border-top:0.2mm dotted #b9c4c7;padding-top:0.8mm}
${s(".case .tech")}{font-weight:700;margin:0 0 0.4mm}
${s(".case .ln")}{display:grid;grid-template-columns:16mm 1fr;column-gap:1.5mm;margin:0.15mm 0}
${s(".case .lb")}{color:#1f4f53;font-weight:600;font-size:.86em;text-transform:uppercase;letter-spacing:.03em;padding-top:.1em}
${s(".case .sep")}{color:#8a979b}
${s(".case .planb")}{margin:0.6mm 0 0;padding:0.4mm 0 0.4mm 1.5mm;border-left:0.6mm dashed #8fa9ab}
${s(".case .imp")}{margin:0.1mm 0 0.1mm 17.5mm;color:#323b3f;font-size:.94em}
${s(".case .ln.todo .vl")}{color:#8a1f12}
${s(".case .ln.todo .lb")}{color:#8a1f12}
${s(".case .why")}{color:#5b6569;font-weight:400;font-size:.9em}
${s(".case .cd")}{color:#3c4549}
${s(".case .cd.stop")}{color:#8a1f12;font-weight:600}
${s(".case .alerts")}{margin:0.8mm 0 0;padding:0.8mm 1.6mm 0.8mm 5mm;background:#fbeeea;border-left:0.8mm solid #b3432b;border-radius:0.8mm;color:#7a1d10;font-weight:600}
${s(".case .alerts li")}{margin:0.1mm 0}
${s(".case .note")}{margin:0.6mm 0 0;padding-left:1.6mm;border-left:0.6mm solid #9fb6b9;color:#323b3f;white-space:pre-wrap}
${s(".case [data-k]")}{cursor:pointer;border-radius:0.8mm}
${s(".case [data-k]:hover")}{background:#e8f0f0}
${s(".case [data-k]:focus-visible")}{outline:2px solid #2f5d54;outline-offset:1px}
${s(".case .off")}{opacity:.35;text-decoration:line-through}
${s(".case.pk")}{font-size:${size - 0.6}pt}
${s(".case.pk table")}{width:100%;border-collapse:collapse}
${s(".case.pk th")}{text-align:left;color:#1f4f53;font-size:.86em;text-transform:uppercase;letter-spacing:.03em;border-bottom:0.25mm solid #cfd6d9;padding:0.4mm 1mm}
${s(".case.pk td")}{vertical-align:top;padding:0.5mm 1mm;border-bottom:0.15mm solid #e3e8ea}
${s(".case.pk td:first-child")}{font-weight:600;white-space:nowrap}
`;
}

/** Every drug of the day's sheets once, in their order (« Pharmaco », at the end of the sheet). */
export function dayKinetics(sheets: CaseSheet[]): SheetKinetics[] {
  const out: SheetKinetics[] = [];
  for (const s of sheets) for (const k of s.kinetics) if (!out.some((x) => x.name === k.name)) out.push(k);
  return out;
}

/** « Pharmaco », once for the whole sheet — each drug can be taken off (« pk:Propofol »). */
export function kineticsHtml(items: SheetKinetics[], opts: SheetHtmlOptions = {}): string {
  const st = opts.settings ?? DEFAULT_SETTINGS;
  if (st.pharmaco === "off") return "";
  const hidden = opts.hidden ?? new Set<string>();
  const edit = !!opts.editable;
  const full = st.pharmaco === "full";
  const rows = items
    .map((k) => {
      const key = `pk:${k.name}`;
      const off = hidden.has(key);
      if (off && !edit) return "";
      const cells = [k.name, k.onset, k.csht ?? "—", ...(full ? [k.duration, k.wake] : [])].map((c) => `<td>${esc(c)}</td>`).join("");
      return `<tr${off ? ' class="off"' : ""}${edit ? ` data-k="${esc(key)}" role="button" tabindex="0" aria-pressed="${off}"` : ""}>${cells}</tr>`;
    })
    .filter(Boolean);
  if (!rows.length) return "";
  const head = ["Produit", "Onset", "½-vie contextuelle", ...(full ? ["Durée", "Réveil"] : [])].map((h) => `<th>${h}</th>`).join("");
  return `<section class="case pk"><header class="hd"><span class="who"><b>Pharmaco</b> — adulte, à titre indicatif</span></header><table><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table></section>`;
}

/** The whole printable page. */
export function caseSheetDocument(
  sheets: { sheet: CaseSheet; hidden?: HiddenLines; edits?: Record<string, string> }[],
  title: string,
  opts: { settings?: SheetSettings; hiddenKinetics?: HiddenLines } = {}
): string {
  const st = opts.settings ?? DEFAULT_SETTINGS;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>@page{size:A5;margin:7mm 7mm 8mm}body{margin:0}h1{font:700 10.5pt "Helvetica Neue",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;margin:0 0 2.6mm;padding-bottom:1.2mm;border-bottom:0.5mm solid #1f4f53;color:#1f4f53}${caseSheetCss("", st)}</style>
</head><body><h1>${esc(title)}</h1>${sheets.map((s, i) => caseSheetHtml(s.sheet, i + 1, { hidden: s.hidden, settings: st, edits: s.edits })).join("")}${kineticsHtml(dayKinetics(sheets.map((s) => s.sheet)), { hidden: opts.hiddenKinetics, settings: st })}</body></html>`;
}
