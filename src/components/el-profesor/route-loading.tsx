import { Loader2 } from "lucide-react";

/** Generic Suspense fallback for El Profesor routes without a dedicated skeleton. */
export function RouteLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <span className="flex items-center gap-2 text-sm text-foreground-subtle">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </span>
    </div>
  );
}
