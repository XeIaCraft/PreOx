"use server";

import { setViewMode } from "@/app/actions/view-mode";
import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import type { ActionState } from "./library";

/** The dashboard's « Vue utilisateur » switch — the hub-wide view (src/lib/auth/view-mode.ts). */
export async function setElProfesorPreviewAsUser(previewAsUser: boolean): Promise<ActionState> {
  await requireElProfesorAccess();
  return setViewMode(previewAsUser ? "user" : "admin");
}
