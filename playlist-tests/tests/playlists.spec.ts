import { test, expect, type Page } from '@playwright/test'

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = process.env.TEST_BASE_URL ?? 'http://localhost:4533'
const TEST_USER = process.env.TEST_USER ?? 'admin'
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'admin'
const ADMIN_USER = process.env.ADMIN_USER ?? 'admin'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthTokens {
  username: string
  subsonicToken: string
  subsonicSalt: string
}

interface PlaylistEntry {
  id: string
  name: string
  owner: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loginViaUI(page: Page, username: string, password: string): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.getByRole('textbox').first().fill(username)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: /Navidrome/i })).toBeVisible({ timeout: 15000 })
}

async function getAuthTokens(page: Page, username: string, password: string): Promise<AuthTokens> {
  return page.evaluate(
    async ({ username, password, baseUrl }) => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) throw new Error(`Auth failed: ${res.status}`)
      const data = (await res.json()) as AuthTokens
      return { username: data.username, subsonicToken: data.subsonicToken, subsonicSalt: data.subsonicSalt }
    },
    { username, password, baseUrl: BASE_URL },
  )
}

async function subsonicCall(
  page: Page,
  auth: AuthTokens,
  command: string,
  params: Record<string, string> = {},
): Promise<Record<string, unknown>> {
  return page.evaluate(
    async ({ auth, command, params, baseUrl }) => {
      const sp = new URLSearchParams({
        u: auth.username,
        t: auth.subsonicToken,
        s: auth.subsonicSalt,
        f: 'json',
        v: '1.16.1',
        c: 'PlaywrightPlaylistTests',
        ...params,
      })
      const res = await fetch(`${baseUrl}/rest/${command}.view?${sp}`)
      if (!res.ok) throw new Error(`${command} failed: ${res.status}`)
      const body = (await res.json()) as { 'subsonic-response': Record<string, unknown> }
      const sr = body['subsonic-response']
      if (sr['status'] !== 'ok') throw new Error(`${command} error: ${JSON.stringify(sr['error'])}`)
      return sr
    },
    { auth, command, params, baseUrl: BASE_URL },
  )
}

async function createPlaylistViaApi(page: Page, auth: AuthTokens, name: string): Promise<string> {
  const result = await subsonicCall(page, auth, 'createPlaylist', { name })
  return (result['playlist'] as { id: string }).id
}

async function deletePlaylistViaApi(page: Page, auth: AuthTokens, id: string): Promise<void> {
  await subsonicCall(page, auth, 'deletePlaylist', { id })
}

async function getPlaylistsViaApi(page: Page, auth: AuthTokens): Promise<PlaylistEntry[]> {
  const result = await subsonicCall(page, auth, 'getPlaylists')
  const raw = (result['playlists'] as { playlist?: unknown } | undefined)?.playlist
  if (!raw) return []
  return (Array.isArray(raw) ? raw : [raw]) as PlaylistEntry[]
}

// ─── Tests ───────────────────────────────────────────────────────────────────

// FR-01
test('FR-01: muestra únicamente las playlists del usuario autenticado', async ({ page }) => {
  await loginViaUI(page, TEST_USER, TEST_PASSWORD)
  const testAuth = await getAuthTokens(page, TEST_USER, TEST_PASSWORD)

  // Create a sentinel playlist owned by TEST_USER
  const ownName = `FR01-own-${Date.now()}`
  const ownId = await createPlaylistViaApi(page, testAuth, ownName)

  // Optionally create a private playlist owned by a different user (ADMIN)
  let otherName: string | null = null
  let otherId: string | null = null
  let adminAuth: AuthTokens | null = null

  if (ADMIN_USER !== TEST_USER) {
    adminAuth = await getAuthTokens(page, ADMIN_USER, ADMIN_PASSWORD)
    otherName = `FR01-other-${Date.now()}`
    otherId = await createPlaylistViaApi(page, adminAuth, otherName)
  }

  try {
    await page.goto(`${BASE_URL}/#/playlist`, { waitUntil: 'domcontentloaded' })

    // Wait for the playlist list to render
    await expect(page.locator('tbody').getByText(ownName, { exact: true })).toBeVisible({ timeout: 15000 })

    // TEST_USER must see their own playlist
    await expect(page.locator('tbody').getByText(ownName, { exact: true })).toBeVisible()

    // TEST_USER must NOT see the other user's playlist (cross-user isolation)
    if (otherName) {
      await expect(page.locator('tbody').getByText(otherName, { exact: true })).not.toBeVisible()
    }
  } finally {
    await deletePlaylistViaApi(page, testAuth, ownId)
    if (otherId && adminAuth) {
      await deletePlaylistViaApi(page, adminAuth, otherId)
    }
  }
})

