import { NextResponse } from "next/server";
import { resetGuestAccount, withGuest } from "@/lib/guest";

export const dynamic = "force-dynamic";

/** POST /api/account/reset -> { ok: true }. Puts the requesting guest's paper account back to the starting balance with nothing else. */
export async function POST(request: Request) {
  try {
    // no cookie, no account to reset (and none is made here)
    return await withGuest(
      request,
      async (user) => {
        await resetGuestAccount(user.id);
        return NextResponse.json({ ok: true });
      },
      { create: false }
    );
  } catch (err) {
    console.error("[/api/account/reset] failed:", err);
    return NextResponse.json({ error: "reset failed" }, { status: 500 });
  }
}
