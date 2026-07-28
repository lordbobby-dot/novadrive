import { expect, test } from "@playwright/test";

/**
 * M7 (public share links) + this milestone's folder-browsing extension (see
 * docs/permissions.md#browsing-a-shared-folder-via-a-public-link): creating a public link for a
 * folder and opening it as a signed-out visitor renders the folder's contents, not just its
 * metadata. Uses a fresh, storageState-less browser context for the "anonymous visitor" half —
 * the authenticated project's session must never leak into that request.
 */
test.describe("shared folder link", () => {
  test("a public folder link is browsable by a signed-out visitor", async ({ page, browser }) => {
    await page.goto("/drive");
    await page.waitForURL(/\/drive\/.+/);

    const folderName = `E2E Share ${Date.now()}`;
    const subfolderName = "Nested";

    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByPlaceholder("Untitled folder").fill(folderName);
    await page.getByRole("button", { name: "Create" }).click();
    const folderLink = page.getByRole("link", { name: folderName });
    await expect(folderLink).toBeVisible();
    await folderLink.click();
    await expect(page).toHaveURL(/\/drive\/.+/);

    await page.getByRole("button", { name: "New folder" }).click();
    await page.getByPlaceholder("Untitled folder").fill(subfolderName);
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page.getByRole("link", { name: subfolderName })).toBeVisible();

    await page.getByRole("button", { name: `Options for ${subfolderName}` }).click();
    await page.getByRole("menuitem", { name: "Share…" }).click();
    await page.getByRole("button", { name: "Link" }).click();
    await page.getByRole("button", { name: "Create link" }).click();

    const shareUrl = await page.locator("code").first().textContent();
    expect(shareUrl).toBeTruthy();
    await page.getByRole("button", { name: /close/i }).click();

    const anonymousContext = await browser.newContext();
    const anonymousPage = await anonymousContext.newPage();
    try {
      await anonymousPage.goto(shareUrl!);
      await expect(anonymousPage.getByRole("heading", { name: subfolderName })).toBeVisible();
      await expect(anonymousPage.getByText("This folder is empty.")).toBeVisible();
    } finally {
      await anonymousContext.close();
    }
  });
});
