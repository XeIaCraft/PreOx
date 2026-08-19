import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { renderIcon } from "@/lib/icon-map";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppRowActions } from "@/components/admin/app-row-actions";

export const metadata: Metadata = { title: "Modules" };

export default async function AdminAppsPage() {
  const supabase = await createClient();
  const { data: apps } = await supabase.from("apps").select("*").order("sort_order", { ascending: true });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-serif-display text-2xl font-medium text-foreground">Modules du hub</h1>
          <p className="mt-1.5 text-foreground-muted">
            Définissez les applications qui composeront PreOx et leur disponibilité.
          </p>
        </div>
        <Link href="/admin/apps/new">
          <Button>
            <Plus className="h-4 w-4" />
            Nouveau module
          </Button>
        </Link>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-foreground-subtle">
              <tr>
                <th className="px-5 py-3 font-medium">Module</th>
                <th className="px-5 py-3 font-medium">Statut</th>
                <th className="px-5 py-3 font-medium">Ordre</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(apps ?? []).map((app) => {
                return (
                  <tr key={app.id}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-primary-tint text-primary-strong">
                          {renderIcon(app.icon, "h-4 w-4")}
                        </span>
                        <div>
                          <p className="font-medium text-foreground">{app.name}</p>
                          <p className="text-xs text-foreground-subtle">/{app.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge variant={app.status === "available" ? "success" : "accent"}>
                        {app.status === "available" ? "Disponible" : "Bientôt disponible"}
                      </Badge>
                    </td>
                    <td className="px-5 py-3.5 text-foreground-muted">{app.sort_order}</td>
                    <td className="px-5 py-3.5">
                      <AppRowActions appId={app.id} isActive={app.is_active} />
                    </td>
                  </tr>
                );
              })}
              {(apps ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-foreground-subtle">
                    Aucun module. Créez le premier module du hub.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
