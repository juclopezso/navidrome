import { chromium } from '@playwright/test'

// Playwright runs this once before any test.
// Vite dev-server compiles all JS modules on the very first page request
// (cold start), which can take 60-120 s. By loading the app here, the cache
// is warm when the actual tests run, so their page.goto calls are fast.
export default async function globalSetup() {
  console.log('\n[global-setup] Warming up Vite dev server — this may take up to 2 minutes on first run...')
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.goto('http://localhost:4533/', {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    })
    // Wait a bit more so Vite finishes pre-bundling in the background
    await page.waitForTimeout(3_000)
    console.log('[global-setup] Vite is ready.\n')
  } catch {
    console.warn('[global-setup] Warm-up timed out — tests may still be slow on first navigation.\n')
  } finally {
    await browser.close()
  }
}
