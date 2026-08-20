"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listMyNotifications, markNotificationRead, markAllNotificationsRead } from "@/app/actions/notifications";
import type { NotificationRow } from "@/lib/supabase/types";

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    listMyNotifications().then(setNotifications);
    const interval = setInterval(() => {
      listMyNotifications().then(setNotifications);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleOpenNotification(n: NotificationRow) {
    if (!n.read) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      startTransition(async () => {
        await markNotificationRead(n.id);
        router.refresh();
      });
    }
    setOpen(false);
  }

  function handleMarkAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    startTransition(async () => {
      await markAllNotificationsRead();
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={unreadCount > 0 ? `${unreadCount} notification(s) non lue(s)` : "Notifications"}
        className="relative"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-medium text-foreground">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                disabled={isPending}
                className="flex items-center gap-1 text-xs text-foreground-subtle hover:text-foreground"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Tout marquer lu
              </button>
            )}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && <li className="px-4 py-6 text-center text-sm text-foreground-subtle">Rien pour l&rsquo;instant.</li>}
            {notifications.map((n) => {
              const inner = (
                <>
                  <p className={`text-sm ${n.read ? "text-foreground-muted" : "font-medium text-foreground"}`}>{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-foreground-subtle">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-foreground-subtle">{new Date(n.created_at).toLocaleString("fr-FR")}</p>
                </>
              );
              return (
                <li key={n.id} className="border-b border-border last:border-0">
                  {n.link ? (
                    <Link href={n.link} onClick={() => handleOpenNotification(n)} className={`block px-4 py-2.5 hover:bg-surface-muted ${!n.read ? "bg-primary-tint/30" : ""}`}>
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" onClick={() => handleOpenNotification(n)} className={`block w-full px-4 py-2.5 text-left hover:bg-surface-muted ${!n.read ? "bg-primary-tint/30" : ""}`}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
