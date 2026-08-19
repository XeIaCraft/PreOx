import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/dal";
import { getAppBySlugForProfile } from "@/lib/apps";
import { renderIcon } from "@/lib/icon-map";
import { Badge } from "@/components/ui/badge";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getCurrentProfile();
  if (!profile) return {};
  const app = await getAppBySlugForProfile(slug, profile);
  return { title: app?.name ?? "Module" };
}

export default async function AppModulePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = (await getCurrentProfile())!;
  const app = await getAppBySlugForProfile(slug, profile);

  if (!app || !app.hasAccess) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/apps"
        className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux modules
      </Link>

      <div className="mt-6 rounded-[var(--radius-lg)] border border-border bg-surface p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-tint text-primary-strong">
          {renderIcon(app.icon, "h-6 w-6")}
        </span>
        <h1 className="mt-4 font-serif-display text-2xl font-medium text-foreground">{app.name}</h1>
        {app.description && <p className="mt-2 text-foreground-muted">{app.description}</p>}

        <div className="mt-6 flex items-center justify-center gap-2">
          <Badge variant="accent">
            <Construction className="h-3 w-3" />
            Module en construction
          </Badge>
        </div>

        <p className="mx-auto mt-4 max-w-sm text-sm text-foreground-subtle">
          Vous avez accès à ce module. Son contenu sera développé dans une prochaine version de PreOx.
        </p>
      </div>
    </div>
  );
}
