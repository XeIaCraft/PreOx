"use server";

import { revalidatePath } from "next/cache";
import { requireElProfesorAdmin } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { logContentChange } from "@/lib/el-profesor/content-log";
import {
  buildVerificationPrompt,
  changeCitations,
  describeChanges,
  orderAfterChanges,
  parseVerification,
  type VerifiableFiche,
} from "@/lib/el-profesor/fiche-verification";
import type { BlockContent, BlockType, Citation, FlashcardSide } from "@/lib/el-profesor/types";

/** A single fiche, or every fiche of a chapter (one conversation for a whole chapter). */
export type VerificationScope = { kind: "fiche"; ficheId: string } | { kind: "chapter"; chapterId: string };

type LoadedFiche = VerifiableFiche & { status: "draft" | "published" };

async function loadScope(scope: VerificationScope): Promise<{ label: string; fiches: LoadedFiche[] } | null> {
  const supabase = await createClient();
  let ficheRows: { id: string; title: string; status: "draft" | "published"; sub_entity_id: string }[] = [];
  let label = "";
  if (scope.kind === "fiche") {
    const { data } = await supabase.from("el_profesor_fiches").select("id, title, status, sub_entity_id").eq("id", scope.ficheId).maybeSingle();
    if (!data) return null;
    ficheRows = [data];
    label = `la fiche « ${data.title} »`;
  } else {
    const { data: chapter } = await supabase.from("el_profesor_chapters").select("title").eq("id", scope.chapterId).maybeSingle();
    if (!chapter) return null;
    const { data: subs } = await supabase.from("el_profesor_sub_entities").select("id").eq("chapter_id", scope.chapterId).order("order_index");
    const order = new Map((subs ?? []).map((s, i) => [s.id, i]));
    const { data } = await supabase
      .from("el_profesor_fiches")
      .select("id, title, status, sub_entity_id, superseded_by_fiche_id")
      .in("sub_entity_id", [...order.keys()]);
    ficheRows = (data ?? []).filter((f) => !f.superseded_by_fiche_id).sort((a, b) => (order.get(a.sub_entity_id) ?? 0) - (order.get(b.sub_entity_id) ?? 0));
    label = `les ${ficheRows.length} fiches du chapitre « ${chapter.title} »`;
  }
  if (ficheRows.length === 0) return null;

  const ids = ficheRows.map((f) => f.id);
  const [{ data: subs }, { data: blocks }, { data: cards }] = await Promise.all([
    supabase.from("el_profesor_sub_entities").select("id, summary").in("id", ficheRows.map((f) => f.sub_entity_id)),
    supabase.from("el_profesor_fiche_blocks").select("id, fiche_id, block_type, content, order_index").in("fiche_id", ids).order("order_index"),
    supabase.from("el_profesor_flashcards").select("id, fiche_id, front, back, created_at").in("fiche_id", ids).neq("status", "replaced").order("created_at"),
  ]);
  const summaryOf = new Map((subs ?? []).map((s) => [s.id, s.summary]));
  return {
    label,
    fiches: ficheRows.map((f) => ({
      ficheId: f.id,
      title: f.title,
      summary: summaryOf.get(f.sub_entity_id) ?? "",
      status: f.status,
      blocks: (blocks ?? []).filter((b) => b.fiche_id === f.id).map((b) => ({ id: b.id, blockType: b.block_type as BlockType, content: b.content as unknown as BlockContent })),
      flashcards: (cards ?? [])
        .filter((c) => c.fiche_id === f.id)
        .map((c) => ({ id: c.id, front: (c.front as unknown as FlashcardSide)?.text ?? "", back: (c.back as unknown as FlashcardSide)?.text ?? "" })),
    })),
  };
}

