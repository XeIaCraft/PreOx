"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Realtime nudge for a change an admin makes to *this* user's own access
 * while they're connected — e.g. granting/revoking a module, or changing
 * their role — so the change is visible without a manual refresh or
 * logging out and back in. Both tables carry owner-or-admin SELECT RLS
 * (see init migration), which Realtime enforces the same way REST does, so
 * this only ever receives events for rows the current user could already
 * read themselves.
 */
export function AccessChangeListener({ userId }: { userId: string }) {
  const router = useRouter();
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`access-changes-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_app_access", filter: `user_id=eq.${userId}` }, () =>
        setChanged(true)
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, () => setChanged(true))
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (!changed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-[var(--radius-md)] border border-primary/30 bg-surface px-4 py-3 shadow-lg">
      <BellRing className="h-4 w-4 shrink-0 text-primary-strong" />
      <p className="text-sm text-foreground">Vos accès ont été mis à jour.</p>
      <Button
        size="sm"
        onClick={() => {
          setChanged(false);
          router.refresh();
        }}
      >
        Actualiser
      </Button>
    </div>
  );
}
