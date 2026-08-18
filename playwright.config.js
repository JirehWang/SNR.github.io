const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:8010",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "python scripts/prepare_e2e_db.py --source data/rlab_reservation.db --target data/e2e.db --input tests/fixtures/equipment-floorplan-placements.json && python -m app.server --host 127.0.0.1 --port 8010 --db data/e2e.db",
    url: "http://127.0.0.1:8010",
    reuseExistingServer: false,
  },
});
