import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const BASE_URL = 'http://localhost:4533';
const FAVORITE_SONG = 'FR09-FAV';
const NON_FAVORITE_SONG = 'FR09-NOFAV';
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

// Estrella una canción vía API (idempotente)
async function starSong(request: APIRequestContext, title: string): Promise<void> {
  const id = await getSongId(request, title);
  await request.get(`${BASE_URL}/rest/star?id=${id}&${SUBSONIC_AUTH}`);
}

// Des-estrella una canción vía API (idempotente)
async function unstarSong(request: APIRequestContext, title: string): Promise<void> {
  const id = await getSongId(request, title);
  await request.get(`${BASE_URL}/rest/unstar?id=${id}&${SUBSONIC_AUTH}`);
}

test.describe.serial('FR-09 Filtrar canciones favoritas', () => {

  test('Precondición — marcar FR09-FAV como favorita', async ({ request }) => {
    // Usa API star (idempotente) para no depender del estado previo
    await starSong(request, FAVORITE_SONG);

    // Verificar vía API que quedó marcada
    const response = await request.get(`${BASE_URL}/rest/getStarred2?${SUBSONIC_AUTH}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const songs: { title: string }[] = body['subsonic-response']?.starred2?.song ?? [];
    expect(
      songs.some((s) => s.title === FAVORITE_SONG),
      `"${FAVORITE_SONG}" debe retornarse en getStarred2`,
    ).toBeTruthy();
  });

  test('FR-09 Filtrar canciones favoritas', async ({ page, request }) => {
    await login(page);

    // Verificar estado inicial: ambas canciones visibles sin filtro
    await page.goto(`${BASE_URL}/#/song`);
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('row').filter({ hasText: FAVORITE_SONG })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('row').filter({ hasText: NON_FAVORITE_SONG })).toBeVisible({ timeout: 10_000 });

    // Aplicar filtro de favoritos
    const filter = encodeURIComponent(JSON.stringify({ starred: true }));
    await page.goto(`${BASE_URL}/#/song?filter=${filter}`);
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });

    // Verificación UI positiva: la favorita debe aparecer
    await expect(
      page.getByRole('row').filter({ hasText: FAVORITE_SONG }),
    ).toBeVisible({ timeout: 10_000 });

    // Verificación UI negativa: la no favorita NO debe aparecer
    await expect(
      page.getByRole('row').filter({ hasText: NON_FAVORITE_SONG }),
    ).not.toBeVisible();

    // Verificación API Subsonic
    const response = await request.get(`${BASE_URL}/rest/getStarred2?${SUBSONIC_AUTH}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const songs: { title: string }[] = body['subsonic-response']?.starred2?.song ?? [];
    expect(
      songs.some((s) => s.title === FAVORITE_SONG),
      `"${FAVORITE_SONG}" debe retornarse en getStarred2`,
    ).toBeTruthy();
    expect(
      songs.some((s) => s.title === NON_FAVORITE_SONG),
      `"${NON_FAVORITE_SONG}" NO debe retornarse en getStarred2`,
    ).toBeFalsy();
  });

  test('Limpieza — desmarcar FR09-FAV', async ({ request }) => {
    // Usa API unstar (idempotente)
    await unstarSong(request, FAVORITE_SONG);
  });

});
