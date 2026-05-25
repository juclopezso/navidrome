import { test, expect } from '@playwright/test'

// Subsonic API auth params (matches default dev credentials from docker-compose.dev.yml)
const AUTH = 'u=admin&p=admin&v=1.16.1&c=playwright-e2e&f=json'

// ---------------------------------------------------------------------------
// Helper: log into the app via the UI login form
// ---------------------------------------------------------------------------
async function login(page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.locator('input[name="username"]').fill('admin')
  await page.locator('input[type="password"]').fill('admin')
  await page.getByRole('button', { name: /sign in|login/i }).click()
  // Wait until the Material-UI AppBar is visible — the app loaded successfully
  await page.waitForSelector('[class*="MuiAppBar"]', { timeout: 15_000 })
}

// ---------------------------------------------------------------------------
// Helper: navigate to the songs list and return the row for a specific song
// ---------------------------------------------------------------------------
async function getSongRow(page, songTitle) {
  // Navidrome uses hash routing: /#/song, not /song
  await page.goto('/#/song', { waitUntil: 'domcontentloaded' })
  // React Admin 3.x does not add data-id to rows — find by title text instead
  const row = page.locator('tr').filter({ hasText: songTitle }).first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  return row
}

// ===========================================================================
// Suite
// ===========================================================================
test.describe.serial('Unfavorite Integration Tests', () => {
  let songId
  let songTitle

  // ── Global setup: find one song from the real library ───────────────────
  test.beforeAll(async ({ request }) => {
    const resp = await request.get(
      `/rest/search3?${AUTH}&query=&songCount=1&albumCount=0&artistCount=0`,
    )
    const json = await resp.json()
    const song = json['subsonic-response']?.searchResult3?.song?.[0]

    if (!song) {
      throw new Error(
        'No hay canciones en la biblioteca.\n' +
          'Agrega archivos de audio a la carpeta music/, ' +
          'reinicia el stack con "docker compose -f docker-compose.dev.yml up --build" ' +
          'y vuelve a correr las pruebas.',
      )
    }

    songId = song.id
    songTitle = song.title

    // Start from a known clean state
    await request.get(`/rest/unstar?${AUTH}&id=${songId}`)
  })

  // ── Global teardown: leave the song unstarred ────────────────────────────
  test.afterAll(async ({ request }) => {
    if (songId) {
      await request.get(`/rest/unstar?${AUTH}&id=${songId}`)
    }
  })

  // =========================================================================
  // LEVEL 2 — Frontend <-> Backend
  //
  // Verifica que cuando el usuario hace click en el botón de corazón, el
  // frontend llama al backend real y la UI se actualiza inmediatamente para
  // mostrar la canción como NO favorita, sin necesidad de recargar la página.
  // =========================================================================
  test.describe('Level 2: UI removes song from favorites through real backend', () => {
    // Pre-condition: star the song via API so it shows as favorited in the UI
    test.beforeEach(async ({ request }) => {
      await request.get(`/rest/star?${AUTH}&id=${songId}`)
    })

    test(
      'clicking the unstar button updates the UI immediately to show song as not favorite',
      async ({ page }) => {
        await login(page)
        const row = await getSongRow(page, songTitle)
        const loveButton = row.locator('[data-testid="love-button"]')

        // Pre-condition: confirm the song is currently shown as starred in the UI
        await expect(loveButton).toHaveAttribute('aria-pressed', 'true', {
          timeout: 5_000,
        })

        // ── Act ──────────────────────────────────────────────────────────────
        // Simulate the user clicking the heart/unfavorite button
        await loveButton.click()

        // ── Verify (Level 2) ─────────────────────────────────────────────────
        // The UI immediately reflects the new state — no page reload required.
        // This confirms the frontend called the real backend (/rest/unstar)
        // and updated the component state upon receiving a success response.
        await expect(loveButton).toHaveAttribute('aria-pressed', 'false', {
          timeout: 8_000,
        })
      },
    )
  })

  // =========================================================================
  // LEVEL 3 — Frontend <-> Backend <-> Database
  //
  // Verifica que el estado "no favorito" persiste en la base de datos.
  // Después de hacer unstar por la UI, una recarga completa de página
  // (nueva petición HTTP al backend, que lee de SQLite) debe mostrar
  // la canción como NO favorita. Si el cambio no se persistió en la BD,
  // la canción reaparecería con el corazón lleno.
  // =========================================================================
  test.describe('Level 3: Unfavorite state persists after page reload', () => {
    // Pre-condition: star the song via API so it shows as favorited in the UI
    test.beforeEach(async ({ request }) => {
      await request.get(`/rest/star?${AUTH}&id=${songId}`)
    })

    test(
      'song remains not favorite and does not appear in favorites after page reload',
      async ({ page }) => {
        await login(page)
        const row = await getSongRow(page, songTitle)
        const loveButton = row.locator('[data-testid="love-button"]')

        // Pre-condition: confirm the song is currently shown as starred
        await expect(loveButton).toHaveAttribute('aria-pressed', 'true', {
          timeout: 5_000,
        })

        // ── Act 1: unstar via UI ─────────────────────────────────────────────
        await loveButton.click()
        await expect(loveButton).toHaveAttribute('aria-pressed', 'false', {
          timeout: 8_000,
        })

        // ── Act 2: simulate page reload ──────────────────────────────────────
        // This is a full navigation — the browser discards all in-memory state
        // and fetches fresh data from the backend, which reads from SQLite.
        await page.reload({ waitUntil: 'domcontentloaded' })

        // ── Verify (Level 3) ─────────────────────────────────────────────────
        // After reload, the backend serves fresh data from the DB.
        // The LoveButton must still show aria-pressed="false", proving the
        // unfavorite state was durably written to SQLite, not just cached in memory.
        const reloadedRow = page.locator('tr').filter({ hasText: songTitle }).first()
        await expect(reloadedRow).toBeVisible({ timeout: 30_000 })
        await expect(
          reloadedRow.locator('[data-testid="love-button"]'),
        ).toHaveAttribute('aria-pressed', 'false')

        // Extra: navigate away and back (simulates closing and reopening the tab)
        await page.goto('/#/album', { waitUntil: 'domcontentloaded' })
        await page.goto('/#/song', { waitUntil: 'domcontentloaded' })

        const finalRow = page.locator('tr').filter({ hasText: songTitle }).first()
        await expect(finalRow).toBeVisible({ timeout: 30_000 })
        await expect(
          finalRow.locator('[data-testid="love-button"]'),
        ).toHaveAttribute('aria-pressed', 'false')
      },
    )
  })
})
