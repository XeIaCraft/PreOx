"use client";

import { Component, type ReactNode } from "react";
import { DalLoadError } from "@/components/el-profesor/dal-load-error";
import { Alert } from "@/components/ui/alert";

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
 *
 * `compact` (added 2026-08-29): the dashboard's own streamed widgets
 * (board.tsx's `use(secondaryDataPromise)`/`use(notionViewDataPromise)`
 * sections — same crash risk, discovered while auditing for it, but never
 * actually wrapped) mount inline alongside a page the rest of which
 * rendered fine; DalLoadError's full-page shell (its own "Retour à la
 * bibliothèque" link, centered column) is wrong there — a small inline
 * alert that only replaces the failed widget's own slot is what fits.
 */
export class RenderErrorBoundary extends Component<{ children: ReactNode; fallbackTitle: string; compact?: boolean }, { error: Error | null }> {
  constructor(props: { children: ReactNode; fallbackTitle: string; compact?: boolean }) {
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
      if (this.props.compact) {
        return (
          <Alert variant="danger">
            <p className="font-medium">{this.props.fallbackTitle} — impossible de charger pour le moment.</p>
            <p className="mt-1 break-words text-xs opacity-80">{this.state.error.message}</p>
          </Alert>
        );
      }
      return <DalLoadError title={this.props.fallbackTitle} error={this.state.error} />;
    }
    return this.props.children;
  }
}
