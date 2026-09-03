const { test, expect } = require("@playwright/test");

const targetReservation = {
  id: 101,
  equipment_id: 1,
  requester_name: "Alice Chen",
  requester_email: "alice@example.com",
  department: "PQE",
  project_name: "Original Project",
  purpose: "可靠度驗證",
  test_condition: "",
  start_time: "2099-03-10T09:00:00.000Z",
  end_time: "2099-03-10T10:00:00.000Z",
  status: "reserved",
  approval_status: "not_required",
  notes: "",
  cancel_reason: null,
  checked_in_at: null,
  checked_out_at: null,
  created_at: "2099-03-01T00:00:00.000Z",
  updated_at: "2099-03-01T00:00:00.000Z",
};

const laterReservation = {
  ...targetReservation,
  id: 102,
  requester_name: "Bob Wu",
  requester_email: "bob@example.com",
  project_name: "Later Project",
  start_time: "2099-03-10T10:30:00.000Z",
  end_time: "2099-03-10T11:30:00.000Z",
};

const equipment = {
  id: 1,
  name: "設備 A",
  category: "DROP",
  location: "A-01",
  status: "available",
  capacity: "1",
  is_active: true,
  requires_test_condition: false,
  label_name: "",
  equipment_spec: "",
};

async function mockSupabase(page, { historyErrorMessage = "" } = {}) {
  const mockOptions = JSON.stringify({ historyErrorMessage });
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        (() => {
          const tableData = {
            requester_directory: [
              { id: 1, name: "Alice Chen", email: "alice@example.com", department: "PQE", sort_order: 10, is_active: true },
              { id: 2, name: "Bob Wu", email: "bob@example.com", department: "外部", sort_order: 20, is_active: true },
            ],
            equipment: [${JSON.stringify(equipment)}],
            equipment_floorplan_placements: [],
            reservations: [${JSON.stringify(targetReservation)}, ${JSON.stringify(laterReservation)}],
            reservation_history: [],
          };

          const mockOptions = ${mockOptions};
          window.__reservationEditMock = { updates: [], historyInserts: [], historyErrors: [] };

          function valueMatches(rowValue, expected) {
            return String(rowValue) === String(expected);
          }

          function dateValue(value) {
            const parsed = new Date(value).getTime();
            return Number.isFinite(parsed) ? parsed : null;
          }

          function executeQuery(table, operation, payload, filters, orders, single) {
            const rows = tableData[table] || [];
            const matches = (row) => filters.every((filter) => {
              if (filter.operator === "eq") return valueMatches(row[filter.column], filter.value);
              if (filter.operator === "neq") return !valueMatches(row[filter.column], filter.value);
              const leftDate = dateValue(row[filter.column]);
              const rightDate = dateValue(filter.value);
              if (leftDate !== null && rightDate !== null) {
                return filter.operator === "lt" ? leftDate < rightDate : leftDate > rightDate;
              }
              return filter.operator === "lt"
                ? String(row[filter.column]) < String(filter.value)
                : String(row[filter.column]) > String(filter.value);
            });

            if (operation === "update") {
              const matched = rows.filter(matches);
              window.__reservationEditMock.updates.push({ table, payload, filters });
              matched.forEach((row) => Object.assign(row, payload));
              const updated = matched.map((row) => ({ ...row }));
              return { data: single ? (updated[0] || null) : updated, error: null };
            }

            if (operation === "insert") {
              const entries = Array.isArray(payload) ? payload : [payload];
              if (table === "reservation_history" && mockOptions.historyErrorMessage) {
                window.__reservationEditMock.historyErrors.push({ table, payload });
                return { data: null, error: { message: mockOptions.historyErrorMessage } };
              }
              tableData[table] = rows.concat(entries);
              window.__reservationEditMock.historyInserts.push(...entries);
              return { data: single ? (entries[0] || null) : entries, error: null };
            }

            const result = rows.filter(matches).sort((left, right) => {
              for (const order of orders) {
                const leftValue = left[order.column];
                const rightValue = right[order.column];
                if (leftValue === rightValue) continue;
                const comparison = leftValue < rightValue ? -1 : 1;
                return order.ascending ? comparison : -comparison;
              }
              return 0;
            });
            return { data: single ? (result[0] || null) : result, error: null };
          }

          function createQuery(table) {
            let operation = "select";
            let payload = null;
            let filters = [];
            let orders = [];
            let single = false;
            const query = {
              select() { return query; },
              order(column, options = {}) {
                orders.push({ column, ascending: options.ascending !== false });
                return query;
              },
              eq(column, value) {
                filters.push({ column, value, operator: "eq" });
                return query;
              },
              neq(column, value) {
                filters.push({ column, value, operator: "neq" });
                return query;
              },
              lt(column, value) {
                filters.push({ column, value, operator: "lt" });
                return query;
              },
              gt(column, value) {
                filters.push({ column, value, operator: "gt" });
                return query;
              },
              update(nextPayload) {
                operation = "update";
                payload = nextPayload;
                return query;
              },
              insert(nextPayload) {
                operation = "insert";
                payload = nextPayload;
                return query;
              },
              single() {
                single = true;
                return query;
              },
              then(resolve, reject) {
                try {
                  return Promise.resolve(executeQuery(table, operation, payload, filters, orders, single)).then(resolve, reject);
                } catch (error) {
                  return Promise.reject(error).then(resolve, reject);
                }
              },
            };
            return query;
          }

          window.supabase = {
            createClient() {
              return { from: (table) => createQuery(table) };
            },
          };
        })();
      `,
    });
  });
}

async function openEditableReservation(page) {
  await page.goto("/?view=reservation");
  await expect(page.locator("#connectionBadge")).toHaveText("已連線");

  const row = page.locator(".reservation-row").filter({ hasText: "Original Project" });
  await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "編輯" }).click();
  await expect(page.locator("#reservationDetailDialog")).toBeVisible();

  await page.locator("#reservationEditEmail").fill("alice@example.com");
  await page.locator("#reservationEditUnlockBtn").click();
  const statusDialog = page.locator("#reservationEditStatusDialog");
  await expect(statusDialog).toBeVisible();
  await expect(statusDialog).toHaveAttribute("data-tone", "success");
  await expect(statusDialog).toContainText("解鎖成功");
  await statusDialog.locator("#reservationEditStatusCloseBtn").click();
  await expect(statusDialog).not.toBeVisible();
  await expect(page.locator("#reservationEditSaveBtn")).toBeEnabled();
}

async function getOneHourLaterInputValue(page) {
  return page.locator("#reservationEditEnd").evaluate((input) => {
    const value = new Date(input.value);
    value.setHours(value.getHours() + 1);
    const pad = (part) => String(part).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  });
}

test("編輯成功時顯示成功 popup", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockSupabase(page);
  await openEditableReservation(page);

  await page.locator("#reservationEditProject").fill("Updated Project");
  await page.locator("#reservationEditSaveBtn").click();

  const statusDialog = page.locator("#reservationEditStatusDialog");
  await expect(statusDialog).toBeVisible();
  await expect(statusDialog).toHaveAttribute("data-tone", "success");
  await expect(page.locator("#reservationEditStatusTitle")).toHaveText("修改成功");
  await expect(page.locator("#reservationEditStatusMessage")).toHaveText("預約已更新。");
  await expect(page.locator("#reservationDetailDialog")).not.toBeVisible();

  const mockState = await page.evaluate(() => window.__reservationEditMock);
  expect(mockState.updates).toHaveLength(1);
  expect(mockState.updates[0].payload.project_name).toBe("Updated Project");
  expect(mockState.historyInserts).toHaveLength(1);
  expect(mockState.historyInserts[0].action).toBe("updated");
  expect(pageErrors).toEqual([]);
});

test("reservations 更新成功但歷程寫入失敗時顯示已更新提示", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockSupabase(page, { historyErrorMessage: "history RLS denied" });
  await openEditableReservation(page);

  await page.locator("#reservationEditProject").fill("History Failure Project");
  await page.locator("#reservationEditSaveBtn").click();

  const statusDialog = page.locator("#reservationEditStatusDialog");
  await expect(statusDialog).toBeVisible();
  await expect(statusDialog).toHaveAttribute("data-tone", "error");
  await expect(page.locator("#reservationEditStatusTitle")).toContainText("預約已更新");
  await expect(page.locator("#reservationEditStatusTitle")).not.toHaveText("修改失敗");
  await expect(page.locator("#reservationEditStatusMessage")).toContainText("預約已更新，但預約歷程寫入失敗");
  await expect(page.locator("#reservationEditStatusMessage")).toContainText("history RLS denied");
  await expect(page.locator("#reservationEditStatusMessage")).toContainText("請通知管理員");

  const mockState = await page.evaluate(() => window.__reservationEditMock);
  expect(mockState.updates).toHaveLength(1);
  expect(mockState.updates[0].payload.project_name).toBe("History Failure Project");
  expect(mockState.historyInserts).toHaveLength(0);
  expect(mockState.historyErrors).toHaveLength(1);
  expect(pageErrors).toEqual([]);
});

test("延長與後方有效專案衝突時顯示失敗 popup 且不 update", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockSupabase(page);
  await openEditableReservation(page);

  await page.locator("#reservationEditEnd").fill(await getOneHourLaterInputValue(page));
  await page.locator("#reservationEditSaveBtn").click();

  const statusDialog = page.locator("#reservationEditStatusDialog");
  await expect(statusDialog).toBeVisible();
  await expect(statusDialog).toHaveAttribute("data-tone", "error");
  await expect(page.locator("#reservationEditStatusTitle")).toHaveText("修改失敗");
  await expect(page.locator("#reservationEditStatusMessage")).toContainText("Later Project");
  await expect(page.locator("#reservationEditStatusMessage")).toContainText("最多可到");
  const expectedMaxAllowed = await page.evaluate(() => {
    const date = new Date("2099-03-10T10:30:00.000Z");
    const day = date.toLocaleDateString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit" });
    const time = date.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${day} ${time}`;
  });
  await expect(page.locator("#reservationEditStatusMessage")).toContainText(expectedMaxAllowed);
  await expect(page.locator("#reservationDetailDialog")).toBeVisible();

  const mockState = await page.evaluate(() => window.__reservationEditMock);
  expect(mockState.updates).toHaveLength(0);
  expect(mockState.historyInserts).toHaveLength(0);
  expect(pageErrors).toEqual([]);
});
