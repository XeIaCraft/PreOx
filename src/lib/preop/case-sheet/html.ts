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
  /** The protocol's « Déroulé », numbered under the plan. */
  steps: boolean;
  /** The tests needed: the recommended ones, those to consider too, or none. */
  workup: "required" | "all" | "off";
  /** The « Pharmaco » list at the end: off, onset and half-times, or with the duration and the awakening. */
  pharmaco: "off" | "short" | "full";
  size: "compact" | "normal" | "large";
  /** Who: surname, first name and birth date, or initials only. */
  identity: "name" | "initials";
  /** Two A5 pages side by side on a landscape A4 (cut in half), or A5 paper. */
  paper: "a4x2" | "a5";
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
  steps: true,
  workup: "required",
  pharmaco: "off",
  size: "normal",
  paper: "a4x2",
  identity: "name",
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

/** Plan B's airway and ventilation (« IOT sonde 7,5–8, Vt … ») — its technique without the technique's name. */
export const planBTechnique = (b: { technique: string }) => (b.technique.includes(",") ? b.technique.replace(/^[^,]+,\s*/, "") : "");

/**
 * The printed page, inside the paper with a margin every browser keeps
 * (Safari on a Mac prints its own margins): a page as tall as the paper
 * overflowed onto a blank one and its half went missing.
 */
const PAGE_H_MM = 196;
const PAD_MM = 5;

