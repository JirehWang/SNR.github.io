const { test, expect } = require("@playwright/test");

async function login(page, account, password) {
  await page.goto("/?view=equipment");
  await page.locator("#loginForm input[name='account']").fill(account);
  await page.locator("#loginForm input[name='password']").fill(password);
  await page.getByRole("button", { name: /登入|login/i }).click();
}

async function dragBy(page, locator, deltaX, deltaY) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + deltaX, box.y + box.height / 2 + deltaY, { steps: 8 });
  await page.mouse.up();
}

async function resizeBy(page, locator, deltaX, deltaY) {
  const box = await locator.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + deltaX, box.y + box.height / 2 + deltaY, { steps: 8 });
  await page.mouse.up();
}

test("admin floorplan smoke covers 16 overlays, selection, drag resize, save, and reload persistence", async ({ page }) => {
  await login(page, "PQE@admin", "PQE@admin");

  await expect(page.locator("[data-view-target='equipment']")).toBeVisible();
  await page.locator("[data-view-target='equipment']").click();
  await expect(page.locator("#floorplanOverlay .floorplan-device")).toHaveCount(16);

  const target = page.locator("#floorplanOverlay [data-equipment-id='1']");
  await target.click();
  await expect(page.locator("#equipmentEditorDialog")).toBeVisible();
  await expect(page.locator("#equipmentDialogFloorplanOverlay [data-equipment-id='1']")).toHaveAttribute("data-editable", "true");
  await expect(page.locator("#equipmentDialogFloorplanOverlay .floorplan-device.editing")).toHaveCount(1);
  await expect(page.locator("#equipmentDialogFloorplanOverlay .floorplan-device.is-locked")).toHaveCount(15);
  await page.locator("#equipmentDialogCloseBtn").click();
  await expect(page.locator("#equipmentEditorDialog")).not.toBeVisible();

  const beforeStyle = await target.getAttribute("style");
  await page.locator("#floorplanLayoutBtn").evaluate((button) => { button.hidden = false; });
  await page.locator("#floorplanLayoutBtn").click();

  const box = await target.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 + 12, { steps: 8 });
  await page.mouse.up();

  const resizeHandle = page.locator("#floorplanOverlay [data-equipment-id='1'] .floorplan-resize-handle[data-resize='se']");
  const handleBox = await resizeHandle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 16, handleBox.y + handleBox.height / 2 + 10, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator("#floorplanMessage")).toContainText("尚有未儲存的定位變更");
  await page.locator("#floorplanSaveBtn").evaluate((button) => { button.hidden = false; });
  await page.locator("#floorplanSaveBtn").click();
  await expect(page.locator("#floorplanMessage")).toContainText("已儲存 16 筆設備定位");

  const afterStyle = await target.getAttribute("style");
  expect(afterStyle).not.toBe(beforeStyle);

  await page.reload();
  await expect(page.locator("#floorplanOverlay .floorplan-device")).toHaveCount(16);
  await expect(page.locator("#floorplanOverlay [data-equipment-id='1']")).toHaveAttribute("style", afterStyle);
});

test("equipment editor dialog opens from add button and floorplan, and cancel avoids equipment mutation requests", async ({ page }) => {
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

  await page.locator("#equipmentAddBtn").click();
  await expect(page.locator("#equipmentEditorDialog")).toBeVisible();
  await expect(page.locator("#equipmentDialogFloorplanOverlay .floorplan-device.editing")).toHaveCount(1);
  await expect(page.locator("#equipmentDialogFloorplanOverlay .floorplan-device.is-locked")).toHaveCount(16);
  await page.locator("#equipmentCancelBtn").click();
  await expect(page.locator("#equipmentEditorDialog")).not.toBeVisible();

  await page.locator("#floorplanOverlay [data-equipment-id='1']").click();
  await expect(page.locator("#equipmentEditorDialog")).toBeVisible();
  await expect(page.locator("#equipmentForm input[name='equipment_id']")).toHaveValue("1");
  const mainStyleBefore = await page.locator("#floorplanOverlay [data-equipment-id='1']").getAttribute("style");
  const draftDevice = page.locator("#equipmentDialogFloorplanOverlay .floorplan-device.editing");
  const draftMeta = page.locator("#equipmentDialogPlacementMeta");
  const draftStyleBefore = await draftDevice.getAttribute("style");
  const draftMetaBefore = await draftMeta.textContent();

  await dragBy(page, draftDevice, 18, 12);
  await resizeBy(page, page.locator("#equipmentDialogFloorplanOverlay .floorplan-device.editing .floorplan-resize-handle[data-resize='se']"), 14, 10);

  const draftStyleAfterDragResize = await draftDevice.getAttribute("style");
  const draftMetaAfterDragResize = await draftMeta.textContent();
  expect(draftStyleAfterDragResize).not.toBe(draftStyleBefore);
  expect(draftMetaAfterDragResize).not.toBe(draftMetaBefore);
  await expect(page.locator("#floorplanOverlay [data-equipment-id='1']")).toHaveAttribute("style", mainStyleBefore);

  await page.locator("#equipmentDialogCloseBtn").click();
  await expect(page.locator("#equipmentEditorDialog")).not.toBeVisible();
  await expect(page.locator("#floorplanOverlay [data-equipment-id='1']")).toHaveAttribute("style", mainStyleBefore);

  await page.locator("#floorplanOverlay [data-equipment-id='1']").click();
  await expect(page.locator("#equipmentEditorDialog")).toBeVisible();
  const reopenedDraftStyleBefore = await draftDevice.getAttribute("style");
  const reopenedDraftMetaBefore = await draftMeta.textContent();
  await dragBy(page, draftDevice, 16, 10);
  await resizeBy(page, page.locator("#equipmentDialogFloorplanOverlay .floorplan-device.editing .floorplan-resize-handle[data-resize='se']"), 12, 8);
  const reopenedDraftStyleAfter = await draftDevice.getAttribute("style");
  const reopenedDraftMetaAfter = await draftMeta.textContent();
  expect(reopenedDraftStyleAfter).not.toBe(reopenedDraftStyleBefore);
  expect(reopenedDraftMetaAfter).not.toBe(reopenedDraftMetaBefore);
  await page.locator("#equipmentSubmitBtn").click();
  await expect(page.locator("#equipmentEditorDialog")).not.toBeVisible();
  const mainStyleAfterSubmit = await page.locator("#floorplanOverlay [data-equipment-id='1']").getAttribute("style");
  expect(mainStyleAfterSubmit).not.toBe(mainStyleBefore);

  expect(equipmentWrites).toEqual([
    "PUT /api/equipment-floorplan-placements",
  ]);
});
