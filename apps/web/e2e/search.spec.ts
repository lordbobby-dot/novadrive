import { expect, test } from "@playwright/test";

/** M5 acceptance criteria: search is filterable and returns sensible results (or a clear empty
 * state), reachable via the header search bar's Enter-to-submit full-results navigation. */
test.describe("search", () => {
  test("searching for a folder created just now finds it in full results", async ({ page }) => {
    await page.goto("/drive");
    await page.waitForURL(/\/drive\/.+/);

    const folderName = `E2E Searchable ${Date.now()}`;
    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByPlaceholder("Untitled folder").fill(folderName);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("link", { name: folderName })).toBeVisible();

    await page.getByPlaceholder("Search files and folders…").fill(folderName);
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/drive\/search\?q=/);
    // Full-results rows are buttons (see ResultList), not links — the Drive listing's own item
    // rows are the ones that render as <a>. exact:true avoids matching the adjacent favorite
    // toggle button, whose own aria-label ("Favorite {name}") also contains the folder name.
    await expect(page.getByRole("button", { name: folderName, exact: true })).toBeVisible();
  });

  test("a query matching nothing shows the empty state, not an error", async ({ page }) => {
    const nonsenseQuery = `zzz-no-such-file-${Date.now()}`;
    await page.goto(`/drive/search?q=${encodeURIComponent(nonsenseQuery)}`);

    // The empty-state copy uses curly/smart quotes (&ldquo;/&rdquo;), not straight ones.
    await expect(page.getByText(`No results for “${nonsenseQuery}”.`)).toBeVisible();
  });
});
