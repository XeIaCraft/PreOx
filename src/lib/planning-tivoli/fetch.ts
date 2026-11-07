// The planning image, taken from the presentation published on the web
// (« Publier sur le Web » of Google Slides: …/presentation/d/e/2PACX-…/pub).
//
// What the published page is made of could not be checked from the
// development environment (docs.google.com was not reachable there), so
// this reads it defensively, on what such a page is known to hold: the
// slides are drawn by the page's script from data embedded in the HTML,
// where each image of a slide is a googleusercontent.com address (lh3…lh7,
// « lh7-rt » for Slides), JavaScript-escaped (=, \/). Every such
// address is tried and the largest image kept — the slide's picture of the
// table is by far the largest. When none is found (Google changes its page,
// a slide made differently), the image is imported by hand on the screen
// (« Importer une image »), and the message says what was found.

import { createHash } from "node:crypto";
import sharp from "sharp";

export const DEFAULT_SOURCE_URL =
  "https://docs.google.com/presentation/d/e/2PACX-1vR-_0tGo1DSNj633U9nIImN_fdT-689bgEQ84V7L1TUCVsXeFsPTKwtvg0QnAOSlZgrEpx6JnP2N-Qw/pub";

const UA = "Mozilla/5.0 (compatible; PreOx planning reader)";

/** JavaScript and HTML escapes undone (« \u003d », « \x3d », « \/ », « &amp; »): addresses read as written. */
export function unescapePage(html: string): string {
  return html
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
}

/**
 * Image addresses in the page's HTML and script data, unescaped, without
 * duplicates: any googleusercontent.com host (« lh3 », « lh7-rt »,
 * « lh7-us »…), and the presentation's own image or thumbnail addresses on
 * docs.google.com.
 */
export function imageUrlsIn(html: string): string[] {
  const text = unescapePage(html);
  const found = [
    ...(text.match(/https:\/\/[a-z0-9-]+\.googleusercontent\.com\/[^"'\s\\)<>]+/g) ?? []),
    ...(text.match(/https:\/\/docs\.google\.com\/[^"'\s\\)<>]*(?:image|thumbnail|export\/png)[^"'\s\\)<>]*/gi) ?? []),
  ];
  return [...new Set(found)];
}

/** What a page holds, when no image was found in it: its hosts and its addresses that look like images. */
export function pageSummary(html: string): string {
  const text = unescapePage(html);
  const hosts = [...new Set(text.match(/https?:\/\/[a-z0-9.-]+/gi) ?? [])].map((h) => h.replace(/^https?:\/\//, "")).slice(0, 12);
  const imagey = [...new Set(text.match(/[^"'\s<>]*(?:\.png|\.jpe?g|image|slidesz|img)[^"'\s<>]*/gi) ?? [])].slice(0, 3).map((u) => u.slice(0, 90));
  return `hôtes : ${hosts.join(", ") || "aucun"}${imagey.length ? ` ; adresses d'aspect image : ${imagey.join(" | ")}` : ""}`;
}

export const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

export interface FetchedImage {
  image: Buffer;
  hash: string;
  width: number;
  height: number;
  url: string;
}

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "user-agent": UA }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} a répondu ${res.status}.`);
  return res;
}

/** The largest image of the published presentation. */
export async function fetchPlanningImage(sourceUrl = DEFAULT_SOURCE_URL): Promise<FetchedImage> {
  const html = await (await get(sourceUrl)).text();
  const urls = imageUrlsIn(html).slice(0, 12);
  if (!urls.length) throw new Error(`Aucune image trouvée dans la page publiée (${html.length} caractères lus ; ${pageSummary(html)}) : importez l'image à la main.`);
  let best: FetchedImage | null = null;
  for (const url of urls) {
    try {
      const image = Buffer.from(await (await get(url)).arrayBuffer());
      const meta = await sharp(image).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      if (!best || width * height > best.width * best.height) best = { image, hash: sha256(image), width, height, url };
    } catch {
      // An address that is not an image (or not reachable): the next one.
    }
  }
  if (!best || best.width < 400) throw new Error("Pas d'image assez grande dans la page publiée : importez l'image à la main.");
  return best;
}
