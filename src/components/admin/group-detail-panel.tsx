"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Save } from "lucide-react";
import { renameGroup, deleteGroup, setGroupMember, setGroupAppAccess } from "@/app/actions/groups";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";
import { renderIcon } from "@/lib/icon-map";
import type { AppModule, Profile, UserGroupRow } from "@/lib/supabase/types";

interface GroupDetailPanelProps {
  group: UserGroupRow;
  users: Profile[];
  apps: AppModule[];
  memberUserIds: string[];
  grantedAppIds: string[];
}

export function GroupDetailPanel({ group, users, apps, memberUserIds, grantedAppIds }: GroupDetailPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(group.name);
  const [members, setMembers] = useState(new Set(memberUserIds));
  const [granted, setGranted] = useState(new Set(grantedAppIds));
  const [message, setMessage] = useState<{ type: "success" | "danger"; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function notify(result: { error?: string; success?: string }) {
    if (result.error) setMessage({ type: "danger", text: result.error });
    else if (result.success) setMessage({ type: "success", text: result.success });
  }

  function handleRename() {
    startTransition(async () => {
      const result = await renameGroup(group.id, name);
      notify(result);
      router.refresh();
    });
  }

  function handleToggleMember(userId: string, checked: boolean) {
    setMembers((prev) => {
      const next = new Set(prev);
      if (checked) next.add(userId);
      else next.delete(userId);
      return next;
    });
    startTransition(async () => {
      const result = await setGroupMember(group.id, userId, checked);
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
      const result = await setGroupAppAccess(group.id, appId, checked);
      notify(result);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteGroup(group.id);
      if (result.error) {
        notify(result);
        setConfirmingDelete(false);
        return;
      }
      router.push("/admin/groups");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {message && <Alert variant={message.type}>{message.text}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Nom du groupe</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={isPending} />
            <Button variant="secondary" size="icon" onClick={handleRename} disabled={isPending || name === group.name} title="Enregistrer">
              <Save className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accès aux modules du groupe</CardTitle>
          <CardDescription>Tous les membres du groupe héritent de ces accès, en plus de leurs accès individuels.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {apps.map((app) => (
              <li key={app.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-surface-muted text-foreground-muted">
                    {renderIcon(app.icon, "h-4 w-4")}
                  </span>
                  <p className="text-sm font-medium text-foreground">{app.name}</p>
                </div>
                <Switch checked={granted.has(app.id)} onCheckedChange={(checked) => handleToggleApp(app.id, checked)} disabled={isPending} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membres</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {users.map((user) => (
              <li key={user.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{user.full_name || user.email}</p>
                  <p className="text-xs text-foreground-subtle">{user.email}</p>
                </div>
                <Switch checked={members.has(user.id)} onCheckedChange={(checked) => handleToggleMember(user.id, checked)} disabled={isPending} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-danger/20">
        <CardHeader>
          <CardTitle className="text-danger">Zone de danger</CardTitle>
          <CardDescription>Supprime le groupe — les membres perdent les accès hérités, pas leurs accès individuels.</CardDescription>
        </CardHeader>
        <CardContent>
          {confirmingDelete ? (
            <div className="flex items-center gap-3">
              <p className="text-sm text-foreground-muted">Confirmer la suppression de ce groupe ?</p>
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
              Supprimer le groupe
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
