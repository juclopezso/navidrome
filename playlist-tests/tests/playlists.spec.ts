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

interface SongEntry {
  id: string
  title: string
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

async function getFirstSongViaApi(page: Page, auth: AuthTokens): Promise<SongEntry | null> {
  const result = await subsonicCall(page, auth, 'getRandomSongs', { size: '1' })
  const songs = (result['randomSongs'] as { song?: unknown } | undefined)?.song
  if (!songs) return null
  const list = Array.isArray(songs) ? songs : [songs]
  return list[0] as SongEntry
}

async function addSongToPlaylistViaApi(
  page: Page,
  auth: AuthTokens,
  playlistId: string,
  songId: string,
): Promise<void> {
  await subsonicCall(page, auth, 'updatePlaylist', { playlistId, songIdToAdd: songId })
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
    await deletePlaylistViaApi(page, testAuth, ownId).catch(() => { })
    if (adminId && adminAuth) {
      await deletePlaylistViaApi(page, adminAuth, adminId).catch(() => { })
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

// FR-04
test('FR-04: Permite agregar una canción a una playlist existente', async ({ page }) => {
  //const playlistName = `FR04-playlist-${Date.now()}`
  const playlistName = `FR04-TEST_PLAYLIST`


  await loginViaUI(page, TEST_USER, TEST_PASSWORD)
  const auth = await getAuthTokens(page, TEST_USER, TEST_PASSWORD)

  // Precondición: crear playlist vacía y verificar que hay canciones disponibles
  const playlistId = await createPlaylistViaApi(page, auth, playlistName)
  const song = await getFirstSongViaApi(page, auth)
  expect(song, 'Debe haber al menos una canción en la biblioteca').not.toBeNull()

  try {
    // Navegar al listado de canciones
    await page.goto(`${BASE_URL}/#/song`, { waitUntil: 'load' })
    await page.locator('tbody tr').first().waitFor({ state: 'visible', timeout: 15000 })

    // Hover para que el checkbox se vuelva visible y luego seleccionar
    await page.locator('tbody tr').first().hover()
    await page.locator('tbody tr').first().locator('input[data-indeterminate]').click({ force: true })

    // Esperar la barra de bulk actions y hacer click en "Add to Playlist"
    const addToPlaylistBtn = page.getByRole('button', { name: /add to playlist/i })
    await addToPlaylistBtn.waitFor({ state: 'visible', timeout: 10000 })
    await addToPlaylistBtn.click()

    // Esperar el diálogo de selección de playlist
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 10000 })

    // Filtrar por nombre de la playlist en el campo de búsqueda
    const searchField = page.getByRole('dialog').locator('input').first()
    await searchField.fill(playlistName)

    // Hacer click en el item de la playlist en la lista
    await page.getByRole('dialog').getByText(playlistName, { exact: true }).click()

    // Registrar la captura ANTES del click — así no se pierde la request si llega rápido
    const addRequestPromise = page.waitForRequest(
      (req) =>
        req.url().includes(`/api/playlist/`) &&
        req.url().includes('/tracks') &&
        req.method() === 'POST',
      { timeout: 15000 },
    )

    // El botón "Add" se habilita → hacer click
    const addBtn = page.locator('[data-testid="playlist-add"]')
    await expect(addBtn).toBeEnabled({ timeout: 5000 })
    await addBtn.click()

    // Extraer el ID de la canción desde el payload del POST
    const addRequest = await addRequestPromise
    const payload = addRequest.postDataJSON() as string[] | { ids: string[] } | { id: string }
    const selectedSongId = Array.isArray(payload)
      ? payload[0]
      : 'ids' in payload
        ? payload.ids[0]
        : payload.id
    expect(selectedSongId, 'La UI debe haber enviado un ID de canción válido en el payload').toBeTruthy()

    // Esperar que el diálogo se cierre
    await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 10000 })

    // Verificar en la UI: navegar a la playlist y confirmar que la canción aparece
    await page.goto(`${BASE_URL}/#/playlist/${playlistId}/show`, { waitUntil: 'commit' })
    await expect(
      page.locator('tbody tr').first(),
      'La canción debe aparecer en la vista de la playlist',
    ).toBeVisible({ timeout: 20000 })

    // Verificar via API que la playlist tiene la canción agregada
    const result = await subsonicCall(page, auth, 'getPlaylist', { id: playlistId })
    const entry = (result['playlist'] as { entry?: unknown })?.entry
    const entries = entry ? (Array.isArray(entry) ? entry : [entry]) as SongEntry[] : []
    expect(entries.length, 'La playlist debe tener al menos una canción').toBeGreaterThanOrEqual(1)

    // El ID en la playlist debe ser el mismo que la UI envió en el request
    const addedSongId = entries[0].id
    expect(addedSongId, 'El ID en la playlist debe coincidir con el enviado por la UI').toBe(selectedSongId)

    // Verificar que ese ID existe en la biblioteca via getSong
    const songResult = await subsonicCall(page, auth, 'getSong', { id: addedSongId })
    const songData = songResult['song'] as SongEntry | undefined
    expect(songData, 'El ID debe corresponder a una canción existente en la biblioteca').toBeDefined()
    expect(songData!.id, 'El ID retornado por getSong debe coincidir').toBe(addedSongId)
  } finally {
    await deletePlaylistViaApi(page, auth, playlistId).catch(() => { })
  }
})

