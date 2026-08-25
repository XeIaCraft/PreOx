import { NextResponse } from "next/server";
import { pollAllClaudeBatches } from "@/lib/el-profesor/batch-poll";

export const maxDuration = 60;

/**
 * Polls every submitted Claude batch job and applies whatever finished —
 * the async half of the "gerer l'envoi et la réception de prompt sans que
 * l'admin soit devant l'ecran" request: submission (see actions/batches.ts)
 * only queues the batch, this cron route is what actually lands the
 * results, on its own schedule (see vercel.json — once daily on the Vercel
 * Hobby plan's cron limit). The same logic is also reachable on demand via
 * pollClaudeBatchesNow (actions/batches.ts), so an admin doesn't have to
 * wait for the next scheduled fire.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await pollAllClaudeBatches();
  return NextResponse.json(result);
}
