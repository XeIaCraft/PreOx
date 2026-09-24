"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { MessageSquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { submitFeedback } from "@/app/actions/feedback";

// El Profesor's fiche and notion-synthesis reading views (requested
// 2026-08-29) both pin their own controls to the bottom-right corner —
// this global widget landed right underneath them there, so it's hidden on
// those two routes rather than fighting for the same corner.
const HIDDEN_ON = [/^\/apps\/el-profesor\/chapters\//, /^\/apps\/el-profesor\/notions\/[^/]+/];

// Modules with their own bottom navigation bar on phones (Carnet de stage):
// the floating button would sit on the bar or on the form's save button,
// so on phones it's only reachable from the module's own menu, which opens
// the widget through this event.
const NO_LAUNCHER_ON_PHONE = [/^\/apps\/carnet-de-stage/];
export const OPEN_FEEDBACK_EVENT = "preox:open-feedback";

export function FeedbackWidget() {
  const pathname = usePathname();
  const hidden = pathname != null && HIDDEN_ON.some((re) => re.test(pathname));
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const noLauncherOnPhone = pathname != null && NO_LAUNCHER_ON_PHONE.some((re) => re.test(pathname));

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_FEEDBACK_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_FEEDBACK_EVENT, onOpen);
  }, []);

  if (hidden) return null;

  function handleSubmit() {
    if (!message.trim()) return;
    startTransition(async () => {
      const result = await submitFeedback(message, window.location.pathname);
      if (result.error) {
        setStatus({ type: "error", text: result.error });
        return;
      }
      setStatus({ type: "success", text: result.success ?? "" });
      setMessage("");
      setTimeout(() => {
        setOpen(false);
        setStatus(null);
      }, 1200);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Signaler un problème ou laisser un retour"
        title="Signaler un problème ou laisser un retour"
        className={`fixed bottom-4 right-4 z-40 h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-foreground-muted shadow-md hover:text-foreground ${noLauncherOnPhone ? "hidden sm:flex" : "flex"}`}
      >
        <MessageSquarePlus className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border border-border bg-surface p-4 shadow-xl">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Un problème ? Une idée ?</p>
        <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="text-foreground-subtle hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        placeholder="Décrivez ce que vous avez rencontré…"
        className="w-full resize-none rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-sm placeholder:text-foreground-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      />
      {status && <p className={`mt-1.5 text-xs ${status.type === "error" ? "text-danger" : "text-success"}`}>{status.text}</p>}
      <Button className="mt-2 w-full" size="sm" onClick={handleSubmit} disabled={isPending || !message.trim()}>
        Envoyer
      </Button>
    </div>
  );
}
