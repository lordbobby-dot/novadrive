import path from "path";
import { expect, test } from "@playwright/test";

/** M2 (folder CRUD/navigation) and M3 (upload pipeline) acceptance criteria, driven through the
 * real UI against a real running API/S3, using the authenticated storage state from
 * global.setup.ts. */
test.describe("drive: folders and upload", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/drive");
    await page.waitForURL(/\/drive\/.+/);
  });

  test("creates a folder, navigates into it, and it appears in the breadcrumb", async ({
    page,
  }) => {
    const folderName = `E2E Folder ${Date.now()}`;

    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByPlaceholder("Untitled folder").fill(folderName);
    await page.getByRole("button", { name: "Create" }).click();

    const folderLink = page.getByRole("link", { name: folderName });
    await expect(folderLink).toBeVisible();

    await folderLink.click();
    await expect(page).toHaveURL(/\/drive\/.+/);
    await expect(page.getByRole("navigation").getByText(folderName)).toBeVisible();
  });

  test("uploads a file and it appears in the current folder", async ({ page }) => {
    // The command palette (mounted globally, outside <main>) has its own hidden file input for
    // its run-anywhere "upload" command — scope to <main> to get the Drive page's own input.
    const fileInput = page.getByRole("main").locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, "fixtures", "sample.txt"));

    await expect(page.getByText("sample.txt")).toBeVisible({ timeout: 15_000 });
  });

  test("renaming a folder updates its displayed name", async ({ page }) => {
    const originalName = `E2E Rename Source ${Date.now()}`;
    const renamedName = `${originalName} (renamed)`;

    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByPlaceholder("Untitled folder").fill(originalName);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("link", { name: originalName })).toBeVisible();

    await page
      .getByRole("button", { name: `Options for ${originalName}` })
      .click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    // The rename field autofocuses and is the only editable input on the page at this moment.
    await page.locator("input:focus").fill(renamedName);
    await page.keyboard.press("Enter");

    await expect(page.getByRole("link", { name: renamedName })).toBeVisible();
  });
});
