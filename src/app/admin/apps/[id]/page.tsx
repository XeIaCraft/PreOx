import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppForm } from "@/components/admin/app-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: app } = await supabase.from("apps").select("name").eq("id", id).single();
  return { title: app?.name ?? "Module" };
}

export default async function EditAppPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: app } = await supabase.from("apps").select("*").eq("id", id).single();

  if (!app) notFound();

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
        <h1 className="mt-3 font-serif-display text-2xl font-medium text-foreground">{app.name}</h1>
      </div>

      <AppForm app={app} />
    </div>
  );
}
