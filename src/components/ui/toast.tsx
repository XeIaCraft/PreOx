"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, Info, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToastOptions {
  variant?: "success" | "error" | "info";
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
}

interface ToastContextValue {
  toast: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const toast = useCallback((message: string, options?: ToastOptions) => {
    if (!message) return;
    const id = ++counter.current;
    const item: ToastItem = { id, message, ...options };
    setItems((prev) => [...prev, item]);
    const duration = options?.durationMs ?? (options?.onAction ? 6000 : 3600);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-2 px-4">
        {items.map((item) => {
          const Icon = item.variant === "error" ? AlertCircle : item.variant === "success" ? CheckCircle2 : Info;
          return (
            <div
              key={item.id}
              className={cn(
                "pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-foreground px-4 py-2.5 text-sm text-background shadow-lg"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.message}</span>
              {item.actionLabel && item.onAction && (
                <button
                  type="button"
                  onClick={() => {
                    item.onAction?.();
                    setItems((prev) => prev.filter((t) => t.id !== item.id));
                  }}
                  className="font-medium underline underline-offset-2"
                >
                  {item.actionLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => setItems((prev) => prev.filter((t) => t.id !== item.id))}
                className="text-background/60 hover:text-background"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
