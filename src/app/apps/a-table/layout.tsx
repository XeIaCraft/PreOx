import type { Metadata } from "next";
import { requireATableAccess } from "@/lib/a-table/dal";

export const metadata: Metadata = { title: "À table" };

export default async function ATableLayout({ children }: { children: React.ReactNode }) {
  await requireATableAccess();
  return <>{children}</>;
}
