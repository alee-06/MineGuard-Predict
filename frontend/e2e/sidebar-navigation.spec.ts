import { test, expect } from '@playwright/test';

test.describe('MineGuard Predict — Single Hamburger & Sidebar Collapse/Expand E2E', () => {
  test('verifies exactly one hamburger toggle exists, brand header has no redundant burger, and collapse/expand works cleanly', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 1. Verify that there is EXACTLY ONE hamburger button across the entire interface
    // The top navbar button has aria-label="Toggle sidebar"
    const toggleButtons = page.locator('button[aria-label="Toggle sidebar"]');
    await expect(toggleButtons).toHaveCount(1);

    // 2. Verify that the sidebar brand header does NOT contain any Menu/hamburger button
    const sidebarHeader = page.locator('aside > div:first-child > div:first-child');
    await expect(sidebarHeader).toBeVisible();
    // In the sidebar brand header when expanded, there should be 0 buttons
    const sidebarHeaderButtons = sidebarHeader.locator('button');
    await expect(sidebarHeaderButtons).toHaveCount(0);

    // Verify brand logo is visible in sidebar
    await expect(sidebarHeader.locator('img[alt="MineGuard"]')).toBeVisible();

    // Verify initial sidebar width is 260px
    const aside = page.locator('aside');
    const initialBox = await aside.boundingBox();
    expect(initialBox?.width).toBeCloseTo(260, -1);

    // Take screenshot of clean expanded state (single hamburger in header, none in sidebar)
    await page.screenshot({ path: 'e2e-screenshots/05-single-burger-expanded.png' });

    // 3. Click the single hamburger button to collapse sidebar
    await toggleButtons.first().click();
    await page.waitForTimeout(400); // allow transition

    // Verify sidebar width is now 70px
    const collapsedBox = await aside.boundingBox();
    expect(collapsedBox?.width).toBeCloseTo(70, -1);

    // Take screenshot of collapsed state
    await page.screenshot({ path: 'e2e-screenshots/06-single-burger-collapsed.png' });

    // 4. Click the top navbar hamburger button again to expand sidebar
    await toggleButtons.first().click();
    await page.waitForTimeout(400); // allow transition

    // Verify sidebar expanded back to 260px
    const reExpandedBox = await aside.boundingBox();
    expect(reExpandedBox?.width).toBeCloseTo(260, -1);

    // 5. Test expanding via the collapsed logo button
    await toggleButtons.first().click(); // collapse it again
    await page.waitForTimeout(400);

    // Now in collapsed state, clicking the collapsed logo button expands it
    const collapsedLogoBtn = sidebarHeader.locator('button[aria-label="Expand sidebar"]');
    await expect(collapsedLogoBtn).toBeVisible();
    await collapsedLogoBtn.click();
    await page.waitForTimeout(400);

    // Verify it is expanded again
    const finalBox = await aside.boundingBox();
    expect(finalBox?.width).toBeCloseTo(260, -1);
  });
});
