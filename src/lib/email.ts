import "server-only";

import { Resend } from "resend";

/**
 * Best-effort transactional email (currently just the new-device login
 * alert). Requires RESEND_API_KEY + RESEND_FROM_EMAIL — until those are
 * configured this silently no-ops rather than breaking the flow it's
 * called from (same "non-blocking integration" pattern as Pexels image
 * fetch elsewhere in the app).
 */
export async function sendEmail({
  to,
  subject,
  html,
  attachments,
}: {
  to: string;
  subject: string;
  html: string;
  /** Base64-encoded file content, as accepted by the Resend API. */
  attachments?: { filename: string; content: string }[];
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    console.warn("sendEmail: RESEND_API_KEY / RESEND_FROM_EMAIL not configured, skipping email:", subject);
    return;
  }

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({ from, to, subject, html, attachments });
  } catch (err) {
    console.error("sendEmail failed:", err);
  }
}
