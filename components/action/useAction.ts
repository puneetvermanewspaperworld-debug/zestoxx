"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ACTION_KEYS, actionToParams, paramsToAction, type ActionSpec } from "@/lib/actions";

/** true once this tab has opened an action itself, so closing can go back instead of leaving the app (a reload or a shared address has nothing to go back to) */
let openedHere = false;

/**
 * Open an action screen. This one does not read the address (it takes it from the window when called), so a component that is also drawn on the
 * server, such as a tab the desktop shares, can use it: reading the address with useSearchParams would make the whole page dynamic.
 */
export function useActionOpener() {
  const router = useRouter();
  return useCallback(
    (a: ActionSpec) => {
      const p = new URLSearchParams(window.location.search);
      ACTION_KEYS.forEach((k) => p.delete(k));
      actionToParams(a).forEach((v, k) => p.set(k, v));
      openedHere = true;
      router.push(`${window.location.pathname}?${p.toString()}`);
    },
    [router]
  );
}

/** Open and close the phone's action screens, and read which one is open. */
export function useAction() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = useMemo(() => paramsToAction(new URLSearchParams(params.toString())), [params]);

  const withoutAction = useCallback(() => {
    const p = new URLSearchParams(params.toString());
    ACTION_KEYS.forEach((k) => p.delete(k));
    const q = p.toString();
    return q ? `${pathname}?${q}` : pathname;
  }, [params, pathname]);

  const openAction = useActionOpener();

  /** back to the page underneath (its state was never lost) */
  const closeAction = useCallback(() => {
    if (openedHere) {
      openedHere = false;
      router.back();
    } else router.replace(withoutAction());
  }, [router, withoutAction]);

  /** leave the action for another page (the result's link to Orders): the action's history entry is replaced, so back goes to the page it was opened over */
  const leaveTo = useCallback(
    (href: string) => {
      openedHere = false;
      router.replace(href);
    },
    [router]
  );

  return { current, openAction, closeAction, leaveTo };
}
