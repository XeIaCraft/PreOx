import "server-only";
import type { NextRequest } from "next/server";

/** Same-origin JSON only — the CSRF protection Server Actions get for free. */
export function isSameOrigin(request: NextRequest, requireJson: boolean): boolean {
  if (requireJson && !request.headers.get("content-type")?.startsWith("application/json")) return false;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
