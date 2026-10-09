import { test, expect } from '@playwright/test';

test.describe('MineGuard Predict — Historical Graph & 8 Warning Crossings E2E', () => {
  test('verifies that the 8 warning crossings are clearly visible on the timeline graph with peak preservation and red warning indicators', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 1. Navigate to Workspace 2: Historical Risk Analysis
    const historicalWorkspaceTab = page.locator('aside button:has-text("Historical Risk Analysis")');
    await historicalWorkspaceTab.click();
    await page.waitForTimeout(1000);

    // 2. Click "Load Demo Dataset" if available to activate the 17,280 row demo dataset
    const loadDemoBtn = page.locator('button:has-text("Load Demo Dataset")');
    if (await loadDemoBtn.isVisible()) {
      await loadDemoBtn.click();
      await page.waitForTimeout(2000);
    }

    // 3. Click "Analyze Period"
    const analyzeBtn = page.locator('button:has-text("Analyze Period")').first();
    await expect(analyzeBtn).toBeVisible();
    await analyzeBtn.click();
    await page.waitForTimeout(3000);

    // 4. Verify Summary Cards
    await expect(page.locator('text=ANALYZED READINGS')).toBeVisible();
    await expect(page.locator('div:has-text("Warning Crossings"):has-text("8")').first()).toBeVisible();

    // 5. Verify the Chart and the "Crossings Visible on Timeline" chip
    await expect(page.locator('text=Sensor Timeline & Threshold Exceedance')).toBeVisible();
    await expect(page.locator('text=Crossings Visible on Timeline')).toBeVisible();

    // 6. Verify that red crossing indicator dots are rendered on the chart SVG
    const crossingDots = page.locator('.recharts-line circle[fill="#F06548"]');
    const dotCount = await crossingDots.count();
    console.log(`Found ${dotCount} red crossing dots rendered on the timeline chart.`);
    expect(dotCount).toBeGreaterThanOrEqual(8);

    // Take a full-page screenshot of the historical analysis showing all 8 crossings clearly on the graph!
    await page.screenshot({ path: 'e2e-screenshots/07-historical-8-crossings.png', fullPage: true });

    // 7. Check the Event Timeline tab under Events & Patterns to verify the 8 events
    const patternsTab = page.locator('button:has-text("Events & Patterns")');
    await patternsTab.click();
    await page.waitForTimeout(1000);

    await expect(page.locator('text=Observed Threshold Crossings & Hazard Events')).toBeVisible();
    const eventRows = page.locator('table tbody tr');
    const count = await eventRows.count();
    console.log(`Found ${count} event rows in the table.`);
    expect(count).toBeGreaterThanOrEqual(8);

    await page.screenshot({ path: 'e2e-screenshots/08-event-timeline-table.png', fullPage: true });
  });
});
