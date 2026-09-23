import { notFound } from "next/navigation";
import { requireElProfesorAccess, getReadingPosition } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveIsAdmin } from "@/lib/el-profesor/preview-mode";
import { getElProfesorChapterContentBatch } from "@/app/apps/el-profesor/actions/offline-sync";
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

  const supabase = await createClient();
  const { data: chapter } = await supabase.from("el_profesor_chapters").select("id, status").eq("id", chapterId).single();
  if (!chapter || chapter.status !== "published") notFound();

  // getElProfesorChapterContentBatch (actions/offline-sync.ts) is the same
  // function the "Synchroniser" local-cache sync uses for every chapter at
  // once — reused here for this one chapter so the live path and the cached
  // path never compute this differently. It also resolves chapterTitle/
  // sourceKind/sourceText, so no separate `select("*")` is needed above.
  const [contentByChapter, readingPosition] = await Promise.all([
    getElProfesorChapterContentBatch([chapterId]),
    entity ? Promise.resolve(null) : getReadingPosition(profile.id),
  ]);
  const snapshot = contentByChapter[chapterId];
  if (!snapshot) notFound();

  // Server-side cross-device resume: only applies when there's no explicit
  // deep link and the saved position was in this same chapter — the client
  // still falls back to its own localStorage cache before this value loads.
  const resumeEntityId = readingPosition?.chapterId === chapterId ? (readingPosition.subEntityId ?? undefined) : undefined;

  return (
    <ToastProvider>
      <ChapterViewWithLocalCache chapterId={chapterId} initialEntityId={entity ?? resumeEntityId} isAdmin={isAdmin} initialSnapshot={snapshot} />
    </ToastProvider>
  );
}
