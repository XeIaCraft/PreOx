"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { toggleAppActive, deleteApp } from "@/app/actions/admin";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export function AppRowActions({ appId, isActive }: { appId: string; isActive: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState(isActive);
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function handleToggle(checked: boolean) {
    setActive(checked);
    startTransition(async () => {
      await toggleAppActive(appId, checked);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteApp(appId);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Switch checked={active} onCheckedChange={handleToggle} disabled={isPending} aria-label="Module actif" />
      <Link href={`/admin/apps/${appId}`}>
        <Button variant="ghost" size="icon" title="Modifier">
          <Pencil className="h-4 w-4" />
        </Button>
      </Link>
      {confirming ? (
        <div className="flex items-center gap-1">
          <Button variant="danger" size="sm" onClick={handleDelete} disabled={isPending}>
            Confirmer
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Annuler
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="icon" title="Supprimer" onClick={() => setConfirming(true)}>
          <Trash2 className="h-4 w-4 text-danger" />
        </Button>
      )}
    </div>
  );
}
