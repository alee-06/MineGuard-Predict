import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL: 'http://127.0.0.1:8000',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'off',
  },
  webServer: {
    command: 'C:\\Users\\abuna\\Desktop\\clg\\IOT\\MineGuard-Predict\\.venv\\Scripts\\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000',
    cwd: '..',
    url: 'http://127.0.0.1:8000/api/health',
    reuseExistingServer: true,
    timeout: 45000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
