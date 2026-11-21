import { NextResponse } from "next/server";
import { withGuest } from "@/lib/guest";
import { loadPortfolio, savePortfolio, MAX_BODY_BYTES, type PortfolioBlob } from "@/lib/portfolio";

// Reads/writes the database on every call — never prerender or cache.
export const dynamic = "force-dynamic";

/** GET /api/portfolio -> PortfolioBlob | null (null = nothing saved yet). The guest's own, from the cookie. */
export async function GET(request: Request) {
  try {
    return await withGuest(request, async (user) => NextResponse.json(await loadPortfolio(user.id)));
  } catch (err) {
    console.error("[/api/portfolio] GET failed:", err);
    return NextResponse.json({ error: "load failed" }, { status: 500 });
  }
}

/** PUT /api/portfolio  body: PortfolioBlob -> { ok: true }. Writes the guest's own account only. */
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
