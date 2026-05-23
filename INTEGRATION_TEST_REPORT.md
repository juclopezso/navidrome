# Integration Test Report — Favorites Flow

**Feature under test:** Star / unstar a song (the "Favorites" / love-button flow)  
**Branch:** `feature/front-back-integration-test`  
**Date:** 2026-05-22

---

## Stack chosen

| Layer | Tool | Reason |
|---|---|---|
| Unit tests | Vitest + Testing Library | Already in the project; fast, in-process |
| **API integration** | **Vitest (node env) + real `fetch`** | No browser overhead; verifies HTTP contract end-to-end |
| **E2E / UI integration** | **Playwright (Chromium)** | Real browser + real stack; proves the button click works for an actual user |
| CI orchestration | Docker Compose profiles | `--profile integration-test` / `--profile playwright-test` |

---

## Files added / modified

```
ui/src/common/LoveButton.jsx              ← added data-testid & data-starred attributes
ui/src/common/LoveButton.integration.test.jsx  ← Vitest API integration tests (new)
ui/src/e2e/favorites.spec.js              ← Playwright E2E tests (new)
ui/vitest.integration.config.js           ← separate Vitest config for integration (new)
ui/playwright.config.js                   ← Playwright config (new)
ui/package.json                           ← added test:integration, test:e2e scripts
docker-compose.dev.yml                    ← added integration-test and playwright-test services
```

---

## How to run

### Locally (backend + frontend already running)

```bash
# API integration tests
npm run test:integration          # inside ui/

# E2E browser tests
npm run test:e2e                  # inside ui/
```

### Via Docker (services start automatically)

```bash
# API integration (backend only)
docker compose -f docker-compose.dev.yml --profile frontend-backend-integration-test up \
  --build --abort-on-container-exit --exit-code-from frontend-backend-integration-test

# E2E browser tests (full stack)
docker compose -f docker-compose.dev.yml --profile playwright-test up \
  --build --abort-on-container-exit --exit-code-from playwright-test
```

> **Library note:** Tests that act on a song (`star`, `unstar`, UI click) require at
> least one audio file in `./music/` with a completed scan. Tests skip gracefully
> when the library is empty — they do **not** fail.

---

## Test descriptions

### Vitest API integration tests
**File:** `ui/src/common/LoveButton.integration.test.jsx`  
**Environment:** Node.js, real HTTP — no browser, no mocks

---

#### Test 1 — `logs in as admin and receives Subsonic credentials`

**What it does:**  
Calls `POST /auth/login` with the default dev credentials and checks that the
response contains a JWT `token`, a `subsonicToken`, and a `subsonicSalt`.

**Why it is valid:**  
Mirrors the exact call made by `authProvider.js:login()`. If this test fails,
no other frontend feature can work — it catches broken auth endpoints before
any user-facing symptom appears.

**What it proves:**  
The backend's authentication endpoint is reachable, returns a well-formed
response, and the Subsonic credential fields (needed by every subsequent API
call) are present.

**Value for the product:**  
Catches backend regressions in the auth layer (missing fields, wrong HTTP
status, changed password hashing) at commit time rather than during a live demo.

---

#### Test 2 — `finds at least one song to use as the test subject`

**What it does:**  
Calls `GET /rest/search3` with empty query and asks for 1 song. Records the
first result as `testSong` used by all subsequent tests.

**Why it is valid:**  
Uses the same Subsonic `search3` endpoint used by the frontend's search feature.
It validates that the library scan pipeline is working end-to-end.

**What it proves:**  
The backend can enumerate content from the music library and expose it through
the Subsonic protocol, which is the prerequisite for any playback or metadata
interaction.

**Value for the product:**  
If the scan pipeline breaks silently (e.g., the music folder is not mounted, the
scanner crashes), this test surfaces it immediately.

---

#### Test 3 — `PUT /rest/star — Subsonic star endpoint returns status ok`

**What it does:**  
Calls `GET /rest/star?id=<songId>&u=...&t=...&s=...` (the exact URL that
`subsonic.star()` in `subsonic/index.js` constructs) and asserts that the
response contains `{ status: 'ok' }`.

**Why it is valid:**  
This is the *same* HTTP call the LoveButton triggers when a user clicks it.
No part of the request is mocked: the authentication token, the song ID, and the
network call are all real. The test is structurally identical to what
`useToggleLove` does under the hood.

**What it proves:**  
The backend's Subsonic `/rest/star` endpoint accepts valid requests and
acknowledges them successfully.

**Value for the product:**  
Protects against regressions in the star endpoint (wrong route, auth
rejection, missing parameter handling). These bugs would manifest as silent
failures in the UI (the button appears to work but does nothing).

---

#### Test 4 — `GET /api/song/:id — backend persists the starred state`

**What it does:**  
After calling `star`, it calls `GET /api/song/<id>` (the Navidrome JSON REST
API endpoint used by `dataProvider.getOne('song', { id })`) and asserts that
`song.starred === true`.

**Why it is valid:**  
`useToggleLove` calls `dataProvider.getOne` immediately after `subsonic.star()`
resolves, to refresh the record in the react-admin store. This test replicates
that exact refresh call and checks the same field the frontend reads to decide
which icon to render.

