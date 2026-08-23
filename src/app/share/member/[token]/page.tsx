import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSimpleBoardData } from "@/lib/a-table/dal";
import { MemberSimpleBoard } from "@/components/a-table/member-simple-board";
import type { ATableHouseholdMemberRow } from "@/lib/supabase/types";
import type { MemberDisplayPrefs } from "@/lib/a-table/types";

export const metadata = { title: "À table — Vue personnelle" };
export const dynamic = "force-dynamic";

/**
 * A household member's personal link — same opaque-token trust model as
 * every other public link in this module. Read-only on the shared meal
 * data (today/week/shopping list); the only thing this page lets the
 * member change is their own display preferences.
 */
export default async function MemberSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: memberRow } = await supabase.from("a_table_household_members").select("*").eq("access_token", token).maybeSingle();
  if (!memberRow) notFound();

  const member = memberRow as ATableHouseholdMemberRow;
  const data = await getSimpleBoardData(supabase, member.user_id);

  return (
    <MemberSimpleBoard
      token={token}
      memberName={member.name}
      data={data}
      initialPrefs={(member.display_prefs as unknown as MemberDisplayPrefs) ?? {}}
    />
  );
}
