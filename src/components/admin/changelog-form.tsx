"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { createChangelogEntry } from "@/app/actions/changelog";
import type { AppModule } from "@/lib/supabase/types";

export function ChangelogForm({ apps }: { apps: AppModule[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [appId, setAppId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await createChangelogEntry(title, body, appId || null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setTitle("");
      setBody("");
      setAppId("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface p-5">
      {error && <Alert variant="danger">{error}</Alert>}
      <div className="space-y-1.5">
        <Label htmlFor="cl-title">Titre</Label>
        <Input id="cl-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Nouvelle fonctionnalité..." />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cl-body">Description</Label>
        <textarea
          id="cl-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          className="flex w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cl-app">Module concerné (optionnel)</Label>
        <Select id="cl-app" value={appId} onChange={(e) => setAppId(e.target.value)}>
          <option value="">Tout le hub</option>
          {apps.map((app) => (
            <option key={app.id} value={app.id}>
              {app.name}
            </option>
          ))}
        </Select>
      </div>
      <Button onClick={handleSubmit} disabled={isPending || !title.trim() || !body.trim()}>
        <Send className="h-4 w-4" />
        Publier
      </Button>
    </div>
  );
}
