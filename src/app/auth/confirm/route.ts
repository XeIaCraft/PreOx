import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for every Supabase auth email link: invite, magic link,
 * and password recovery. Verifies the token, establishes a session, then
 * routes the user to the right next step.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/apps";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      if (type === "invite" || type === "recovery") {
        redirect(`/set-password?next=${encodeURIComponent(next)}`);
      }
      redirect(next);
    }
  }

  redirect("/login?error=invalid_link");
}
