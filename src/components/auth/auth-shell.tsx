import Link from "next/link";
import { Logo } from "@/components/logo";

interface AuthShellProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-background px-4 py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--primary)_9%,transparent),transparent)]"
      />
      <Link href="/" className="relative mb-8">
        <Logo />
      </Link>

      <div className="relative w-full max-w-[400px] rounded-[var(--radius-lg)] border border-border bg-surface p-8 shadow-[0_1px_2px_rgba(20,30,25,0.04),0_20px_40px_-24px_rgba(20,30,25,0.15)]">
        <div className="mb-6 text-center">
          <h1 className="font-serif-display text-2xl font-medium text-foreground">{title}</h1>
          {description && (
            <p className="mt-2 text-sm text-foreground-muted text-balance">{description}</p>
          )}
        </div>
        {children}
      </div>

      {footer && <div className="relative mt-6 text-sm text-foreground-muted">{footer}</div>}
    </div>
  );
}
