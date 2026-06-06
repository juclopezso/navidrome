import { test, expect, type Page } from '@playwright/test';
import { BASE_URL, ensureStarState, expectSongStarred, login } from './helpers';

const SONG_TITLE = 'FR07-08';

// Los tests deben correr en orden: FR-07 estrella la canción, FR-08 la des-estrella
test.describe.serial('Favoritos', () => {

  test('FR-07 Marcar canción como favorita', async ({ page, request }) => {
    // 1. Login
    await login(page);
    // Garantizar que la canción NO está marcada antes de marcarla
    await ensureStarState(request, SONG_TITLE, false);

    // 2. Dar click en boton de favoritos
    await clickFavoriteButton(page, SONG_TITLE, 'Yes');

    const row = page.getByRole('row');
    // Verificación UI: la canción FR07-08 debe mostrarse en favoritos
    await expect(
      row.filter({ hasText: SONG_TITLE })
    ).toBeVisible();

    await expectSongStarred(request, SONG_TITLE, true);
  });

  test('FR-08 Desmarcar canción como favorita', async ({ page, request }) => {
    // 1. Login
    await login(page);
    // Garantizar que la canción SÍ está marcada antes de desmarcarla
    await ensureStarState(request, SONG_TITLE, true);

    // 2. Filtrar por no favoritos
    await clickFavoriteButton(page, SONG_TITLE, 'No');

    const row = page.getByRole('row');

    // Verificación UI: la canción FR07-08 debe mostrarse en NO favoritos
    await expect(
      row.filter({ hasText: SONG_TITLE })
    ).toBeVisible();

    await expectSongStarred(request, SONG_TITLE, false);
  });

});

async function clickFavoriteButton(page: Page, songTitle: string, filter: string) {
  await page.getByRole('menuitem', { name: 'Songs' }).click();
  await page.getByRole('textbox', { name: 'Search' }).click();
  await page.getByRole('textbox', { name: 'Search' }).fill(songTitle);
  await page.getByText(songTitle).click();
  const songRow = page.getByRole('row').filter({ hasText: songTitle });
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
