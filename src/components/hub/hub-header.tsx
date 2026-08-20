import Link from "next/link";
import Image from "next/image";
import { ShieldCheck, LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { InitialsAvatar } from "@/components/hub/initials-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/hub/theme-toggle";
import { NotificationBell } from "@/components/hub/notification-bell";
import { logout } from "@/app/actions/auth";
import type { Profile } from "@/lib/supabase/types";

export function HubHeader({ profile, section }: { profile: Profile; section?: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-sm">
      {/* min-w-0 on both sides + truncate on the breadcrumb is what keeps this row from
          overflowing/clipping on narrow phones instead of silently hiding content. */}
      <div className="mx-auto flex h-auto min-h-16 max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/apps" className="shrink-0">
            <Logo />
          </Link>
          {section && (
            <span className="hidden min-w-0 items-center gap-3 text-sm font-medium text-foreground-muted md:flex">
              <span className="text-border-strong">/</span>
              <span className="truncate">{section}</span>
            </span>
          )}
        </div>

        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          {profile.role === "admin" && (
            <Link href="/admin">
              <Button variant="secondary" size="sm">
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden sm:inline">Administration</span>
              </Button>
            </Link>
          )}

          <Link href="/profile" className="flex min-w-0 items-center gap-2 rounded-full py-1 pl-1 pr-2 hover:bg-surface-muted">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-tint text-primary-strong">
              {profile.avatar_url ? (
                <Image src={profile.avatar_url} alt="" fill sizes="32px" className="object-cover" />
              ) : (
                <InitialsAvatar userId={profile.id} name={profile.full_name} email={profile.email} className="h-8 w-8 text-xs" />
              )}
            </span>
            <div className="hidden min-w-0 text-right leading-tight lg:block">
              <p className="truncate text-sm font-medium text-foreground">
                {profile.full_name || profile.email}
              </p>
              <Badge variant={profile.role === "admin" ? "accent" : "neutral"} className="mt-0.5">
                {profile.role === "admin" ? "Administrateur" : "Utilisateur"}
              </Badge>
            </div>
          </Link>

          <NotificationBell />

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
