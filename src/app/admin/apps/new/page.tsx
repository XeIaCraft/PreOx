import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppForm } from "@/components/admin/app-form";

export const metadata: Metadata = { title: "Nouveau module" };

export default function NewAppPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/apps"
          className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux modules
        </Link>
        <h1 className="mt-3 font-serif-display text-2xl font-medium text-foreground">Nouveau module</h1>
      </div>

      <AppForm />
    </div>
  );
}
