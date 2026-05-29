import { test, expect, type Page } from '@playwright/test';

const BASE_URL = 'http://localhost:4533';
const SONG_TITLE = 'FR07-08';
const USERNAME = 'admin';
const PASSWORD = 'admin';
const SUBSONIC_AUTH = `u=${USERNAME}&p=${PASSWORD}&v=1.16.1&c=e2e-playwright&f=json`;

async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/`);
  await page.fill('#username', USERNAME);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  // Esperar a que desaparezca el formulario de login
  await expect(page.locator('button[type="submit"]')).not.toBeVisible({ timeout: 15_000 });
}

// Los tests deben correr en orden: FR-07 estrella la canción, FR-08 la des-estrella
test.describe.serial('Favoritos', () => {

  test('FR-07 Marcar canción como favorita', async ({ page, request }) => {
    // 1. Login
    await login(page);

    // 2. Navegar a la sección Songs
    await page.goto(`${BASE_URL}/#/song`);
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });

    // 3. Buscar la canción FR07-08 y marcarla como favorita
    await page.locator('input[type="text"]').first().fill(SONG_TITLE);
    const songRow = page.getByRole('row').filter({ hasText: SONG_TITLE });
    await expect(songRow).toBeVisible({ timeout: 10_000 });

    // Hover sobre la fila para revelar el LoveButton
    await songRow.hover();
    // LoveButton es el primer button en la última columna (SongContextMenu)
    const loveButton = songRow.locator('td:last-child button').first();
    await expect(loveButton).toBeVisible({ timeout: 5_000 });
    await loveButton.click();
    await page.waitForTimeout(1_000);

    // 4. Navegar a canciones favoritas (filter starred=true)
    const filter = encodeURIComponent(JSON.stringify({ starred: true }));
    await page.goto(`${BASE_URL}/#/song?filter=${filter}`);
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });

    // Verificación UI: la canción FR07-08 debe mostrarse en favoritos
    await expect(
      page.getByRole('row').filter({ hasText: SONG_TITLE })
    ).toBeVisible({ timeout: 10_000 });

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

    // 2. Navegar a la sección Songs
    await page.goto(`${BASE_URL}/#/song`);
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });

    // 3. Buscar la canción FR07-08 y desmarcarla como favorita
    await page.locator('input[type="text"]').first().fill(SONG_TITLE);
    const songRow = page.getByRole('row').filter({ hasText: SONG_TITLE });
    await expect(songRow).toBeVisible({ timeout: 10_000 });

    // Hover sobre la fila para revelar el LoveButton (corazón lleno = ya es favorita)
    await songRow.hover();
    const loveButton = songRow.locator('td:last-child button').first();
    await expect(loveButton).toBeVisible({ timeout: 5_000 });
    await loveButton.click();
    await page.waitForTimeout(1_000);

    // 4. Navegar a canciones favoritas (filter starred=true)
    const filter = encodeURIComponent(JSON.stringify({ starred: true }));
    await page.goto(`${BASE_URL}/#/song?filter=${filter}`);
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });

    // Verificación UI: la canción FR07-08 NO debe mostrarse en favoritos
    await expect(
      page.getByRole('row').filter({ hasText: SONG_TITLE })
    ).not.toBeVisible();

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
