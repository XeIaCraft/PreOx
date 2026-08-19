import "server-only";

import { headers } from "next/headers";

/**
 * Resolves the public origin of the app for building email redirect URLs.
 * Prefers NEXT_PUBLIC_SITE_URL (set this on Vercel to your production
 * domain) and falls back to the incoming request's Host header, which
 * works out of the box for local dev and Vercel preview deployments.
 */
export async function getSiteURL() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}
