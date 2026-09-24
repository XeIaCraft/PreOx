import { notFound } from "next/navigation";
import { requireElProfesorAccess, getReadingPosition } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveIsAdmin } from "@/lib/el-profesor/preview-mode";
import { getElProfesorChapterContentBatch } from "@/lib/el-profesor/sync-data";
import { ChapterViewWithLocalCache } from "@/components/el-profesor/chapter-view-with-local-cache";
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

  // Both cheap, single indexed lookups — kept awaited, they were never the
  // slow part. getElProfesorChapterContentBatch is the expensive one (the
  // full sub_entities/fiches/blocks/flashcards join): deliberately NOT
  // awaited below, for the same reason as page.tsx's dashboard snapshot —
  // awaiting it here blocks the whole page on every navigation, leaving the
  // local cache no chance to ever render first.
  const supabase = await createClient();
  const [{ data: chapter }, readingPosition] = await Promise.all([
    supabase.from("el_profesor_chapters").select("id, status").eq("id", chapterId).single(),
    entity ? Promise.resolve(null) : getReadingPosition(profile.id),
  ]);
  if (!chapter || chapter.status !== "published") notFound();

  // getElProfesorChapterContentBatch (lib/el-profesor/sync-data.ts) is the same
  // function the "Synchroniser" local-cache sync uses for every chapter at
  // once — reused here for this one chapter so the live path and the cached
  // path never compute this differently. It also resolves chapterTitle/
  // sourceKind/sourceText, so no separate `select("*")` is needed above.
  const contentPromise = getElProfesorChapterContentBatch([chapterId]).then((byChapter) => byChapter[chapterId] ?? null);

  // Server-side cross-device resume: only applies when there's no explicit
  // deep link and the saved position was in this same chapter — the client
  // still falls back to its own localStorage cache before this value loads.
  const resumeEntityId = readingPosition?.chapterId === chapterId ? (readingPosition.subEntityId ?? undefined) : undefined;

  return (
    <ToastProvider>
      <ChapterViewWithLocalCache
        key={chapterId}
        chapterId={chapterId}
        initialEntityId={entity ?? resumeEntityId}
        isAdmin={isAdmin}
        contentPromise={contentPromise}
      />
    </ToastProvider>
  );
}
