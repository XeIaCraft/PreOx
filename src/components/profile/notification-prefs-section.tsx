"use client";

import { useState, useTransition } from "react";
import { Mail, Bell } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Alert } from "@/components/ui/alert";
import { updateNotificationPrefs, subscribeToPush, unsubscribeFromPush } from "@/app/actions/notifications";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(rawData.length));
  for (let i = 0; i < rawData.length; i++) bytes[i] = rawData.charCodeAt(i);
  return bytes;
}

export function NotificationPrefsSection({ notifyEmailDigest, notifyPush }: { notifyEmailDigest: boolean; notifyPush: boolean }) {
  const [emailDigest, setEmailDigest] = useState(notifyEmailDigest);
  const [push, setPush] = useState(notifyPush);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleEmailDigestToggle(checked: boolean) {
    setEmailDigest(checked);
    startTransition(async () => {
      const result = await updateNotificationPrefs({ notifyEmailDigest: checked });
      if (result.error) setError(result.error);
    });
  }

  async function handlePushToggle(checked: boolean) {
    setError(null);
    if (!checked) {
      setPush(false);
      startTransition(async () => {
        const reg = await navigator.serviceWorker?.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          await unsubscribeFromPush(sub.endpoint);
          await sub.unsubscribe();
        } else {
          await updateNotificationPrefs({ notifyPush: false });
        }
      });
      return;
    }

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !vapidKey) {
      setError("Les notifications push ne sont pas disponibles sur cet appareil ou ce serveur n'est pas configuré pour en envoyer.");
      return;
    }

    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setError("Autorisation refusée par le navigateur.");
          return;
        }
        const reg = await navigator.serviceWorker.register("/sw.js");
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
        const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const result = await subscribeToPush({ endpoint: json.endpoint, keys: json.keys });
        if (result.error) {
          setError(result.error);
          return;
        }
        setPush(true);
      } catch {
        setError("Impossible d'activer les notifications push.");
      }
    });
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-6">
      <h2 className="font-serif-display text-lg font-medium text-foreground">Notifications</h2>
      {error && (
        <div className="mt-3">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}
      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-2.5">
            <Mail className="mt-0.5 h-4 w-4 text-foreground-subtle" />
            <div>
              <p className="text-sm font-medium text-foreground">Résumé hebdomadaire par email</p>
              <p className="text-sm text-foreground-muted">Un e-mail par semaine avec vos rappels et votre activité.</p>
            </div>
          </div>
          <Switch checked={emailDigest} onCheckedChange={handleEmailDigestToggle} disabled={isPending} aria-label="Résumé hebdomadaire par email" />
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <div className="flex items-start gap-2.5">
            <Bell className="mt-0.5 h-4 w-4 text-foreground-subtle" />
            <div>
              <p className="text-sm font-medium text-foreground">Notifications push</p>
              <p className="text-sm text-foreground-muted">Alertes sur cet appareil (nouvel appareil connecté, nouvel accès…).</p>
            </div>
          </div>
          <Switch checked={push} onCheckedChange={handlePushToggle} disabled={isPending} aria-label="Notifications push" />
        </div>
      </div>
    </div>
  );
}
