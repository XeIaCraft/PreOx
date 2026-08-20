"use client";

import { useState } from "react";
import { renderIcon, ICON_OPTIONS, type IconName } from "@/lib/icon-map";

export function IconPicker({ name, defaultValue }: { name: string; defaultValue: IconName }) {
  const [selected, setSelected] = useState<IconName>(defaultValue);

  return (
    <div>
      <input type="hidden" name={name} value={selected} />
      <div className="grid grid-cols-8 gap-1.5">
        {ICON_OPTIONS.map((icon) => (
          <button
            key={icon}
            type="button"
            onClick={() => setSelected(icon)}
            title={icon}
            aria-pressed={selected === icon}
            className={`flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border transition-colors ${
              selected === icon
                ? "border-primary bg-primary-tint text-primary-strong"
                : "border-border text-foreground-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            {renderIcon(icon, "h-4 w-4")}
          </button>
        ))}
      </div>
    </div>
  );
}
