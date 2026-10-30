import React from "react";
import Link from "next/link";

/**
 * Soft call-to-action shown under an empty state — "nothing here yet, here's how to start".
 * Pass `href` for a link or `onClick` for an in-page action.
 */
export default function PromoCard({
  title,
  body,
  cta,
  href,
  onClick,
}: {
  title: string;
  body: string;
  cta: string;
  href?: string;
  onClick?: () => void;
}) {
  const button =
    "shrink-0 rounded-md bg-blue-600 px-3.5 py-2 text-[12.5px] font-semibold text-white hover:opacity-90";
  return (
    <div className="mx-auto mt-4 flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4">
      <div className="min-w-[200px] flex-1">
        <div className="font-display text-[13.5px] font-semibold text-slate-900">{title}</div>
        <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{body}</p>
      </div>
      {href ? (
        <Link href={href} className={button}>
          {cta}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={button}>
          {cta}
        </button>
      )}
    </div>
  );
}
