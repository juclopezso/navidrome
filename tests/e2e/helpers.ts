import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const BASE_URL = 'http://localhost:4533';
export const USERNAME = 'admin';
export const PASSWORD = 'admin';
export const SUBSONIC_AUTH = `u=${USERNAME}&p=${PASSWORD}&v=1.16.1&c=e2e-playwright&f=json`;

type StarredSong = {
  id?: string;
  title?: string;
};

export async function login(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/login`);
  await page.fill('input[name="username"]', USERNAME);
  await page.fill('input[name="password"]', PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('button[type="submit"]')).not.toBeVisible({ timeout: 15_000 });
}

export async function getSongId(request: APIRequestContext, title: string): Promise<string> {
  const res = await request.get(
    `${BASE_URL}/rest/search3?query=${encodeURIComponent(title)}&songCount=5&albumCount=0&artistCount=0&${SUBSONIC_AUTH}`,
  );
  const body = await res.json();
  const songs: { id: string; title: string }[] = body['subsonic-response']?.searchResult3?.song ?? [];
  const song = songs.find((s) => s.title === title);
  if (!song) throw new Error(`Song "${title}" not found via search3`);
  return song.id;
}

export async function getStarredSongs(request: APIRequestContext): Promise<StarredSong[]> {
  const response = await request.get(`${BASE_URL}/rest/getStarred2?${SUBSONIC_AUTH}`);
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  return body['subsonic-response']?.starred2?.song ?? [];
}

export async function starSong(request: APIRequestContext, title: string): Promise<void> {
  const id = await getSongId(request, title);
  await request.get(`${BASE_URL}/rest/star?id=${id}&${SUBSONIC_AUTH}`);
}

export async function unstarSong(request: APIRequestContext, title: string): Promise<void> {
  const id = await getSongId(request, title);
  await request.get(`${BASE_URL}/rest/unstar?id=${id}&${SUBSONIC_AUTH}`);
}

export async function ensureStarState(
  request: APIRequestContext,
  title: string,
  starred: boolean,
): Promise<void> {
  const id = await getSongId(request, title);
  const starredSongs = await getStarredSongs(request);
  const isStarred = starredSongs.some((s) => s.id === id);

  if (starred && !isStarred) {
    await request.get(`${BASE_URL}/rest/star?id=${id}&${SUBSONIC_AUTH}`);
  } else if (!starred && isStarred) {
    await request.get(`${BASE_URL}/rest/unstar?id=${id}&${SUBSONIC_AUTH}`);
  }
}

export async function expectSongStarred(
  request: APIRequestContext,
  title: string,
  expected: boolean,
): Promise<void> {
  const songs = await getStarredSongs(request);
  const message = expected
    ? `"${title}" debe retornarse en getStarred2`
    : `"${title}" NO debe retornarse en getStarred2`;

  expect(songs.some((s) => s.title === title), message).toBe(expected);
}

export async function getRowTitles(page: Page): Promise<string[]> {
  return page.locator('table tbody tr').evaluateAll((rows) =>
    rows.map((row) => row.textContent ?? ''),
  );
}

export function indexOfMatch(titles: string[], needle: string): number {
  return titles.findIndex((title) => title.includes(needle));
}
