"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSiteURL } from "@/lib/site-url";
import { ICON_OPTIONS } from "@/lib/icon-map";

export interface ActionState {
  error?: string;
  success?: string;
}

/* ---------------------------- User management --------------------------- */

const inviteSchema = z.object({
  email: z.email({ message: "Adresse e-mail invalide." }),
  fullName: z.string().trim().min(1, { message: "Le nom est requis." }).max(120),
  role: z.enum(["admin", "user"]),
});

export async function inviteUser(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const { email, fullName, role } = parsed.data;
  const siteURL = await getSiteURL();
  const adminClient = createAdminClient();

  const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${siteURL}/auth/confirm?next=/set-password`,
  });

  if (error || !data.user) {
    const alreadyExists = error?.message?.toLowerCase().includes("already");
    return {
      error: alreadyExists
        ? "Un utilisateur avec cette adresse existe déjà."
        : "Impossible d'inviter cet utilisateur pour le moment.",
    };
  }

  if (role === "admin") {
    const supabase = await createClient();
    await supabase.from("profiles").update({ role: "admin" }).eq("id", data.user.id);
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { success: `Invitation envoyée à ${email}.` };
}

export async function updateUserRole(userId: string, role: "admin" | "user"): Promise<ActionState> {
  const admin = await requireAdmin();

  if (admin.id === userId && role !== "admin") {
    return { error: "Vous ne pouvez pas retirer votre propre rôle administrateur." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);

  if (error) {
    return { error: "Impossible de mettre à jour le rôle." };
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { success: "Rôle mis à jour." };
}

export async function updateUserName(userId: string, fullName: string): Promise<ActionState> {
  await requireAdmin();

  const parsed = z.string().trim().min(1).max(120).safeParse(fullName);
  if (!parsed.success) return { error: "Nom invalide." };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: parsed.data }).eq("id", userId);

  if (error) return { error: "Impossible de mettre à jour le nom." };

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  return { success: "Nom mis à jour." };
}

export async function setAppAccess(userId: string, appId: string, granted: boolean): Promise<ActionState> {
  const admin = await requireAdmin();
  const supabase = await createClient();

  if (granted) {
    const { error } = await supabase
      .from("user_app_access")
      .upsert({ user_id: userId, app_id: appId, granted_by: admin.id });
    if (error) return { error: "Impossible d'attribuer l'accès à ce module." };
  } else {
    const { error } = await supabase
      .from("user_app_access")
      .delete()
      .eq("user_id", userId)
      .eq("app_id", appId);
    if (error) return { error: "Impossible de retirer l'accès à ce module." };
  }

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/apps");
  return { success: "Accès mis à jour." };
}

export async function deleteUser(userId: string): Promise<ActionState> {
  const admin = await requireAdmin();

  if (admin.id === userId) {
    return { error: "Vous ne pouvez pas supprimer votre propre compte." };
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(userId);

  if (error) {
    return { error: "Impossible de supprimer cet utilisateur." };
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { success: "Utilisateur supprimé." };
}

/* ---------------------------- Apps management ---------------------------- */

const appSchema = z.object({
  name: z.string().trim().min(1, { message: "Le nom est requis." }).max(80),
  slug: z
    .string()
    .trim()
    .min(1, { message: "Le slug est requis." })
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
      message: "Le slug ne peut contenir que des minuscules, chiffres et tirets.",
    }),
  description: z.string().trim().max(300).optional(),
  icon: z.enum(ICON_OPTIONS),
  status: z.enum(["available", "coming_soon"]),
  route: z.string().trim().max(200).optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  isActive: z.coerce.boolean(),
});

function parseAppForm(formData: FormData) {
  return appSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description") || undefined,
    icon: formData.get("icon"),
    status: formData.get("status"),
    route: formData.get("route") || undefined,
    sortOrder: formData.get("sortOrder") || 0,
    isActive: formData.get("isActive") === "on",
  });
}

export async function createApp(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();

  const parsed = parseAppForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("apps").insert({
    name: parsed.data.name,
    slug: parsed.data.slug,
    description: parsed.data.description || null,
    icon: parsed.data.icon,
    status: parsed.data.status,
    route: parsed.data.route || null,
    sort_order: parsed.data.sortOrder,
    is_active: parsed.data.isActive,
  });

  if (error) {
    return { error: error.code === "23505" ? "Ce slug est déjà utilisé." : "Impossible de créer le module." };
  }

  revalidatePath("/admin/apps");
  revalidatePath("/apps");
  return { success: "Module créé." };
}

export async function updateApp(
  appId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  await requireAdmin();

  const parsed = parseAppForm(formData);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("apps")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
      icon: parsed.data.icon,
      status: parsed.data.status,
      route: parsed.data.route || null,
      sort_order: parsed.data.sortOrder,
      is_active: parsed.data.isActive,
    })
    .eq("id", appId);

  if (error) {
    return { error: error.code === "23505" ? "Ce slug est déjà utilisé." : "Impossible de modifier le module." };
  }

  revalidatePath("/admin/apps");
  revalidatePath("/apps");
  return { success: "Module mis à jour." };
}

export async function toggleAppActive(appId: string, isActive: boolean): Promise<ActionState> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("apps").update({ is_active: isActive }).eq("id", appId);

  if (error) return { error: "Impossible de mettre à jour le module." };

  revalidatePath("/admin/apps");
  revalidatePath("/apps");
  return { success: "Module mis à jour." };
}

export async function deleteApp(appId: string): Promise<ActionState> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("apps").delete().eq("id", appId);

  if (error) return { error: "Impossible de supprimer ce module." };

  revalidatePath("/admin/apps");
  revalidatePath("/apps");
  return { success: "Module supprimé." };
}
