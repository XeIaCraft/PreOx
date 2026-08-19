"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteURL } from "@/lib/site-url";

export interface ActionState {
  error?: string;
  success?: string;
}

const loginSchema = z.object({
  email: z.email({ message: "Adresse e-mail invalide." }).trim(),
  password: z.string().min(1, { message: "Le mot de passe est requis." }),
});

export async function login(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Identifiants incorrects. Vérifiez votre e-mail et votre mot de passe." };
  }

  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/") ? next : "/apps");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

const emailSchema = z.email({ message: "Adresse e-mail invalide." });

export async function requestPasswordReset(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const parsed = emailSchema.safeParse(formData.get("email"));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Adresse e-mail invalide." };
  }

  const supabase = await createClient();
  const siteURL = await getSiteURL();

  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteURL}/auth/confirm?next=/set-password`,
  });

  if (error) {
    return { error: "Impossible d'envoyer l'e-mail de réinitialisation pour le moment." };
  }

  return {
    success: "Si un compte existe avec cette adresse, un e-mail de réinitialisation vient d'être envoyé.",
  };
}

const passwordSchema = z
  .string()
  .min(8, { message: "8 caractères minimum." })
  .regex(/[a-zA-Z]/, { message: "Au moins une lettre." })
  .regex(/[0-9]/, { message: "Au moins un chiffre." });

export async function updatePassword(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Mot de passe invalide." };
  }

  if (password !== confirmPassword) {
    return { error: "Les deux mots de passe ne correspondent pas." };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Votre lien a expiré. Demandez un nouveau lien de connexion." };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data });

  if (error) {
    return { error: "Impossible de mettre à jour le mot de passe." };
  }

  const next = formData.get("next");
  redirect(typeof next === "string" && next.startsWith("/") ? next : "/apps");
}
