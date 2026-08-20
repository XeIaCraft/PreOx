"use server";

import { requireProfile } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function submitFeedback(message: string, pageUrl: string): Promise<ActionState> {
  const profile = await requireProfile();
  const trimmed = message.trim();
  if (!trimmed) return { error: "Décrivez le problème ou votre retour." };

  const supabase = await createClient();
  const { error } = await supabase.from("feedback_reports").insert({ user_id: profile.id, message: trimmed, page_url: pageUrl || null });
  if (error) return { error: "Impossible d'envoyer votre message." };

  return { success: "Merci, votre message a été transmis." };
}
