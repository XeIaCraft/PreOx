import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = ["/apps", "/admin"];
const AUTH_PREFIXES = ["/login", "/forgot-password"];

/**
 * Runs on every request to refresh the Supabase session cookie and perform
 * an *optimistic* authentication check (the JWT is verified locally, no
 * round-trip to the Auth server). Role-based authorization (admin vs. user)
 * is enforced later, close to the data, in `requireAdmin()` — see
 * `src/lib/auth/dal.ts`.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // getClaims() verifies the session's JWT locally (asymmetric ES256 signing
  // key, public key cached) and refreshes it when expired — getUser() asked
  // the Auth server on every request, prefetches and sync calls included,
  // although the authoritative check (getCurrentUser in lib/auth/dal.ts)
  // runs again close to the data anyway.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthPage = AUTH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isAuthPage && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/apps";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
