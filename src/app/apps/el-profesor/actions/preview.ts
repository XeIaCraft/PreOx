"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireElProfesorAccess } from "@/lib/el-profesor/dal";
import { PREVIEW_COOKIE } from "@/lib/el-profesor/preview-mode";
import type { ActionState } from "./library";

/** Only a real admin can set (or clear) the preview cookie — see preview-mode.ts. */
export async function setElProfesorPreviewAsUser(previewAsUser: boolean): Promise<ActionState> {
  const profile = await requireElProfesorAccess();
  if (profile.role !== "admin") {
    return { error: "Réservé aux administrateurs." };
  }

  const store = await cookies();
  if (previewAsUser) {
    store.set(PREVIEW_COOKIE, "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  } else {
    store.delete(PREVIEW_COOKIE);
  }

  revalidatePath("/apps/el-profesor", "layout");
  return {};
}
