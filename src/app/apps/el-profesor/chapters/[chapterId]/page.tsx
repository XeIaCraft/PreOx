import { notFound } from "next/navigation";
import { requireElProfesorAccess, getChapterContent, getBookmarkedSubEntityIds, getReadingPosition, getBlockReviewStates } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveIsAdmin } from "@/lib/el-profesor/preview-mode";
import { ChapterView } from "@/components/el-profesor/chapter-view";
import { ToastProvider } from "@/components/ui/toast";

export default async function ChapterPage({
  params,
  searchParams,
}: {
  params: Promise<{ chapterId: string }>;
  searchParams: Promise<{ entity?: string }>;
}) {
  const profile = await requireElProfesorAccess();
  const { chapterId } = await params;
  const { entity } = await searchParams;
  const { effectiveIsAdmin: isAdmin } = await getEffectiveIsAdmin(profile.role === "admin");

  const supabase = await createClient();
  const { data: chapter } = await supabase.from("el_profesor_chapters").select("*").eq("id", chapterId).single();
  if (!chapter || chapter.status !== "published") notFound();

  const [subEntities, bookmarkedIds, readingPosition] = await Promise.all([
    getChapterContent(chapterId, false),
    getBookmarkedSubEntityIds(profile.id),
    entity ? Promise.resolve(null) : getReadingPosition(profile.id),
  ]);

  const blockIds = subEntities.flatMap((s) => s.fiche?.blocks.map((b) => b.id) ?? []);
  const blockReviewStates = await getBlockReviewStates(profile.id, blockIds);

  // Server-side cross-device resume: only applies when there's no explicit
  // deep link and the saved position was in this same chapter — the client
  // still falls back to its own localStorage cache before this value loads.
  const resumeEntityId = readingPosition?.chapterId === chapterId ? (readingPosition.subEntityId ?? undefined) : undefined;

  return (
    <ToastProvider>
      <ChapterView
        chapterId={chapterId}
        chapterTitle={chapter.title}
        subEntities={subEntities}
        initialEntityId={entity ?? resumeEntityId}
        bookmarkedIds={[...bookmarkedIds]}
        sourceKind={chapter.source_kind}
        sourceText={chapter.source_text}
        blockReviewStates={blockReviewStates}
        isAdmin={isAdmin}
      />
    </ToastProvider>
  );
}
