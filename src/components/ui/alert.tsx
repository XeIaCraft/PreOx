import * as React from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "danger" | "success" | "info";
}

function Alert({ className, variant = "info", children, ...props }: AlertProps) {
  const styles = {
    danger: "bg-danger-tint text-danger border-danger/20",
    success: "bg-success-tint text-success border-success/20",
    info: "bg-primary-tint text-primary-strong border-primary/20",
  } as const;

  const Icon = variant === "danger" ? AlertCircle : variant === "success" ? CheckCircle2 : Info;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-[var(--radius-sm)] border px-3.5 py-3 text-sm",
        styles[variant],
        className
      )}
      {...props}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export { Alert };
