const { test, expect } = require("@playwright/test");
const { pathToFileURL } = require("url");
const path = require("path");

const prototypeUrl = pathToFileURL(
  path.resolve(__dirname, "../../prototypes/equipment-floorplan-ux.html"),
).href;

test.describe("equipment floorplan UX prototype", () => {
  test("selects chamber ch06, validates the 16-device overlay, and exports placements", async ({
    page,
  }) => {
    await page.goto(prototypeUrl);

    await expect(page.locator("#overlay .device")).toHaveCount(16);
    await expect(page.locator("[data-device-id='drop']")).toBeVisible();
    await expect(page.locator("[data-device-id='salt']")).toBeVisible();

    const chamber06 = page.locator("[data-device-id='ch06']");
    await expect(chamber06).toBeVisible();
    await chamber06.click();

    await expect(chamber06).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#selectedName")).toHaveValue("Chamber NO.6");
    await expect(page.locator("#selectedLocation")).toContainText("可靠度實驗室");
    await expect(page.locator("#selectedGeometry")).toContainText(/x:\s*\d+/i);

    const exportPlacements = page.locator("#exportPlacements");
    await expect(exportPlacements).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await exportPlacements.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("equipment-floorplan-placements.json");
  });

  test("adds a draft footprint, deactivates it, and restores it", async ({ page }) => {
    await page.goto(prototypeUrl);

    await page.locator("#addDevice").click();
    const draft = page.locator("#overlay .device[data-device-id^='draft-']");
    await expect(draft).toBeVisible();
    await expect(draft).toHaveAttribute("aria-pressed", "true");

    await page.locator("#deactivateDevice").click();
    await expect(draft).toHaveCount(0);
    await expect(page.locator("#inactiveCount")).toHaveText("1");

    await page.locator("#inactiveList button").first().click();
    await expect(page.locator("#overlay .device[data-device-id^='draft-']")).toBeVisible();
    await expect(page.locator("#inactiveCount")).toHaveText("0");
  });

  test("drags only after layout mode is enabled and updates position values", async ({ page }) => {
    await page.goto(prototypeUrl);

    const chamber06 = page.locator("[data-device-id='ch06']");
    await chamber06.click();
    const before = await page.locator("#selectedGeometry").textContent();

    const boxBefore = await chamber06.boundingBox();
    expect(boxBefore).not.toBeNull();
    await page.mouse.move(boxBefore.x + boxBefore.width / 2, boxBefore.y + boxBefore.height / 2);
    await page.mouse.down();
    await page.mouse.move(boxBefore.x + 60, boxBefore.y + 30);
    await page.mouse.up();
    await expect(page.locator("#selectedGeometry")).toHaveText(before);

    await page.locator("#layoutMode").click();
    const boxAfterToggle = await chamber06.boundingBox();
    expect(boxAfterToggle).not.toBeNull();
    await page.mouse.move(
      boxAfterToggle.x + boxAfterToggle.width / 2,
      boxAfterToggle.y + boxAfterToggle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(boxAfterToggle.x + 72, boxAfterToggle.y + 44);
    await page.mouse.up();

    await expect(page.locator("#selectedGeometry")).not.toHaveText(before);
    await expect(page.locator("#selectedGeometry")).toContainText(/x:\s*\d+/i);
  });

  test("shows resize handles only in layout mode and updates width and height from the southeast handle", async ({
    page,
  }) => {
    await page.goto(prototypeUrl);

    const chamber06 = page.locator("[data-device-id='ch06']");
    await chamber06.click();
    await expect(page.locator("[data-resize='se']")).toHaveCount(0);

    await page.locator("#layoutMode").click();
    const southeastHandle = chamber06.locator("[data-resize='se']");
    await expect(southeastHandle).toBeVisible();

    const before = await page.locator("#selectedGeometry").textContent();
    const handleBox = await southeastHandle.boundingBox();
    expect(handleBox).not.toBeNull();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + 40, handleBox.y + 34);
    await page.mouse.up();

    await expect(page.locator("#selectedGeometry")).not.toHaveText(before);
    await expect(page.locator("#selectedGeometry")).toContainText(/w:\s*\d+/i);
    await expect(page.locator("#selectedGeometry")).toContainText(/h:\s*\d+/i);
  });

  test("generates a label, enters placement mode, and marks the device placed after dragging", async ({
    page,
  }) => {
    await page.goto(prototypeUrl);

    const chamber06 = page.locator("[data-device-id='ch06']");
    await chamber06.click();
    await page.locator("#generateLabel").click();

    await expect(page.locator("#layoutMode")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#locationStatus")).toHaveAttribute("data-location-state", "placing");
    await expect(chamber06).toHaveAttribute("data-location-state", "placing");
    await expect(chamber06.locator("[data-resize='se']")).toBeVisible();

    const box = await chamber06.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 48, box.y + 36);
    await page.mouse.up();

    await expect(page.locator("#locationStatus")).toHaveAttribute("data-location-state", "placed");
    await expect(chamber06).toHaveAttribute("data-location-state", "placed");
  });

  test("keeps the shell within desktop and mobile viewport width", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto(prototypeUrl);
    await expect(page.locator(".floorplan-shell")).toBeVisible();
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);

    await page.setViewportSize({ width: 390, height: 840 });
    await expect(page.locator(".floorplan-shell")).toBeVisible();
    await expect(page.locator(".inspector")).toBeVisible();
    overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(overflow).toBe(false);
  });

  test("persists local placements after drag and exposes export download", async ({ page }) => {
    await page.goto(prototypeUrl);

    const chamber06 = page.locator("[data-device-id='ch06']");
    await chamber06.click();
    await page.locator("#layoutMode").click();

    const box = await chamber06.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 54, box.y + 28);
    await page.mouse.up();

    const stored = await page.evaluate(() => window.localStorage.getItem("equipment-floorplan-placements"));
    expect(stored).not.toBeNull();
    const payload = JSON.parse(stored);
    expect(payload.placements).toHaveLength(16);
    expect(payload.placements.find((item) => item.equipmentId === 8).locationState).toBe("placed");

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#exportPlacements").click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("equipment-floorplan-placements.json");
  });
});
