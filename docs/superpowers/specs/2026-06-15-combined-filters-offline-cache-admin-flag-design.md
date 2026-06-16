# Combined search page · offline cache · local-only admin — design

**Date:** 2026-06-15 · **Status:** approved by user (4 design questions + F1 visual mockup at `webui/_preview-filters.html`)

## Goal

Three independent, user-facing changes to the SPA (`webui/`):

1. **One combined search page** — merge today's separate `home` (birthday
   search) and `browse` (filters) views into a single page. The birthday
   search leads; the rest of the filters start **locked** and unlock when the
   user picks a birthday **or** clicks "browse the full registry".
2. **Durable lazy offline cache** — cache `martyrs.json` and portrait photos
   in the browser so repeat visits are fast and work offline, without a
   247 MB upfront download. Keyed to the dataset `version`.
3. **Local-only admin** — the admin portal (login button, admin view, edit
   buttons) shows only on a developer's machine, never on the public GitHub
   Pages deployment.

## Why

- The birthday search is the site's signature feature, but today it lives on a
  separate page from the registry filters; users bounce between two views.
  One page makes birthday-first the obvious flow while keeping every filter
  one scroll away.
- Photos are **247 MB across 600 files** (avg 422 KB); `martyrs.json` is only
  0.56 MB. Re-fetching photos on every visit is wasteful, and GitHub Pages'
  HTTP cache is evictable and not offline-guaranteed. A Service Worker gives
  durable "downloaded once (per photo, as viewed)" semantics.
- The admin entry points currently render for every visitor (the real lock is
  the `ADMIN_TOKEN` + API, which doesn't exist on Pages — so login can't
  function there anyway). Hiding the UI on the public site is hygiene: no dead
  "Editor login" button, no admin nav, no edit affordances for visitors.

## User decisions (locked)

1. **F2 cache strategy:** lazy — cache photos as they are viewed, not eagerly.
2. **F2 freshness:** refresh when the dataset `version` changes; reuse the
   existing `version` field in `martyrs.json` as the "store ID".
3. **F1 unlock trigger:** other filters unlock on **birthday picked OR** an
   explicit "browse the full registry" button.
4. **F3 admin flag:** an `adminEnabled` flag in `config.js` **plus** a hostname
   gate. Committed value stays `true`; the hostname gate (`isLocalDev`)
   enforces "off in deployment". *(Confirm at spec review: if you'd rather the
   committed value literally read `false`, that also hides admin locally — so
   the recommendation is `true` + hostname gate.)*

---

## Feature 1 — combined search page

### View model

Merge `home` and `browse` into a single primary view. Keep `detail`, `admin`,
`about`. The nav drops the separate "Registry" entry; the home/landing entry
*is* the search page.

Decision: rather than introduce a brand-new view id, **the `browse` view
becomes the combined page** and the `home` content (birthday card, on-this-day,
stats) moves into it. The landing route (`view === 'home'`) redirects to the
combined page so existing `goto('home')` / logo clicks still work.
*(Alternative considered: keep `home` as the id and fold `browse` into it —
equivalent; pick whichever is the smaller diff during implementation. Either
way there is exactly one user search page.)*

### Layout (top → bottom — matches the approved mockup)

1. Intro heading + one-line subtitle.
2. **Birthday card** (primary) — Litepicker birth-date input + window pills +
   "Show names". Unchanged from today's home hero card.
3. **Secondary filters** — name/city search, city, rank, battalion, age, *and*
   the martyrdom-date-range + age-range that live in today's collapsible
   "Advanced" panel (now shown inline within this block). Locked by default.
4. **Results grid** — the existing cards grid + sort + grid/list toggle.
5. **On this day** + **stats strip** move to the bottom of the page.

### Gating

New Alpine state `filtersUnlocked: false`.

- Set `true` when a birthday is picked (watch `bday.year`, which Litepicker
  sets) **or** when the "تصفّح السجلّ كاملاً / Browse the full registry"
  button is clicked.
- Once `true`, stays unlocked for the session (clearing the birthday does not
  re-lock — least surprising).
