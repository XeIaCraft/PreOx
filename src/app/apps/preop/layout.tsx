import type { Metadata } from "next";
import { requirePreopAccess } from "@/lib/preop/dal";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = { title: "Préop" };

export default async function PreopLayout({ children }: { children: React.ReactNode }) {
  await requirePreopAccess();
  return <ToastProvider>{children}</ToastProvider>;
}
