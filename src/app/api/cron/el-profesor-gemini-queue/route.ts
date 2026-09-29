import { NextResponse } from "next/server";
import { processGeminiQueue } from "@/lib/el-profesor/gemini-queue";

export const maxDuration = 300;

/**
 * Works through the server-side Gemini extraction queue (see
 * lib/el-profesor/gemini-queue.ts). Called every 5 minutes by pg_cron
 * (migration 092, only while something is waiting), once a day by Vercel's
 * own cron as a fallback, and right after « Mettre en file » — so the queue
 * keeps going with the window closed.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await processGeminiQueue({ budgetMs: 270_000, startBeforeMs: 150_000 });
  return NextResponse.json(result);
}
