import type { Metadata } from "next";
import { requireCarnetAccess } from "@/lib/carnet/dal";
import { CarnetProvider } from "@/components/carnet/carnet-provider";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = { title: "Carnet de stage" };

export default async function CarnetLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireCarnetAccess();
  return (
    <ToastProvider>
      <CarnetProvider userId={profile.id}>{children}</CarnetProvider>
    </ToastProvider>
  );
}
