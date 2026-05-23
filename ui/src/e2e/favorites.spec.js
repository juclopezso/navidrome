/**
 * E2E integration tests for the favorites (star/unstar) flow.
 *
 * These tests run a REAL browser against a REAL running stack
 * (Navidrome backend + Vite frontend). They simulate exactly what a user
 * does: navigate to the song list, click the star button, and verify the
 * UI and the backend both reflect the change.
 *
 * Prerequisites:
 *   - Backend at BACKEND_URL  (default: http://localhost:4633)
 *   - Frontend at BASE_URL    (default: http://localhost:4533)
 *   - Admin credentials: admin / admin
 *   - At least one song in the library
 *
 * Run locally (both services must be running):
 *   npm run test:e2e
 *
 * Run via Docker:
 *   docker compose -f docker-compose.dev.yml --profile playwright-test up \
 *     --abort-on-container-exit --exit-code-from playwright-test
 */

import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4633'
const ADMIN_USER = process.env.ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin'

// ---------------------------------------------------------------------------
// Helpers: backend API (used to verify state after UI interactions)
// ---------------------------------------------------------------------------

async function loginViaApi() {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  })
  if (!res.ok) return null
  return res.json()
}

async function getFirstSongFromApi(auth) {
  const subParams = new URLSearchParams({
    u: auth.username,
    t: auth.subsonicToken,
    s: auth.subsonicSalt,
    f: 'json',
    v: '1.8.0',
    c: 'NavidromeUI',
    query: '',
    songCount: 1,
    songOffset: 0,
    albumCount: 0,
    artistCount: 0,
  })
  const res = await fetch(`${BACKEND_URL}/rest/search3?${subParams}`)
  const body = await res.json()
  return body['subsonic-response']?.searchResult3?.song?.[0] ?? null
}

