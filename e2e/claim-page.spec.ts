import { test, expect } from "@playwright/test";
import { hydrated } from "./hydrate";

/**
 * The /claim page. It exists only while DEMO_CLAIM_SECRET is set on the server (a server component reads it at request time), so these tests
 * run in two modes: with the variable set in the environment the tests are started from (the form, with the API mocked), and without it (the
 * page says claiming is off and has no form). The claim route itself is covered in lib/guest.test.ts.
 */
test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
const SET = (process.env.DEMO_CLAIM_SECRET ?? "").length >= 24;
const PASSWORD = "my-claim-password-1234567890";

test.describe("with the secret set", () => {
  test.skip(!SET, "needs DEMO_CLAIM_SECRET in the environment");

  test("a password field and one button, 44 px, no sideways scroll; the secret goes in a header, never in an address", async ({ page }) => {
    const seen: { url: string; auth: string | undefined; body: string | null; referrer: string | undefined }[] = [];
    await page.route("**/api/account/claim-demo", (r) => {
      const q = r.request();
      seen.push({ url: q.url(), auth: q.headers()["authorization"], body: q.postData(), referrer: q.headers()["referer"] });
      return r.fulfill({ json: { result: "claimed" } });
    });
    await page.goto("/claim", { waitUntil: "domcontentloaded" });
    const field = page.getByTestId("claim-secret");
    await expect(field).toHaveAttribute("type", "password");
    await expect(field).toHaveAttribute("autocomplete", "off");
    for (const id of ["claim-secret", "claim-submit"]) expect((await page.getByTestId(id).boundingBox())!.height, id).toBeGreaterThanOrEqual(43.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.getByTestId("claim-submit")).toBeDisabled(); // nothing typed yet
    await hydrated(field);
    await field.fill(PASSWORD);
    await page.getByTestId("claim-submit").click();
    await expect(page.getByTestId("claim-success")).toContainText("Done");
    expect(seen).toHaveLength(1);
    expect(seen[0].auth).toBe(`Bearer ${PASSWORD}`);
    expect(seen[0].url).not.toContain(PASSWORD);
    expect(seen[0].url).not.toContain("?");
    expect(seen[0].body ?? "").not.toContain(PASSWORD);
    expect(page.url()).not.toContain(PASSWORD);
    expect(page.url()).not.toContain("?");
    // cleared after success, and nothing is kept in the browser
    await expect(field).toHaveValue("");
    const stored = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage }, c: document.cookie }));
    expect(stored).not.toContain(PASSWORD);
  });

  for (const [status, text] of [
    [401, "not right"],
    [404, "not available"],
    [410, "already claimed"],
    [429, "Too many"],
    [503, "cannot save"],
    [500, "code 500"],
  ] as const) {
    test(`a ${status} answer is explained, in words`, async ({ page }) => {
      await page.route("**/api/account/claim-demo", (r) => r.fulfill({ status, json: { error: "x" } }));
      await page.goto("/claim", { waitUntil: "domcontentloaded" });
      await hydrated(page.getByTestId("claim-secret"));
      await page.getByTestId("claim-secret").fill(PASSWORD);
      await page.getByTestId("claim-submit").click();
      await expect(page.getByTestId("claim-error")).toContainText(text);
      await expect(page.getByTestId("claim-success")).toHaveCount(0);
      await expect(page.getByTestId("claim-submit")).toBeEnabled();
    });
  }

  test("a browser whose account already has data is asked before it is replaced", async ({ page }) => {
    const bodies: string[] = [];
    await page.route("**/api/account/claim-demo", (r) => {
      const body = r.request().postData() ?? "";
      bodies.push(body);
      return JSON.parse(body).replace === true ? r.fulfill({ json: { result: "claimed" } }) : r.fulfill({ status: 409, json: { result: "guest_has_data" } });
    });
    await page.goto("/claim", { waitUntil: "domcontentloaded" });
    await hydrated(page.getByTestId("claim-secret"));
    await page.getByTestId("claim-secret").fill(PASSWORD);
    await expect(page.getByTestId("claim-replace")).toHaveCount(0);
    await page.getByTestId("claim-submit").click();
    await expect(page.getByTestId("claim-error")).toContainText("would replace it");
    expect((await page.getByTestId("claim-replace").boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
    await page.getByTestId("claim-replace").check();
    await page.getByTestId("claim-submit").click();
    await expect(page.getByTestId("claim-success")).toBeVisible();
    expect(bodies.map((b) => JSON.parse(b).replace)).toEqual([false, true]);
  });

  test("a network failure is reported, not swallowed", async ({ page }) => {
    await page.route("**/api/account/claim-demo", (r) => r.abort());
    await page.goto("/claim", { waitUntil: "domcontentloaded" });
    await hydrated(page.getByTestId("claim-secret"));
    await page.getByTestId("claim-secret").fill(PASSWORD);
    await page.getByTestId("claim-submit").click();
    await expect(page.getByTestId("claim-error")).toContainText("Could not reach the server");
  });
});

test.describe("without the secret", () => {
  test.skip(SET, "needs DEMO_CLAIM_SECRET to be unset");
  test("the page says claiming is off and has no form", async ({ page }) => {
    await page.goto("/claim", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("claim-off")).toContainText("not turned on");
    await expect(page.getByTestId("claim-form")).toHaveCount(0);
    await expect(page.getByTestId("claim-secret")).toHaveCount(0);
  });
});
