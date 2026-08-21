"use server";

import { requireElProfesorAccess, getRelatedFiches } from "@/lib/el-profesor/dal";
import type { NotionLinkedFiche } from "@/lib/el-profesor/types";

/** Other published fiches sharing a notion with this one — inline cross-links on the fiche itself. */
export async function getFicheRelatedLinks(ficheId: string): Promise<NotionLinkedFiche[]> {
  await requireElProfesorAccess();
  return getRelatedFiches(ficheId);
}
