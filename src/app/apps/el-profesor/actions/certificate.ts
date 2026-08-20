"use server";

import { requireElProfesorAccess, getBookCertificateStats, type BookCertificateStats } from "@/lib/el-profesor/dal";
import { createClient } from "@/lib/supabase/server";

export async function getCertificateStatsForBook(bookId: string): Promise<BookCertificateStats> {
  const profile = await requireElProfesorAccess();
  const supabase = await createClient();
  const { data: chapters } = await supabase.from("el_profesor_chapters").select("id, status").eq("book_id", bookId);
  return getBookCertificateStats(profile.id, chapters ?? []);
}
