"use client";

import { useState, useTransition } from "react";
import { updateMemberDisplayPrefs } from "@/app/apps/a-table/actions/household";
import { SimpleBoard } from "@/components/a-table/simple-board";
import type { MemberDisplayPrefs, SimpleBoardData } from "@/lib/a-table/types";

/** A household member's personal link: read-only on the meal data, but they can tweak their own display preferences (theme/density), persisted against their profile. */
export function MemberSimpleBoard({
  token,
  memberName,
  data,
  initialPrefs,
}: {
  token: string;
  memberName: string;
  data: SimpleBoardData;
  initialPrefs: MemberDisplayPrefs;
}) {
  const [, startTransition] = useTransition();
  const [prefs, setPrefs] = useState(initialPrefs);

  return (
    <SimpleBoard
      data={data}
      readOnly
      memberName={memberName}
      displayPrefs={prefs}
      onChangeDisplayPrefs={(patch) => {
        setPrefs(patch);
        startTransition(async () => {
          await updateMemberDisplayPrefs(token, patch);
        });
      }}
    />
  );
}
