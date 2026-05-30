import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const BASE_URL = 'http://localhost:4533';
const SONG_TITLE = 'FR07-08';
const USERNAME = 'admin';
const PASSWORD = 'admin';
const SUBSONIC_AUTH = `u=${USERNAME}&p=${PASSWORD}&v=1.16.1&c=e2e-playwright&f=json`;

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/login`);
  await page.locator('input[name="username"]').click();
  await page.locator('input[name="username"]').fill('admin');
  await page.locator('input[name="password"]').click();
  await page.locator('input[name="password"]').fill('admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
} 

// Los tests deben correr en orden: FR-07 estrella la canción, FR-08 la des-estrella
test.describe.serial('Favoritos', () => {

  test('FR-07 Marcar canción como favorita', async ({ page, request }) => {
    // 1. Login
    await login(page);
    // Garantizar que la canción NO está marcada antes de marcarla
    await ensureStarState(request, false);

    // 2. Dar click en boton de favoritos
    await clickFavButtom(page, 'Yes');

    const row = page.getByRole('row');
    // Verificación UI: la canción FR07-08 debe mostrarse en favoritos
    await expect(
      row.filter({ hasText: SONG_TITLE })
    ).toBeVisible();

    // Verificación API Subsonic: getStarred2 debe incluir la canción
    const response = await request.get(`${BASE_URL}/rest/getStarred2?${SUBSONIC_AUTH}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const songs: { title: string }[] = body['subsonic-response']?.starred2?.song ?? [];
    expect(
      songs.some((s) => s.title === SONG_TITLE),
      `"${SONG_TITLE}" debe retornarse en getStarred2`,
    ).toBeTruthy();
  });

  test('FR-08 Desmarcar canción como favorita', async ({ page, request }) => {
    // 1. Login
    await login(page);
    // Garantizar que la canción SÍ está marcada antes de desmarcarla
    await ensureStarState(request, true);

    // 2. Filtrar por no favoritos
    await clickFavButtom(page, 'No');

   const row = page.getByRole('row');

    // Verificación UI: la canción FR07-08 debe mostrarse en NO favoritos
    await expect(
      row.filter({ hasText: SONG_TITLE })
    ).toBeVisible();

    // Verificación API Subsonic: getStarred2 NO debe incluir la canción
    const response = await request.get(`${BASE_URL}/rest/getStarred2?${SUBSONIC_AUTH}`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    const songs: { title: string }[] = body['subsonic-response']?.starred2?.song ?? [];
    expect(
      songs.some((s) => s.title === SONG_TITLE),
      `"${SONG_TITLE}" NO debe retornarse en getStarred2`,
    ).toBeFalsy();
  });

});

async function ensureStarState(request: APIRequestContext, starred: boolean): Promise<void> {
  // Buscar la canción por título para obtener su ID
  const searchRes = await request.get(`${BASE_URL}/rest/search3?query=${encodeURIComponent(SONG_TITLE)}&songCount=5&${SUBSONIC_AUTH}`);
  const searchBody = await searchRes.json();
  const songs = searchBody['subsonic-response']?.searchResult3?.song ?? [];
  const song = songs.find((s: any) => s.title === SONG_TITLE);
  if (!song) throw new Error(`Canción "${SONG_TITLE}" no encontrada en la biblioteca`);

  // Verificar estado actual
  const starredRes = await request.get(`${BASE_URL}/rest/getStarred2?${SUBSONIC_AUTH}`);
  const starredBody = await starredRes.json();
  const starredSongs: { id: string }[] = starredBody['subsonic-response']?.starred2?.song ?? [];
  const isStarred = starredSongs.some((s) => s.id === song.id);

  // Solo actuar si el estado actual no coincide con el deseado
  if (starred && !isStarred) {
    await request.get(`${BASE_URL}/rest/star?id=${song.id}&${SUBSONIC_AUTH}`);
  } else if (!starred && isStarred) {
    await request.get(`${BASE_URL}/rest/unstar?id=${song.id}&${SUBSONIC_AUTH}`);
  }
}

async function clickFavButtom(page: Page, filter: string) {
  await page.getByRole('menuitem', { name: 'Songs' }).click();
  await page.getByRole('textbox', { name: 'Search' }).click();
  await page.getByRole('textbox', { name: 'Search' }).fill(SONG_TITLE);
  await page.getByText(SONG_TITLE).click();
  const songRow = page.getByRole('row').filter({ hasText: SONG_TITLE });
  console.log(songRow);
  // Hover sobre la fila para revelar el LoveButton
  await songRow.hover();
  // LoveButton es el primer button en la última columna (SongContextMenu)
  const loveButton = songRow.locator('[class*="NDLoveButton-love"]');
  await loveButton.click();
  await page.waitForTimeout(1000);

  await applyFilterFavs(page, filter);
}

async function applyFilterFavs(page: Page, filter: string) {
  await page.getByRole('button', { name: 'Add filter' }).click();
  await page.locator('.MuiButtonBase-root.MuiListItem-root > .MuiSvgIcon-root > path').click();
  await page.getByLabel('', { exact: true }).click();
  await page.getByRole('option', { name: filter }).click();
}

