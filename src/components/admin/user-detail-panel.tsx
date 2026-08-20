"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Save, Eye } from "lucide-react";
import { updateUserRole, updateUserName, setAppAccess, deleteUser } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { renderIcon } from "@/lib/icon-map";
import type { AppModule, Profile, UserRole } from "@/lib/supabase/types";

interface UserDetailPanelProps {
  user: Profile;
  apps: AppModule[];
  grantedAppIds: string[];
  groupGrantedAppNames: Record<string, string[]>;
  isSelf: boolean;
}

export function UserDetailPanel({ user, apps, grantedAppIds, groupGrantedAppNames, isSelf }: UserDetailPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [role, setRole] = useState<UserRole>(user.role);
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [granted, setGranted] = useState(new Set(grantedAppIds));
  const [message, setMessage] = useState<{ type: "success" | "danger"; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function notify(result: { error?: string; success?: string }) {
    if (result.error) setMessage({ type: "danger", text: result.error });
    else if (result.success) setMessage({ type: "success", text: result.success });
  }

  function handleRoleChange(nextRole: UserRole) {
    setRole(nextRole);
    startTransition(async () => {
      const result = await updateUserRole(user.id, nextRole);
      notify(result);
      router.refresh();
    });
  }

  function handleNameSave() {
    startTransition(async () => {
      const result = await updateUserName(user.id, fullName);
      notify(result);
      router.refresh();
    });
  }

  function handleToggleApp(appId: string, checked: boolean) {
    setGranted((prev) => {
      const next = new Set(prev);
      if (checked) next.add(appId);
      else next.delete(appId);
      return next;
    });
    startTransition(async () => {
      const result = await setAppAccess(user.id, appId, checked);
      notify(result);
      router.refresh();
    });
  }

  function handlePreset(preset: "all" | "none") {
    const targets = apps.filter((app) => (preset === "all" ? !granted.has(app.id) : granted.has(app.id)));
    if (targets.length === 0) return;
    setGranted(new Set(preset === "all" ? apps.map((a) => a.id) : []));
    startTransition(async () => {
      let lastResult: { error?: string; success?: string } = {};
      for (const app of targets) {
        lastResult = await setAppAccess(user.id, app.id, preset === "all");
      }
      notify(lastResult);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteUser(user.id);
      if (result.error) {
        notify(result);
        setConfirmingDelete(false);
        return;
      }
      router.push("/admin/users");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.type}>{message.text}</Alert>
      )}

      <Link href={`/admin/users/${user.id}/preview`}>
        <Button variant="secondary" size="sm">
          <Eye className="h-4 w-4" />
          Aperçu (lecture seule)
        </Button>
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Profil</CardTitle>
          <CardDescription>Informations générales du compte.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Adresse e-mail</Label>
            <Input value={user.email} disabled />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fullName">Nom complet</Label>
            <div className="flex gap-2">
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isPending}
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={handleNameSave}
                disabled={isPending || fullName === (user.full_name ?? "")}
                title="Enregistrer le nom"
              >
                <Save className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role">Rôle</Label>
            <Select
              id="role"
              value={role}
              onChange={(e) => handleRoleChange(e.target.value as UserRole)}
              disabled={isPending || isSelf}
            >
              <option value="user">Utilisateur</option>
              <option value="admin">Administrateur</option>
            </Select>
            {isSelf && (
              <p className="text-xs text-foreground-subtle">
                Vous ne pouvez pas modifier votre propre rôle.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Accès aux modules</CardTitle>
              <CardDescription>
                {role === "admin"
                  ? "Les administrateurs ont accès à tous les modules par défaut."
                  : "Choisissez les modules accessibles à cet utilisateur."}
              </CardDescription>
            </div>
            {role !== "admin" && (
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" size="sm" onClick={() => handlePreset("all")} disabled={isPending}>
                  Tout accorder
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handlePreset("none")} disabled={isPending}>
                  Tout retirer
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {apps.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Aucun module configuré pour le moment.</p>
          ) : (
            <ul className="divide-y divide-border">
              {apps.map((app) => {
                const groupNames = groupGrantedAppNames[app.id];
                return (
                  <li key={app.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-surface-muted text-foreground-muted">
                        {renderIcon(app.icon, "h-4 w-4")}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{app.name}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {!app.is_active && (
                            <Badge variant="outline" className="text-[10px]">
                              Inactif
                            </Badge>
                          )}
                          {app.status === "coming_soon" && (
                            <Badge variant="accent" className="text-[10px]">
                              Bientôt
                            </Badge>
                          )}
                          {groupNames && groupNames.length > 0 && (
                            <Badge variant="primary" className="text-[10px]">
                              Via {groupNames.join(", ")}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <span title={groupNames?.length ? "Retirez l'utilisateur du groupe pour révoquer cet accès." : undefined}>
                      <Switch
                        checked={role === "admin" || granted.has(app.id) || Boolean(groupNames?.length)}
                        onCheckedChange={(checked) => handleToggleApp(app.id, checked)}
                        disabled={isPending || role === "admin" || Boolean(groupNames?.length)}
                        aria-label={`Accès à ${app.name}`}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {!isSelf && (
        <Card className="border-danger/20">
          <CardHeader>
            <CardTitle className="text-danger">Zone de danger</CardTitle>
            <CardDescription>La suppression du compte est définitive.</CardDescription>
          </CardHeader>
          <CardContent>
            {confirmingDelete ? (
              <div className="flex items-center gap-3">
                <p className="text-sm text-foreground-muted">Confirmer la suppression de ce compte ?</p>
                <Button variant="danger" size="sm" onClick={handleDelete} disabled={isPending}>
                  Oui, supprimer
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingDelete(false)}>
                  Annuler
                </Button>
              </div>
            ) : (
              <Button variant="danger" size="sm" onClick={() => setConfirmingDelete(true)}>
                <Trash2 className="h-4 w-4" />
                Supprimer l&rsquo;utilisateur
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
