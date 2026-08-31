import React from "react";

type Tone = "muted" | "up" | "down" | "gold";

export default function Chip({
  tone = "muted",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const tones: Record<Tone, string> = {
    muted: "bg-blue-50 text-slate-500",
    up: "bg-emerald-50 text-emerald-500",
    down: "bg-rose-50 text-rose-500",
    gold: "bg-amber-50 text-blue-600",
  };
  return (
    <span className={"rounded px-1.5 py-0.5 text-[10.5px] font-medium " + tones[tone]}>
      {children}
    </span>
  );
}
