"use client";

import { useState } from "react";
import { Sun, Moon, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type ThemeChoice = "system" | "light" | "dark";
const STORAGE_KEY = "preox-theme";
const ORDER: ThemeChoice[] = ["system", "light", "dark"];

const META: Record<ThemeChoice, { icon: React.ComponentType<{ className?: string }>; label: string }> = {
  system: { icon: MonitorSmartphone, label: "Thème : système (cliquer pour passer en clair)" },
  light: { icon: Sun, label: "Thème : clair (cliquer pour passer en sombre)" },
  dark: { icon: Moon, label: "Thème : sombre (cliquer pour revenir au système)" },
};

function applyTheme(choice: ThemeChoice) {
  if (choice === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", choice);
}

function readStoredChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function ThemeToggle() {
  // Lazy initializer: matches whatever the beforeInteractive init script
  // already applied to the DOM, so there's nothing to reconcile on mount.
  const [choice, setChoice] = useState<ThemeChoice>(readStoredChoice);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length];
    setChoice(next);
    applyTheme(next);
    try {
      if (next === "system") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore (private browsing / quota)
    }
  }

  const { icon: Icon, label } = META[choice];

  return (
    <Button variant="ghost" size="icon" onClick={cycle} title={label} aria-label={label}>
      <Icon className="h-4 w-4" />
    </Button>
  );
}
