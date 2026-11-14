import type { Locator } from "@playwright/test";

/**
 * Wait until React has hydrated an element of a server-rendered page. A click on it before that is lost (the page is visible and the button
 * looks ready, but nothing is listening yet), which on a busy machine made tests that tap straight after the page loads fail now and then.
 * React puts its props on a DOM node as it hydrates it (a property whose name starts with __reactProps), so that is what is waited for.
 */
export async function hydrated(el: Locator): Promise<void> {
  await el.waitFor({ state: "visible" });
  await el.evaluate(
    (node) =>
      new Promise<void>((resolve) => {
        const check = () => (Object.keys(node).some((k) => k.startsWith("__reactProps")) ? resolve() : setTimeout(check, 50));
        check();
      })
  );
}
