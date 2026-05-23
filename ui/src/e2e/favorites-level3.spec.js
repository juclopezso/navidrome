/**
 * Level 3 E2E — Favorite persistence after page reload
 *
 * Covers the full stack: Browser UI ↔ Backend (/rest/star|unstar) ↔ SQLite DB
 *
 * Scenarios:
 *   1. Favorite state persists after reload   (unstar → click → starred=true → reload → still true)
 *   2. Unfavorite state persists after reload (star   → click → starred=false → reload → still false)
 *
 * Prerequisites:
 *   - Backend running at BACKEND_URL (default http://localhost:4633)
 *   - Frontend running at BASE_URL   (default http://localhost:4533)
 *   - At least one music file scanned into the library
 */

import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'http://localhost:4533'
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4633'

// ── API helpers ──────────────────────────────────────────────────────────────

async function loginViaApi() {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin' }),
  })
  const body = await res.json()
  if (!body.token) throw new Error(`Login failed: ${JSON.stringify(body)}`)
  return body
}

async function apiFetch(path, authInfo) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { Authorization: `Bearer ${authInfo.token}` },
  })
  return res.json()
}

async function subsonicRequest(endpoint, authInfo, params = {}) {
  const url = new URL(`${BACKEND_URL}/rest/${endpoint}`)
  url.searchParams.set('u', authInfo.username)
  url.searchParams.set('t', authInfo.subsonicToken)
  url.searchParams.set('s', authInfo.subsonicSalt)
  url.searchParams.set('f', 'json')
  url.searchParams.set('v', '1.8.0')
  url.searchParams.set('c', 'e2e-level3')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  const json = await res.json()
  return json['subsonic-response']
}

// ── Test suite ───────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' })

test.describe('Level 3 E2E – Favorite persistence after page reload', () => {
  let authInfo
  let songId

  test.beforeAll(async () => {
    authInfo = await loginViaApi()

    // Get first page of songs (same sort as SongList default: title ASC)
    const songs = await apiFetch(
      '/api/song?_sort=title&_order=ASC&_start=0&_end=15',
      authInfo,
    )

    if (!Array.isArray(songs) || songs.length === 0) {
      throw new Error(
        'No songs found in the library. ' +
          'Add audio files to ./music and let the backend scan them before running E2E tests.',
      )
    }

    songId = songs[0].id
  })

  // ── Helpers (use captured authInfo / songId) ─────────────────────────────

  async function setStar(starred) {
    const endpoint = starred ? 'star' : 'unstar'
    await subsonicRequest(endpoint, authInfo, { id: songId })
  }

  async function isStarredInBackend() {
    const data = await apiFetch(`/api/song/${songId}`, authInfo)
    return data.starred === true
  }

  async function seedAuth(page) {
    // Load the shell page so localStorage is set on the right origin, then
    // inject auth so the React app skips the login screen on next navigate.
    await page.goto(BASE_URL)
    await page.evaluate((info) => {
      localStorage.setItem('token', info.token)
      localStorage.setItem('userId', info.id)
      localStorage.setItem('name', info.name)
      localStorage.setItem('username', info.username)
      localStorage.setItem('role', info.isAdmin ? 'admin' : 'regular')
      localStorage.setItem('subsonic-salt', info.subsonicSalt)
      localStorage.setItem('subsonic-token', info.subsonicToken)
      localStorage.setItem('is-authenticated', 'true')
    }, authInfo)
  }

  // ── Scenario 1 ───────────────────────────────────────────────────────────

  test('Scenario 1: Favorite state persists after reload', async ({ page }) => {
    // Arrange: song must NOT be starred
    await setStar(false)

    await seedAuth(page)
    await page.goto(`${BASE_URL}/#/song`)

    const loveBtn = page
      .locator(`[data-testid="love-button"][data-record-id="${songId}"]`)
      .first()
    await loveBtn.waitFor({ state: 'attached', timeout: 15000 })

    // Assert pre-condition
    await expect(loveBtn).toHaveAttribute('data-starred', 'false')

    // Act: star the song through the UI
    await loveBtn.click({ force: true })
    await expect(loveBtn).toHaveAttribute('data-starred', 'true', {
      timeout: 5000,
    })

    // Act: full page reload
    await page.reload()
    await loveBtn.waitFor({ state: 'attached', timeout: 15000 })

    // Assert: UI still shows starred after reload
    await expect(loveBtn).toHaveAttribute('data-starred', 'true', {
      timeout: 5000,
    })

    // Assert: backend / DB also shows starred
    expect(await isStarredInBackend()).toBe(true)
  })

  // ── Scenario 2 ───────────────────────────────────────────────────────────

  test('Scenario 2: Unfavorite state persists after reload', async ({
    page,
  }) => {
    // Arrange: song must be starred
    await setStar(true)

    await seedAuth(page)
    await page.goto(`${BASE_URL}/#/song`)

    const loveBtn = page
      .locator(`[data-testid="love-button"][data-record-id="${songId}"]`)
      .first()
    await loveBtn.waitFor({ state: 'attached', timeout: 15000 })

    // Assert pre-condition
    await expect(loveBtn).toHaveAttribute('data-starred', 'true')

    // Act: unstar the song through the UI
    await loveBtn.click({ force: true })
    await expect(loveBtn).toHaveAttribute('data-starred', 'false', {
      timeout: 5000,
    })

    // Act: full page reload
    await page.reload()
    await loveBtn.waitFor({ state: 'attached', timeout: 15000 })

    // Assert: UI still shows unstarred after reload
    await expect(loveBtn).toHaveAttribute('data-starred', 'false', {
      timeout: 5000,
    })

    // Assert: backend / DB also shows not starred
    expect(await isStarredInBackend()).toBe(false)
  })
})
