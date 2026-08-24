import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { FicheViewer } from "@/components/el-profesor/fiche-viewer";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ElProfesorFicheBlockRow, ElProfesorSubEntityRow, ElProfesorChapterRow, ElProfesorBookRow } from "@/lib/supabase/types";
import type { BlockContent, Citation, FicheBlock } from "@/lib/el-profesor/types";

export const metadata = { title: "Fiche partagée" };

/**
 * Public, unauthenticated read-only view of a shared fiche — same trust
 * model as the recipe share page: an unguessable random `share_token`
 * gates the row, not a session check. Only ever serves fiches whose status
 * is still "published" and whose blocks are individually published, so
 * revoking publication also breaks any outstanding share link.
 */
export default async function SharedFichePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();

  const { data: fiche } = await supabase.from("el_profesor_fiches").select("*").eq("share_token", token).eq("status", "published").maybeSingle();
  if (!fiche) notFound();

  const { data: subEntity } = await supabase.from("el_profesor_sub_entities").select("*").eq("id", fiche.sub_entity_id).single();
  if (!subEntity) notFound();

  const [{ data: blockRows }, { data: chapter }] = await Promise.all([
    supabase.from("el_profesor_fiche_blocks").select("*").eq("fiche_id", fiche.id).eq("status", "published").order("order_index"),
    supabase.from("el_profesor_chapters").select("*").eq("id", (subEntity as ElProfesorSubEntityRow).chapter_id).single(),
  ]);

  const { data: book } = chapter
    ? await supabase.from("el_profesor_books").select("*").eq("id", (chapter as ElProfesorChapterRow).book_id).single()
    : { data: null };

  const blocks: FicheBlock[] = ((blockRows ?? []) as ElProfesorFicheBlockRow[]).map((b) => ({
    id: b.id,
    ficheId: b.fiche_id,
    orderIndex: b.order_index,
    blockType: b.block_type as FicheBlock["blockType"],
    content: b.content as unknown as BlockContent,
    citations: (b.citations as unknown as Citation[]) ?? [],
    needsReview: b.needs_review,
    status: b.status,
    isEmergency: b.is_emergency,
  }));

  const bookRow = book as ElProfesorBookRow | null;

  return (
    <div className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <Logo />
      <p className="mt-6 text-xs font-medium uppercase tracking-wide text-foreground-subtle">
        Fiche partagée depuis El Profesor{bookRow ? ` — ${bookRow.title}` : ""}
      </p>
      <div className="mt-4">
        <FicheViewer title={fiche.title} summary={subEntity.summary} blocks={blocks} />
      </div>
    </div>
  );
}
