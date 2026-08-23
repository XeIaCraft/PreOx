"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleShoppingChecked } from "@/app/apps/a-table/actions/settings";
import { cookMealCard } from "@/app/apps/a-table/actions/planning";
import { SimpleBoard } from "@/components/a-table/simple-board";
import type { SimpleBoardData } from "@/lib/a-table/types";

/** Thin client wrapper: the owner's own épuré view stays interactive (check off shopping items, mark today cooked), unlike a household member's read-only personal link. */
export function SimpleBoardOwner({ data }: { data: SimpleBoardData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <SimpleBoard
      data={data}
      readOnly={false}
      backHref="/apps/a-table"
      onToggleShopping={(key) => {
        startTransition(async () => {
          await toggleShoppingChecked(key);
          router.refresh();
        });
      }}
      onMarkCooked={(cardId) => {
        startTransition(async () => {
          await cookMealCard(cardId);
          router.refresh();
        });
      }}
    />
  );
}
