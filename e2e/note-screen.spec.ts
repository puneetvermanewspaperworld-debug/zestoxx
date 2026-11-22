import { test, expect } from "@playwright/test";
import { account, lastPut, openApp, openSheet, phone, typeKeepingFocus } from "./action-helpers";

/** A note on a symbol, as a full screen. */
test.use(phone());

test("Add notes opens a screen with the price strip, a counter and a hint; Save shows the saved state and the note is kept with the account", async ({ page }) => {
  const { puts } = await openApp(page);
  await openSheet(page, "RELIANCE");
  await page.getByTestId("sheet-notes").click();
  await expect(page).toHaveURL(/act=note&s=RELIANCE/);
  await expect(page.getByTestId("action-label")).toHaveText("Add note");
  await expect(page.getByTestId("strip-price")).toHaveText("₹1,500.00");
  await expect(page.getByTestId("paper-badge")).toBeVisible();
  await page.getByTestId("note-text").fill("Wait for 1,450");
  await expect(page.getByTestId("note-text-count")).toHaveText("14 / 500");
  await page.getByTestId("action-submit").click();
  await expect(page.getByTestId("note-saved")).toHaveText("Note saved in your paper account.");
  await expect(page.getByTestId("result-line")).toHaveText("Wait for 1,450");
  await expect.poll(() => lastPut(puts)?.notes).toEqual({ RELIANCE: "Wait for 1,450" });
  await page.getByTestId("action-done").click();
  await expect(page.getByTestId("saved-note")).toHaveText("Wait for 1,450"); // the sheet underneath shows it
  await expect(page.getByTestId("sheet-notes")).toHaveText("Edit notes");
});

test("a longer note goes in one character at a time with the field keeping focus", async ({ page }) => {
  await openApp(page);
  await openSheet(page, "RELIANCE");
  await page.getByTestId("sheet-notes").click();
  expect(await typeKeepingFocus(page, page.getByTestId("note-text"), "300 shares")).toBe("300 shares");
});

test("an empty note is refused when there is nothing to delete; over 500 characters is refused with the count", async ({ page }) => {
  await openApp(page);
  await openSheet(page, "RELIANCE");
  await page.getByTestId("sheet-notes").click();
  await page.getByTestId("action-submit").click();
  await expect(page.getByTestId("note-error")).toHaveText("Write a note to save it.");
  await page.getByTestId("note-text").fill("x".repeat(520));
  await expect(page.getByTestId("note-text-count")).toHaveText("520 / 500");
  await page.getByTestId("action-submit").click();
  await expect(page.getByTestId("note-error")).toHaveText("A note holds up to 500 characters. This one is 520.");
  await expect(page.getByTestId("note-saved")).toHaveCount(0);
});

test("editing a saved note shows it; clearing it warns and saving deletes it", async ({ page }) => {
  const { puts } = await openApp(page, "/app/watchlist", account({ notes: { RELIANCE: "old words" } }));
  await openSheet(page, "RELIANCE");
  await page.getByTestId("sheet-notes").click();
  await expect(page.getByTestId("action-label")).toHaveText("Edit note");
  await expect(page.getByTestId("note-text")).toHaveValue("old words");
  await page.getByTestId("note-text").fill("");
  await expect(page.getByTestId("note-delete-warning")).toBeVisible();
  await expect(page.getByTestId("action-submit")).toHaveText("Delete note · RELIANCE");
  await page.getByTestId("action-submit").click();
  await expect(page.getByTestId("note-saved")).toHaveText("Note deleted.");
  await expect.poll(() => lastPut(puts)?.notes ?? {}).toEqual({});
});

test("back closes it without saving, and the sheet is still open", async ({ page }) => {
  const { puts } = await openApp(page);
  await openSheet(page, "RELIANCE");
  await page.getByTestId("sheet-notes").click();
  await page.getByTestId("note-text").fill("not saved");
  await page.getByTestId("action-back").click();
  await expect(page.getByTestId("action-screen")).toHaveCount(0);
  await expect(page.getByTestId("symbol-sheet")).toBeVisible();
  await expect(page.getByTestId("saved-note")).toHaveCount(0);
  await page.waitForTimeout(1200);
  expect(lastPut(puts)?.notes ?? {}).toEqual({});
});
