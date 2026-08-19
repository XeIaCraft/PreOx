import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { InviteUserForm } from "@/components/admin/invite-user-form";

export const metadata: Metadata = { title: "Inviter un utilisateur" };

export default function NewUserPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm text-foreground-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux utilisateurs
        </Link>
        <h1 className="mt-3 font-serif-display text-2xl font-medium text-foreground">
          Inviter un utilisateur
        </h1>
      </div>

      <InviteUserForm />
    </div>
  );
}
