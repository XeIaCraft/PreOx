import { requireElProfesorAdmin, getLibrary, getBookQualityDashboard, getOrphanedChapterPdfs } from "@/lib/el-profesor/dal";
import { QualityDashboardView } from "@/components/el-profesor/quality-dashboard-view";
import { DalLoadError } from "@/components/el-profesor/dal-load-error";
import { ToastProvider } from "@/components/ui/toast";

// getBookQualityDashboard aggregates across every chapter/sub-entity/fiche/
// block of a book (up to ~70 chapters for the largest book in the library) —
// genuinely heavy for a big book, and this page had no maxDuration set at
// all (piste 2026-09-24 — suite au retour "le tableau de bord qualité ne
// marche plus, ça charge et s'ouvre jamais"), meaning it ran under whatever
// short platform default applies and could get killed mid-query with no
// error shown to the user at all — just an indefinite spinner followed by a
// blank failure. Raised explicitly, same pattern as the other heavy pages
// in this module (el-profesor/page.tsx, notions/[notionId]/page.tsx).
export const maxDuration = 60;

// Bounded well under maxDuration so a genuinely stuck query produces this
// page's own clear error message instead of the platform's opaque 504.
const QUALITY_FETCH_TIMEOUT_MS = 45_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} : délai dépassé (${Math.round(ms / 1000)} s).`)), ms)),
  ]);
}

async function loadQualityData(bookId: string | undefined) {
  const books = await getLibrary();
  const booksWithPublished = books.filter((b) => b.chapters.some((c) => c.status === "published"));
  const selectedBookId = bookId && booksWithPublished.some((b) => b.id === bookId) ? bookId : (booksWithPublished[0]?.id ?? null);

  const [dashboard, orphanedPdfs] = await Promise.all([
    selectedBookId ? withTimeout(getBookQualityDashboard(selectedBookId), QUALITY_FETCH_TIMEOUT_MS, "Statistiques qualité") : Promise.resolve(null),
    withTimeout(getOrphanedChapterPdfs(), QUALITY_FETCH_TIMEOUT_MS, "PDF orphelins"),
  ]);

  return { booksWithPublished, selectedBookId, dashboard, orphanedPdfs };
}

// JSX must stay outside the try (react-hooks/error-boundaries) — React
// defers rendering, so wrapping a <Component/> construction itself in
// try/catch never actually catches that component's own render errors, only
// genuinely synchronous-to-this-await-chain errors, i.e. the data fetch
// above it — which is exactly what this guards. Same pattern as the
// journal/notions pages elsewhere in this module.
export default async function QualityPage({ searchParams }: { searchParams: Promise<{ book?: string }> }) {
  await requireElProfesorAdmin();
  const { book: bookId } = await searchParams;

  let data: Awaited<ReturnType<typeof loadQualityData>> | null = null;
  let loadError: unknown = null;
  try {
    data = await loadQualityData(bookId);
  } catch (error) {
    loadError = error;
  }

  if (!data) return <DalLoadError title="Tableau de bord qualité" error={loadError} />;
  return (
    <ToastProvider>
      <QualityDashboardView
        books={data.booksWithPublished.map((b) => ({ id: b.id, title: b.title }))}
        selectedBookId={data.selectedBookId}
        dashboard={data.dashboard}
        orphanedPdfs={data.orphanedPdfs}
      />
    </ToastProvider>
  );
}
