"use client";

import { Modal } from "@/components/ui/modal";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const GROUPS: ShortcutGroup[] = [
  {
    title: "Partout",
    shortcuts: [{ keys: ["Ctrl", "K"], description: "Rechercher dans la bibliothèque" }],
  },
  {
    title: "Consultation d'une fiche",
    shortcuts: [
      { keys: ["↑", "↓"], description: "Notion précédente / suivante" },
      { keys: ["F"], description: "Mode lecture (masquer les panneaux, tablette/PC)" },
      { keys: ["Glisser"], description: "Sur mobile : changer de notion" },
    ],
  },
  {
    title: "Révision de flashcards",
    shortcuts: [
      { keys: ["Espace"], description: "Demander à révéler la réponse" },
      { keys: ["←"], description: "Confiance avant révélation : « hésitant(e) »" },
      { keys: ["→"], description: "Confiance avant révélation : « sûr(e) »" },
      { keys: ["1", "2", "3", "4"], description: "Après révélation : Encore / Difficile / Correct / Facile" },
      { keys: ["Ctrl", "Z"], description: "Annuler la dernière réponse" },
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Raccourcis clavier" onClose={onClose} size="sm">
      <div className="space-y-5">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">{group.title}</h3>
            <ul className="space-y-2">
              {group.shortcuts.map((shortcut, i) => (
                <li key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground-muted">{shortcut.description}</span>
                  <span className="flex shrink-0 gap-1">
                    {shortcut.keys.map((key) => (
                      <kbd
                        key={key}
                        className="rounded border border-border-strong bg-surface-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
