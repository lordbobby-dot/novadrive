import { expect, test } from "@playwright/test";

/** M12 acceptance criteria: starring a folder surfaces it on /drive/favorites, and unstarring
 * removes it — driven through the real UI against a real running API. */
test.describe("favorites", () => {
  test("starring a folder adds it to Favorites, unstarring removes it", async ({ page }) => {
    await page.goto("/drive");
    await page.waitForURL(/\/drive\/.+/);

    const folderName = `E2E Favorite ${Date.now()}`;
    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByPlaceholder("Untitled folder").fill(folderName);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("link", { name: folderName })).toBeVisible();

    await page.getByRole("button", { name: `Favorite ${folderName}` }).click();
    await expect(page.getByRole("button", { name: `Unfavorite ${folderName}` })).toBeVisible();

    await page.getByRole("link", { name: "Favorites", exact: true }).click();
    await expect(page).toHaveURL(/\/drive\/favorites/);
    await expect(page.getByText(folderName)).toBeVisible();

    await page.getByRole("button", { name: `Unfavorite ${folderName}` }).click();
    await expect(page.getByText(folderName)).toHaveCount(0);
  });
});
