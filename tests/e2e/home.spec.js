const { test, expect } = require("@playwright/test");

async function login(page, account, password) {
  await page.goto("/");
  await page.locator("#loginForm input[name='account']").fill(account);
  await page.locator("#loginForm input[name='password']").fill(password);
  await page.getByRole("button", { name: /登入|login/i }).click();
}

test("guest login gates the app before protected data loads", async ({ page }) => {
  const responses = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/")) {
      responses.push({ path: url.pathname, status: response.status() });
    }
  });

  await page.goto("/");

  await expect(page.locator("#loginScreen")).toBeVisible();
  await expect(page.locator("#reservationForm")).toBeHidden();
  expect(responses.filter((item) => item.path === "/api/equipment")).toEqual([]);

  await page.locator("#loginForm input[name='account']").fill("@Guest");
  await page.locator("#loginForm input[name='password']").fill("@Guest");
  await page.getByRole("button", { name: /登入|login/i }).click();

  await expect(page.locator("#loginScreen")).toBeHidden();
  await expect(page.locator("#authStatus")).toContainText("@Guest");
  await expect(page.locator("#authStatus")).toContainText("guest");
  await expect(page.locator("#reservationForm")).toBeHidden();
  await expect(page.locator("#connectionBadge")).toHaveText(/connected|撌脤/i);
});

test("member first login binds requester identity and hides admin mutation views", async ({ page }) => {
  await login(page, "member@example.com", "member-pass");

  await expect(page.locator("#reservationForm")).toBeVisible();
  await expect(page.locator("#reservationForm input[name='requester_name']")).toHaveValue("Other Member");
  await expect(page.locator("#reservationForm input[name='requester_email']")).toHaveValue("member@example.com");
  await expect(page.locator("#reservationForm input[name='requester_name']")).toBeDisabled();
  await expect(page.locator("#reservationForm input[name='requester_email']")).toBeDisabled();
  await expect(page.locator("[data-view-target='equipment']")).toBeHidden();
  await expect(page.locator("[data-view-target='requester']")).toBeVisible();
  await expect(page.locator("[data-view-target='admin']")).toBeHidden();
  await page.locator("[data-view-target='requester']").click();
  await expect(page.locator("#linkedAccountPanel")).toBeVisible();
  await expect(page.locator("#selfPasswordForm")).toBeVisible();
  await expect(page.locator("#requesterForm select[name='account_role']")).toBeHidden();
  await expect(page.locator("#adminResetPassword")).toBeHidden();
  await expect(page.locator("#linkedEditUserBtn")).toBeHidden();

  await page.locator("#selfPasswordForm input[name='current_password']").fill("member-pass");
  await page.locator("#selfPasswordForm input[name='new_password']").fill("member-pass-2");
  await page.locator("#selfPasswordSubmitBtn").click();
  await expect(page.locator("#selfPasswordForm input[name='current_password']")).toHaveValue("");
  await expect(page.locator("#selfPasswordForm input[name='new_password']")).toHaveValue("");

  await page.locator("#logoutBtn").click();
  await expect(page.locator("#loginScreen")).toBeVisible();

  await login(page, "member@example.com", "member-pass-2");
  await expect(page.locator("#authStatus")).toContainText("member@example.com");
  await expect(page.locator("#authStatus")).toContainText("member");
});

test("admin can open the user edit workflow with role and password reset controls", async ({ page }) => {
  await login(page, "PQE@admin", "PQE@admin");

  await page.locator("[data-view-target='requester']").click();
  await expect(page.locator("#requesterForm")).toBeVisible();
  await expect(page.locator("[data-edit-requester]").first()).toBeVisible();
  await page.locator("[data-edit-requester]").first().click();

  await expect(page.locator("#linkedAccountPanel")).toBeVisible();
  await expect(page.locator("#requesterForm select[name='account_role']")).toBeVisible();
  await expect(page.locator("#adminResetPassword")).toBeVisible();
  await expect(page.locator("[data-edit-user]").first()).toBeVisible();
});
