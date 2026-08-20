"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { setWidgetHidden } from "@/app/actions/personalization";

export function DismissibleWidget({ widgetKey, children }: { widgetKey: string; children: React.ReactNode }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [, startTransition] = useTransition();

  if (hidden) return null;

  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => {
          setHidden(true);
          startTransition(async () => {
            await setWidgetHidden(widgetKey, true);
            router.refresh();
          });
        }}
        aria-label="Masquer ce widget"
        title="Masquer ce widget (réactivable depuis Profil)"
        className="absolute right-2 top-2 z-10 rounded-full p-1 text-foreground-subtle opacity-0 hover:bg-surface-muted hover:text-foreground group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  );
}