- While `false`: the secondary-filter controls are visually dimmed
  (`opacity` + grayscale) and non-interactive (`:disabled` on inputs/selects,
  `pointer-events: none` on the block), with a dashed **lock hint** row
  carrying the explanatory text and the "browse all" button. The lock hint
  hides once unlocked.
- The results grid shows the existing "pick your birthday / browse" empty
  state until unlocked; afterwards it shows `filtered`.

### Filtering — no logic change

`get filtered()` already composes the birthday `matchFilter` with `filters.q`,
`filters.city/rank/batt/age`, and the advanced `martyrdomFrom/To` + `ageMin/Max`
(see `app.js` lines ~353–420), and sorts by closeness when `matchFilter` is set,
otherwise by the chosen `sort`. The combined page reuses this untouched.
`runBirthdaySearch()` no longer needs to switch views (already on the page); it
just sets `matchFilter` and scrolls to results.

### CSS

The dim/lock treatment uses existing design tokens. New utility classes
(`.filters-locked`, `.lock-hint`) go in `styles.css` `:root`/component section
per the no-hard-coded-values rule. No new colors or breakpoints.

---

## Feature 2 — durable lazy offline cache

### Service Worker (`sw.js`)

A plain static file (no build step) placed at the **repo root** so its scope
covers both `/webui/` and `/data/`:

- On GitHub Pages it is served at `/AQMAR/sw.js`; locally (IIS at
  `localhost:8082`, working-tree root) at `/sw.js`.
- Registered from the SPA with a parent scope:
  `navigator.serviceWorker.register('../sw.js', { scope: './' /* parent */ })`
  — a SW script may claim scope up to its own directory, so a root `sw.js`
  can control `/data/photos/*`. **Verify the exact `scope` string against both
  `localhost:8082/webui/` and the Pages project-path during implementation.**

Fetch strategy (only these two route classes are intercepted; everything else
passes through untouched to avoid app-shell staleness):

| Request | Strategy | Cache name |
|---|---|---|
| `…/data/photos/*` | **cache-first** (miss ⇒ fetch ⇒ put ⇒ serve) | `aqmar-photos` |
| `…/data/martyrs.json` | **network-first**, fall back to cache offline | `aqmar-data` |

Photos cache themselves the first time they are actually viewed → "cache as
viewed", no upfront 247 MB. The `aqmar-data` cache is refreshed on every
successful online load (network-first).

**Photo cache invalidation (per the "refresh once per version" decision):**
on load, the app compares the published `version` to the stored "store ID";
when it changes, it deletes the `aqmar-photos` cache (`caches.delete`) so a
*corrected or replaced* photo at an existing `<id>.jpg` reaches returning
visitors. Photos then re-cache lazily as they're viewed again — the cost is
re-fetching only the photos a returning visitor actually looks at, once per
published version. (Within a version, photos persist and load instantly.)

### Boot spinner + "store ID"

- `martyrs.json` already carries a `version` field
  (`data-loader.js` reads it → `publishedVersion`).
- The "store ID" = `localStorage['aqmar.cacheVersion']`.
- A full-screen **boot spinner** (`#boot-spinner`) is shown from the first
  paint. It sits *outside* the Alpine root so it appears before Alpine
  initializes (not gated on Alpine state); `init()`'s `revealApp()` fades +
  removes it once `loadMartyrs()` has resolved and the store ID is written.
  An inline 20 s safety timer hides it even if the app never boots.
- `persistCacheVersion()` reads the previously-stored store ID, and when the
  published `version` differs it purges the `aqmar-photos` cache (see above)
  before writing the new version. The network-first JSON fetch has already
  pulled the fresh data.
- **Cache-busting:** `index.html` appends a `?v=YYYYMMDD…` query to the
  `styles.css` / `config.js` / `app.js` includes (same convention as
  `tests.html`) so returning visitors never run a stale `app.js` against new
  markup. Bump the token when those files change.

### Scope of versioning

