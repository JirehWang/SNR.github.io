const { test, expect } = require("@playwright/test");

const requesters = [
  {
    id: 1,
    name: "Alice Chen",
    email: "alice@example.com",
    department: "PQE",
    sort_order: 10,
    is_active: true,
  },
  {
    id: 2,
    name: "Bob Wu",
    email: "bob@example.com",
    department: "外部",
    sort_order: 20,
    is_active: true,
  },
];

async function mockSupabase(page) {
  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2/, async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: `
        (() => {
          const tableData = {
            requester_directory: ${JSON.stringify(requesters)},
            equipment: [],
            equipment_floorplan_placements: [],
            reservations: [],
          };

          function createQuery(table) {
            const query = {
              select() { return query; },
              order() { return query; },
              then(resolve, reject) {
                return Promise.resolve({ data: tableData[table] || [], error: null }).then(resolve, reject);
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

test("requester search filters by name or email and keeps responsive card actions", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await mockSupabase(page);
  await page.goto("/?view=requester");

  await expect(page.locator("#connectionBadge")).toHaveText("已連線");
  const search = page.locator("#requesterSearchInput");
  await expect(search).toHaveAccessibleName("搜尋使用者");
  await expect(page.locator(".requester-card")).toHaveCount(2);
  await expect(page.locator("#requesterResultCount")).toHaveText("顯示 2 / 2 位使用者");

  await search.fill("BOB@EXAMPLE");
  await expect(page.locator(".requester-card")).toHaveCount(1);
  await expect(page.locator(".requester-card h3")).toHaveText("Bob Wu");
  await expect(page.locator("#requesterResultCount")).toHaveText("顯示 1 / 2 位使用者");

  await page.locator("#refreshBtn").click();
  await expect(page.locator("#connectionBadge")).toHaveText("已連線");
  await expect(search).toHaveValue("BOB@EXAMPLE");
  await expect(page.locator(".requester-card h3")).toHaveText("Bob Wu");

  await search.fill("not-found");
  await expect(page.locator(".requester-card")).toHaveCount(0);
  await expect(page.locator("#requesterSummary .empty-card")).toContainText("找不到符合「not-found」");
  await expect(page.locator("#requesterResultCount")).toHaveText("顯示 0 / 2 位使用者");

  await search.fill("");
  await expect(page.locator(".requester-card")).toHaveCount(2);

  const desktopLayout = await page.locator(".requester-card").first().evaluate((card) => {
    const content = card.querySelector(".requester-card-content").getBoundingClientRect();
    const actions = card.querySelector(".requester-card-actions").getBoundingClientRect();
    const editButton = card.querySelector("[data-edit-requester]").getBoundingClientRect();
    const deleteButton = card.querySelector("[data-delete-requester]").getBoundingClientRect();
    return {
      columns: getComputedStyle(card).gridTemplateColumns,
      actionsAtTop: actions.top <= content.top + 1,
      editButtonWidth: editButton.width,
      deleteButtonWidth: deleteButton.width,
      editButtonHeight: editButton.height,
      deleteButtonHeight: deleteButton.height,
    };
  });
  expect(desktopLayout.columns.split(" ")).toHaveLength(2);
  expect(desktopLayout.actionsAtTop).toBeTruthy();
  expect(desktopLayout.editButtonWidth).toBe(desktopLayout.deleteButtonWidth);
  expect(desktopLayout.editButtonHeight).toBe(desktopLayout.deleteButtonHeight);
  expect(desktopLayout.editButtonWidth).toBeGreaterThan(0);
  expect(desktopLayout.deleteButtonWidth).toBeGreaterThan(0);
  expect(desktopLayout.editButtonHeight).toBeGreaterThan(0);
  expect(desktopLayout.deleteButtonHeight).toBeGreaterThan(0);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileColumns = await page.locator(".requester-card").first().evaluate((card) => getComputedStyle(card).gridTemplateColumns);
  expect(mobileColumns.split(" ")).toHaveLength(1);
  expect(pageErrors).toEqual([]);
});
