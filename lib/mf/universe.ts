import { visibleSchemes, type Scheme } from "./parse";

/** The pages say what they cover. */
export const COVERAGE_LABEL = "Direct plans, Growth option";

/** Below this many tracked schemes a NAV file is treated as broken (truncated, wrong page) and nothing is written. */
export const MIN_TRACKED_SCHEMES = 1000;

/** Direct plan, Growth option, open ended. Regular plans and dividend (IDCW) options are left out, and so are closed-ended and interval funds. */
export const isTracked = (s: Pick<Scheme, "plan" | "option" | "kind">): boolean => s.kind === "Open Ended" && s.plan === "Direct" && s.option === "Growth";

/** The schemes to store and show: tracked, fresh (NAV within 7 days) and not matured. */
export const trackedSchemes = (schemes: Scheme[], today: string): Scheme[] => visibleSchemes(schemes, today).filter(isTracked);
