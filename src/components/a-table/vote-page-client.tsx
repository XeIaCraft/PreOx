"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import { castDraftVote } from "@/app/apps/a-table/actions/drafts";
import type { DraftProposal } from "@/lib/a-table/types";

const VOTER_ID_KEY = "a-table-voter-id";

/** Reads (or creates and persists) this browser's anonymous voter id — null during SSR, where localStorage doesn't exist. */
function readVoterId(): string | null {
  if (typeof window === "undefined") return null;
  let id = localStorage.getItem(VOTER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VOTER_ID_KEY, id);
  }
  return id;
}

export function VotePageClient({
  voteToken,
  proposals,
  initialVotes,
}: {
  voteToken: string;
  proposals: DraftProposal[];
  initialVotes: Record<string, string[]>;
}) {
  const [isPending, startTransition] = useTransition();
  const [voterId] = useState<string | null>(readVoterId);
  const [votes, setVotes] = useState(initialVotes);

  function toggle(index: number) {
    if (!voterId) return;
    const key = String(index);
    const current = votes[key] ?? [];
    const nextForKey = current.includes(voterId) ? current.filter((v) => v !== voterId) : [...current, voterId];
    setVotes({ ...votes, [key]: nextForKey });
    startTransition(async () => {
      await castDraftVote(voteToken, index, voterId);
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8 sm:px-6">
      <div className="text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-foreground-subtle">Vote familial</p>
        <h1 className="mt-1 font-serif-display text-2xl font-medium text-foreground">Quels repas pour la semaine ?</h1>
        <p className="mt-1 text-sm text-foreground-muted">Touchez les plats que vous aimeriez manger.</p>
      </div>

      <div className="space-y-3">
        {proposals.map((proposal, index) => {
          const voters = votes[String(index)] ?? [];
          const picked = voterId ? voters.includes(voterId) : false;
          return (
            <button
              key={index}
              type="button"
              onClick={() => toggle(index)}
              disabled={!voterId || isPending}
              className={`flex w-full items-center gap-3 overflow-hidden rounded-[var(--radius-md)] border p-3 text-left transition-colors ${
                picked ? "border-primary bg-primary-tint" : "border-border bg-surface"
              }`}
            >
              {proposal.image_url && (
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-[var(--radius-sm)]">
                  <Image src={proposal.image_url} alt={proposal.title} fill sizes="64px" className="object-cover" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{proposal.title}</p>
                <p className="text-xs text-foreground-subtle">
                  {proposal.servings} pers.{proposal.cooking_minutes != null ? ` · ${proposal.cooking_minutes} min` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {picked && <Check className="h-4 w-4 text-primary-strong" />}
                <span className="text-sm font-medium text-foreground-subtle">{voters.length || ""}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
