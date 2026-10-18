import { NextResponse } from "next/server";
import { processMergeJobs } from "@/lib/el-profesor/merge/pipeline";

export const maxDuration = 300;

/**
 * Works through the book fusions in progress (see lib/el-profesor/merge/
 * pipeline.ts). Called every minute by pg_cron while a fusion is active
 * (migration 098), once a day by Vercel's own cron as a fallback, and right
 * after a fusion is launched.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await processMergeJobs({ budgetMs: 280_000, startBeforeMs: 150_000 });
  return NextResponse.json(result);
}
