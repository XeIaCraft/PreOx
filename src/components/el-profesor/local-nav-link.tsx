"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import { useLocalNav } from "@/components/el-profesor/local-nav-shell";
import { matchLocalRoute } from "@/lib/el-profesor/local-nav-routes";

/**
 * Drop-in replacement for next/link at the specific points that navigate
 * between the four screens the local nav shell covers (dashboard, book,
 * chapter, review — piste 2026-09-24 — "module 100% local"). A plain,
 * unmodified left-click on a matching href is handled entirely client-side
 * (no Next.js server round trip); anything else (modified click, a target
 * href outside the shell's four screens, or no LocalNavShell mounted at
 * all) falls through to next/link's normal behavior, unchanged.
 */
export function LocalNavLink({ href, onClick, ...linkProps }: ComponentProps<typeof Link>) {
  const nav = useLocalNav();

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (!nav) return; // no shell mounted — plain Link behavior
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // modified click — let the browser open it normally (new tab, etc.)
    const hrefString = typeof href === "string" ? href : href.pathname ? `${href.pathname}${href.search ?? ""}` : null;
    if (!hrefString) return;
    const url = new URL(hrefString, window.location.origin);
    if (!matchLocalRoute(url.pathname, url.searchParams)) return; // not one of the four covered screens — normal Link navigation
    e.preventDefault();
    nav.navigateLocally(hrefString);
  }

  return <Link href={href} onClick={handleClick} {...linkProps} />;
}
