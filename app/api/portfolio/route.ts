import { NextResponse } from "next/server";
import { withGuest } from "@/lib/guest";
import { loadPortfolio, savePortfolio, MAX_BODY_BYTES, type PortfolioBlob } from "@/lib/portfolio";

// Reads/writes the database on every call — never prerender or cache.
export const dynamic = "force-dynamic";

/**
 * GET /api/portfolio -> PortfolioBlob | null (null = nothing saved yet, the default fresh account). The guest's own, from the cookie.
 * Reading never makes an account: a visitor with no cookie (a crawler, a bot, someone just looking) gets null and nothing is stored. The
 * guest account is made by the first write (PUT below, the claim route), which is also when the cookie is set.
 */
export async function GET(request: Request) {
  try {
    return await withGuest(request, async (user) => NextResponse.json(await loadPortfolio(user.id)), { create: false });
  } catch (err) {
    console.error("[/api/portfolio] GET failed:", err);
    return NextResponse.json({ error: "load failed" }, { status: 500 });
  }
}

/** PUT /api/portfolio  body: PortfolioBlob -> { ok: true }. Writes the guest's own account only, making it (and the cookie) on the first write. */
export async function PUT(request: Request) {
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return NextResponse.json({ error: "body too large" }, { status: 413 });
    let blob: PortfolioBlob;
    try {
      blob = JSON.parse(text) as PortfolioBlob;
    } catch {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!blob || typeof blob !== "object" || Array.isArray(blob)) return NextResponse.json({ error: "invalid body" }, { status: 400 });
    return await withGuest(request, async (user) => {
      await savePortfolio(user.id, blob);
      return NextResponse.json({ ok: true });
    });
  } catch (err) {
    console.error("[/api/portfolio] PUT failed:", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
