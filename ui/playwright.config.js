import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './src/e2e',
  timeout: 30000,
  retries: 0,
  workers: 1,
  use: {
    // 800px keeps us below Material UI's md breakpoint (960px) so
    // contextAlwaysVisible=true in SongDatagrid — LoveButton stays in DOM.
    viewport: { width: 800, height: 600 },
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
})
