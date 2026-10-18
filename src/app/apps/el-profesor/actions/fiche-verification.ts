"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { logContentChange } from "@/lib/el-profesor/content-log";
import { buildFicheVerificationPrompt, describeChanges, parseFicheVerification, type VerifiableFiche } from "@/lib/el-profesor/fiche-verification";
import type { BlockContent, BlockType, Citation, FlashcardSide } from "@/lib/el-profesor/types";

async function loadFiche(ficheId: string): Promise<(VerifiableFiche & { status: "draft" | "published"; subEntityId: string }) | null> {
  const supabase = await createClient();
  const { data: fiche } = await supabase.from("el_profesor_fiches").select("id, title, status, sub_entity_id").eq("id", ficheId).maybeSingle();
  if (!fiche) return null;
  const [{ data: sub }, { data: blocks }, { data: cards }] = await Promise.all([
    supabase.from("el_profesor_sub_entities").select("summary").eq("id", fiche.sub_entity_id).maybeSingle(),
    supabase.from("el_profesor_fiche_blocks").select("id, block_type, content").eq("fiche_id", ficheId).order("order_index"),
    supabase.from("el_profesor_flashcards").select("id, front, back").eq("fiche_id", ficheId).neq("status", "replaced").order("created_at"),
  ]);
  return {
    title: fiche.title,
    summary: sub?.summary ?? "",
    status: fiche.status,
    subEntityId: fiche.sub_entity_id,
    blocks: (blocks ?? []).map((b) => ({ id: b.id, blockType: b.block_type as BlockType, content: b.content as unknown as BlockContent })),
    flashcards: (cards ?? []).map((c) => ({ id: c.id, front: (c.front as unknown as FlashcardSide)?.text ?? "", back: (c.back as unknown as FlashcardSide)?.text ?? "" })),
  };
}

const today = () => new Date().toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" });

export async function exportFicheVerification(ficheId: string): Promise<{ prompt?: string; title?: string; error?: string }> {
  await requireElProfesorAdmin();
  const fiche = await loadFiche(ficheId);
  if (!fiche) return { error: "Fiche introuvable." };
  return { prompt: buildFicheVerificationPrompt(fiche, today()), title: fiche.title };
}

export async function previewFicheVerification(ficheId: string, raw: string): Promise<{ lines?: string[]; summary?: string; error?: string }> {
  await requireElProfesorAdmin();
  const fiche = await loadFiche(ficheId);
  if (!fiche) return { error: "Fiche introuvable." };
  const parsed = parseFicheVerification(raw, fiche);
  if (!parsed.ok) return { error: parsed.error };
  return { lines: describeChanges(parsed.changes, fiche), summary: parsed.changes.summary };
}

/**
 * Applies a checked answer: modified blocks and cards are rewritten and
 * marked « à vérifier », additions go in at their place, removals are
 * deleted, and every change carries its note (what changed, why, with the
 * reference) as a citation « Actualisation » — the reader sees where a
 * passage comes from, exactly like a page of a source book.
 */
export async function applyFicheVerification(ficheId: string, raw: string): Promise<{ success?: string; error?: string }> {
  const profile = await requireElProfesorAdmin();
  const fiche = await loadFiche(ficheId);
  if (!fiche) return { error: "Fiche introuvable." };
  const parsed = parseFicheVerification(raw, fiche);
  if (!parsed.ok) return { error: parsed.error };
  const { changes } = parsed;
  const supabase = await createClient();
  const label = `Actualisation ${new Date().toISOString().slice(0, 7)}`;
  const noteCitation = (note: string): Citation[] => (note ? [{ page: 0, quote: note, bookTitle: label, chapterTitle: note }] : []);
  const { data: current } = await supabase.from("el_profesor_fiche_blocks").select("id, citations").eq("fiche_id", ficheId);
  const citationsOf = new Map((current ?? []).map((b) => [b.id, (b.citations as unknown as Citation[]) ?? []]));

  let order = 0;
  for (const b of changes.blocks) {
    if (b.kind === "keep") {
      await supabase.from("el_profesor_fiche_blocks").update({ order_index: order++ }).eq("id", b.id);
    } else if (b.kind === "update") {
      await supabase
        .from("el_profesor_fiche_blocks")
        .update({ order_index: order++, content: b.content as never, citations: [...(citationsOf.get(b.id) ?? []), ...noteCitation(b.note)] as never, needs_review: true })
        .eq("id", b.id);
      await logContentChange(profile.id, "block", b.id, "update_check", b.note.slice(0, 500));
    } else {
      await supabase.from("el_profesor_fiche_blocks").insert({
        fiche_id: ficheId,
        order_index: order++,
        block_type: b.blockType,
        content: b.content as never,
        citations: noteCitation(b.note) as never,
        needs_review: true,
        status: fiche.status,
      });
    }
  }
  if (changes.removedBlocks.length) await supabase.from("el_profesor_fiche_blocks").delete().in("id", changes.removedBlocks.map((r) => r.id));

  for (const c of changes.cards) {
    if (c.kind === "update") {
      await supabase.from("el_profesor_flashcards").update({ front: { text: c.front } as never, back: { text: c.back } as never, needs_review: true }).eq("id", c.id);
      await logContentChange(profile.id, "flashcard", c.id, "update_check", c.note.slice(0, 500));
    } else if (c.kind === "add") {
      await supabase.from("el_profesor_flashcards").insert({
        fiche_id: ficheId,
        front: { text: c.front } as never,
        back: { text: c.back } as never,
        citations: noteCitation(c.note) as never,
        status: fiche.status,
        needs_review: true,
      });
    }
  }
  if (changes.removedCards.length) await supabase.from("el_profesor_flashcards").delete().in("id", changes.removedCards.map((r) => r.id));

  revalidatePath("/apps/el-profesor");
  const n = describeChanges(changes, fiche).length;
  return { success: n ? `${n} changement(s) appliqué(s), marqué(s) « à vérifier ».` : "Rien à changer : la fiche est à jour." };
}