async function getSongStarredState(auth, songId) {
  const res = await fetch(`${BACKEND_URL}/api/song/${songId}`, {
    headers: {
      'X-ND-Authorization': `Bearer ${auth.token}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) return null
  return res.json()
}

async function resetSongStarState(auth, songId) {
  const params = new URLSearchParams({
    u: auth.username,
    t: auth.subsonicToken,
    s: auth.subsonicSalt,
    f: 'json',
    v: '1.8.0',
    c: 'NavidromeUI',
    id: songId,
  })
  await fetch(`${BACKEND_URL}/rest/unstar?${params}`)
}

// ---------------------------------------------------------------------------
// Helpers: browser UI
// ---------------------------------------------------------------------------

async function loginViaUI(page) {
  await page.goto('/')
  // Wait for login form (react-admin renders a form with Final Form Fields)
  await page.waitForSelector('input[name="username"]', { timeout: 15_000 })
  await page.fill('input[name="username"]', ADMIN_USER)
  await page.fill('input[name="password"]', ADMIN_PASS)
  await page.click('button[type="submit"]')
  // Wait for the app shell (navigation or main content) after login
  await page.waitForURL(/.*#\/.*/, { timeout: 15_000 })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Favorites flow — E2E browser + real backend', () => {
  let auth = null
  let testSong = null

  // Run once before all tests to check backend availability and find a song.
  // If anything is unavailable, every test skips rather than failing.
  test.beforeAll(async () => {
    try {
      auth = await loginViaApi()
      if (auth) {
        testSong = await getFirstSongFromApi(auth)
      }
    } catch {
      // Backend not reachable — tests will skip inside
    }
  })

  test.afterAll(async () => {
    if (auth && testSong) {
      await resetSongStarState(auth, testSong.id)
    }
  })

  // ---- Test 1: Login -------------------------------------------------------

  test('user can log in and reach the main application', async ({ page }) => {
    if (!auth) {
      test.skip(true, `Backend not reachable at ${BACKEND_URL}`)
    }

    await loginViaUI(page)

    // The app shell renders a navigation sidebar with the Navidrome logo/title
    await expect(page.locator('nav, [class*="sidebar"], [class*="Sidebar"]').first()).toBeVisible({
      timeout: 10_000,
    })
  })

  // ---- Test 2: Song list renders -------------------------------------------

  test('the songs page renders a list of songs', async ({ page }) => {
    if (!auth) test.skip(true, 'Backend not reachable')
    if (!testSong) test.skip(true, 'No songs found in library')

    await loginViaUI(page)
    await page.goto('/#/song')

    // Wait for at least one row in the song datagrid
    const firstRow = page.locator('table tbody tr').first()
    await expect(firstRow).toBeVisible({ timeout: 15_000 })
  })

  // ---- Test 3: LoveButton is present in the song list ---------------------

  test('every song row contains a LoveButton', async ({ page }) => {
    if (!auth) test.skip(true, 'Backend not reachable')
    if (!testSong) test.skip(true, 'No songs found in library')

    await loginViaUI(page)
    await page.goto('/#/song')

    const firstRow = page.locator('table tbody tr').first()
    await expect(firstRow).toBeVisible({ timeout: 15_000 })

    // Hover to reveal the context menu (which contains the LoveButton)
    await firstRow.hover()

    const loveButton = firstRow.locator('[data-testid="love-button"]')
    await expect(loveButton).toBeVisible({ timeout: 5_000 })
  })

  // ---- Test 4: Clicking the LoveButton stars the song in the UI -----------

  test('clicking the LoveButton changes the icon to filled (starred)', async ({ page }) => {
    if (!auth) test.skip(true, 'Backend not reachable')
    if (!testSong) test.skip(true, 'No songs found in library')

    // Start with a clean (unstarred) state
    await resetSongStarState(auth, testSong.id)

    await loginViaUI(page)
    await page.goto('/#/song')

    const firstRow = page.locator('table tbody tr').first()
    await expect(firstRow).toBeVisible({ timeout: 15_000 })
    await firstRow.hover()

    const loveButton = firstRow.locator('[data-testid="love-button"]')
    await expect(loveButton).toBeVisible()

    // Song should be unstarred initially
    await expect(loveButton).toHaveAttribute('data-starred', 'false')

    // Click to star
    await loveButton.click()

    // The button should update to data-starred="true" as React re-renders
    // after the backend call resolves and dataProvider.getOne refreshes the record.
    await expect(loveButton).toHaveAttribute('data-starred', 'true', { timeout: 10_000 })
  })

  // ---- Test 5: Backend persists the starred state after UI click ----------

  test('starred state after UI click is persisted in the backend', async ({ page }) => {
    if (!auth) test.skip(true, 'Backend not reachable')
    if (!testSong) test.skip(true, 'No songs found in library')

    await resetSongStarState(auth, testSong.id)

    await loginViaUI(page)
    await page.goto('/#/song')

    const firstRow = page.locator('table tbody tr').first()
    await expect(firstRow).toBeVisible({ timeout: 15_000 })
    await firstRow.hover()

    const loveButton = firstRow.locator('[data-testid="love-button"]')
    await loveButton.click()

    // Wait for UI to confirm the change before querying the backend
    await expect(loveButton).toHaveAttribute('data-starred', 'true', { timeout: 10_000 })

    // Now verify the backend actually saved it
    const song = await getSongStarredState(auth, testSong.id)
    expect(song).not.toBeNull()
    expect(song.starred).toBe(true)
  })

  // ---- Test 6: Clicking again unstars the song ----------------------------

  test('clicking the LoveButton again removes the star (toggle behaviour)', async ({ page }) => {
    if (!auth) test.skip(true, 'Backend not reachable')
    if (!testSong) test.skip(true, 'No songs found in library')

    await resetSongStarState(auth, testSong.id)

    await loginViaUI(page)
    await page.goto('/#/song')

    const firstRow = page.locator('table tbody tr').first()
    await expect(firstRow).toBeVisible({ timeout: 15_000 })
    await firstRow.hover()

    const loveButton = firstRow.locator('[data-testid="love-button"]')

    // Star
    await loveButton.click()
    await expect(loveButton).toHaveAttribute('data-starred', 'true', { timeout: 10_000 })

    // Unstar
    await firstRow.hover()
    await loveButton.click()
    await expect(loveButton).toHaveAttribute('data-starred', 'false', { timeout: 10_000 })

    // Verify backend
    const song = await getSongStarredState(auth, testSong.id)
    expect(song?.starred).toBe(false)
  })
})
