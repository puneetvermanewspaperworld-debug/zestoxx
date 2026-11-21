import type { Metadata } from "next";
import ClaimForm from "./ClaimForm";

// The page depends on an environment variable at request time, so it is never prerendered.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Claim my data · Zestoxx", robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * /claim: for the owner, once, to attach the old shared demo data to this browser's guest account (see app/api/account/claim-demo). It is
 * there only while DEMO_CLAIM_SECRET is set; without it the page says claiming is off and has no form.
 */
export default function ClaimPage() {
  const enabled = (process.env.DEMO_CLAIM_SECRET ?? "").length >= 24;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-5 text-slate-900">
      <h1 className="font-display text-[20px] font-semibold">Claim my data</h1>
      {enabled ? (
        <ClaimForm />
      ) : (
        <p data-testid="claim-off" className="rounded-lg bg-slate-100 px-4 py-3 text-[14px] text-slate-600">
          Claiming is not turned on. It is only available while the claim secret is set on the server.
        </p>
      )}
    </main>
  );
}
