import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests', testMatch: 'squad-finder.spec.ts', fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:5176', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5176 --strictPort', url: 'http://127.0.0.1:5176', reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: 'https://xensi-presets.example.invalid', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_fixture' },
  },
})
