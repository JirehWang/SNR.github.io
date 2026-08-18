const { test, expect } = require("@playwright/test");

async function login(page, account, password) {
  await page.goto("/?view=equipment");
  await page.locator("#loginForm input[name='account']").fill(account);
  await page.locator("#loginForm input[name='password']").fill(password);
  await page.getByRole("button", { name: /登入|login/i }).click();
  await expect(page.locator("#loginScreen")).toBeHidden();
}

async function dragLocator(page, locator, dx, dy) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}

async function resizeFromHandle(page, locator, dx, dy) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}

test("equipment editor dialog uses draft floorplan placement until saved", async ({ page }) => {
  const equipmentWrites = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      ["/api/equipment", "/api/equipment-floorplan-placements"].includes(url.pathname)
      && ["POST", "PATCH", "PUT"].includes(request.method())
    ) {
      equipmentWrites.push(`${request.method()} ${url.pathname}`);
    }
  });

  await login(page, "PQE@admin", "PQE@admin");
  await page.locator("[data-view-target='equipment']").click();

  const mainTarget = page.locator("#floorplanOverlay [data-equipment-id='1']");
  await expect(page.locator("#floorplanOverlay .floorplan-device")).toHaveCount(16);
  const originalStyle = await mainTarget.getAttribute("style");

  await mainTarget.click();
  const dialog = page.locator("#equipmentEditorDialog");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#equipmentDialogFloorplanOverlay .floorplan-device")).toHaveCount(16);

  const dialogTarget = page.locator("#equipmentDialogFloorplanOverlay [data-equipment-id='1']");
  await expect(dialogTarget).toHaveAttribute("data-editable", "true");
  await expect(dialogTarget).toHaveAttribute("aria-disabled", "false");
  await expect(page.locator("#equipmentDialogFloorplanOverlay .floorplan-device[aria-disabled='true']")).toHaveCount(15);

  const draftStyleBeforeCancel = await dialogTarget.getAttribute("style");
  await dragLocator(page, dialogTarget, 24, 12);
  await resizeFromHandle(page, page.locator("#equipmentDialogFloorplanOverlay [data-equipment-id='1'] .floorplan-resize-handle[data-resize='se']"), 18, 10);
  await expect(dialogTarget).not.toHaveAttribute("style", draftStyleBeforeCancel);
  await page.locator("#equipmentDialogCloseBtn").click();
  await expect(dialog).not.toBeVisible();
  await expect(mainTarget).toHaveAttribute("style", originalStyle);
  expect(equipmentWrites).toEqual([]);

  await mainTarget.click();
  await expect(dialog).toBeVisible();
  const reopenedTarget = page.locator("#equipmentDialogFloorplanOverlay [data-equipment-id='1']");
  await dragLocator(page, reopenedTarget, 32, 16);
  await page.locator("#equipmentSubmitBtn").click();
  await expect(dialog).not.toBeVisible();
  await expect(mainTarget).not.toHaveAttribute("style", originalStyle);
});

test("offline equipment restores to the stored placement when re-enabled", async ({ page }) => {
  await login(page, "PQE@admin", "PQE@admin");
  await page.locator("[data-view-target='equipment']").click();

  const equipmentListResponse = await page.request.get("/api/equipment");
  expect(equipmentListResponse.ok()).toBeTruthy();
  const equipmentPayload = await equipmentListResponse.json();
  const originalEquipment = equipmentPayload.equipment.find((item) => Number(item.id) === 1);
  expect(originalEquipment).toBeTruthy();

  const placementResponse = await page.request.get("/api/equipment-floorplan-placements");
  expect(placementResponse.ok()).toBeTruthy();
  const placementPayload = await placementResponse.json();
  const storedPlacement = placementPayload.placements.find((item) => Number(item.equipment_id) === 1);
  expect(storedPlacement).toBeTruthy();

  let shouldRestoreStatus = false;
  try {
    const equipmentResponse = await page.request.patch("/api/equipment/1", {
      data: { status: "offline" },
    });
    expect(equipmentResponse.ok()).toBeTruthy();
    shouldRestoreStatus = true;

    await page.goto("/?view=equipment");
    await expect(page.locator("#loginScreen")).toBeHidden();
    await expect(page.locator("#floorplanOverlay [data-equipment-id='1']")).toHaveCount(0);
    await expect(page.locator("#disabledEquipmentSection")).toBeVisible();

    await page.locator("#disabledEquipmentList [data-edit-disabled-equipment='1']").click();
    const dialogTarget = page.locator("#equipmentDialogFloorplanOverlay [data-equipment-id='1']");
    await expect(page.locator("#equipmentEditorDialog")).toBeVisible();
    await expect(dialogTarget).toHaveAttribute("data-editable", "true");

    const placementStyle = await dialogTarget.evaluate((element) => ({
      left: element.style.left,
      top: element.style.top,
      width: element.style.width,
      height: element.style.height,
    }));
    expect(placementStyle).toEqual({
      left: `${Number(storedPlacement.x_percent)}%`,
      top: `${Number(storedPlacement.y_percent)}%`,
      width: `${Number(storedPlacement.width_percent)}%`,
      height: `${Number(storedPlacement.height_percent)}%`,
    });

    await page.locator("#equipmentForm select[name='status']").selectOption("available");
    await page.locator("#equipmentSubmitBtn").click();
    shouldRestoreStatus = false;
    await expect(page.locator("#equipmentEditorDialog")).not.toBeVisible();

    const mainTarget = page.locator("#floorplanOverlay [data-equipment-id='1']");
    await expect(mainTarget).toBeVisible();
    const restoredStyle = await mainTarget.evaluate((element) => ({
      left: element.style.left,
      top: element.style.top,
      width: element.style.width,
      height: element.style.height,
    }));
    expect(restoredStyle).toEqual(placementStyle);
  } finally {
    if (shouldRestoreStatus) {
      await page.request.patch("/api/equipment/1", {
        data: { status: originalEquipment.status || "available" },
      });
    }
  }
});
