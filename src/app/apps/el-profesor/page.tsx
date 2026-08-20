import { getCurrentProfile } from "@/lib/auth/dal";
import {
  getLibrary,
  getDueCountsByChapter,
  getNeedsReviewCounts,
  getMasteryCountsByChapter,
  getElProfesorGeminiModel,
  getGlobalDueQueue,
  getDifficultQueue,
  getReviewActivitySummary,
  getDailyCard,
  getBookmarkedEntities,
} from "@/lib/el-profesor/dal";
import { ElProfesorBoard } from "@/components/el-profesor/board";
import { ToastProvider } from "@/components/ui/toast";

export default async function ElProfesorPage() {
  const profile = (await getCurrentProfile())!;
  const isAdmin = profile.role === "admin";
  const rawBooks = await getLibrary();
  // Non-admins never see a chapter still being imported/reviewed — only
  // admins need visibility into the pipeline's in-progress state.
  const books = isAdmin ? rawBooks : rawBooks.map((b) => ({ ...b, chapters: b.chapters.filter((c) => c.status === "published") }));
  const allChapters = books.flatMap((b) => b.chapters);
  const [dueCounts, needsReviewCounts, masteryCounts, geminiModel, globalDue, difficult, activity, dailyCard, bookmarks] =
    await Promise.all([
      getDueCountsByChapter(profile.id, allChapters),
      isAdmin ? getNeedsReviewCounts(allChapters.map((c) => c.id)) : Promise.resolve({}),
      getMasteryCountsByChapter(profile.id, allChapters),
      isAdmin ? getElProfesorGeminiModel() : Promise.resolve(null),
      getGlobalDueQueue(profile.id, allChapters),
      getDifficultQueue(profile.id, allChapters),
      getReviewActivitySummary(profile.id),
      getDailyCard(profile.id, allChapters),
      getBookmarkedEntities(profile.id),
    ]);

  return (
    <ToastProvider>
      <ElProfesorBoard
        books={books}
        dueCounts={dueCounts}
        needsReviewCounts={needsReviewCounts}
        masteryCounts={masteryCounts}
        isAdmin={isAdmin}
        geminiModel={geminiModel}
        globalDueCount={globalDue.length}
        difficultCount={difficult.length}
        activity={activity}
        dailyCard={dailyCard}
        bookmarks={bookmarks}
      />
    </ToastProvider>
  );
}
