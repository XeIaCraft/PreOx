import { getCurrentProfile } from "@/lib/auth/dal";
import { getSimpleBoardData } from "@/lib/a-table/dal";
import { createClient } from "@/lib/supabase/server";
import { SimpleBoardOwner } from "@/components/a-table/simple-board-owner";

export const metadata = { title: "À table — Vue épurée" };

/** "Option one page sans modal" — a stripped-down alternative to the full board, gated by the same layout access check. */
export default async function ATableSimplePage() {
  const profile = (await getCurrentProfile())!;
  const supabase = await createClient();
  const data = await getSimpleBoardData(supabase, profile.id);

  return <SimpleBoardOwner data={data} />;
}
