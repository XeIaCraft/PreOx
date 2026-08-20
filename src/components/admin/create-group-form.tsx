"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { createGroup } from "@/app/actions/groups";

export function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    if (!name.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await createGroup(name);
      if (result.error) {
        setError(result.error);
        return;
      }
      setName("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom du groupe (ex. Internes anesthésie)" className="max-w-xs" />
        <Button onClick={handleCreate} disabled={isPending || !name.trim()}>
          <Plus className="h-4 w-4" />
          Créer
        </Button>
      </div>
    </div>
  );
}
