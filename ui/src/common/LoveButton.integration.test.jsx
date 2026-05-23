/**
 * Integration tests for the favorites (star/unstar) flow.
 *
 * These tests hit a REAL running backend — they are NOT unit tests and they
 * will be skipped gracefully when the backend is not reachable.
 *
 * Prerequisites:
 *   - Navidrome backend accessible at BACKEND_URL (default: http://localhost:4633)
 *   - Default dev credentials: admin / admin (set via ND_DEVAUTOCREATEADMINPASSWORD)
 *   - At least one song scanned into the library
 *
 * Run locally (backend must be up):
 *   npm run test:integration
 *
 * Run via Docker (starts backend automatically):
 *   docker compose -f docker-compose.dev.yml --profile frontend-backend-integration-test up \
 *     --abort-on-container-exit --exit-code-from frontend-backend-integration-test
 */

// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4633'
const ADMIN_USER = process.env.ADMIN_USER || 'admin'
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin'

// ---------------------------------------------------------------------------
// Shared state (populated in beforeAll)
// ---------------------------------------------------------------------------

let auth = null // { token, username, subsonicToken, subsonicSalt }
let testSong = null // first song found in the library

// ---------------------------------------------------------------------------
// Helpers: authentication
// ---------------------------------------------------------------------------

async function loginAsAdmin() {
  const res = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USER, password: ADMIN_PASS }),
  })
  if (!res.ok) {
    throw new Error(
      `POST /auth/login returned ${res.status} — is the backend running at ${BACKEND_URL}?`,
    )
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Helpers: Subsonic API
// These mirror what subsonic/index.js does in the real frontend.
// ---------------------------------------------------------------------------

function buildSubsonicUrl(command, extra = {}) {
  const params = new URLSearchParams({
    u: auth.username,
    t: auth.subsonicToken,
    s: auth.subsonicSalt,
    f: 'json',
    v: '1.8.0',
    c: 'NavidromeUI',
    ...extra,
  })
  return `${BACKEND_URL}/rest/${command}?${params}`
}

async function subsonicCall(command, extra = {}) {
  const res = await fetch(buildSubsonicUrl(command, extra))
  const body = await res.json()
  const sr = body['subsonic-response']
  if (sr.status !== 'ok') {
    throw new Error(
      `Subsonic "${command}" failed — ${sr.error?.message} (code ${sr.error?.code})`,
    )
  }
  return sr
}

// ---------------------------------------------------------------------------
// Helpers: Navidrome JSON REST API
// These mirror what useToggleLove calls via dataProvider.getOne() to refresh.
// ---------------------------------------------------------------------------

async function apiGet(path) {
  const res = await fetch(`${BACKEND_URL}/api/${path}`, {
    headers: {
      'X-ND-Authorization': `Bearer ${auth.token}`,
      Accept: 'application/json',
    },
  })
  if (!res.ok) return null
  return res.json()
}

async function findFirstSong() {
  const sr = await subsonicCall('search3', {
    query: '',
    songCount: 1,
    songOffset: 0,
    albumCount: 0,
    artistCount: 0,
  })
  return sr.searchResult3?.song?.[0] ?? null
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  try {
    auth = await loginAsAdmin()
  } catch (err) {
    console.warn(`[integration] ${err.message} — all tests in this suite will be skipped`)
    return
  }

  try {
    testSong = await findFirstSong()
  } catch {
    // backend is up but search failed — tests that need a song will skip
  }

  if (!testSong) {
    console.warn(
      '[integration] No songs found in the library. ' +
      'Add audio files to ./music/ and trigger a scan, then re-run. ' +
      'Star/unstar tests will be skipped.',
    )
  }
})

afterAll(async () => {
  // Best-effort cleanup: ensure the test song is left unstarred
  if (auth && testSong) {
    try {
      await subsonicCall('unstar', { id: testSong.id })
    } catch {
      // ignore cleanup errors
    }
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Favorites flow — frontend ↔ backend integration', () => {
  // ---- 1. Auth ---------------------------------------------------------------

  describe('Authentication', () => {
    it('logs in as admin and receives Subsonic credentials', (ctx) => {
      if (!auth) ctx.skip()
      expect(auth.username).toBe(ADMIN_USER)
      expect(auth.token).toBeTruthy()
      expect(auth.subsonicToken).toBeTruthy()
      expect(auth.subsonicSalt).toBeTruthy()
    })
  })

  // ---- 2. Library ------------------------------------------------------------

  describe('Library', () => {
    it('finds at least one song to use as the test subject', (ctx) => {
      if (!auth) ctx.skip()
      if (!testSong) ctx.skip()
      expect(testSong.id).toBeTruthy()
      expect(testSong.title).toBeTruthy()
    })
  })

  // ---- 3. Star / unstar via Subsonic API (mirrors what useToggleLove does) ---

  describe('Starring a song', () => {
    it('PUT /rest/star — Subsonic star endpoint returns status ok', async (ctx) => {
      if (!auth || !testSong) ctx.skip()

      const sr = await subsonicCall('star', { id: testSong.id })
      expect(sr.status).toBe('ok')
    })

    it('GET /api/song/:id — backend persists the starred state', async (ctx) => {
      if (!auth || !testSong) ctx.skip()

      // This call mirrors what useToggleLove does after subsonic.star():
      // dataProvider.getOne('song', { id }) to refresh the record in the store.
      const song = await apiGet(`song/${testSong.id}`)
      expect(song).not.toBeNull()
      expect(song.starred).toBe(true)
    })
  })

  // ---- 4. Unstar -------------------------------------------------------------

  describe('Unstarring a song', () => {
    it('PUT /rest/unstar — Subsonic unstar endpoint returns status ok', async (ctx) => {
      if (!auth || !testSong) ctx.skip()

      const sr = await subsonicCall('unstar', { id: testSong.id })
      expect(sr.status).toBe('ok')
    })

    it('GET /api/song/:id — backend confirms song is no longer starred', async (ctx) => {
      if (!auth || !testSong) ctx.skip()

      const song = await apiGet(`song/${testSong.id}`)
      expect(song).not.toBeNull()
      // The backend omits the starred field when a song is not starred,
      // so the value is undefined rather than false.
      expect(song.starred).toBeFalsy()
    })
  })

  // ---- 5. Full round-trip ----------------------------------------------------

  describe('Full round-trip: star → verify → unstar → verify', () => {
    it('starred state toggles correctly across two consecutive calls', async (ctx) => {
      if (!auth || !testSong) ctx.skip()

      // Star
      await subsonicCall('star', { id: testSong.id })
      const starred = await apiGet(`song/${testSong.id}`)
      expect(starred.starred).toBe(true)

      // Unstar
      await subsonicCall('unstar', { id: testSong.id })
      const unstarred = await apiGet(`song/${testSong.id}`)
      expect(unstarred.starred).toBeFalsy()
    })
  })
})
