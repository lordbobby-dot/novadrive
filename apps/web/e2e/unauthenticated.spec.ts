import { expect, test } from "@playwright/test";

/** M0/M1 acceptance criteria: unauthenticated visitors are gated out of protected routes. */
test.describe("unauthenticated", () => {
  test("home page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: "NovaDrive" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your team's files, organized and secure" }),
    ).toBeVisible();
  });

  test("visiting /dashboard while signed out redirects to sign-in", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/sign-in/);
  });

  test("visiting /drive while signed out redirects to sign-in", async ({ page }) => {
    await page.goto("/drive");
    await expect(page).toHaveURL(/sign-in/);
  });

  test("visiting /admin while signed out redirects to sign-in", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/sign-in/);
  });
});
