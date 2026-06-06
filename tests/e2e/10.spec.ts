import { test, expect } from '@playwright/test';
import {
  BASE_URL,
  expectSongStarred,
  getRowTitles,
  indexOfMatch,
  login,
  starSong,
  unstarSong,
} from './helpers';

const FAVORITE_SONGS = ['FR10-FAV-A', 'FR10-FAV-B'];
const NON_FAVORITE_SONGS = ['FR10-NOFAV-A', 'FR10-NOFAV-B'];

test.describe.serial('FR-10 Ordenamiento por favoritos', () => {

  test('Precondición — marcar FR10-FAV-A y FR10-FAV-B como favoritas', async ({ request }) => {
    // Usa API star (idempotente) para no depender del estado previo
    for (const title of FAVORITE_SONGS) {
      await starSong(request, title);
    }

    for (const title of FAVORITE_SONGS) {
      await expectSongStarred(request, title, true);
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