const today = () => new Date().toLocaleDateString("fr-BE", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Brussels" });

export async function exportVerification(scope: VerificationScope): Promise<{ prompt?: string; title?: string; ficheCount?: number; error?: string }> {
  await requireElProfesorAdmin();
  const loaded = await loadScope(scope);
  if (!loaded) return { error: "Rien à vérifier ici." };
  return { prompt: buildVerificationPrompt(loaded, today()), title: loaded.fiches.length === 1 ? loaded.fiches[0].title : loaded.label, ficheCount: loaded.fiches.length };
}

export async function previewVerification(scope: VerificationScope, raw: string): Promise<{ lines?: string[]; summary?: string; warnings?: string[]; error?: string }> {
  await requireElProfesorAdmin();
  const loaded = await loadScope(scope);
  if (!loaded) return { error: "Rien à vérifier ici." };
  const parsed = parseVerification(raw, loaded.fiches);
  if (!parsed.ok) return { error: parsed.error };
  const warnings = [...parsed.changes.skipped];
  if (parsed.changes.referencesWithoutId) warnings.push(`${parsed.changes.referencesWithoutId} référence(s) sans PMID ni DOI : à vérifier avant de les apprendre.`);
  return { lines: describeChanges(parsed.changes, loaded.fiches), summary: parsed.changes.summary, warnings };
}

/**
 * Applies a checked answer: modified blocks and cards are rewritten and
 * marked « à vérifier », additions (studies, history…) go in at their place,
 * removals are deleted. Every change carries its note as an « Actualisation »
 * citation and its references as chips that open PubMed or the DOI.
 */
export async function applyVerification(scope: VerificationScope, raw: string): Promise<{ success?: string; error?: string }> {
  const profile = await requireElProfesorAdmin();
  const loaded = await loadScope(scope);
  if (!loaded) return { error: "Rien à vérifier ici." };
  const parsed = parseVerification(raw, loaded.fiches);
  if (!parsed.ok) return { error: parsed.error };
  const { changes } = parsed;
  const supabase = await createClient();
  const month = new Date().toISOString().slice(0, 7);

  for (const [fi, c] of changes.fiches.entries()) {
    const fiche = loaded.fiches[fi];
    if (!c.updates.length && !c.inserts.length && !c.removes.length && !c.cardUpdates.length && !c.cardAdds.length && !c.cardRemoves.length) continue;
    const { data: current } = await supabase.from("el_profesor_fiche_blocks").select("id, block_type, citations").eq("fiche_id", fiche.ficheId).order("order_index");
    const rows = current ?? [];
    const typeOf = new Map(rows.map((b) => [b.id, b.block_type as BlockType]));
    const citationsOf = new Map(rows.map((b) => [b.id, (b.citations as unknown as Citation[]) ?? []]));
    const updateOf = new Map(c.updates.map((u) => [u.id, u]));

    if (c.removes.length) await supabase.from("el_profesor_fiche_blocks").delete().in("id", c.removes.map((r) => r.id));
    const order = orderAfterChanges(rows.map((b) => b.id), (id) => typeOf.get(id), c);
    for (const [orderIndex, item] of order.entries()) {
      if (typeof item === "string") {
        const u = updateOf.get(item);
        if (!u) {
          await supabase.from("el_profesor_fiche_blocks").update({ order_index: orderIndex }).eq("id", item);
          continue;
        }
        await supabase
          .from("el_profesor_fiche_blocks")
          .update({ order_index: orderIndex, content: u.content as never, citations: [...(citationsOf.get(item) ?? []), ...changeCitations(u.note, u.refs, month)] as never, needs_review: true })
          .eq("id", item);
        await logContentChange(profile.id, "block", item, "update_check", u.note.slice(0, 500));
      } else {
        const ins = c.inserts[item.insert];
        await supabase.from("el_profesor_fiche_blocks").insert({
          fiche_id: fiche.ficheId,
          order_index: orderIndex,
          block_type: ins.blockType,
          content: ins.content as never,
          citations: changeCitations(ins.note, ins.refs, month) as never,
          needs_review: true,
          status: fiche.status,
        });
      }
    }

    for (const u of c.cardUpdates) {
      const { data: card } = await supabase.from("el_profesor_flashcards").select("citations").eq("id", u.id).maybeSingle();
      await supabase
        .from("el_profesor_flashcards")
        .update({
          front: { text: u.front } as never,
          back: { text: u.back } as never,
          citations: [...(((card?.citations as unknown as Citation[]) ?? [])), ...changeCitations(u.note, u.refs, month)] as never,
          needs_review: true,
        })
        .eq("id", u.id);
      await logContentChange(profile.id, "flashcard", u.id, "update_check", u.note.slice(0, 500));
    }
    if (c.cardAdds.length)
      await supabase.from("el_profesor_flashcards").insert(
        c.cardAdds.map((a) => ({
          fiche_id: fiche.ficheId,
          front: { text: a.front } as never,
          back: { text: a.back } as never,
          citations: changeCitations(a.note, a.refs, month) as never,
          status: fiche.status,
          needs_review: true,
        }))
      );
    if (c.cardRemoves.length) await supabase.from("el_profesor_flashcards").delete().in("id", c.cardRemoves.map((r) => r.id));
  }

  revalidatePath("/apps/el-profesor");
  const n = describeChanges(changes, loaded.fiches).length;
  return { success: n ? `${n} changement(s) appliqué(s), marqué(s) « à vérifier ».` : "Rien à changer : c'est à jour." };
}
