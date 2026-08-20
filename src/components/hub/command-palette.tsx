"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, User, ShieldCheck, LogOut, Keyboard } from "lucide-react";
import { renderIcon } from "@/lib/icon-map";
import { logout } from "@/app/actions/auth";
import type { AppWithAccess } from "@/lib/apps";

interface Command {
  id: string;
  label: string;
  icon: React.ReactNode;
  run: () => void;
}

export function CommandPalette({ apps, isAdmin }: { apps: AppWithAccess[]; isAdmin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = useMemo(() => {
    const list: Command[] = apps
      .filter((app) => app.hasAccess)
      .map((app) => ({
        id: `app-${app.id}`,
        label: app.name,
        icon: renderIcon(app.icon, "h-4 w-4"),
        run: () => router.push(`/apps/${app.slug}`),
      }));
    list.push({ id: "profile", label: "Aller à mon profil", icon: <User className="h-4 w-4" />, run: () => router.push("/profile") });
    if (isAdmin) {
      list.push({ id: "admin", label: "Administration", icon: <ShieldCheck className="h-4 w-4" />, run: () => router.push("/admin") });
    }
    list.push({ id: "logout", label: "Se déconnecter", icon: <LogOut className="h-4 w-4" />, run: () => logout() });
    return list;
  }, [apps, isAdmin, router]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(term));
  }, [commands, query]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setActiveIndex(0);
        return;
      }
      if (e.key === "?" && !isTyping && !open) {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        setHelpOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  function handleKeyDownInInput(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[activeIndex];
      if (cmd) {
        setOpen(false);
        cmd.run();
      }
    }
  }

  if (helpOpen) {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={() => setHelpOpen(false)}>
        <div
          className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="flex items-center gap-2 font-serif-display text-lg font-medium text-foreground">
            <Keyboard className="h-4 w-4" /> Raccourcis clavier
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-foreground-muted">Palette de commandes</span>
              <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 text-xs">Ctrl/⌘ K</kbd>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-foreground-muted">Cette aide</span>
              <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 text-xs">?</kbd>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-foreground-muted">Fermer</span>
              <kbd className="rounded border border-border bg-surface-muted px-1.5 py-0.5 text-xs">Échap</kbd>
            </li>
          </ul>
        </div>
      </div>
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="h-4 w-4 text-foreground-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDownInInput}
            placeholder="Aller à un module, mon profil…"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-subtle"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto py-1.5">
          {filtered.map((cmd, i) => (
            <li key={cmd.id}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  cmd.run();
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm ${
                  i === activeIndex ? "bg-primary-tint text-primary-strong" : "text-foreground"
                }`}
              >
                {cmd.icon}
                {cmd.label}
              </button>
            </li>
          ))}
          {filtered.length === 0 && <li className="px-4 py-3 text-sm text-foreground-subtle">Aucun résultat.</li>}
        </ul>
      </div>
    </div>
  );
}
