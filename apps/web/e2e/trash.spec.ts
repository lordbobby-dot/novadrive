import { expect, test } from "@playwright/test";

/** M6 acceptance criteria: deleted items appear in Trash and are restorable to their original
 * location. */
test.describe("trash", () => {
  test("deleting a folder moves it to Trash, and restoring it brings it back", async ({
    page,
  }) => {
    await page.goto("/drive");
    await page.waitForURL(/\/drive\/.+/);

    const folderName = `E2E Trash ${Date.now()}`;
    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByPlaceholder("Untitled folder").fill(folderName);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("link", { name: folderName })).toBeVisible();

    await page.getByRole("button", { name: `Options for ${folderName}` }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("link", { name: folderName })).toHaveCount(0);

    // Non-exact matching would also match this test's own folder link, since a favorited
    // folder's link accessible-name concatenates its nested favorite-toggle button's own label
    // ("Favorite {name}") — "E2E Trash..." then contains "Trash" as a substring of that too.
    await page.getByRole("link", { name: "Trash", exact: true }).click();
    await expect(page).toHaveURL(/\/drive\/trash/);
    const trashRow = page.getByText(folderName);
    await expect(trashRow).toBeVisible();

    await page.getByRole("button", { name: `Restore ${folderName}` }).click();
    await expect(trashRow).toHaveCount(0);
  });
});
