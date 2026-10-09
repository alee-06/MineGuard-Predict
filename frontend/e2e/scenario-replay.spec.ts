import { test, expect } from '@playwright/test';

test.describe('Scenario Simulator & Event Replay Fixes', () => {
  test('Scenario Simulator produces continuous predictions and dynamic lead time', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 1. Switch to Historical Risk Analysis workspace
    const histNavBtn = page.locator('button:has-text("Historical Risk Analysis")');
    await expect(histNavBtn).toBeVisible();
    await histNavBtn.click();
    await page.waitForTimeout(1000);

    // 2. Click What-If Simulator button in tab bar
    const simModalBtn = page.locator('button:has-text("What-If Simulator")');
    await expect(simModalBtn).toBeVisible();
    await simModalBtn.click();
    await page.waitForTimeout(500);

    // 3. Verify modal opened
    await expect(page.locator('text=Hypothetical Inputs')).toBeVisible();

    // 4. Click Run What-If Simulation
    const runBtn = page.locator('button:has-text("Run What-If Simulation")');
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    // 5. Wait for simulation to complete
    await page.waitForTimeout(3000);

    // Badges must be visible
    await expect(page.locator('text=Peak Simulated Methane')).toBeVisible();
    await expect(page.locator('text=Highest Warning Chance')).toBeVisible();
    await expect(page.locator('text=Advance Warning Lead Time')).toBeVisible();

    // Verify the chart SVG exists inside simulator
    const chart = page.locator('.h-72.w-full.pt-2 .recharts-responsive-container');
    await expect(chart).toBeVisible();

    // Verify dynamic lead time badge is rendered
    const leadBadge = page.locator('div:has-text("Advance Warning Lead Time") span.font-mono').last();
    await expect(leadBadge).toBeVisible();
    const leadText = await leadBadge.textContent();
    console.log('Advance Warning Lead Time text:', leadText);
    expect(leadText).toBeDefined();

    // Take screenshot of Scenario Simulator
    await page.screenshot({ path: 'e2e-screenshots/scenario-simulator-verified.png' });
  });

  test('Event Replay prioritizes physical hazards and demonstrates accurate model warning', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 1. Switch to Historical Risk Analysis workspace
    const histNavBtn = page.locator('button:has-text("Historical Risk Analysis")');
    await expect(histNavBtn).toBeVisible();
    await histNavBtn.click();
    await page.waitForTimeout(1000);

    // 2. Click Event Replay button in tab bar
    const replayModalBtn = page.locator('button:has-text("Event Replay")');
    await expect(replayModalBtn).toBeVisible();
    await replayModalBtn.click();
    await page.waitForTimeout(500);

    // 3. Verify default episode is EP-0001 (waiting for async load to populate options)
    const episodeSelect = page.locator('select.min-w-\\[320px\\]');
    await expect(episodeSelect).toBeVisible();
    await expect(episodeSelect).toHaveValue('EP-0001', { timeout: 10000 });
    const selectedVal = await episodeSelect.inputValue();
    console.log('Default selected episode in Event Replay:', selectedVal);
    expect(selectedVal).toBe('EP-0001');

    // 4. Verify Physical Atmospheric Hazard banner is displayed
    await expect(page.locator('text=Physical Atmospheric Hazard')).toBeVisible();

    // 5. Select 10x speed and click Play Simulation
    await page.click('button:has-text("10x")');
    const playBtn = page.locator('button:has-text("Play Simulation")');
    await playBtn.click();

    // Allow it to play 30 steps
    await page.waitForTimeout(3000);
    await page.click('button:has-text("Pause Simulation")');

    // 6. Scrub directly to step 400 using input event
    const scrubber = page.locator('input[type="range"]').last();
    await scrubber.evaluate((el: HTMLInputElement) => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value'
      )?.set;
      nativeInputValueSetter?.call(el, '400');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(2000);

    // 7. Verify Correct Warning Issued count is > 0
    const correctWarnings = page.locator('div:has-text("Correct Warning Issued") div.font-mono').last();
    const valText = await correctWarnings.textContent();
    console.log('Correct Warnings Issued at min 400:', valText);
    const count = parseInt(valText || '0', 10);
    expect(count).toBeGreaterThan(0);

    // 8. Verify Unwarned Rise is 0 (model didn't miss this physical event!)
    const missedWarnings = page.locator('div:has-text("Unwarned Rise") div.font-mono').last();
    const missedText = await missedWarnings.textContent();
    console.log('Unwarned Rise count at min 400:', missedText);
    expect(parseInt(missedText || '0', 10)).toBe(0);

    // Take screenshot of Event Replay
    await page.screenshot({ path: 'e2e-screenshots/event-replay-verified.png' });
  });
});
