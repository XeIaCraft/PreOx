import type { Metadata } from "next";
import { requirePreopAccess } from "@/lib/preop/dal";
import { getViewMode } from "@/lib/auth/view-mode";
import { getAppBySlugForProfile } from "@/lib/apps";
import { CARNET_SLUG } from "@/lib/carnet/dal";
import { CarnetProvider } from "@/components/carnet/carnet-provider";
import { PreopSessionProvider } from "@/components/preop/session";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = { title: "Préop" };

// The carnet store is mounted too when the user has the carnet: a prepared
// case can then be planned there (not counted until confirmed). A user (or
// an admin in the user view) only has the surgery sheets and treatments.
export default async function PreopLayout({ children }: { children: React.ReactNode }) {
  const profile = await requirePreopAccess();
  const carnet = await getAppBySlugForProfile(CARNET_SLUG, profile);
  const carnetEnabled = !!carnet?.hasAccess;
  const { realIsAdmin, isAdmin } = await getViewMode(profile);
  const content = (
    <PreopSessionProvider userId={profile.id} carnetEnabled={carnetEnabled} isAdmin={isAdmin} realIsAdmin={realIsAdmin}>
      {children}
    </PreopSessionProvider>
  );
  return <ToastProvider>{carnetEnabled ? <CarnetProvider userId={profile.id}>{content}</CarnetProvider> : content}</ToastProvider>;
}
