import Link from "next/link";
import { Lock, Clock, ArrowUpRight } from "lucide-react";
import { renderIcon } from "@/lib/icon-map";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AppWithAccess } from "@/lib/apps";

export function AppCard({ app }: { app: AppWithAccess }) {
  const isComingSoon = app.status === "coming_soon";
  const isLocked = !app.hasAccess;
  const href = app.hasAccess ? `/apps/${app.slug}` : undefined;

  const content = (
    <>
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)]",
            isLocked ? "bg-surface-muted text-foreground-subtle" : "bg-primary-tint text-primary-strong"
          )}
        >
          {renderIcon(app.icon, "h-5 w-5")}
        </span>

        {isLocked ? (
          <Lock className="h-4 w-4 text-foreground-subtle" />
        ) : (
          href && <ArrowUpRight className="h-4 w-4 text-foreground-subtle transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        )}
      </div>

      <div className="mt-4">
        <h3 className={cn("font-medium", isLocked ? "text-foreground-muted" : "text-foreground")}>
          {app.name}
        </h3>
        {app.description && (
          <p className="mt-1 text-sm text-foreground-subtle line-clamp-2">{app.description}</p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {isLocked ? (
          <Badge variant="outline">Accès restreint</Badge>
        ) : isComingSoon ? (
          <Badge variant="accent">
            <Clock className="h-3 w-3" />
            Bientôt disponible
          </Badge>
        ) : (
          <Badge variant="success">Disponible</Badge>
        )}
      </div>
    </>
  );

  const baseClasses =
    "group relative flex flex-col rounded-[var(--radius-lg)] border border-border bg-surface p-5 transition-all duration-200";

  if (href) {
    return (
      <Link href={href} className={cn(baseClasses, "hover:border-primary/30 hover:shadow-[0_8px_24px_-16px_rgba(20,30,25,0.25)]")}>
        {content}
      </Link>
    );
  }

  return (
    <div
      className={cn(baseClasses, "opacity-70 cursor-not-allowed select-none")}
      title={isLocked ? "Accès non autorisé — contactez un administrateur" : "Module en cours de préparation"}
    >
      {content}
    </div>
  );
}
