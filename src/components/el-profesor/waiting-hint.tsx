import { NEW_CARD_READ_THRESHOLD } from "@/lib/el-profesor/new-card-gate";

/** « +N après lecture » next to a chapter's review button: new cards that arrive once their fiche is read (new-card-gate.ts). */
export function WaitingHint({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="text-xs text-foreground-subtle" title={`Cartes jamais révisées : elles arrivent dans vos révisions une fois leur fiche lue à ${NEW_CARD_READ_THRESHOLD} %.`}>
      +{count} après lecture
    </span>
  );
}
