import { test, expect } from '@playwright/test';
import { BASE_URL, expectSongStarred, login, starSong, unstarSong } from './helpers';

const FAVORITE_SONG = 'FR09-FAV';
const NON_FAVORITE_SONG = 'FR09-NOFAV';

test.describe.serial('FR-09 Filtrar canciones favoritas', () => {

  test('Precondición — marcar FR09-FAV como favorita', async ({ request }) => {
    // Usa API star (idempotente) para no depender del estado previo
    await starSong(request, FAVORITE_SONG);

    await expectSongStarred(request, FAVORITE_SONG, true);
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

    await expectSongStarred(request, FAVORITE_SONG, true);
    await expectSongStarred(request, NON_FAVORITE_SONG, false);
  });

  test('Limpieza — desmarcar FR09-FAV', async ({ request }) => {
    // Usa API unstar (idempotente)
    await unstarSong(request, FAVORITE_SONG);
  });

});
