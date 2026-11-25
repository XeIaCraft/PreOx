import type { Metadata } from "next";
import { requirePreopAccess } from "@/lib/preop/dal";
import { getViewMode } from "@/lib/auth/view-mode";
import { getAppBySlugForProfile } from "@/lib/apps";
import { CARNET_SLUG } from "@/lib/carnet/dal";
import { CarnetProvider } from "@/components/carnet/carnet-provider";
import { PreopSessionProvider } from "@/components/preop/session";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = { title: "Préop · CARE" };

// Préop inside the EasyPM extension's side panel, next to CARE: the same
// module (same access check, same encrypted dossiers on this device), without
// the hub around it. Only this path may be framed, and only by a browser
// extension page (next.config.ts).
export default async function EmbeddedPreopLayout({ children }: { children: React.ReactNode }) {
  const profile = await requirePreopAccess();
  const carnet = await getAppBySlugForProfile(CARNET_SLUG, profile);
  const carnetEnabled = !!carnet?.hasAccess;
  const { realIsAdmin, isAdmin } = await getViewMode(profile);
  const content = (
    <PreopSessionProvider userId={profile.id} carnetEnabled={carnetEnabled} isAdmin={isAdmin} realIsAdmin={realIsAdmin}>
      {children}
    </PreopSessionProvider>
  );
  return (
    <ToastProvider>
      <main className="min-h-screen bg-background px-2 py-3">{carnetEnabled ? <CarnetProvider userId={profile.id}>{content}</CarnetProvider> : content}</main>
    </ToastProvider>
  );
}
