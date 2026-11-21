import { NextResponse } from "next/server";
import { claimDemoData, claimSecretMatches, withGuest } from "@/lib/guest";

export const dynamic = "force-dynamic";

/**
 * POST /api/account/claim-demo — one time, to take the old shared demo user's data into the guest account of whoever calls it.
 *
 * Protected by DEMO_CLAIM_SECRET (an environment variable of at least 24 characters; unset means the route is off). Send it as
 * `Authorization: Bearer <secret>`, from the browser that should own the data, so its guest cookie is the one that gets the data:
 *
 *   fetch("/api/account/claim-demo", { method: "POST", headers: { authorization: "Bearer <secret>" } }).then(r => r.json())
 *
 * A guest that already has data is only overwritten with `{"replace": true}` in the body. After a claim the demo user is empty and marked
 * claimed, so a second call answers 410, and nothing serves the demo user to anyone.
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.DEMO_CLAIM_SECRET;
    if (!secret || secret.length < 24) return NextResponse.json({ error: "claiming is not enabled" }, { status: 404 });
    const auth = request.headers.get("authorization") ?? "";
    if (!claimSecretMatches(auth.startsWith("Bearer ") ? auth.slice(7) : null)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    let replace = false;
    try {
      replace = (await request.json())?.replace === true;
    } catch {
      // no body: replace stays false
    }
    return await withGuest(request, async (user) => {
      const result = await claimDemoData(user.id, { replace });
      const status = { claimed: 200, no_demo_user: 404, already_claimed: 410, guest_has_data: 409 }[result];
      return NextResponse.json({ result }, { status });
    });
  } catch (err) {
    console.error("[/api/account/claim-demo] failed:", err);
    return NextResponse.json({ error: "claim failed" }, { status: 500 });
  }
}
