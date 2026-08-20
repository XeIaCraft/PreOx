import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <Logo />
      <div>
        <p className="font-serif-display text-5xl font-medium text-foreground">404</p>
        <p className="mt-2 text-sm text-foreground-muted">Cette page n&rsquo;existe pas ou plus.</p>
      </div>
      <Link
        href="/apps"
        className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-strong"
      >
        Retour au hub
      </Link>
    </div>
  );
}
