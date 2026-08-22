import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { VotePageClient } from "@/components/a-table/vote-page-client";
import type { ATableDraftRow } from "@/lib/supabase/types";
import type { DraftProposal } from "@/lib/a-table/types";

export const metadata = { title: "Vote familial" };
export const dynamic = "force-dynamic";

/**
 * Public, unauthenticated family-voting page — same opaque-token trust
 * model as a shared recipe link. Anyone with the link can pick proposals;
 * no hub account or sign-in involved, matching the "no household multi-user
 * auth" architecture decision for this module.
 */
export default async function VoteSharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase.from("a_table_drafts").select("*").eq("vote_token", token).maybeSingle();
  if (!data) notFound();

  const draft = data as ATableDraftRow;
  const proposals = (draft.proposals as unknown as DraftProposal[]) ?? [];
  const votes = (draft.votes as unknown as Record<string, string[]>) ?? {};

  return <VotePageClient voteToken={token} proposals={proposals} initialVotes={votes} />;
}
