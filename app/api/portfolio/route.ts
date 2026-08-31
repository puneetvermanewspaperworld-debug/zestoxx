import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { loadPortfolio, savePortfolio, type PortfolioBlob } from "@/lib/portfolio";

// Reads/writes the database on every call — never prerender or cache.
export const dynamic = "force-dynamic";

/** GET /api/portfolio -> PortfolioBlob | null (null = nothing saved yet) */
export async function GET() {
  try {
    const user = await getCurrentUser();
    const blob = await loadPortfolio(user.id);
    return NextResponse.json(blob);
  } catch (err) {
    console.error("[/api/portfolio] GET failed:", err);
    return NextResponse.json({ error: "load failed" }, { status: 500 });
  }
}

/** PUT /api/portfolio  body: PortfolioBlob -> { ok: true } */
export async function PUT(request: Request) {
  try {
    const blob = (await request.json()) as PortfolioBlob;
    if (!blob || typeof blob !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    const user = await getCurrentUser();
    await savePortfolio(user.id, blob);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/portfolio] PUT failed:", err);
    return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
}