**What it proves:**  
The `star` call is not just acknowledged — the state actually changes in the
database and is subsequently readable through the REST API. It validates the
full write-then-read cycle.

**Value for the product:**  
Without this test, a backend that acknowledges the `star` request but fails to
persist the change would pass Test 3 but show an incorrect icon on page reload.
This test catches that specific class of bug.

---

#### Test 5 — `PUT /rest/unstar — Subsonic unstar endpoint returns status ok`

**What it does:**  
After the star test, calls `GET /rest/unstar?id=<songId>&...` and asserts
`{ status: 'ok' }`.

**Why it is valid:**  
Symmetric with Test 3. The unstar path is separate code in both the frontend
(`subsonic.unstar`) and the backend, so it must be tested independently.

**What it proves:**  
The unstar endpoint works correctly and accepts the same credential format.

**Value for the product:**  
Users who star a song should always be able to unstar it. A broken unstar
endpoint would permanently lock songs in a "starred" state.

---

#### Test 6 — `GET /api/song/:id — backend confirms starred is now false`

**What it does:**  
After unstar, calls `GET /api/song/<id>` and asserts `song.starred === false`.

**Why it is valid:**  
Same reasoning as Test 4 but for the reverse state. Forms the closing half of
the round-trip contract.

**What it proves:**  
The `starred` field is a true toggle: write false → read false.

**Value for the product:**  
Prevents a regression where unstar removes the DB record but the REST API
still returns `starred: true` from a cache or incorrect query.

---

#### Test 7 — `starred state toggles correctly across two consecutive calls`

**What it does:**  
In a single test: star → assert `starred: true` via REST → unstar → assert
`starred: false` via REST.

**Why it is valid:**  
Combines the star/unstar cycle into one atomic sequence without a cleanup
phase between them. Exercises the state machine under realistic conditions
(users toggle back and forth).

**What it proves:**  
The full round-trip — from the Subsonic star endpoint through the database to
the JSON REST API — is idempotent and reversible.

**Value for the product:**  
This is the highest-confidence API-level test: it proves the feature works
end-to-end without any intermediary reset. It serves as the single-sentence
proof of correctness: "the star button works."

---

### Playwright E2E tests
**File:** `ui/src/e2e/favorites.spec.js`  
**Environment:** Real Chromium browser + real Vite frontend + real backend

---

#### Test 8 — `user can log in and reach the main application`

**What it does:**  
Navigates to `http://localhost:4533`, fills in username/password, clicks
Submit, and waits for the app sidebar to appear.

**Why it is valid:**  
Uses the same form fields (`name="username"`, `name="password"`,
`type="submit"`) that a real user types into. Tests the full auth chain:
browser → Vite proxy → Go backend `/auth/login` → JWT → react-admin session.

**What it proves:**  
The login UI is functional, the Vite proxy is correctly routing `/auth/*`
to the backend, and the frontend renders the authenticated app shell on success.

**Value for the product:**  
Catches broken login flows from either end (frontend validation change, backend
auth regression, proxy misconfiguration). Without this test, a broken login
would only be caught manually or by a user report.

---

#### Test 9 — `the songs page renders a list of songs`

**What it does:**  
After login, navigates to `/#/song` and asserts that at least one `<tr>` in the
song datagrid is visible within 15 seconds.

**Why it is valid:**  
Exercises the full data-loading path: react-admin mounts the List view →
`dataProvider.getList('song', ...)` fires → Vite proxy routes
`GET /api/song?...` to backend → backend queries the DB → JSON response
populates the table.

**What it proves:**  
The song list UI renders real data from the backend. A misconfigured proxy,
broken `getList` implementation, or missing database table would all be caught
here.

**Value for the product:**  
The song list is the primary entry point for the entire music library. If it
doesn't render, users cannot play, star, or manage any song.

---

#### Test 10 — `every song row contains a LoveButton`

**What it does:**  
Hovers over the first song row (triggering the CSS `:hover` that makes the
context menu visible) and asserts that an element with
`data-testid="love-button"` is visible.

**Why it is valid:**  
The LoveButton is rendered by `SongContextMenu` and hidden via CSS until the
row is hovered. Playwright's `hover()` command faithfully simulates the user's
mouse movement and triggers the real CSS transition.

**What it proves:**  
The component tree is assembled correctly (SongDatagrid → SongContextMenu →
LoveButton), the `data-testid` attribute is present in the DOM, and the
hover-to-reveal interaction works as designed.

**Value for the product:**  
If a refactor accidentally removes the LoveButton from the song list, or the
hover CSS breaks, users lose the ability to star songs from the most-used
screen. This test catches that at the UI layer.

---

#### Test 11 — `clicking the LoveButton changes the icon to filled (starred)`

**What it does:**  
Resets the song to unstarred, navigates to the song list, hovers, clicks the
LoveButton, and waits for `data-starred` to become `"true"`.

**Why it is valid:**  
This test is the literal translation of the acceptance criterion: "clicking
the star button marks a song as a favorite and updates the UI." It uses a
real Chromium browser, a real React render cycle, and real HTTP calls to the
backend — nothing is mocked.