/** Labels kept to the grid's column. */
const SHORT_LABEL: Record<string, string> = { Hémodynamique: "Hémodyn.", Prémédication: "Prémédic.", "Entretien (TIVA)": "Entretien", "Sédation / entretien": "Sédation", Antibioprophylaxie: "ATB" };
/** A post-op instruction longer than this is cut (the whole one in the plan). */
const POSTOP_CHARS = 90;

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
  const gridLine = (key: string, label: string, body: string, cls = "") => (body ? piece(key, `<span class="lb">${esc(SHORT_LABEL[label] ?? label)}</span><span class="vl">${body}</span>`, "div", `ln ${cls}`.trim()) : "");

  const planRow = (r: SheetRow, prefix = "") => {
    const parts = r.parts
      .map((t) => {
        const key = `${prefix}${r.label}:${t.text}`;
        const text = edits[key] ?? t.text;
        return piece(key, withDose(r.label === "Post-op" && text.length > POSTOP_CHARS ? `${text.slice(0, POSTOP_CHARS - 1).replace(/\s+\S*$/, "")}…` : text));
      })
      .filter(Boolean);
    if (!parts.length) return "";
    if (!edit && r.parts.every((t) => hidden.has(`${prefix}${r.label}:${t.text}`))) return "";
    return gridLine(`row:${prefix}${r.label}`, r.label, parts.join('<span class="sep"> · </span>'));
  };

  const rows = sheet.rows.filter((r) => st.postop || r.label !== "Post-op");
  // How the case goes, step by step (numbered: the order is the point).
  const steps = st.steps
    ? (sheet.steps ?? [])
        .map((t) => {
          const key = `Déroulé:${t}`;
          return piece(key, esc(edits[key] ?? t), "li");
        })
        .filter(Boolean)
    : [];
  const stepsHtml = steps.length ? gridLine("row:Déroulé", "Déroulé", `<ol class="steps">${steps.join("")}</ol>`) : "";
  const b = st.planB ? sheet.fallback : undefined;
  const planB = b
    ? piece(
        "planb",
        `<div class="ln"><span class="lb">${b.planned ? "Temps AG" : "Plan B"}</span><span class="vl"><b>${esc({ general: "AG", neuraxial: "Rachi", regional: "ALR", sedation: "Sédation" }[b.mode])}</b> ${b.planned ? "prévue au déroulé (et si échec)" : "si refus / échec"}${planBTechnique(b) ? ` — ${piece("planbtech", esc(edits.planbtech ?? planBTechnique(b)))}` : ""}</span></div>${b.rows.map((r) => planRow(r, "B ")).join("")}`,
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
  // Treatments: what to stop, adapt or check, each with its conduct; then the ones simply kept, in one list.
  const tttLine = () => {
    const list = shown("ttt");
    const act = list.filter((i) => i.conduct !== "continue" && i.detail !== "idem");
    const keep = list.filter((i) => i.conduct === "continue" || i.detail === "idem");
    const actHtml = act.map(itemHtml).filter(Boolean);
    const keepHtml = keep.map((i) => piece(i.key, esc(i.text), "span", "", ` data-s="ttt"`)).filter(Boolean);
    if (!actHtml.length && !keepHtml.length) return list.length ? "" : gridLine("row:TTT", "TTT", "aucun");
    const body = [
      actHtml.length ? `<span class="act">${actHtml.join('<span class="sep"> ; </span>')}</span>` : "",
      keepHtml.length ? `<span class="keep"><span class="cd">Poursuivre :</span> ${keepHtml.join('<span class="sep">, </span>')}</span>` : "",
    ].filter(Boolean);
    return gridLine("row:TTT", "TTT", body.join(""));
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
  // The « Bilan » line is always there (most patients get something written in it): on the preview with its « + »,
  // printed with a line to write on when nothing is known yet.
  const there = work.filter((w) => w.status !== "todo").map(workPiece).filter(Boolean);
  const addWork = edit ? `<span class="tag add" data-k="bilan:+" role="button" tabindex="0" aria-label="Ajouter au bilan">+</span>` : "";
  const workup =
    (st.workup === "off" ? "" : gridLine("row:Bilan", "Bilan", there.length ? there.join('<span class="sep"> · </span>') + (addWork ? ` ${addWork}` : "") : addWork || '<span class="bl w"></span>')) +
    workLine("À prévoir", work.filter((w) => w.status === "todo"), "todo");

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

  // The header's labels: each can be corrected or taken off (« tag:… »), and one added (« tag:+ »).
  const tags = sheet.tags.map((t) => piece(`tag:${t}`, esc(edits[`tag:${t}`] ?? t), "span", "tag")).join("") + (edit ? `<span class="tag add" data-k="tag:+" role="button" tabindex="0" aria-label="Ajouter une étiquette">+</span>` : "");
  const named = st.identity === "name" && !!sheet.name;
  const who = named ? sheet.name! : sheet.initials;
  const born = named && sheet.birthDate ? ` <span class="dob">${esc(sheet.birthDate)}</span>` : "";
  return `<article class="case">
<header class="hd"><span class="no">${index}</span><span class="who"><b>${esc(who)}</b>${born} — ${esc(sheet.surgery)}</span>${tags}</header>
<p class="body">${esc(sheet.body)}</p>
<section class="blk">
${piece("tech", esc(edits.tech ?? sheet.technique), "div", "tech")}
${rows.map((r) => planRow(r)).join("")}
${stepsHtml}
${planB}
</section>
<section class="blk pt">
${itemLine("atcd", ", ", "RAS")}
${implications}
${st.habits ? itemLine("habit", " ; ") : ""}
${st.surgical ? itemLine("chir", ", ") : ""}
${tttLine()}
${itemLine("allergy", ", ")}
${sheet.airway ? gridLine("airway", "Voies aér.", esc(edits.airway ?? sheet.airway)) : ""}
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
${s(".case .who b")}{text-transform:none}
${s(".case .dob")}{font-size:.85em;color:#3c4549;text-transform:none}
${s(".case .tag.add")}{border-style:dashed;color:#5b6a6e;font-weight:500}
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
${s(".case .act, .case .keep")}{display:block}
${s(".case .steps")}{margin:0;padding-left:4mm}
${s(".case .steps li")}{margin:0 0 0.2mm}
${s(".case.tx h2")}{font-size:1em;margin:1.6mm 0 0.6mm;padding-bottom:0.3mm;border-bottom:0.2mm solid #cfd6d9;color:#1f4f53;text-transform:uppercase;letter-spacing:.03em}
${s(".case .bl")}{display:inline-block;min-width:40mm;border-bottom:0.2mm solid #7d8a8e;height:1em;vertical-align:baseline}
${s(".case.tx .bl")}{display:inline-block;min-width:16mm;border-bottom:0.2mm solid #7d8a8e;height:1em;vertical-align:baseline}
${s(".case.tx .bl.w")}{min-width:34mm}
${s(".case.tx .wl")}{border-bottom:0.2mm solid #b9c4c7;height:1.5em}
${s(".case.tx .tf")}{margin:0.6mm 0 0}
${s(".case.tx .box")}{font-size:1.1em;line-height:1}
${s(".case.tx .tline")}{margin:0.7mm 0 0}
${s(".case.tx .tl")}{color:#1f4f53;font-weight:600}
${s(".case.tx .hint")}{color:#6b777b;font-size:.9em}
${s(".case.tx .io")}{width:100%;border-collapse:collapse;margin:1mm 0}
${s(".case.tx .io th")}{text-align:left;color:#1f4f53;font-size:.86em;text-transform:uppercase;border-bottom:0.25mm solid #9fb0b3;padding:0.3mm 1mm}
${s(".case.tx .io td")}{border-bottom:0.15mm solid #c9d2d4;height:1.5em;padding:0 1mm}
${s(".case.tx .io td:nth-child(2), .case.tx .io td:nth-child(4)")}{width:13mm;border-left:0.15mm solid #c9d2d4}
${s(".case.tx .io td:nth-child(3), .case.tx .io td:nth-child(5)")}{border-left:0.25mm solid #9fb0b3}
${s(".case.tx .io .tot td")}{font-weight:600;border-top:0.25mm solid #9fb0b3}
${s(".case .keep .cd")}{color:#1f4f53;font-weight:600}
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

/**
 * The intensive care handover, on two pages of its own (one A4 sheet when
 * two A5 are printed side by side), in the order it is told:
 * the operation first (why — what was found, how it was decided — then what
 * the surgeon and the anaesthetist did), the course of the operation to fill
 * in by hand (printed the day before, written at the end of the case), the
 * post-operative plan and the surgeon's instructions, then the patient's
 * background — each of its lines can be corrected or taken off (« tx:… »).
 */
/** The handover's sections to fill in, in their order: page 1 after the background, then page 2 (« txf:<id> » keys). */
export const TX_FIELDS: { id: string; label: string; page: 1 | 2 }[] = [
  { id: "indication", label: "Indication", page: 1 },
  { id: "acte-chir", label: "Acte chir.", page: 1 },
  { id: "drains", label: "Drains", page: 1 },
  { id: "acte-anesth", label: "Acte anesth.", page: 1 },
  { id: "chrono", label: "Chrono", page: 1 },
  { id: "abords", label: "Abords", page: 1 },
  { id: "atb", label: "ATB", page: 1 },
  { id: "produits", label: "Produits", page: 1 },
  { id: "io", label: "IN / OUT", page: 2 },
  { id: "hemo", label: "Hémodynamique", page: 2 },
  { id: "ventilation", label: "Ventilation", page: 2 },
  { id: "gazo", label: "Gazométrie", page: 2 },
  { id: "temp", label: "T°", page: 2 },
  { id: "events", label: "Événements, complications", page: 2 },
  { id: "sortie", label: "Sortie de salle", page: 2 },
  { id: "antalgie", label: "Relais antalgie postop", page: 2 },
  { id: "plan", label: "Plan postopératoire", page: 2 },
  { id: "consignes", label: "Consignes chirurgicales", page: 2 },
];

/**
 * The intensive care handover, on two A5 pages of its own (one A4 sheet when
 * two A5 are printed side by side): the patient's background first, then the
 * operation (why, what the surgeon and the anaesthetist did) and its course
 * to fill in by hand, the post-operative plan and the surgeon's
 * instructions. Everything can be adjusted on the preview: a background line
 * corrected or taken off the handover (« tx:… », « txrow:… »), a section
 * renamed or taken off (« txf:… »), sections added (« txf:+ »).
 */
export function transmissionHtml(sheet: CaseSheet, index: number, opts: SheetHtmlOptions = {}): string {
  const hidden = opts.hidden ?? new Set<string>();
  const edits = opts.edits ?? {};
  const edit = !!opts.editable;
  /** A piece that can be touched: left out of the print when taken off, struck through in the preview. */
  const piece = (key: string, html: string, tag = "span", cls = "", data = "") => {
    const off = hidden.has(key);
    if (off && !edit) return "";
    const classes = [cls, off ? "off" : ""].filter(Boolean).join(" ");
    return `<${tag}${classes ? ` class="${classes}"` : ""}${edit ? ` data-k="${esc(key)}"${data} role="button" tabindex="0" aria-pressed="${off}"` : ""}>${html}</${tag}>`;
  };
  const items = (s: ItemSection) => sheet.items.filter((i) => i.section === s && (edit || !hidden.has(`tx:${i.key}`)));
  const bl = (wide = false) => `<span class="bl${wide ? " w" : ""}"></span>`;
  const box = '<span class="box">☐</span>';
  const lines = (n: number) => '<div class="wl"></div>'.repeat(n);
  const list = (l: SheetItem[]) =>
    l
      .map((i) => piece(`tx:${i.key}`, i.strong ? `<b>${esc(i.text.replace(/\s*\(cité : .*\)$/, ""))}</b>` : esc(i.text.replace(/\s*\(cité : .*\)$/, "")), "span", "", ` data-s="${i.section}"`))
      .filter(Boolean)
      .join('<span class="sep"> ; </span>');
  const row = (label: string, html: string) => (html ? piece(`txrow:${label}`, `<span class="lb">${esc(label)}</span><span class="vl">${html}</span>`, "div", "ln") : "");
  const who = sheet.name ?? sheet.initials;
  const work = (sheet.workup ?? [])
    .filter((w) => w.status !== "todo")
    .map((w) => piece(`tx:bilan:${w.code}`, esc(w.value ?? w.label)))
    .filter(Boolean)
    .join('<span class="sep"> · </span>');
  const general = /\bAG\b|générale/i.test(sheet.technique) || !!sheet.fallback?.planned;
  const inOut = ["Cristalloïdes", "Colloïdes", "CGR", "PFC / plaquettes", ""]
    .map((x, k) => `<tr><td>${esc(x)}</td><td></td><td>${esc(["Pertes sanguines", "Diurèse", "Drains", "", ""][k])}</td><td></td><td></td></tr>`)
    .join("");
  const body: Record<string, string> = {
    indication: sheet.indication ? ` ${piece("txind", esc(sheet.indication))}${lines(1)}` : lines(2),
    "acte-chir": lines(2),
    drains: lines(1),
    "acte-anesth": lines(1),
    chrono: lines(1),
    abords: ` VVP ${bl()} · KTA ${bl()} · VVC ${bl()} · autre ${bl()}`,
    atb: ` ${bl(true)} à ${bl()} · réinjection ${bl()}`,
    produits: lines(3),
    io: `<table class="io"><thead><tr><th>IN</th><th>mL</th><th>OUT</th><th>mL</th><th>Annotations</th></tr></thead><tbody>${inOut}<tr class="tot"><td>Total</td><td></td><td>Total</td><td></td><td>Balance :</td></tr></tbody></table>`,
    hemo: lines(2),
    ventilation: ` FiO₂ ${bl()} · Vt ${bl()} · FR ${bl()} · PEP ${bl()}`,
    gazo: lines(3),
    temp: ` début ${bl()} · fin ${bl()}`,
    events: lines(2),
    sortie: ` ${box} intubé ${box} extubé${general ? ` · Cormack ${bl()} · sonde ${bl()}` : ""}`,
    antalgie: lines(3),
    plan: lines(6),
    consignes: lines(4),
  };
  const field = (id: string, label: string, html: string, removable = false) => {
    const key = `txf:${id}`;
    const title = esc(edits[key] ?? label);
    const head = id === "plan" || id === "consignes" ? `<h2>${title}</h2>` : `<span class="tl">${title}</span>`;
    // The label is what is touched; the lines to write stay with it.
    if (hidden.has(key) && !edit) return "";
    return `<div class="tf${hidden.has(key) ? " off" : ""}">${edit ? `<span data-k="${esc(key)}"${removable ? ' data-added="1"' : ""} role="button" tabindex="0">${head}</span>` : head}${html}</div>`;
  };
  const fields = (page: 1 | 2) =>
    TX_FIELDS.filter((f) => f.page === page)
      .flatMap((f) => [
        // Sections added on the sheet go before the post-operative plan.
        ...(f.id === "plan" ? (sheet.txFields ?? []).map((label, k) => field(`x${k}`, label, lines(2), true)) : []),
        field(f.id, f.label, f.id === "io" ? body.io : body[f.id]),
      ])
      .join("");
  const add = edit ? `<div class="tf"><span class="tag add" data-k="txf:+" role="button" tabindex="0">+ rubrique</span></div>` : "";
  const header = (suite: boolean) =>
    `<header class="hd"><span class="no">${index}</span><span class="who"><b>Transmission USI — ${esc(who)}</b>${suite ? ' <span class="dob">(suite)</span>' : sheet.birthDate ? ` <span class="dob">${esc(sheet.birthDate)}</span>` : ""}</span>${suite ? "" : sheet.tags.filter((t) => !hidden.has(`tag:${t}`)).map((t) => `<span class="tag">${esc(edits[`tag:${t}`] ?? t)}</span>`).join("")}</header>`;
  return `<article class="case tx" data-newpage="sheet">
${header(false)}
<p class="body">${esc(sheet.body)}</p>
<h2>Background</h2>
${row("ATCD", list(items("atcd")) || "RAS")}
${row("Habitus", list(items("habit")))}
${row("Chir.", list(items("chir")))}
${row("TTT", list(items("ttt")) || "aucun")}
${row("Allergies", list(items("allergy")))}
${row("Bilan", work)}
${row("Alertes", list(items("alert").filter((i) => !i.minor)))}
${row("Notes", list(items("note")))}
<h2>Chirurgie — ${esc(sheet.surgery)}</h2>
${fields(1)}
</article>
<article class="case tx" data-newpage="1">
${header(true)}
${fields(2)}
${add}
</article>`;
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

/**
 * The whole printable page: A5 pages, two side by side on a landscape A4
 * (to cut in half) or one per A5 sheet. A case is never split: the pages
 * are filled in the print window (each case measured, put on the next page
 * when it no longer fits), and a case taller than a page is set smaller
 * until it fits on one.
 */
export function caseSheetDocument(
  sheets: { sheet: CaseSheet; hidden?: HiddenLines; edits?: Record<string, string> }[],
  title: string,
  opts: { settings?: SheetSettings; hiddenKinetics?: HiddenLines; print?: boolean } = {}
): string {
  const st = opts.settings ?? DEFAULT_SETTINGS;
  const a4 = st.paper !== "a5";
  const cases = sheets
    .map((s, i) => caseSheetHtml(s.sheet, i + 1, { hidden: s.hidden, settings: st, edits: s.edits }) + (s.sheet.transmission ? transmissionHtml(s.sheet, i + 1, { hidden: s.hidden, edits: s.edits }) : ""))
    .join("");
  const pk = kineticsHtml(dayKinetics(sheets.map((s) => s.sheet)), { hidden: opts.hiddenKinetics, settings: st });
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title>
<style>
@page{size:${a4 ? "A4 landscape" : "A5"};margin:5mm}
html,body{margin:0;background:#fff}
.sheet{display:flex;width:${a4 ? "284mm" : "136mm"};height:${PAGE_H_MM}mm;margin:0 auto;overflow:hidden;break-after:page;page-break-after:always;break-inside:avoid;page-break-inside:avoid}
.sheet:last-child{break-after:auto;page-break-after:auto}
.pg{box-sizing:border-box;width:${a4 ? 142 : 136}mm;height:${PAGE_H_MM}mm;padding:${PAD_MM}mm 6mm;overflow:hidden}
.sheet .pg+.pg{border-left:0.2mm dashed #c3ccce}
.ph{display:flex;justify-content:space-between;gap:3mm;margin:0 0 2.4mm;padding-bottom:1mm;border-bottom:0.45mm solid #1f4f53;color:#1f4f53;font:700 8.4pt "Helvetica Neue",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
.ph span:last-child{font-weight:500;white-space:nowrap}
#src{width:${a4 ? 130 : 124}mm}
@media screen{body{background:#e9edee}.sheet{margin:6mm auto;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.2)}}
${caseSheetCss("", st)}
</style>
</head><body data-a4="${a4 ? 1 : 0}" data-title="${esc(title)}"><div id="src">${cases}${pk}</div>
<script>
(function () {
  var MM = 96 / 25.4, src = document.getElementById("src"), body = document.body;
  var a4 = body.getAttribute("data-a4") === "1", title = body.getAttribute("data-title");
  // One page, off screen, to measure what fits.
  var probe = document.createElement("div");
  probe.className = "pg";
  probe.style.cssText = "position:absolute;left:-10000px;top:0;height:auto";
  var header = function (no) {
    var ph = document.createElement("div"), a = document.createElement("span"), b = document.createElement("span");
    ph.className = "ph";
    a.textContent = title;
    b.textContent = no;
    ph.appendChild(a);
    ph.appendChild(b);
    return ph;
  };
  probe.appendChild(header("1/1"));
  body.appendChild(probe);
  var room = ${PAGE_H_MM} * MM - ${2 * PAD_MM} * MM - probe.firstChild.getBoundingClientRect().height - 2.4 * MM - 1;
  var cases = Array.prototype.slice.call(src.children);
  var height = function (el) { return el.getBoundingClientRect().height + 3.2 * MM; };
  var pages = [[]], used = 0, afterAlone = false;
  cases.forEach(function (el) {
    probe.appendChild(el);
    // Taller than a page: smaller, down to 6 pt, so that it stays on one.
    var size = parseFloat(getComputedStyle(el).fontSize) * 0.75;
    while (height(el) > room && size > 6) { size -= 0.25; el.style.fontSize = size + "pt"; }
    var h = height(el);
    // The handover sheet is a page of its own (it is handed over on its own).
    var alone = el.hasAttribute("data-newpage");
    if ((used + h > room || alone || afterAlone) && pages[pages.length - 1].length) { pages.push([]); used = 0; }
    // Its first page on the left of a sheet: the two pages of the handover on one A4.
    if (a4 && el.getAttribute("data-newpage") === "sheet" && (pages.length - 1) % 2 === 1) pages.push([]);
    pages[pages.length - 1].push(el);
    used += h;
    afterAlone = alone;
  });
  body.removeChild(probe);
  src.parentNode.removeChild(src);
  var per = a4 ? 2 : 1, n = pages.length;
  for (var i = 0; i < n; i += per) {
    var sheet = document.createElement("div");
    sheet.className = "sheet";
    for (var j = i; j < Math.min(i + per, n); j++) {
      var pg = document.createElement("div");
      pg.className = "pg";
      pg.appendChild(header(j + 1 + "/" + n));
      pages[j].forEach(function (el) { pg.appendChild(el); });
      sheet.appendChild(pg);
    }
    body.appendChild(sheet);
  }
  ${opts.print === false ? "" : 'setTimeout(function () { window.focus(); window.print(); }, 250);'}
})();
</script></body></html>`;
}
