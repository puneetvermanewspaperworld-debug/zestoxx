"use client";

import React from "react";
import { Eye, EyeOff } from "lucide-react";
import { usePrivacy } from "@/components/usePrivacy";

/**
 * The eye that hides the balance and profit and loss as **** and ***, wherever they are shown. The choice is remembered on this device and is the
 * same everywhere (see usePrivacy). A 44 px button.
 */
export default function PrivacyEye({ className = "" }: { className?: string }) {
  const { hidden, toggle } = usePrivacy();
  return (
    <button type="button" onClick={toggle} aria-pressed={hidden} aria-label={hidden ? "Show balance and profit and loss" : "Hide balance and profit and loss"} data-testid="privacy-eye" className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 " + className}>
      {hidden ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
    </button>
  );
}
