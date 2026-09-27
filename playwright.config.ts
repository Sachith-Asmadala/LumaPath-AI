import { defineConfig, devices } from "@playwright/test";

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: externalBaseURL ?? "http://127.0.0.1:3001",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: externalBaseURL ? undefined : {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3001",
    url: "http://127.0.0.1:3001/overview",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
