const { test, expect } = require("@playwright/test");

const ACTIVE_EQUIPMENT_COUNT = 21;
const PREVIEW_PRESETS = {
  mobile: { label: "手機預覽", width: 390, height: 844 },
  tablet: { label: "平板預覽", width: 1024, height: 768 },
  desktop: { label: "一般預覽", width: 1280, height: 720 },
};

const equipmentRows = Array.from({ length: ACTIVE_EQUIPMENT_COUNT }, (_, index) => ({
  id: index + 1,
  name: `Chamber ${String(index + 1).padStart(2, "0")}`,
  category: "TEMP",
  location: "1F",
  status: "available",
  capacity: "1",
  is_active: true,
  requires_test_condition: false,
  label_name: `CH-${String(index + 1).padStart(2, "0")}`,
  equipment_spec: "",
})).concat({
  id: 99,
  name: "Offline chamber",
  category: "TEMP",
  location: "1F",
  status: "offline",
  capacity: "1",
  is_active: false,
  requires_test_condition: false,
  label_name: "OFF-99",
  equipment_spec: "",
});

async function mockSupabase(page, tables = {}) {
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        (() => {
          const tableData = {
            requester_directory: [],
            equipment: ${JSON.stringify(equipmentRows)},
            equipment_floorplan_placements: [],
            reservations: [],
            ...${JSON.stringify(tables)},
          };

          function createQuery(table) {
            const query = {
              select() { return query; },
              order() { return query; },
              eq() { return query; },
              then(resolve, reject) {
                return Promise.resolve({ data: tableData[table] || [], error: null }).then(resolve, reject);
              },
            };
            return query;
          }

          window.supabase = {
            createClient() {
              return {
                from(table) {
                  return createQuery(table);
                },
              };
            },
          };
        })();
      `,
    });
  });
}

async function getBulletinMetrics(page) {
  return page.evaluate(() => {
    const wrap = document.querySelector(".bulletin-wrap");
    const scale = document.querySelector(".bulletin-scale");
    const chart = document.querySelector(".bulletin-chart");
    const rows = Array.from(document.querySelectorAll(".bulletin-row"));
    const bars = Array.from(document.querySelectorAll(".bulletin-bar"));
    const settings = document.querySelector("#bulletinSettings");
    const settingsToggle = document.querySelector("#bulletinSettingsToggle");
    const fullscreenButton = document.querySelector("#bulletinFullscreenBtn");
    const topRegion = document.querySelector("#bulletinTopRegion");
    const resizeHandle = document.querySelector("#bulletinTopResizeHandle");
    const settingsRect = settings.getBoundingClientRect();
    const settingsToggleRect = settingsToggle.getBoundingClientRect();
    const fullscreenButtonRect = fullscreenButton.getBoundingClientRect();
    const topRegionRect = topRegion.getBoundingClientRect();
    const board = document.querySelector("#bulletinBoard");
    const boardStyle = window.getComputedStyle(board);
    const previewFullscreenActive = board.classList.contains("is-preview-fullscreen");
    const resizeHandleRect = resizeHandle.getBoundingClientRect();
    const titleRowRect = topRegion.querySelector(".section-title").getBoundingClientRect();
    const titleCopyRect = topRegion.querySelector(".bulletin-title-copy").getBoundingClientRect();
    const legend = document.querySelector("#bulletinColorLegend");
    const legendRect = legend.getBoundingClientRect();
    const legendMatrixRect = legend.querySelector(".bulletin-legend-matrix").getBoundingClientRect();
    const weekControlsRect = topRegion.querySelector(".week-controls").getBoundingClientRect();
    const dateNavRect = document.querySelector("#bulletinMonthLabel").closest(".date-navigation").getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const scaleRect = scale.getBoundingClientRect();
    const rectsOverlap = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const topRegionVisible = (document.fullscreenElement?.id !== "bulletinBoard" && !previewFullscreenActive) || topRegionRect.height > 1;
    const legendMatrixDots = Array.from(legend.querySelectorAll(".bulletin-legend-matrix .legend-swatch"));
    const isFullyVisibleRow = (row) => {
      const rowRect = row.getBoundingClientRect();
      return rowRect.top >= scaleRect.bottom - 1 && rowRect.bottom <= wrapRect.bottom + 1;
    };
    return {
      dayCount: document.querySelectorAll(".bulletin-scale .gantt-day").length,
      rowCount: rows.length,
      fullyVisibleRowCount: rows.filter((row) => isFullyVisibleRow(row)).length,
      firstFiveRowsFullyVisible: rows.slice(0, 5).every((row) => isFullyVisibleRow(row)),
      chartWidth: chart.getBoundingClientRect().width,
      scaleStyleWidth: scale.style.width,
      wrapClientHeight: wrap.clientHeight,
      wrapScrollHeight: wrap.scrollHeight,
      wrapClientWidth: wrap.clientWidth,
      wrapScrollWidth: wrap.scrollWidth,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      tabletMediaMatches: window.matchMedia("(min-width: 561px) and (max-width: 1080px)").matches,
      desktopMediaMatches: window.matchMedia("(min-width: 1081px)").matches,
      controlsVisible: settings.open,
      settingsOpen: settings.open,
      settingsExpanded: settingsToggle.getAttribute("aria-expanded"),
      settingsHeight: settingsRect.height,
      settingsToggleVisible: topRegionVisible && settingsToggleRect.width > 0 && settingsToggleRect.height > 0 && settingsToggleRect.top >= 0 && settingsToggleRect.bottom <= window.innerHeight,
      settingsPanelVisible: settings.open,
      topRegionHeight: topRegionRect.height,
      topRegionAriaHidden: topRegion.getAttribute("aria-hidden"),
      topRegionInert: topRegion.hasAttribute("inert"),
      resizeHandleVisible: resizeHandleRect.width > 0 && resizeHandleRect.height > 0 && resizeHandleRect.top >= 0 && resizeHandleRect.bottom <= window.innerHeight,
      resizeHandleTagName: resizeHandle.tagName,
      resizeHandleRole: resizeHandle.getAttribute("role"),
      resizeHandleExpanded: resizeHandle.getAttribute("aria-expanded"),
      resizeHandleLabel: resizeHandle.getAttribute("aria-label"),
      resizeHandleTitle: resizeHandle.getAttribute("title"),
      resizeHandleCursor: window.getComputedStyle(resizeHandle).cursor,
      resizeHandleTouchAction: window.getComputedStyle(resizeHandle).touchAction,
      legendVisible: legendRect.width > 0 && legendRect.height > 0,
      legendRightOfTitle: legendRect.left >= titleCopyRect.right - 1,
      legendLeftOfControls: legendRect.right <= weekControlsRect.left + 1,
      legendControlsOverlap: rectsOverlap(legendRect, weekControlsRect),
      legendDateNavOverlap: rectsOverlap(legendRect, dateNavRect),
      legendTopRowContained: legendRect.left >= titleRowRect.left - 1
        && weekControlsRect.right <= titleRowRect.right + 1
        && Math.max(legendRect.bottom, weekControlsRect.bottom) <= titleRowRect.bottom + 1,
      legendColumnHeaders: Array.from(legend.querySelectorAll("thead th[scope='col']"))
        .map((item) => item.textContent.trim())
        .filter(Boolean),
      legendRowHeaders: Array.from(legend.querySelectorAll("tbody th[scope='row']"))
        .map((item) => item.textContent.trim()),
      legendCellLabels: Array.from(legend.querySelectorAll(".bulletin-legend-cell"))
        .map((item) => item.getAttribute("aria-label")),
      legendMatrixDotCount: legendMatrixDots.length,
      legendTotalDotCount: legend.querySelectorAll(".legend-swatch").length,
      legendMatrixWidth: legendMatrixRect.width,
      fullscreenButtonVisible: topRegionVisible && fullscreenButtonRect.top >= 0 && fullscreenButtonRect.bottom <= window.innerHeight,
      fullscreenElementId: document.fullscreenElement?.id || "",
      previewFullscreenActive,
      boardOutlineWidth: boardStyle.outlineWidth,
      boardOutlineStyle: boardStyle.outlineStyle,
      boardOutlineColor: boardStyle.outlineColor,
      boardOutlineOffset: boardStyle.outlineOffset,
      monthLabel: document.querySelector("#bulletinMonthLabel").textContent,
      rangeValue: document.querySelector("#bulletinRangeSelect").value,
      rangeOptions: Array.from(document.querySelectorAll("#bulletinRangeSelect option")).map((option) => ({
        value: option.value,
        text: option.textContent,
      })),
      scrollIntervalValue: document.querySelector("#bulletinScrollInterval").value,
      scrollDurationValue: document.querySelector("#bulletinScrollDuration").value,
      dayTexts: Array.from(document.querySelectorAll(".bulletin-scale .gantt-day")).map((day) =>
        Array.from(day.children).map((child) => child.textContent).join(" ")
      ),
      dayTextContained: Array.from(document.querySelectorAll(".bulletin-scale .gantt-day")).every((day) => {
        const dayRect = day.getBoundingClientRect();
        const dayStyle = window.getComputedStyle(day);
        if (dayStyle.minWidth !== "0px" || dayStyle.overflow !== "hidden") return false;
        return Array.from(day.children).every((child) => {
          const childRect = child.getBoundingClientRect();
          const childStyle = window.getComputedStyle(child);
          return childStyle.minWidth === "0px"
            && childStyle.overflow === "hidden"
            && childStyle.whiteSpace === "nowrap"
            && childRect.left >= dayRect.left - 1
            && childRect.right <= dayRect.right + 1;
        });
      }),
      barTextContained: bars.every((bar) => {
        const barRect = bar.getBoundingClientRect();
        return bar.scrollHeight <= bar.clientHeight + 1
          && Array.from(bar.querySelectorAll(".bulletin-bar-info > *")).every((line) => {
            const lineRect = line.getBoundingClientRect();
            return lineRect.top >= barRect.top - 1
              && lineRect.bottom <= barRect.bottom + 1
              && lineRect.left >= barRect.left - 1
              && lineRect.right <= barRect.right + 1;
          });
      }),
    };
  });
}

async function getExpectedBulletinRange(page, dayCount, startOffset = 0) {
  return page.evaluate(({ dayCount: days, startOffset: offset }) => {
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() + offset);
    const end = new Date(start);
    end.setDate(end.getDate() + days - 1);
    const formatDate = (date) => `${date.getMonth() + 1}/${date.getDate()}`;
    const formatDayText = (date) => `${dayNames[date.getDay()]} ${formatDate(date)}`;
    return {
      label: `${formatDate(start)} - ${formatDate(end)}`,
      firstDayText: formatDayText(start),
      lastDayText: formatDayText(end),
    };
  }, { dayCount, startOffset });
}

async function openMockedBulletin(page, viewport, options = {}) {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockSupabase(page, options.mockTables);
  if (options.clockTime) {
    await page.clock.install({ time: options.clockTime });
  }
  await page.setViewportSize(viewport);
  await page.goto("/?view=bulletin");
  await expect(page.locator("#connectionBadge")).toHaveText("已連線");
  await page.locator("#bulletinBoard").scrollIntoViewIfNeeded();
  return pageErrors;
}

async function openMockedBulletinPreview(page, presetName = "tablet", options = {}) {
  const pageErrors = [];
  const preset = PREVIEW_PRESETS[presetName];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockSupabase(page, options.mockTables);
  if (options.clockTime) {
    await page.clock.install({ time: options.clockTime });
  }
  await page.setViewportSize(options.hostViewport || { width: 1440, height: 980 });
  await page.goto("/preview.html");
  await page.locator(`[data-preset="${presetName}"]`).click();

  const iframe = page.locator("#previewFrame");
  await expect(iframe).toHaveAttribute("data-viewport-width", String(preset.width));
  await expect(iframe).toHaveAttribute("data-viewport-height", String(preset.height));
  const frameHandle = await iframe.elementHandle();
  const frame = await frameHandle.contentFrame();
  await expect(frame.locator("#connectionBadge")).toHaveText("已連線");
  await frame.locator("#bulletinBoard").scrollIntoViewIfNeeded();
  return { pageErrors, frame, preset };
}

async function expandBulletinSettings(page) {
  if ((await getBulletinMetrics(page)).fullscreenElementId === "bulletinBoard") {
    const metrics = await getBulletinMetrics(page);
    if (metrics.topRegionHeight <= 0) {
      await page.locator("#bulletinTopResizeHandle").click();
    }
    await expect.poll(async () => (await getBulletinMetrics(page)).topRegionHeight).toBe(260);
  }
  if (!(await page.locator("#bulletinSettings").evaluate((settings) => settings.open))) {
    await page.locator("#bulletinSettingsToggle").click();
  }
  await expect.poll(async () => (await getBulletinMetrics(page)).settingsOpen).toBe(true);
  await expect.poll(async () => (await getBulletinMetrics(page)).settingsExpanded).toBe("true");
}

async function collapseBulletinSettings(page) {
  if (await page.locator("#bulletinSettings").evaluate((settings) => settings.open)) {
    await page.locator("#bulletinSettingsToggle").click();
  }
  await expect.poll(async () => (await getBulletinMetrics(page)).settingsOpen).toBe(false);
  await expect.poll(async () => (await getBulletinMetrics(page)).settingsExpanded).toBe("false");
}

async function selectBulletinRange(page, days) {
  await expandBulletinSettings(page);
  await page.locator("#bulletinRangeSelect").selectOption(String(days));
}

test("bulletin tablet landscape defaults to four weeks and keeps active equipment in a scrollable board", async ({ page }) => {
  const pageErrors = await openMockedBulletin(page, { width: 1024, height: 768 });

  await expect(page.locator(".bulletin-scale .gantt-day")).toHaveCount(28);
  await expect(page.locator(".bulletin-row")).toHaveCount(ACTIVE_EQUIPMENT_COUNT);

  const metrics = await getBulletinMetrics(page);
  const expected = await getExpectedBulletinRange(page, 28);
  expect(metrics.settingsOpen).toBe(false);
  expect(metrics.settingsExpanded).toBe("false");
  expect(metrics.settingsToggleVisible).toBe(true);
  expect(metrics.settingsPanelVisible).toBe(false);
  expect(metrics.controlsVisible).toBe(false);
  expect(metrics.settingsHeight).toBeLessThanOrEqual(44);
  expect(metrics.legendVisible).toBe(true);
  expect(metrics.legendRightOfTitle).toBe(true);
  expect(metrics.legendLeftOfControls).toBe(true);
  expect(metrics.legendControlsOverlap).toBe(false);
  expect(metrics.legendDateNavOverlap).toBe(false);
  expect(metrics.legendTopRowContained).toBe(true);
  expect(metrics.legendColumnHeaders).toEqual(["未完成", "已完成"]);
  expect(metrics.legendRowHeaders).toEqual(["PQE", "神準", "外部", "儀校"]);
  expect(metrics.legendCellLabels).toEqual([
    "PQE 未完成",
    "PQE 已完成",
    "神準 未完成",
    "神準 已完成",
    "外部 未完成",
    "外部 已完成",
    "儀校 未完成",
    "儀校 已完成",
  ]);
  expect(metrics.legendMatrixDotCount).toBe(8);
  expect(metrics.legendTotalDotCount).toBe(8);
  expect(metrics.legendMatrixWidth).toBeLessThanOrEqual(220);
  expect(metrics.rangeValue).toBe("28");
  expect(metrics.firstFiveRowsFullyVisible).toBe(true);
  expect(metrics.fullyVisibleRowCount).toBeGreaterThanOrEqual(5);
  expect(metrics.rangeOptions).toEqual([
    { value: "7", text: "1 週" },
    { value: "14", text: "2 週" },
    { value: "28", text: "4 週" },
  ]);
  expect(metrics.monthLabel).toBe(expected.label);
  expect(metrics.dayTexts[0]).toBe(expected.firstDayText);
  expect(metrics.dayTexts[metrics.dayTexts.length - 1]).toBe(expected.lastDayText);
  expect(metrics.fullscreenButtonVisible).toBe(true);
  expect(metrics.wrapScrollHeight).toBeGreaterThan(metrics.wrapClientHeight);
  expect(metrics.wrapScrollWidth).toBeGreaterThanOrEqual(metrics.wrapClientWidth);

  await expandBulletinSettings(page);
  const expandedMetrics = await getBulletinMetrics(page);
  expect(expandedMetrics.controlsVisible).toBe(true);
  expect(expandedMetrics.settingsPanelVisible).toBe(true);
  await expect(page.locator("#bulletinRangeSelect")).toBeVisible();
  await expect(page.locator("#bulletinScrollInterval")).toBeVisible();
  await expect(page.locator("#bulletinScrollDuration")).toBeVisible();

  await collapseBulletinSettings(page);
  const collapsedMetrics = await getBulletinMetrics(page);
  expect(collapsedMetrics.controlsVisible).toBe(false);
  expect(collapsedMetrics.settingsPanelVisible).toBe(false);
  expect(collapsedMetrics.settingsToggleVisible).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("bulletin tablet bars keep three reservation lines inside the compact tablet row height", async ({ page }) => {
  const pageErrors = await openMockedBulletin(page, { width: 1024, height: 768 }, {
    clockTime: new Date("2026-08-27T09:00:00+08:00"),
    mockTables: {
      reservations: [
        {
          id: 1,
          equipment_id: 1,
          equipment_name: "Chamber 01",
          equipment_category: "TEMP",
          project_name: "Thermal Reliability Qualification",
          requester_name: "Alex Chen",
          requester_email: "alex.chen@example.com",
          start_time: "2026-08-27T09:00:00+08:00",
          end_time: "2026-08-27T18:00:00+08:00",
          status: "reserved",
          purpose: "",
        },
      ],
    },
  });

  const metrics = await getBulletinMetrics(page);
  expect(metrics.rowCount).toBe(ACTIVE_EQUIPMENT_COUNT);
  expect(metrics.firstFiveRowsFullyVisible).toBe(true);
  expect(metrics.barTextContained).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("bulletin legend mirrors requester unit colors for open and completed states", async ({ page }) => {
  const pageErrors = await openMockedBulletin(page, { width: 1024, height: 768 });

  const legend = await page.evaluate(() => {
    const readSwatch = (label) => {
      const selector = `.bulletin-legend-cell[aria-label='${label}'] .legend-swatch`;
      const element = document.querySelector(selector);
      const style = window.getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        borderStyle: style.borderStyle,
        borderRadius: style.borderRadius,
        height: element.getBoundingClientRect().height,
        width: element.getBoundingClientRect().width,
      };
    };
    const readReference = (className) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `gantt-bar bulletin-bar ${className}`;
      element.style.position = "fixed";
      element.style.left = "-1000px";
      element.style.top = "-1000px";
      document.body.appendChild(element);
      const style = window.getComputedStyle(element);
      const result = {
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        borderStyle: style.borderStyle,
      };
      element.remove();
      return result;
    };

    return {
      text: document.querySelector("#bulletinColorLegend").textContent,
      units: [
        { unit: "pqe", label: "PQE" },
        { unit: "senao", label: "神準" },
        { unit: "external", label: "外部" },
        { unit: "purpose-calibration", label: "儀校" },
      ].map(({ unit, label }) => ({
        unit,
        open: readSwatch(`${label} 未完成`),
        openReference: readReference(unit === "purpose-calibration" ? unit : `requester-category-${unit}`),
        complete: readSwatch(`${label} 已完成`),
        completeReference: readReference(`${unit === "purpose-calibration" ? unit : `requester-category-${unit}`} is-complete`),
      })),
    };
  });

  expect(legend.text).toContain("PQE 未完成");
  expect(legend.text).toContain("PQE 已完成");
  expect(legend.text).toContain("神準 未完成");
  expect(legend.text).toContain("神準 已完成");
  expect(legend.text).toContain("外部 未完成");
  expect(legend.text).toContain("外部 已完成");
  expect(legend.text).toContain("儀校 未完成");
  expect(legend.text).toContain("儀校 已完成");
  for (const unit of legend.units) {
    expect(unit.open.backgroundColor).toBe(unit.openReference.backgroundColor);
    expect(unit.open.borderColor).toBe(unit.openReference.borderColor);
    expect(unit.open.width).toBe(10);
    expect(unit.open.height).toBe(10);
    expect(unit.open.borderRadius).toBe("999px");
    expect(unit.complete.backgroundColor).toBe(unit.completeReference.backgroundColor);
    expect(unit.complete.borderColor).toBe(unit.completeReference.borderColor);
    expect(unit.complete.borderStyle).toBe("dashed");
    expect(unit.complete.width).toBe(10);
    expect(unit.complete.height).toBe(10);
    expect(unit.complete.borderRadius).toBe("999px");
  }
  expect(pageErrors).toEqual([]);
});

test("bulletin range select redraws one, two, and four week day headers without losing equipment rows", async ({ page }) => {
  const pageErrors = await openMockedBulletin(page, { width: 1024, height: 768 });

  for (const days of [7, 14, 28]) {
    await selectBulletinRange(page, days);
    await expect(page.locator(".bulletin-scale .gantt-day")).toHaveCount(days);

    const metrics = await getBulletinMetrics(page);
    const expected = await getExpectedBulletinRange(page, days);
    expect(metrics.rangeValue).toBe(String(days));
    expect(metrics.monthLabel).toBe(expected.label);
    expect(metrics.dayTexts[0]).toBe(expected.firstDayText);
    expect(metrics.dayTexts[metrics.dayTexts.length - 1]).toBe(expected.lastDayText);
    expect(metrics.rowCount).toBe(ACTIVE_EQUIPMENT_COUNT);
  }

  expect(pageErrors).toEqual([]);
});

test("bulletin equipment display mode filters rows and restores all equipment", async ({ page }) => {
  const pageErrors = await openMockedBulletin(page, { width: 1024, height: 768 });

  await expect(page.locator("#bulletinEquipmentMode")).toHaveValue("all");
  await expect(page.locator(".bulletin-row")).toHaveCount(ACTIVE_EQUIPMENT_COUNT);

  await expandBulletinSettings(page);
  await page.locator("#bulletinEquipmentMode").selectOption("custom");
  const checkboxes = page.locator("#bulletinEquipmentOptions input[type='checkbox']");
  await expect(page.locator("#bulletinEquipmentOptions")).toBeVisible();
  await expect(checkboxes).toHaveCount(ACTIVE_EQUIPMENT_COUNT);
  expect(await checkboxes.evaluateAll((items) => items.every((item) => item.checked))).toBe(true);

  await checkboxes.nth(0).uncheck();
  await expect(page.locator(".bulletin-row")).toHaveCount(ACTIVE_EQUIPMENT_COUNT - 1);
  await page.locator("#bulletinEquipmentOptions input[type='checkbox']").nth(1).uncheck();
  await expect(page.locator(".bulletin-row")).toHaveCount(ACTIVE_EQUIPMENT_COUNT - 2);
  expect(await page.evaluate(() => document.cookie)).toContain("snr_bulletin_settings_v1=");
  await page.evaluate(() => window.localStorage.clear());

  await page.reload();
  await expect(page.locator("#connectionBadge")).toHaveText("已連線");
  await expect(page.locator("#bulletinEquipmentMode")).toHaveValue("custom");
  await expect(page.locator(".bulletin-row")).toHaveCount(ACTIVE_EQUIPMENT_COUNT - 2);

  await expandBulletinSettings(page);
  await page.locator("#bulletinEquipmentMode").selectOption("all");
  await expect(page.locator(".bulletin-row")).toHaveCount(ACTIVE_EQUIPMENT_COUNT);
  await expect(page.locator("#bulletinEquipmentOptions")).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test("bulletin range and scroll settings persist through the settings cookie", async ({ page }) => {
  const pageErrors = await openMockedBulletin(page, { width: 1024, height: 768 });

  await selectBulletinRange(page, 14);
  await page.locator("#bulletinScrollInterval").fill("45");
  await page.locator("#bulletinScrollInterval").dispatchEvent("change");
  await page.locator("#bulletinScrollDuration").fill("3");
  await page.locator("#bulletinScrollDuration").dispatchEvent("change");
  expect(await page.evaluate(() => document.cookie)).toContain("snr_bulletin_settings_v1=");

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await expect(page.locator("#connectionBadge")).toHaveText("已連線");
  await expect(page.locator("#bulletinRangeSelect")).toHaveValue("14");
  await expect(page.locator(".bulletin-scale .gantt-day")).toHaveCount(14);
  await expect(page.locator("#bulletinScrollInterval")).toHaveValue("45");
  await expect(page.locator("#bulletinScrollDuration")).toHaveValue("3");
  expect(pageErrors).toEqual([]);
});

test.describe("bulletin daily range synchronization", () => {
  test.use({ timezoneId: "Asia/Taipei" });

  test("bulletin range follows local midnight while preserving selected range and rows", async ({ page }) => {
    const pageErrors = await openMockedBulletin(page, { width: 1024, height: 768 }, {
      clockTime: new Date("2026-08-31T23:59:50+08:00"),
    });
    await selectBulletinRange(page, 14);
    await collapseBulletinSettings(page);

    const before = await getBulletinMetrics(page);
    const beforeExpected = await getExpectedBulletinRange(page, 14);
    expect(before.monthLabel).toBe(beforeExpected.label);
    expect(before.dayTexts[0]).toBe(beforeExpected.firstDayText);
    expect(before.rangeValue).toBe("14");
    expect(before.rowCount).toBe(ACTIVE_EQUIPMENT_COUNT);

    await page.clock.runFor(11_000);

    const afterExpected = await getExpectedBulletinRange(page, 14);
    await expect.poll(async () => (await getBulletinMetrics(page)).monthLabel).toBe(afterExpected.label);
    const after = await getBulletinMetrics(page);
    expect(after.monthLabel).toBe(afterExpected.label);
    expect(after.dayTexts[0]).toBe(afterExpected.firstDayText);
    expect(after.dayTexts[0]).not.toBe(before.dayTexts[0]);
    expect(after.dayCount).toBe(14);
    expect(after.rowCount).toBe(ACTIVE_EQUIPMENT_COUNT);
    expect(after.rangeValue).toBe("14");
    expect(after.settingsOpen).toBe(false);
    expect(after.settingsExpanded).toBe("false");
    expect(pageErrors).toEqual([]);
  });

  test("bulletin range synchronizes after returning to the foreground", async ({ page }) => {
    const pageErrors = await openMockedBulletin(page, { width: 1024, height: 768 }, {
      clockTime: new Date("2026-09-30T23:59:50+08:00"),
    });
    await selectBulletinRange(page, 7);
    await collapseBulletinSettings(page);

    const before = await getBulletinMetrics(page);
    const beforeExpected = await getExpectedBulletinRange(page, 7);
    expect(before.dayTexts[0]).toBe(beforeExpected.firstDayText);

    await page.clock.setSystemTime(new Date("2026-10-01T00:00:05+08:00"));
    await page.evaluate(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    const afterExpected = await getExpectedBulletinRange(page, 7);
    await expect.poll(async () => (await getBulletinMetrics(page)).monthLabel).toBe(afterExpected.label);
    const after = await getBulletinMetrics(page);
    expect(after.monthLabel).toBe(afterExpected.label);
    expect(after.dayTexts[0]).toBe(afterExpected.firstDayText);
    expect(after.dayTexts[0]).not.toBe(before.dayTexts[0]);
    expect(after.dayCount).toBe(7);
    expect(after.rowCount).toBe(ACTIVE_EQUIPMENT_COUNT);
    expect(after.rangeValue).toBe("7");
    expect(after.settingsOpen).toBe(false);
    expect(after.settingsExpanded).toBe("false");
    expect(pageErrors).toEqual([]);
  });
});

test("bulletin fullscreenchange rerenders stale tablet-width gantt columns", async ({ page }) => {
  const pageErrors = await openMockedBulletin(page, { width: 960, height: 540 });

  const fullscreenEnabled = await page.evaluate(() => document.fullscreenEnabled);
  test.skip(!fullscreenEnabled, "Fullscreen API is not available in this browser run.");

  await expect(page.locator(".bulletin-row")).toHaveCount(ACTIVE_EQUIPMENT_COUNT);
  await selectBulletinRange(page, 14);
  await expect(page.locator(".bulletin-scale .gantt-day")).toHaveCount(14);
  await collapseBulletinSettings(page);
  await page.evaluate(() => {
    const staleWidth = 2080;
    const scale = document.querySelector(".bulletin-scale");
    const chart = document.querySelector(".bulletin-chart");
    scale.style.gridTemplateColumns = "220px repeat(14, 60px)";
    scale.style.width = `${staleWidth}px`;
    scale.style.minWidth = `${staleWidth}px`;
    chart.style.width = `${staleWidth}px`;
    chart.style.minWidth = `${staleWidth}px`;
  });

  await page.locator("#bulletinFullscreenBtn").click();
  await expect.poll(async () => (await getBulletinMetrics(page)).fullscreenElementId).toBe("bulletinBoard");
  await expect.poll(async () => (await getBulletinMetrics(page)).scaleStyleWidth).not.toBe("2080px");

  const metrics = await getBulletinMetrics(page);
  expect(metrics.dayCount).toBe(14);
  expect(metrics.rangeValue).toBe("14");
  expect(metrics.rowCount).toBe(ACTIVE_EQUIPMENT_COUNT);
  expect(metrics.chartWidth).toBeLessThan(2080);
  expect(metrics.settingsOpen).toBe(false);
  expect(metrics.topRegionHeight).toBe(0);
  expect(metrics.topRegionAriaHidden).toBe("true");
  expect(metrics.topRegionInert).toBe(true);
  expect(metrics.settingsToggleVisible).toBe(false);
  expect(metrics.resizeHandleVisible).toBe(true);
  expect(metrics.resizeHandleTagName).toBe("BUTTON");
  expect(metrics.resizeHandleRole).toBe(null);
  expect(metrics.resizeHandleExpanded).toBe("false");
  expect(metrics.resizeHandleLabel).toBe("點擊展開設定區");
  expect(metrics.resizeHandleTitle).toBe("點擊展開設定區");
  expect(metrics.resizeHandleCursor).toBe("pointer");
  expect(metrics.resizeHandleTouchAction).not.toBe("none");
  expect(metrics.controlsVisible).toBe(false);
  expect(metrics.fullscreenButtonVisible).toBe(false);
  expect(metrics.dayTextContained).toBe(true);
  expect(metrics.wrapScrollHeight).toBeGreaterThan(metrics.wrapClientHeight);
  expect(metrics.chartWidth).toBeLessThanOrEqual(metrics.wrapClientWidth + 2);
  expect(metrics.wrapScrollWidth).toBeLessThanOrEqual(metrics.wrapClientWidth + 2);
  expect(pageErrors).toEqual([]);
});

test("preview tablet fullscreen keeps the iframe CSS viewport and tablet layout", async ({ page }) => {
  const { pageErrors, frame, preset } = await openMockedBulletinPreview(page, "tablet");

  const before = await getBulletinMetrics(frame);
  expect(before.viewportWidth).toBe(preset.width);
  expect(before.viewportHeight).toBe(preset.height);
  expect(before.tabletMediaMatches).toBe(true);
  expect(before.desktopMediaMatches).toBe(false);
  expect(before.previewFullscreenActive).toBe(false);
  expect(before.fullscreenElementId).toBe("");
  expect(before.boardOutlineStyle).toBe("none");

  await frame.locator("#bulletinFullscreenBtn").click();
  await expect.poll(async () => (await getBulletinMetrics(frame)).previewFullscreenActive).toBe(true);

  const fullscreen = await getBulletinMetrics(frame);
  expect(fullscreen.viewportWidth).toBe(preset.width);
  expect(fullscreen.viewportHeight).toBe(preset.height);
  expect(fullscreen.tabletMediaMatches).toBe(true);
  expect(fullscreen.desktopMediaMatches).toBe(false);
  expect(fullscreen.fullscreenElementId).toBe("");
  expect(fullscreen.boardOutlineWidth).toBe("1px");
  expect(fullscreen.boardOutlineStyle).toBe("solid");
  expect(fullscreen.boardOutlineColor).toBe("rgb(100, 116, 139)");
  expect(fullscreen.boardOutlineOffset).toBe("-1px");
  expect(fullscreen.firstFiveRowsFullyVisible).toBe(true);
  expect(fullscreen.fullyVisibleRowCount).toBeGreaterThanOrEqual(5);
  expect(fullscreen.wrapScrollHeight).toBeGreaterThan(fullscreen.wrapClientHeight);

  await frame.locator("#bulletinTopResizeHandle").click();
  await expect.poll(async () => (await getBulletinMetrics(frame)).topRegionHeight).toBe(260);
  await frame.locator("#bulletinFullscreenBtn").click();
  await expect.poll(async () => (await getBulletinMetrics(frame)).previewFullscreenActive).toBe(false);

  const after = await getBulletinMetrics(frame);
  expect(after.viewportWidth).toBe(preset.width);
  expect(after.viewportHeight).toBe(preset.height);
  expect(after.tabletMediaMatches).toBe(true);
  expect(after.desktopMediaMatches).toBe(false);
  expect(after.boardOutlineStyle).toBe("none");
  await expect(page.locator("#previewFrame")).toHaveAttribute("data-viewport-width", String(preset.width));
  await expect(page.locator("#previewFrame")).toHaveAttribute("data-viewport-height", String(preset.height));
  await expect(page.locator('[data-preset="tablet"]')).toHaveAttribute("aria-pressed", "true");
  expect(pageErrors).toEqual([]);
});

test("bulletin fullscreen handle toggles the top settings region", async ({ page }) => {
  const pageErrors = await openMockedBulletin(page, { width: 1024, height: 768 });

  const fullscreenEnabled = await page.evaluate(() => document.fullscreenEnabled);
  test.skip(!fullscreenEnabled, "Fullscreen API is not available in this browser run.");

  await page.locator("#bulletinFullscreenBtn").click();
  await expect.poll(async () => (await getBulletinMetrics(page)).fullscreenElementId).toBe("bulletinBoard");
  await expect.poll(async () => (await getBulletinMetrics(page)).topRegionHeight).toBe(0);

  await page.locator("#bulletinTopResizeHandle").click();
  await expect.poll(async () => (await getBulletinMetrics(page)).topRegionHeight).toBe(260);
  let metrics = await getBulletinMetrics(page);
  expect(metrics.resizeHandleExpanded).toBe("true");
  expect(metrics.resizeHandleLabel).toBe("點擊收合設定區");
  expect(metrics.resizeHandleTitle).toBe("點擊收合設定區");
  expect(metrics.topRegionAriaHidden).toBe(null);
  expect(metrics.topRegionInert).toBe(false);

  await page.locator("#bulletinTopResizeHandle").click();
  await expect.poll(async () => (await getBulletinMetrics(page)).topRegionHeight).toBe(0);
  metrics = await getBulletinMetrics(page);
  expect(metrics.resizeHandleExpanded).toBe("false");
  expect(metrics.resizeHandleLabel).toBe("點擊展開設定區");
  expect(metrics.resizeHandleTitle).toBe("點擊展開設定區");
  expect(metrics.topRegionAriaHidden).toBe("true");
  expect(metrics.topRegionInert).toBe(true);
  expect(pageErrors).toEqual([]);
});

test("bulletin segment navigation moves by the selected range and can return", async ({ page }) => {
  const pageErrors = await openMockedBulletin(page, { width: 1024, height: 768 });
  await selectBulletinRange(page, 14);
  await collapseBulletinSettings(page);

  const initialLabel = (await getBulletinMetrics(page)).monthLabel;
  const expectedNext = await getExpectedBulletinRange(page, 14, 14);
  await page.locator("#bulletinNextMonth").click();
  await expect.poll(async () => (await getBulletinMetrics(page)).monthLabel).toBe(expectedNext.label);
  const nextLabel = (await getBulletinMetrics(page)).monthLabel;

  await page.locator("#bulletinPrevMonth").click();
  await expect.poll(async () => (await getBulletinMetrics(page)).monthLabel).toBe(initialLabel);

  expect(nextLabel).not.toBe(initialLabel);
  await expect(page.locator(".bulletin-scale .gantt-day")).toHaveCount(14);
  await expect(page.locator(".bulletin-row")).toHaveCount(ACTIVE_EQUIPMENT_COUNT);
  expect(pageErrors).toEqual([]);
});

test("bulletin scroll settings are applied and auto-scroll scheduling stays stable", async ({ page }) => {
  const pageErrors = await openMockedBulletin(page, { width: 960, height: 540 });

  const fullscreenEnabled = await page.evaluate(() => document.fullscreenEnabled);
  test.skip(!fullscreenEnabled, "Fullscreen API is not available in this browser run.");

  await page.locator("#bulletinFullscreenBtn").click();
  await expect.poll(async () => (await getBulletinMetrics(page)).fullscreenElementId).toBe("bulletinBoard");
  await selectBulletinRange(page, 7);
  await expect(page.locator(".bulletin-scale .gantt-day")).toHaveCount(7);

  await page.locator("#bulletinScrollInterval").fill("7");
  await page.locator("#bulletinScrollInterval").dispatchEvent("change");
  await page.locator("#bulletinScrollDuration").fill("4");
  await page.locator("#bulletinScrollDuration").dispatchEvent("change");

  const metrics = await getBulletinMetrics(page);
  expect(metrics.rangeValue).toBe("7");
  expect(metrics.scrollIntervalValue).toBe("7");
  expect(metrics.scrollDurationValue).toBe("4");
  expect(metrics.settingsOpen).toBe(true);
  expect(metrics.controlsVisible).toBe(true);
  expect(metrics.wrapScrollHeight).toBeGreaterThan(metrics.wrapClientHeight);
  expect(pageErrors).toEqual([]);
});

test("bulletin auto-scroll reaches the true bottom so the last row is not clipped", async ({ page }) => {
  const pageErrors = await openMockedBulletin(page, { width: 1912, height: 365 });

  const fullscreenEnabled = await page.evaluate(() => document.fullscreenEnabled);
  test.skip(!fullscreenEnabled, "Fullscreen API is not available in this browser run.");

  await page.locator("#bulletinFullscreenBtn").click();
  await expect.poll(async () => (await getBulletinMetrics(page)).fullscreenElementId).toBe("bulletinBoard");
  await page.evaluate(() => new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
  }));

  await page.evaluate(() => {
    const wrap = document.querySelector(".bulletin-wrap");
    wrap.scrollTo({ top: 0, behavior: "auto" });
    stepBulletinAutoScroll();
  });
  await page.waitForTimeout(1200);

  const bottomMetrics = await page.evaluate(() => {
    const wrap = document.querySelector(".bulletin-wrap");
    const lastRow = document.querySelector(".bulletin-row:last-child");
    const maxTop = Math.max(wrap.scrollHeight - wrap.clientHeight, 0);
    const targetTop = getBulletinBottomScrollTop(wrap);
    const rowRect = lastRow.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    return {
      maxTop,
      targetTop,
      actualTop: wrap.scrollTop,
      lastRowBottom: rowRect.bottom,
      wrapBottom: wrapRect.bottom,
    };
  });

  expect(bottomMetrics.targetTop).toBe(bottomMetrics.maxTop);
  expect(bottomMetrics.actualTop).toBe(bottomMetrics.maxTop);
  expect(bottomMetrics.lastRowBottom).toBeLessThanOrEqual(bottomMetrics.wrapBottom + 1);
  expect(pageErrors).toEqual([]);
});
