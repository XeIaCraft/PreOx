// Deterministic default avatar (initials on a colored circle) shown
// wherever a user has no uploaded photo, instead of a generic person icon.

const PALETTE = ["#2f5d54", "#3b5a72", "#a8532e", "#7a5ea8", "#4d7a3f", "#b0793a", "#4a6a8a", "#8a4a6a"];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  return hash;
}

function initialsFor(name: string | null, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function InitialsAvatar({ userId, name, email, className }: { userId: string; name: string | null; email: string; className?: string }) {
  const color = PALETTE[hashString(userId) % PALETTE.length];
  return (
    <span
      className={`flex items-center justify-center rounded-full font-medium text-white ${className ?? ""}`}
      style={{ background: color }}
    >
      {initialsFor(name, email)}
    </span>
  );
}
