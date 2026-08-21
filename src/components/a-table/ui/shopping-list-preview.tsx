import { SHOPPING_CATEGORIES, SHOPPING_OTHER_CATEGORY } from "@/lib/a-table/constants";
import type { ShoppingItem } from "@/lib/a-table/shopping";

const CATEGORIES = [...SHOPPING_CATEGORIES, SHOPPING_OTHER_CATEGORY];

/** Compact, read-only shopping list grouped by rayon — used for live previews (e.g. génération). */
export function ShoppingListPreview({ items }: { items: ShoppingItem[] }) {
  const unchecked = items.filter((i) => !i.checked);
  if (unchecked.length === 0) {
    return <p className="text-sm text-foreground-subtle">Rien à acheter pour l&apos;instant.</p>;
  }

  return (
    <div className="space-y-4">
      {CATEGORIES.map((category) => {
        const categoryItems = unchecked.filter((i) => i.category === category.key);
        if (categoryItems.length === 0) return null;
        return (
          <div key={category.key}>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground-subtle">{category.label}</p>
            <ul className="space-y-0.5">
              {categoryItems.map((item) => (
                <li key={item.key} className="text-sm text-foreground">
                  {item.uncertain
                    ? `${item.name} (quantité à ajuster)`
                    : `${item.quantity ? Math.round(item.quantity * 100) / 100 : ""} ${item.unit} ${item.name}`}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
