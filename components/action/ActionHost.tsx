"use client";

import { useScreenMode } from "@/lib/useScreenMode";
import { useAction } from "./useAction";

/**
 * Draws the action screen named by the address, over whatever page is open, on a phone. (A wide screen keeps the forms it has always had.)
 * Each kind of screen is added here as it is built.
 */
export default function ActionHost() {
  const mode = useScreenMode();
  const { current } = useAction();
  if (mode === "wide" || !current) return null;
  return null;
}
