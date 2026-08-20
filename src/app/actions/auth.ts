"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSiteURL } from "@/lib/site-url";
import { sendEmail } from "@/lib/email";

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
  const { data: signInData, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Identifiants incorrects. Vérifiez votre e-mail et votre mot de passe." };
  }

  await logLoginAndAlertIfNewDevice(signInData.user.id, signInData.user.email ?? parsed.data.email);

  const next = formData.get("next");

  // 2FA is opt-in — signInWithPassword alone only ever reaches aal1. A user
  // with a verified TOTP factor still has to clear /mfa-challenge before
  // requireUser() (src/lib/auth/dal.ts) will let them past any page, but
  // sending them there immediately (rather than to /apps and bouncing back)
  // avoids a pointless extra redirect.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    redirect("/mfa-challenge");
  }

  redirect(typeof next === "string" && next.startsWith("/") ? next : "/apps");
}

/** Records this login in user_login_log and, if this device/browser was never seen before for this user, emails a heads-up. Never throws — a broken alert must not block sign-in. */
async function logLoginAndAlertIfNewDevice(userId: string, email: string): Promise<void> {
  try {
    const supabase = await createClient();
    const headerList = await headers();
    const userAgent = headerList.get("user-agent");
    const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

    const { data: seenBefore } = await supabase
      .from("user_login_log")
      .select("id")
      .eq("user_id", userId)
      .eq("user_agent", userAgent ?? "")
      .limit(1)
      .maybeSingle();

    const { count } = await supabase.from("user_login_log").select("id", { count: "exact", head: true }).eq("user_id", userId);
    const isFirstLoginEver = (count ?? 0) === 0;

    await supabase.from("user_login_log").insert({ user_id: userId, user_agent: userAgent, ip });

    if (!seenBefore && !isFirstLoginEver) {
      await sendEmail({
        to: email,
        subject: "Nouvelle connexion à votre compte PreOx",
        html: `<p>Une connexion vient d'avoir lieu sur votre compte PreOx depuis un appareil ou navigateur non reconnu.</p>
<p><strong>Appareil :</strong> ${userAgent ?? "inconnu"}<br><strong>Date :</strong> ${new Date().toLocaleString("fr-FR")}</p>
<p>Si c'était vous, aucune action n'est requise. Sinon, changez votre mot de passe immédiatement depuis votre profil.</p>`,
      });
    }
  } catch (err) {
    console.error("logLoginAndAlertIfNewDevice failed:", err);
  }
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

// No expiration policy (by design — forced periodic rotation is no longer
// considered good practice), but classic strength criteria on creation.
const passwordSchema = z
  .string()
  .min(10, { message: "10 caractères minimum." })
  .regex(/[a-z]/, { message: "Au moins une minuscule." })
  .regex(/[A-Z]/, { message: "Au moins une majuscule." })
  .regex(/[0-9]/, { message: "Au moins un chiffre." })
  .regex(/[^a-zA-Z0-9]/, { message: "Au moins un caractère spécial." });

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
