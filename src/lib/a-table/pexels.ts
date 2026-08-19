import "server-only";

export class PexelsError extends Error {}

/**
 * Searches Pexels for a landscape photo matching a dish title/query.
 * Same endpoint/auth shape as the original Home Assistant integration.
 */
export async function searchPexelsImage(query: string, apiKey: string): Promise<string> {
  const url = new URL("https://api.pexels.com/v1/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "1");
  url.searchParams.set("orientation", "landscape");

  const response = await fetch(url, {
    headers: { Authorization: apiKey },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new PexelsError(
      `Recherche d'image impossible (Pexels, code ${response.status}) : ${body?.error ?? "erreur inconnue"}.`
    );
  }

  const data = await response.json();
  const large = data?.photos?.[0]?.src?.large;

  if (!large) {
    throw new PexelsError("Aucune image trouvée pour ce plat.");
  }

  return large as string;
}
