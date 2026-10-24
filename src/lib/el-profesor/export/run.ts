import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { EL_PROFESOR_PDF_BUCKET } from "../storage-constants";
import { renderVolumeDocx, splitForDocs } from "./docx";
import { listExportVolumes, loadExportVolume } from "./load";
import { renderVolumePdf, type PdfFonts } from "./pdf";

// Exports are made on demand from the book as it is now (illustrations and
// edits included) and kept in storage, under exports/<book>/, one PDF and
// one or more Word cahiers per tome: a tome's PDF is far over what a
// function may return directly (4.5 MB), so the browser downloads it from
// storage through a signed link.

export type ExportFormat = "pdf" | "docx";
export type ExportFile = { name: string; url: string; updatedAt: string | null; format: ExportFormat; volume: number };

const FONT_DIR = join(process.cwd(), "src/lib/el-profesor/export/fonts");
const LINK_TTL = 60 * 60;

let fontsPromise: Promise<PdfFonts> | null = null;
function loadFonts(): Promise<PdfFonts> {
  if (!fontsPromise) {
    const f = async (name: string) => new Uint8Array(await readFile(join(FONT_DIR, name)));
    fontsPromise = (async () => ({
      serif: await f("SourceSerif4-Regular.ttf"),
      serifItalic: await f("SourceSerif4-It.ttf"),
      serifSemibold: await f("SourceSerif4-Semibold.ttf"),
      serifBold: await f("SourceSerif4-Bold.ttf"),
      sans: await f("SourceSans3-Regular.ttf"),
      sansItalic: await f("SourceSans3-It.ttf"),
      sansSemibold: await f("SourceSans3-Semibold.ttf"),
      sansBold: await f("SourceSans3-Bold.ttf"),
      fallback: await f("DejaVuSans.ttf"),
      fallbackBold: await f("DejaVuSans-Bold.ttf"),
    }))().catch((err) => {
      fontsPromise = null;
      throw err;
    });
  }
  return fontsPromise;
}

const folder = (bookId: string) => `exports/${bookId}`;
const pad = (n: number) => String(n).padStart(2, "0");
const fileStem = (volume: number) => `tome-${pad(volume)}`;

function slug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** What the user downloads: « Bible-anesthesie-Tome-04-Pharmacologie.pdf ». */
function downloadName(bookTitle: string, volume: number, title: string, ext: string, cahier?: string): string {
  return `${slug(bookTitle)}-Tome-${pad(volume)}-${slug(title)}${cahier ? `-${cahier}` : ""}.${ext}`;
}

async function signedFiles(bookId: string, bookTitle: string, titles: Map<number, string>): Promise<ExportFile[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.storage.from(EL_PROFESOR_PDF_BUCKET).list(folder(bookId), { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw new Error(`Lecture des exports impossible : ${error.message}`);
  const files: ExportFile[] = [];
  for (const f of data ?? []) {
    const match = /^tome-(\d+)(?:-cahier-(\d+)-(\d+))?\.(pdf|docx)$/.exec(f.name);
    if (!match) continue;
    const volume = Number(match[1]);
    const format = match[4] as ExportFormat;
    const cahier = match[2] ? `cahier-${match[2]}-sur-${match[3]}` : undefined;
    const { data: signed } = await supabase.storage
      .from(EL_PROFESOR_PDF_BUCKET)
      .createSignedUrl(`${folder(bookId)}/${f.name}`, LINK_TTL, { download: downloadName(bookTitle, volume, titles.get(volume) ?? "", format, cahier) });
    if (signed?.signedUrl) files.push({ name: f.name, url: signed.signedUrl, updatedAt: f.updated_at ?? f.created_at ?? null, format, volume });
  }
  return files;
}

/** The book's tomes and the files already exported for each. */
export async function listExports(bookId: string) {
  const supabase = createAdminClient();
  const { bookTitle, volumes } = await listExportVolumes(supabase, bookId);
  const files = await signedFiles(bookId, bookTitle, new Map(volumes.map((v) => [v.number, v.title])));
  return { bookTitle, volumes: volumes.map((v) => ({ number: v.number, title: v.title, ficheCount: v.ficheCount, pages: v.pages, partTitles: v.partTitles })), files };
}

/** Lays one tome out again from the current content and stores it, replacing the previous export of that tome in that format. */
export async function exportVolume(bookId: string, volumeNumber: number, format: ExportFormat): Promise<ExportFile[]> {
  const supabase = createAdminClient();
  const volume = await loadExportVolume(supabase, bookId, volumeNumber);
  const bucket = supabase.storage.from(EL_PROFESOR_PDF_BUCKET);
  const stem = fileStem(volumeNumber);

  const outputs: { name: string; data: Uint8Array; type: string }[] =
    format === "pdf"
      ? [{ name: `${stem}.pdf`, data: await renderVolumePdf(volume, await loadFonts()), type: "application/pdf" }]
      : await Promise.all(
          splitForDocs(volume).map(async (part) => ({
            name: part.count > 1 ? `${stem}-cahier-${part.index}-${part.count}.docx` : `${stem}.docx`,
            data: await renderVolumeDocx(volume, part),
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          }))
        );

  // Earlier cahiers of this tome go (their count may have changed).
  const { data: existing } = await bucket.list(folder(bookId), { limit: 1000 });
  const stale = (existing ?? []).map((f) => f.name).filter((n) => n.startsWith(stem) && n.endsWith(`.${format}`) && !outputs.some((o) => o.name === n));
  if (stale.length) await bucket.remove(stale.map((n) => `${folder(bookId)}/${n}`));

  for (const o of outputs) {
    const { error } = await bucket.upload(`${folder(bookId)}/${o.name}`, o.data, { contentType: o.type, upsert: true });
    if (error) throw new Error(`Enregistrement de l'export impossible : ${error.message}`);
  }
  const files = await signedFiles(bookId, volume.bookTitle, new Map([[volumeNumber, volume.title]]));
  return files.filter((f) => f.volume === volumeNumber && f.format === format);
}