// FR-02
test('FR-02: crea una playlist y la asocia al usuario autenticado', async ({ page }) => {
  const playlistName = `FR02-new-${Date.now()}`

  await loginViaUI(page, TEST_USER, TEST_PASSWORD)
  const auth = await getAuthTokens(page, TEST_USER, TEST_PASSWORD)

  try {
    // Navigate to the create form
    await page.goto(`${BASE_URL}/#/playlist/create`, { waitUntil: 'domcontentloaded' })

    // Fill the name field and submit
    await page.locator('input[name="name"]').waitFor({ timeout: 10000 })
    await page.locator('input[name="name"]').fill(playlistName)
    await page.getByRole('button', { name: /save/i }).click()

    // React Admin redirects to the list after a successful create
    await page.waitForURL(/\/#\/playlist(?:\?.*)?$/, { timeout: 15000 })

    // New playlist must appear in the list
    await expect(
      page.locator('tbody').getByText(playlistName, { exact: true }),
    ).toBeVisible({ timeout: 10000 })

    // Verify via Subsonic API that the playlist exists and belongs to TEST_USER
    const playlists = await getPlaylistsViaApi(page, auth)
    const created = playlists.find((p) => p.name === playlistName)
    expect(created, 'Playlist must exist in the Subsonic API response for TEST_USER').toBeDefined()
    expect(created!.owner).toBe(TEST_USER)
  } finally {
    // Cleanup: delete any playlist created with this name
    const playlists = await getPlaylistsViaApi(page, auth)
    for (const p of playlists.filter((p) => p.name === playlistName)) {
      await deletePlaylistViaApi(page, auth, p.id)
    }
  }
})

// FR-03
test('FR-03: permite crear dos playlists con el mismo nombre y coexisten de forma independiente', async ({
  page,
}) => {
  const sharedName = `FR03-dup-${Date.now()}`

  await loginViaUI(page, TEST_USER, TEST_PASSWORD)
  const auth = await getAuthTokens(page, TEST_USER, TEST_PASSWORD)

  try {
    // Create first playlist via the UI form
    await page.goto(`${BASE_URL}/#/playlist/create`, { waitUntil: 'domcontentloaded' })
    await page.locator('input[name="name"]').waitFor({ timeout: 10000 })
    await page.locator('input[name="name"]').fill(sharedName)
    await page.getByRole('button', { name: /save/i }).click()
    await page.waitForURL(/\/#\/playlist(?:\?.*)?$/, { timeout: 15000 })

    // Create second playlist with the same name
    await page.goto(`${BASE_URL}/#/playlist/create`, { waitUntil: 'domcontentloaded' })
    await page.locator('input[name="name"]').waitFor({ timeout: 10000 })
    await page.locator('input[name="name"]').fill(sharedName)
    await page.getByRole('button', { name: /save/i }).click()
    await page.waitForURL(/\/#\/playlist(?:\?.*)?$/, { timeout: 15000 })

    // Both playlists must appear as separate rows in the list
    const matchingRows = page.locator('tbody tr').filter({ hasText: sharedName })
    await expect(matchingRows).toHaveCount(2, { timeout: 10000 })

    // Verify via Subsonic API: two entries with the same name and different IDs
    const playlists = await getPlaylistsViaApi(page, auth)
    const duplicates = playlists.filter((p) => p.name === sharedName)
    expect(duplicates, 'Both playlists must exist in the Subsonic API').toHaveLength(2)
    expect(duplicates[0].id, 'Playlists with the same name must have different IDs').not.toBe(
      duplicates[1].id,
    )
  } finally {
    // Cleanup: delete all playlists with this name
    const playlists = await getPlaylistsViaApi(page, auth)
    for (const p of playlists.filter((p) => p.name === sharedName)) {
      await deletePlaylistViaApi(page, auth, p.id)
    }
  }
})