// FR-05
test('FR-05: Permite eliminar una canción de una playlist', async ({ page }) => {
  const playlistName = `FR05-TEST_PLAYLIST`

  await loginViaUI(page, TEST_USER, TEST_PASSWORD)
  const auth = await getAuthTokens(page, TEST_USER, TEST_PASSWORD)

  // Precondición: crear playlist y agregar DOS canciones via API
  const songs = await subsonicCall(page, auth, 'getRandomSongs', { size: '2' })
  const rawSongs = (songs['randomSongs'] as { song?: unknown })?.song
  const songList = rawSongs ? (Array.isArray(rawSongs) ? rawSongs : [rawSongs]) as SongEntry[] : []
  expect(songList.length, 'Debe haber al menos una canción en la biblioteca').toBeGreaterThan(0)

  const playlistId = await createPlaylistViaApi(page, auth, playlistName)
  // Agregar las dos canciones (si solo hay una en la biblioteca, se agrega dos veces)
  await addSongToPlaylistViaApi(page, auth, playlistId, songList[0].id)
  await addSongToPlaylistViaApi(page, auth, playlistId, (songList[1] ?? songList[0]).id)

  try {
    // Navegar a la vista de la playlist y confirmar que hay 2 canciones
    await page.goto(`${BASE_URL}/#/playlist/${playlistId}/show`, { waitUntil: 'load' })
    await expect(page.locator('tbody tr'), 'La playlist debe tener 2 canciones antes de eliminar')
      .toHaveCount(2, { timeout: 15000 })

    // Capturar el título de la primera canción para verificar que desaparece
    const firstRowTitle = await page.locator('tbody tr').first().textContent()

    // Hover para que el checkbox se vuelva visible y seleccionar la primera canción
    await page.locator('tbody tr').first().hover()
    await page.locator('tbody tr').first().locator('input[data-indeterminate]').click({ force: true })

    // Registrar la captura del DELETE ANTES de hacer click en Remove
    const removeRequestPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/playlist/') &&
        req.url().includes('/tracks') &&
        req.method() === 'DELETE',
      { timeout: 15000 },
    )

    // Hacer click en el botón "Remove" de la barra bulk
    const removeBtn = page.getByRole('button', { name: /remove/i })
    await removeBtn.waitFor({ state: 'visible', timeout: 10000 })
    await removeBtn.click()

    // Confirmar el diálogo si aparece
    const confirmBtn = page.getByRole('button', { name: /confirm/i })
    const confirmVisible = await confirmBtn.isVisible().catch(() => false)
    if (confirmVisible) {
      await confirmBtn.click()
    }

    // Verificar que la UI envió el DELETE al endpoint correcto
    await removeRequestPromise

    // Verificar en la UI: ahora debe quedar exactamente 1 canción
    await expect(page.locator('tbody tr'), 'Debe quedar 1 canción tras eliminar la primera')
      .toHaveCount(1, { timeout: 15000 })

    // Verificar via API que la playlist tiene exactamente 1 canción
    const result = await subsonicCall(page, auth, 'getPlaylist', { id: playlistId })
    const entry = (result['playlist'] as { entry?: unknown })?.entry
    const remaining = entry ? (Array.isArray(entry) ? entry : [entry]) as SongEntry[] : []
    expect(remaining, 'La API debe reportar exactamente 1 canción restante').toHaveLength(1)

    // La canción eliminada (songList[0]) ya no debe estar en la playlist
    const remainingIds = remaining.map((s) => s.id)
    expect(remainingIds, 'La canción seleccionada debe haber sido eliminada').not.toContain(songList[0].id)

    // Si las canciones eran distintas, la que quedó debe ser songList[1]
    if (songList.length >= 2 && songList[0].id !== songList[1].id) {
      expect(remainingIds, 'La canción no seleccionada debe permanecer en la playlist').toContain(songList[1].id)
    }
  } finally {
    await deletePlaylistViaApi(page, auth, playlistId).catch(() => { })
  }
})

// FR-06
test('FR-06: Permite eliminar una playlist completa', async ({ page }) => {

  const playlistName = `FR06-TEST_PLAYLIST`
  await loginViaUI(page, TEST_USER, TEST_PASSWORD)
  const auth = await getAuthTokens(page, TEST_USER, TEST_PASSWORD)

  // Precondición: crear una playlist via API
  const playlistId = await createPlaylistViaApi(page, auth, playlistName)

  try {
    // Navegar al listado de playlists
    await page.goto(`${BASE_URL}/#/playlist`, { waitUntil: 'load' })

    // Identificar la fila exacta por el href del botón Edit que contiene el playlistId
    // Esto evita ambigüedad cuando existen varias filas con el mismo nombre "TEST_PLAYLIST"
    const playlistRow = page.locator('tbody tr').filter({
      has: page.locator(`a[href*="${playlistId}"]`),
    })
    await expect(playlistRow).toBeVisible({ timeout: 15000 })

    // Hover para que el checkbox se vuelva visible y luego seleccionar
    // Se usa data-indeterminate para distinguir el checkbox de selección del Switch de "Public"
    await playlistRow.hover()
    await playlistRow.locator('input[data-indeterminate]').click({ force: true })

    // Hacer click en el botón "Delete" de la barra bulk
    const deleteBtn = page.getByRole('button', { name: /delete/i })
    await deleteBtn.waitFor({ state: 'visible', timeout: 10000 })
    await deleteBtn.click()

    // Esperar que la fila desaparezca de la UI (RA la elimina optimistamente)
    await expect(playlistRow).not.toBeVisible({ timeout: 25000 })

    // RA v3 usa undoable mode: el DELETE llega al servidor después de ~5s (undo window).
    // expect.poll reintenta hasta que la API confirme la eliminación real.
    await expect.poll(
      async () => {
        const playlists = await getPlaylistsViaApi(page, auth)
        return playlists.find((p) => p.id === playlistId)
      },
      { message: 'La playlist eliminada no debe aparecer en la API', timeout: 15000 },
    ).toBeUndefined()
  } catch (e) {
    await deletePlaylistViaApi(page, auth, playlistId).catch(() => { })
    throw e
  }
})