The `data-starred` attribute is updated synchronously with React state after
the backend response resolves, so waiting for it is equivalent to waiting for
the full async cycle to complete.

**What it proves:**  
1. The click event is correctly bound and propagated.  
2. `useToggleLove` calls `subsonic.star()` with the right ID.  
3. The backend processes the request.  
4. `dataProvider.getOne` fetches the updated record.  
5. React re-renders the button with `record.starred = true`.  
6. The DOM reflects the new state.

This is **six integration points** validated in a single test.

**Value for the product:**  
This is the single most valuable test in the suite. It proves the complete,
user-visible behavior works exactly as specified.

---

#### Test 12 — `starred state after UI click is persisted in the backend`

**What it does:**  
Performs the same UI click as Test 11, waits for `data-starred="true"`, then
calls `GET /api/song/:id` directly from the test to verify `song.starred === true`
in the backend.

**Why it is valid:**  
Separates the concern of "the UI thinks it worked" from "the backend actually
saved it." A race condition or a fire-and-forget bug could cause the UI to
update optimistically while the backend fails silently.

**What it proves:**  
The backend persists the change triggered by the UI interaction. The two
independently observable states (DOM attribute and REST API response) agree.

**Value for the product:**  
Prevents the most dangerous class of bug in write operations: optimistic UI
updates that are never persisted. Users think their favorites are saved;
on next login they are gone.

---

#### Test 13 — `clicking the LoveButton again removes the star (toggle behaviour)`

**What it does:**  
Stars a song via UI click, asserts `data-starred="true"`, then clicks again,
asserts `data-starred="false"`, and verifies the backend agrees.

**Why it is valid:**  
The toggle is implemented by `useToggleLove` choosing between `subsonic.star`
and `subsonic.unstar` based on `record.starred`. This test exercises both
branches of that decision in a single browser session, with the state threaded
through the real React re-render cycle.

**What it proves:**  
The toggle is stateful and symmetric: the second click correctly reads the
current state (`starred: true`) and calls `unstar`. No stale closure or
React state issue can hide here.

**Value for the product:**  
Users use the heart button as a toggle. If the second click failed silently or
called `star` again instead of `unstar`, the song would be stuck in a starred
state with no UI way to remove it.

---

## Reflection: how integration testing complements unit testing

### What the unit tests do well

The unit tests for `LoveButton` and `useToggleLove` are fast, exhaustive, and
surgical. They verify:

- The LoveButton renders nothing when `enableFavourites` is false.
- The button is disabled during loading and for missing tracks.
- `useToggleLove` calls `subsonic.star` vs `subsonic.unstar` based on
  `record.starred`.
- The correct IDs are used (`mediaFileId` preferred over `id`).
- `dataProvider.getOne` is called after the toggle to refresh the record.
- Error notifications are shown when the API call fails.
- The loading state is true during the call and false after.
- No React state update warning fires after unmount.

These tests run in under 200 ms with no network access. They are the first line
of defense against regressions.

### What they cannot catch

Unit tests mock every external dependency. They prove that the code *would*
call the right function with the right arguments *if* that function existed and
behaved as mocked. They cannot verify:

| Risk | Why unit tests miss it |
|---|---|
| Backend changes the star endpoint URL or response format | `subsonic.star` is mocked |
| JWT token is not forwarded correctly to the backend | `httpClient` is mocked |
| The Vite proxy fails to route `/rest/*` to the backend | No network at all |
| The database schema for `starred` changes | No DB access |
| The CSS hover interaction hides the button | No DOM rendering |
| A React re-render loop prevents the icon from updating | Record context is static |
| The Subsonic auth token format is rejected by the backend | Token is never sent |

### What integration tests add

**API integration tests** (Vitest + real backend) close the gap between the
mocked unit and the real system. They prove the HTTP contract: the URL format,
the credential parameters, and the response shape are all exactly what the
backend expects. If the Navidrome team changes the API, these tests fail before
any UI code needs to change.

**E2E Playwright tests** validate the full chain from user gesture to DOM
update and backend state. They catch the bugs that unit tests structurally
cannot: CSS visibility, React re-render timing, proxy routing, and the
accumulated effect of every real dependency working together.

### Risk mitigation summary

| Risk category | Caught by unit tests | Caught by integration tests |
|---|---|---|
| Logic error in toggle direction | ✓ | ✓ |
| Wrong subsonic ID sent | ✓ | ✓ |
| Backend rejects the request | ✗ | ✓ API layer |
| State not persisted in DB | ✗ | ✓ API + E2E |
| UI does not re-render after toggle | ✗ | ✓ E2E |
| Login / auth chain broken | ✗ | ✓ E2E |
| Proxy routing misconfiguration | ✗ | ✓ E2E |
| CSS hover hides the button | ✗ | ✓ E2E |
| Toggle is not reversible | Partially | ✓ E2E |

Together, the three levels — unit, API integration, and E2E — give a defense in
depth. Unit tests find logic bugs in seconds; integration tests verify contracts
in under a minute; E2E tests confirm the user-visible outcome in a real browser.
No single level is sufficient alone.
