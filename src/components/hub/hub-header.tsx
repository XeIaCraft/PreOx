import Link from "next/link";
import { ShieldCheck, LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/hub/theme-toggle";
import { logout } from "@/app/actions/auth";
import type { Profile } from "@/lib/supabase/types";

export function HubHeader({ profile, section }: { profile: Profile; section?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Link href="/apps">
            <Logo />
          </Link>
          {section && (
            <>
              <span className="hidden text-border-strong sm:inline">/</span>
              <span className="hidden text-sm font-medium text-foreground-muted sm:inline">
                {section}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {profile.role === "admin" && (
            <Link href="/admin">
              <Button variant="secondary" size="sm">
                <ShieldCheck className="h-4 w-4" />
                Administration
              </Button>
            </Link>
          )}

          <div className="hidden items-center gap-2 sm:flex">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium text-foreground">
                {profile.full_name || profile.email}
              </p>
              <Badge variant={profile.role === "admin" ? "accent" : "neutral"} className="mt-0.5">
                {profile.role === "admin" ? "Administrateur" : "Utilisateur"}
              </Badge>
            </div>
          </div>

          <ThemeToggle />

          <form action={logout}>
            <Button type="submit" variant="ghost" size="icon" title="Se déconnecter">
              <LogOut className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
