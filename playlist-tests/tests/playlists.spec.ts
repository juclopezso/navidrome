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
  await page.goto(BASE_URL)
  // Espera el formulario (tolera recargas de Vite en primera carga)
  const usernameInput = page.getByRole('textbox').first()
  await usernameInput.waitFor({ state: 'visible', timeout: 60000 })
  await usernameInput.fill(username)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // Tras login exitoso el hash cambia a '#/<recurso>' — funciona para cualquier usuario
  await page.waitForURL(
    (url) => url.hash.startsWith('#/') && !url.hash.startsWith('#/login'),
    { timeout: 30000 },
  )
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
      const data = (await res.json()) as {
        username: string
        subsonicToken: string
        subsonicSalt: string
      }
      return {
        username: data.username,
        subsonicToken: data.subsonicToken,
        subsonicSalt: data.subsonicSalt,
      }
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
  // 1. Login en la UI primero — si las credenciales son incorrectas se ve aquí
  await loginViaUI(page, TEST_USER, TEST_PASSWORD)

  // 2. Con el browser ya en la app, obtenemos tokens de ambos usuarios vía API
  const testAuth = await getAuthTokens(page, TEST_USER, TEST_PASSWORD)

  // 3. Creamos una playlist propia de TEST_USER para confirmar que sí la ve
  const ownName = `FR01-own-${Date.now()}`
  const ownId = await createPlaylistViaApi(page, testAuth, ownName)

  // 4. Si hay un usuario admin distinto, creamos su playlist (no debería verse)
  let adminName: string | null = null
  let adminId: string | null = null
  let adminAuth: AuthTokens | null = null

  if (ADMIN_USER !== TEST_USER) {
    adminAuth = await getAuthTokens(page, ADMIN_USER, ADMIN_PASSWORD)
    adminName = `FR01-admin-${Date.now()}`
    adminId = await createPlaylistViaApi(page, adminAuth, adminName)
  }

  try {
    // 5. Navegamos a la sección de playlists
    await page.goto(`${BASE_URL}/#/playlist`, { waitUntil: 'load' })

    // La playlist propia debe verse
    await expect(
      page.locator('tbody').getByText(ownName, { exact: true }),
    ).toBeVisible({ timeout: 15000 })

    // La playlist del admin NO debe verse (solo verificable con dos usuarios distintos)
    if (adminName) {
      await expect(
        page.locator('tbody').getByText(adminName, { exact: true }),
      ).not.toBeVisible()
    }
  } finally {
    await deletePlaylistViaApi(page, testAuth, ownId).catch(() => {})
    if (adminId && adminAuth) {
      await deletePlaylistViaApi(page, adminAuth, adminId).catch(() => {})
    }
  }
})

// FR-02
test('FR-02: crea una playlist y la asocia al usuario autenticado', async ({ page }) => {
  const playlistName = `FR02-new-${Date.now()}`

  await loginViaUI(page, TEST_USER, TEST_PASSWORD)
  const auth = await getAuthTokens(page, TEST_USER, TEST_PASSWORD)

  try {
    // Navegamos al formulario de creación
    await page.goto(`${BASE_URL}/#/playlist/create`, { waitUntil: 'load' })

    // Rellenamos el nombre y guardamos
    await page.locator('input[name="name"]').waitFor({ timeout: 10000 })
    await page.locator('input[name="name"]').fill(playlistName)
    await page.getByRole('button', { name: /save/i }).click()

    // React Admin redirige al listado tras crear con éxito
    await page.waitForURL(/\/#\/playlist(?:\?.*)?$/, { timeout: 15000 })

    // La nueva playlist debe aparecer en la tabla
    await expect(
      page.locator('tbody').getByText(playlistName, { exact: true }),
    ).toBeVisible({ timeout: 10000 })

    // La API Subsonic también debe reportarla como propiedad de TEST_USER
    const playlists = await getPlaylistsViaApi(page, auth)
    const created = playlists.find((p) => p.name === playlistName)
    expect(created, 'La playlist debe existir en la respuesta de la API Subsonic').toBeDefined()
    expect(created!.owner).toBe(TEST_USER)
  } finally {
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
    // Primera playlist con el nombre compartido
    await page.goto(`${BASE_URL}/#/playlist/create`, { waitUntil: 'load' })
    await page.locator('input[name="name"]').waitFor({ timeout: 10000 })
    await page.locator('input[name="name"]').fill(sharedName)
    await page.getByRole('button', { name: /save/i }).click()
    await page.waitForURL(/\/#\/playlist(?:\?.*)?$/, { timeout: 15000 })

    // Segunda playlist con el mismo nombre
    await page.goto(`${BASE_URL}/#/playlist/create`, { waitUntil: 'load' })
    await page.locator('input[name="name"]').waitFor({ timeout: 10000 })
    await page.locator('input[name="name"]').fill(sharedName)
    await page.getByRole('button', { name: /save/i }).click()
    await page.waitForURL(/\/#\/playlist(?:\?.*)?$/, { timeout: 15000 })

    // Deben aparecer dos filas separadas con el mismo nombre
    const matchingRows = page.locator('tbody tr').filter({ hasText: sharedName })
    await expect(matchingRows).toHaveCount(2, { timeout: 10000 })

    // La API también debe reportar dos entradas con IDs distintos
    const playlists = await getPlaylistsViaApi(page, auth)
    const duplicates = playlists.filter((p) => p.name === sharedName)
    expect(duplicates, 'Deben existir exactamente 2 playlists con el mismo nombre').toHaveLength(2)
    expect(duplicates[0].id, 'Las dos playlists deben tener IDs distintos').not.toBe(duplicates[1].id)
  } finally {
    const playlists = await getPlaylistsViaApi(page, auth)
    for (const p of playlists.filter((p) => p.name === sharedName)) {
      await deletePlaylistViaApi(page, auth, p.id)
    }
  }
})
