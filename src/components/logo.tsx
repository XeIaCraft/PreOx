import { cn } from "@/lib/utils";

function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("h-full w-full", className)}
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="1.4" opacity="0.35" />
      <path
        d="M7 16h3.2l2-6.5 3.6 13 2-6.5 1.6 3.5h5.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
}

export function Logo({ className, markClassName, showWordmark = true }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 text-foreground", className)}>
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full bg-primary-tint text-primary-strong",
          markClassName
        )}
      >
        <LogoMark className="h-5 w-5" />
      </span>
      {showWordmark && (
        <span className="font-serif-display text-lg font-medium tracking-tight">PreOx</span>
      )}
    </span>
  );
}
