"use client";

import { Component, type ReactNode } from "react";
import { DalLoadError } from "@/components/el-profesor/dal-load-error";

/**
 * Catches a crash in the CHILD component's own render — something a
 * page.tsx's own try/catch around its data fetching can never catch
 * (React defers rendering a <Component/>, so an error thrown while
 * actually rendering it happens outside that try/catch entirely; this is
 * exactly what the `react-hooks/error-boundaries` lint rule warns about).
 * Added 2026-08-28 for glossaire/journal after a server-side try/catch
 * around their data fetching produced zero change — the crash survived
 * private browsing and a different browser too, ruling out caching, which
 * points at a render-time bug in GlossaryView/CaseJournalView (or a child)
 * rather than in the data fetch itself.
 */
export class RenderErrorBoundary extends Component<{ children: ReactNode; fallbackTitle: string }, { error: Error | null }> {
  constructor(props: { children: ReactNode; fallbackTitle: string }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[RenderErrorBoundary]", this.props.fallbackTitle, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return <DalLoadError title={this.props.fallbackTitle} error={this.state.error} />;
    }
    return this.props.children;
  }
}
