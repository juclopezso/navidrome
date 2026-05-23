import { expect, test } from '@playwright/test'

const baseUrl = process.env.NAVIDROME_URL || 'http://127.0.0.1:4533'
const username = process.env.NAVIDROME_USER || 'admin'
const password = process.env.NAVIDROME_PASSWORD || 'password'
const targetSongTitle = process.env.NAVIDROME_TEST_SONG || 'Heartbreak Hotel'
const slowMs = Number(process.env.FAV_INT_SLOW_MS || 0)

const slow = async (page) => {
  if (slowMs > 0) {
    await page.waitForTimeout(slowMs)
  }
}

test('FAV-INT-05: remove a song from favorites through the UI', async ({
  page,
}) => {
  test.setTimeout(slowMs > 0 ? 90000 : 30000)

  const authAndSong = await test.step('Log in and prepare a favorite song', async () => {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    await slow(page)
    await page.getByRole('textbox').first().fill(username)
    await slow(page)
    await page.locator('input[name="password"]').fill(password)
    await slow(page)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(
      page.getByRole('heading', { name: /Navidrome/i }),
    ).toBeVisible()
    await slow(page)

    return page.evaluate(
      async ({ username, password, targetSongTitle }) => {
        const loginResponse = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
        })
        if (!loginResponse.ok) {
          throw new Error(`Login failed with status ${loginResponse.status}`)
        }

        const auth = await loginResponse.json()
        const subsonicParams = new URLSearchParams({
          u: auth.username,
          t: auth.subsonicToken,
          s: auth.subsonicSalt,
          f: 'json',
          v: '1.16.1',
          c: 'PlaywrightFAVINT05',
        })

        const subsonicGet = async (command, params = {}) => {
          const url = new URL(`/rest/${command}.view`, window.location.origin)
          subsonicParams.forEach((value, key) =>
            url.searchParams.set(key, value),
          )
          Object.entries(params).forEach(([key, value]) =>
            url.searchParams.set(key, value),
          )
          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`${command} failed with status ${response.status}`)
          }
          const body = await response.json()
          const subsonicResponse = body['subsonic-response']
          if (subsonicResponse.status !== 'ok') {
            throw new Error(`${command} returned ${subsonicResponse.status}`)
          }
          return subsonicResponse
        }

        const search = await subsonicGet('search3', {
          query: targetSongTitle,
          songCount: '10',
          albumCount: '0',
          artistCount: '0',
        })
        const song = search.searchResult3.song?.find(
          (item) => item.title === targetSongTitle,
        )
        if (!song?.id) {
          throw new Error(`Song "${targetSongTitle}" was not available`)
        }

        await subsonicGet('star', { id: song.id })

        const before = await subsonicGet('getStarred2')
        const starredBefore = before.starred2.song?.some(
          (item) => item.id === song.id,
        )
        if (!starredBefore) {
          throw new Error('The song was not starred during test setup')
        }

        return {
          id: song.id,
          title: song.title,
          auth: {
            username: auth.username,
            token: auth.subsonicToken,
            salt: auth.subsonicSalt,
          },
        }
      },
      { username, password, targetSongTitle },
    )
  })

  await test.step('Click the favorite button to remove the song from favorites', async () => {
    await page.goto(`${baseUrl}/#/song`, { waitUntil: 'domcontentloaded' })
    await slow(page)

    const songRow = page
      .locator('tbody tr')
      .filter({ hasText: authAndSong.title })
      .first()
    await expect(songRow).toBeVisible()

    const favoriteButton = songRow
      .locator('button[class*="NDLoveButton"]')
      .first()
    await expect(favoriteButton).toHaveAttribute('title', /.+/)
    await slow(page)

    const unstarResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/rest/unstar') && response.status() === 200,
    )
    await favoriteButton.click()
    await unstarResponse
    await slow(page)
  })

  await test.step('Verify the backend no longer reports the song as favorite', async () => {
    const starredAfterClick = await page.evaluate(async ({ result }) => {
      const params = new URLSearchParams({
        u: result.auth.username,
        t: result.auth.token,
        s: result.auth.salt,
        f: 'json',
        v: '1.16.1',
        c: 'PlaywrightFAVINT05',
      })
      const response = await fetch(`/rest/getStarred2.view?${params}`)
      if (!response.ok) {
        throw new Error(`getStarred2 failed with status ${response.status}`)
      }
      const body = await response.json()
      return (
        body['subsonic-response'].starred2.song?.some(
          (song) => song.id === result.id,
        ) ?? false
      )
    }, { result: authAndSong })

    expect(
      starredAfterClick,
      `${authAndSong.title} should be removed from favorites`,
    ).toBe(false)

    await slow(page)
  })
})
