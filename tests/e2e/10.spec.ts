import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const BASE_URL = 'http://localhost:4533';
const FAVORITE_SONGS = ['FR10-FAV-A', 'FR10-FAV-B'];
const NON_FAVORITE_SONGS = ['FR10-NOFAV-A', 'FR10-NOFAV-B'];
const USERNAME = 'admin';
const PASSWORD = 'admin';
const SUBSONIC_AUTH = `u=${USERNAME}&p=${PASSWORD}&v=1.16.1&c=e2e-playwright&f=json`;

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/`);
  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await expect(page.locator('button[type="submit"]')).not.toBeVisible({ timeout: 15_000 });
}

// Resuelve el ID de una canción por título vía Subsonic search3
async function getSongId(request: APIRequestContext, title: string): Promise<string> {
  const res = await request.get(
    `${BASE_URL}/rest/search3?query=${encodeURIComponent(title)}&songCount=5&albumCount=0&artistCount=0&${SUBSONIC_AUTH}`,
  );
  const body = await res.json();
  const songs: { id: string; title: string }[] = body['subsonic-response']?.searchResult3?.song ?? [];
  const song = songs.find((s) => s.title === title);
  if (!song) throw new Error(`Song "${title}" not found via search3`);
  return song.id;
}

// Estrella una canción vía API (idempotente — star sobre ya-starred es no-op)
async function starSong(request: APIRequestContext, title: string): Promise<void> {
  const id = await getSongId(request, title);
  await request.get(`${BASE_URL}/rest/star?id=${id}&${SUBSONIC_AUTH}`);
}

// Des-estrella una canción vía API (idempotente)
async function unstarSong(request: APIRequestContext, title: string): Promise<void> {
  const id = await getSongId(request, title);
  await request.get(`${BASE_URL}/rest/unstar?id=${id}&${SUBSONIC_AUTH}`);
}

async function getRowTitles(page: Page): Promise<string[]> {
  return page.locator('table tbody tr').evaluateAll(rows =>
    rows.map(r => r.textContent ?? ''),
  );
}

function indexOfMatch(titles: string[], needle: string): number {
  return titles.findIndex(t => t.includes(needle));
}

test.describe.serial('FR-10 Ordenamiento por favoritos', () => {

  test('Precondición — marcar FR10-FAV-A y FR10-FAV-B como favoritas', async ({ request }) => {
    // Usa API star (idempotente) para no depender del estado previo
    for (const title of FAVORITE_SONGS) {
      await starSong(request, title);
    }

    // Verificar vía API que ambas quedaron marcadas
    const response = await request.get(`${BASE_URL}/rest/getStarred2?${SUBSONIC_AUTH}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const songs: { title: string }[] = body['subsonic-response']?.starred2?.song ?? [];
    for (const title of FAVORITE_SONGS) {
      expect(
        songs.some((s) => s.title === title),
        `"${title}" debe retornarse en getStarred2`,
      ).toBeTruthy();
    }
  });

  test('FR-10 Ordenar por favoritos ASC — no favoritas primero', async ({ page }) => {
    await login(page);

    await page.goto(`${BASE_URL}/#/song?order=ASC&sort=starred_at&perPage=100`);
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });

    const titles = await getRowTitles(page);

    // Verificar que las 4 canciones de prueba están en la tabla
    for (const title of [...FAVORITE_SONGS, ...NON_FAVORITE_SONGS]) {
      expect(indexOfMatch(titles, title), `"${title}" debe estar en la tabla`).toBeGreaterThanOrEqual(0);
    }

    // Las no favoritas deben aparecer antes que las favoritas
    for (const nonFav of NON_FAVORITE_SONGS) {
      for (const fav of FAVORITE_SONGS) {
        expect(
          indexOfMatch(titles, nonFav),
          `"${nonFav}" debe aparecer antes que "${fav}" en orden ASC`,
        ).toBeLessThan(indexOfMatch(titles, fav));
      }
    }
  });

  test('FR-10 Ordenar por favoritos DESC — favoritas primero', async ({ page }) => {
    await login(page);

    await page.goto(`${BASE_URL}/#/song?order=DESC&sort=starred_at&perPage=100`);
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });

    const titles = await getRowTitles(page);

    // Verificar que las 4 canciones de prueba están en la tabla
    for (const title of [...FAVORITE_SONGS, ...NON_FAVORITE_SONGS]) {
      expect(indexOfMatch(titles, title), `"${title}" debe estar en la tabla`).toBeGreaterThanOrEqual(0);
    }

    // Las favoritas deben aparecer antes que las no favoritas
    for (const fav of FAVORITE_SONGS) {
      for (const nonFav of NON_FAVORITE_SONGS) {
        expect(
          indexOfMatch(titles, fav),
          `"${fav}" debe aparecer antes que "${nonFav}" en orden DESC`,
        ).toBeLessThan(indexOfMatch(titles, nonFav));
      }
    }
  });

  test('Limpieza — desmarcar FR10-FAV-A y FR10-FAV-B', async ({ request }) => {
    // Usa API unstar (idempotente)
    for (const title of FAVORITE_SONGS) {
      await unstarSong(request, title);
    }
  });

});
