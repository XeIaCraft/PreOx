import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Alert } from "@/components/ui/alert";

/**
 * Renders inline instead of letting a Server Component data-fetch failure
 * bubble up to the generic app/error.tsx boundary (requested 2026-08-28,
 * after the glossaire/journal "erreur" reports turned out undiagnosable —
 * Next.js strips a thrown Server Component error down to an opaque digest
 * before it reaches any client-side error boundary in production, so the
 * user had no message to give us). This instead renders the failure within
 * our own component tree, where the real error message is just page
 * content — visible on screen, not sanitized away.
 */
export function DalLoadError({ title, error }: { title: string; error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/apps/el-profesor" className="mb-4 inline-flex items-center gap-1.5 text-sm text-foreground-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à la bibliothèque
      </Link>
      <h1 className="font-serif-display text-2xl font-medium text-foreground">{title}</h1>
      <Alert variant="danger" className="mt-6">
        <p className="font-medium">Impossible de charger cette page pour le moment.</p>
        <p className="mt-1 break-words text-xs opacity-80">{message}</p>
      </Alert>
    </div>
  );
}
