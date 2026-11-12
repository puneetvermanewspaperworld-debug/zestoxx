import { NextResponse } from "next/server";

/**
 * Guard for the cron routes. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the variable is set. With no secret
 * configured the routes refuse to run (except in local development), so a preview or production deployment can never be
 * triggered by anyone who finds the URL. Returns the response to send when the caller is not allowed, else null.
 */
export function cronAuthError(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "development") return null;
    console.error("[cron] CRON_SECRET is not set; refusing to run");
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

/** Log a line from an ingest the way Vercel's function log expects. */
export function cronLog(tag: string) {
  return (level: "info" | "warn" | "error", message: string, data?: Record<string, unknown>) =>
    console[level === "info" ? "log" : level](`[${tag}] ${message}`, data ? JSON.stringify(data) : "");
}
