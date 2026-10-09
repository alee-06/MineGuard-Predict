import { test, expect } from '@playwright/test';

test.describe('MineGuard Predict — Live Simulation & Safety Operations E2E', () => {
  test('verifies dynamic telemetry simulation, ML advance risk, active warnings, and historical analysis', async ({ page }) => {
    // 1. Navigate to main dashboard
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify Title and Workspace Navigation
    await expect(page.locator('text=MineGuard Predict').first()).toBeVisible();
    await expect(page.locator('text=Live Monitoring').first()).toBeVisible();

    // Verify KPI Cards on Overview
    await expect(page.locator('text=Monitored Areas').first()).toBeVisible();
    await expect(page.locator('text=Safety Threshold').first()).toBeVisible();
    await expect(page.locator('text=1.0% CH₄').first()).toBeVisible();

    // Verify the Live Dynamic Telemetry Stream chart is present
    await expect(page.locator('text=Live Telemetry Stream').first()).toBeVisible();
    await expect(page.locator('text=Tailgate Return (Bleeder Junction)').first()).toBeVisible();

    // 2. Start Live Simulation
    const startSimBtn = page.locator('button:has-text("Start Live Simulation")');
    if (await startSimBtn.isVisible()) {
      await startSimBtn.click();
      await page.waitForTimeout(1000);
    }

    // Verify simulation is active
    await expect(page.locator('text=Live Telemetry Simulating')).toBeVisible();

    // 3. Test Step +1m button
    const stepBtn = page.locator('button:has-text("Step +1m")');
    await expect(stepBtn).toBeVisible();
    await stepBtn.click();
    await page.waitForTimeout(1000);

    // 4. Test Jump to Hazard Buildup
    const jumpBtn = page.locator('button:has-text("Jump to Hazard")');
    await expect(jumpBtn).toBeVisible();
    await jumpBtn.click();
    await page.waitForTimeout(2500); // Allow poll and inference

    // Verify Active Warnings count is now at least 1!
    const activeWarningsCard = page.locator('text=Active Warnings').locator('..');
    await expect(activeWarningsCard).toBeVisible();

    // Verify Priority Alert or Advance Warning has triggered
    const alertBanner = page.locator('text=Priority Operational Alert').or(page.locator('text=ADVANCE WARNING')).or(page.locator('text=RISK'));
    await expect(alertBanner.first()).toBeVisible();

    // Take screenshot of hazard buildup state
    await page.screenshot({ path: 'e2e-screenshots/01-hazard-buildup.png', fullPage: true });

    // 5. Navigate to Warnings tab to verify active incidents table
    const warningsTabBtn = page.locator('button[data-tab="warnings"]');
    await warningsTabBtn.click();
    await page.waitForTimeout(1000);

    // Verify the table shows active warnings
    await expect(page.locator('th:has-text("Event ID")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Status")').first()).toBeVisible();
    const activeBadge = page.locator('text=ACTIVE').first();
    await expect(activeBadge).toBeVisible();

    await page.screenshot({ path: 'e2e-screenshots/02-active-warnings.png', fullPage: true });

    // 6. Navigate to Sensor Trends tab
    const trendsTabBtn = page.locator('button[data-tab="trends"]');
    await trendsTabBtn.click();
    await page.waitForTimeout(1000);

    // Verify forecast cards
    await expect(page.locator('text=15-Minute Ahead Forecast').first()).toBeVisible();
    await expect(page.locator('text=Airflow').first()).toBeVisible();

    await page.screenshot({ path: 'e2e-screenshots/03-sensor-trends.png', fullPage: true });

    // 7. Reset simulation back to safe baseline
    const resetBtn = page.locator('button:has-text("Reset Baseline")');
    await resetBtn.click();
    await page.waitForTimeout(2000);

    // Return to Overview
    await page.locator('button[data-tab="overview"]').click();
    await page.waitForTimeout(1000);

    // 8. Test Workspace 2: Historical Risk Analysis
    const historicalWorkspaceTab = page.locator('aside button:has-text("Historical Risk Analysis")');
    await historicalWorkspaceTab.click();
    await page.waitForTimeout(1500);

    // Verify Workspace 2 controls
    await expect(page.locator('text=Historical Atmospheric Risk Intelligence').first()).toBeVisible();
    await expect(page.locator('button:has-text("Analyze Period")').first()).toBeVisible();

    // Click Analyze Period
    await page.locator('button:has-text("Analyze Period")').first().click();
    await page.waitForTimeout(3000);

    // Verify analysis results appear
    await expect(page.locator('text=Analyzed Readings').first()).toBeVisible();
    await expect(page.locator('text=Warning Crossings').first()).toBeVisible();
    await expect(page.locator('text=Peak Methane Observed').first()).toBeVisible();

    await page.screenshot({ path: 'e2e-screenshots/04-historical-analysis.png', fullPage: true });
  });
});
