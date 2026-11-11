import { defineConfig } from "@playwright/test";

/**
 * Phone checks (npm run test:mobile). Needs a production build first: `npm run build`.
 * By default it starts `next start` on port 3100 (or reuses one that's running); point E2E_BASE_URL at a
 * preview deployment to test that instead. Uses your installed Chrome — no browser download.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100", channel: "chrome", headless: true },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npx next start -p 3100", url: "http://localhost:3100", reuseExistingServer: true, timeout: 120_000 },
});
