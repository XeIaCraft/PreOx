"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/dal";

export interface ActionState {
  error?: string;
  success?: string;
}

export interface MfaFactor {
  id: string;
  status: "verified" | "unverified";
  createdAt: string;
}

/** TOTP factors only — this app doesn't offer phone/SMS MFA. */
export async function listMfaFactors(): Promise<MfaFactor[]> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return [];
  return data.totp.map((f) => ({ id: f.id, status: f.status, createdAt: f.created_at }));
}

export interface EnrollMfaResult extends ActionState {
  factorId?: string;
  qrCodeSvg?: string;
  secret?: string;
}

/** Starts TOTP enrollment: returns a scannable QR (Supabase hands back ready-made SVG) plus the raw secret for manual entry. The factor is "unverified" until confirmVerify below succeeds. */
export async function enrollMfa(): Promise<EnrollMfaResult> {
  await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error || !data) return { error: "Impossible de démarrer l'activation de la 2FA." };
  return { factorId: data.id, qrCodeSvg: data.totp.qr_code, secret: data.totp.secret };
}

/** Confirms enrollment with the 6-digit code from the authenticator app. */
export async function confirmMfaEnrollment(factorId: string, code: string): Promise<ActionState> {
  await requireUser();
  const supabase = await createClient();

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeError || !challenge) return { error: "Impossible de vérifier ce code." };

  const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() });
  if (verifyError) return { error: "Code incorrect. Vérifiez l'heure de votre téléphone et réessayez." };

  revalidatePath("/profile");
  return { success: "Authentification à deux facteurs activée." };
}

export async function unenrollMfa(factorId: string): Promise<ActionState> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { error: "Impossible de désactiver la 2FA." };

  revalidatePath("/profile");
  return { success: "Authentification à deux facteurs désactivée." };
}

/** Second step of login when the account has a verified TOTP factor: upgrades the session from aal1 to aal2. */
export async function verifyMfaChallenge(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const code = formData.get("code");
  if (typeof code !== "string" || !code.trim()) return { error: "Entrez le code à 6 chiffres." };

  const supabase = await createClient();
  const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (factorsError || !factor) return { error: "Aucun facteur de vérification actif." };

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (challengeError || !challenge) return { error: "Impossible de vérifier ce code." };

  const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: factor.id, challengeId: challenge.id, code: code.trim() });
  if (verifyError) return { error: "Code incorrect." };

  redirect("/apps");
}