Version-keying applies to the **public / static-json path** (the deployed
site). In local **API mode** (`dataSource === 'api'`, admin server running)
there is no published `version`; the SW still caches photos, but the
version flag is only written when a `version` is present. The boot spinner
still works (gated on load completion), it just doesn't store a version in
API mode.

### Degradation

- No `navigator.serviceWorker` (old browser, insecure context) ⇒ skip
  registration entirely; the site loads normally over the network and
  `cacheReady` flips as soon as `loadMartyrs()` resolves. Never block the
  site on SW availability.
- SW registration throws ⇒ caught, logged to console, treated as "no SW".

---

## Feature 3 — local-only admin

### Config + gate

- `config.js`: add `adminEnabled: true` to `window.AQMAR_CONFIG`.
- `app.js`: new getter
  `get adminAllowed() { return !!(window.AQMAR_CONFIG?.adminEnabled) && this.isLocalDev; }`
  (`isLocalDev` already returns true for `localhost` / `127.0.0.1` / empty
  host).

### Gated entry points

Replace the visitor-facing admin **entry points** with `adminAllowed`:

- Header **"Editor login"** button → `x-if="adminAllowed && !isAdmin"`.
- Header **"Admin"** nav button → `x-if="adminAllowed && isAdmin"`.
- Detail-page **edit / add-photo** buttons → `x-show="isAdmin && adminAllowed"`
  (already behind `isAdmin`; add `adminAllowed`).
- `goto('admin')` and any path that sets `view = 'admin'` → guard with
  `if (!this.adminAllowed) return;`.
- `checkSession()` (auto-restore of a stashed token) → early-return when
  `!adminAllowed`, so a leftover sessionStorage token can't surface admin on
  the public host.

`isAdmin` keeps its current meaning ("a valid token is loaded"). On GitHub
Pages, `isLocalDev` is false ⇒ `adminAllowed` is false ⇒ no admin UI renders
and no admin view is reachable, regardless of the flag value.

---

## Testing / verification

- **F1 gating** is small UI logic; verify in the browser via Playwright at
  `localhost:8082/webui/`: locked on load, unlock on birthday pick, unlock on
  "browse all", filters compose with a birthday active. If the `tests.html`
  harness can host a pure-function check for `filtersUnlocked` transitions,
  add one; otherwise browser verification is the gate.
- **F2** verify in-browser: first load registers the SW and writes the version
  (DevTools → Application → Service Workers / Cache Storage shows
  `aqmar-photos` + `aqmar-data`); view a few cards, then go offline and
  reload — seen photos + JSON still render. Confirm SW scope reaches
  `/data/photos/` on both `localhost:8082/webui/` and the Pages path.
- **F3** verify both ways: at `localhost` the admin entry points render; with
  `adminEnabled:false` (or simulating a non-localhost host) they vanish and
  `goto('admin')` is a no-op.
- The Python test suite (`pytest -q`) is unaffected (all three changes are
  front-end only) but must still pass.

## Out of scope (YAGNI)

- No image resizing/compression of the 247 MB photo set (real opportunity, but
  separate work — do not broaden here).
- No caching of the app shell (HTML/CSS/JS) by the SW — only data + photos, to
  avoid stale-site headaches.
- No new build step / bundler (Tailwind Play CDN stays).
- No server-side admin auth changes — the `ADMIN_TOKEN` + API boundary is
  unchanged; F3 is UI visibility only.
- The temporary `webui/_preview-filters.html` mockup is deleted once F1 lands.

## Files touched (anticipated)

- `webui/index.html` — merge views into one search page; inline the advanced
  filters; lock-hint markup; gate admin entry points; boot-spinner overlay.
- `webui/app.js` — `filtersUnlocked` state + watchers; `adminAllowed` getter;
  admin guards; SW registration + `cacheReady` + version write in `init()`.
- `webui/config.js` — add `adminEnabled`.
- `webui/styles.css` — `.filters-locked` / `.lock-hint` utilities + boot
  spinner styles (tokens only).
- `sw.js` — **new**, repo root.
- `webui/_preview-filters.html` — **delete** after F1 lands.
