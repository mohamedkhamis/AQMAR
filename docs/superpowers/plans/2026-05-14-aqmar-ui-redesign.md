# AQMAR UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AQMAR `webui/` SPA with the new editorial multi-view design from `C:\Users\MohamedKhamis\Downloads\AQMAR\aqmar-webui\` while preserving the polish work from PR #1 (search, tests, a11y, focus traps).

**Architecture:** Branch from `master` after PR #1 is merged. Drop in the download's 4 files (`index.html`, `app.js`, `config.js`, `styles.css`). Add a 2-function schema adapter in `webui/data-loader.js` that maps our `martyrs.json` shape (`msg_id`, `birth_date`, `martyrdom_date`, `military_rank`, `photo_path`) to the new UI's expected shape (`id`, `birth`, `martyrdom`, `rank`, `photo`). Preserve and wire-in `filter-logic.js`, `data-loader.js`, `admin-edit.js`, and `tests.html` so all 41 existing tests stay green and the search/admin/overrides logic survives. Layer back the ARIA / skip-link / focus-trap polish from PR #1 commits `0db3cf2` and `fac8e4a`.

**Tech Stack:** Vanilla JS + Alpine.js 3.13.5 + Tailwind Play CDN + Litepicker + Google Fonts (Reem Kufi, Amiri, Tajawal, Crimson Pro, Inter Tight). No build step. Same as current.

**Reference docs:**
- Integration assessment: [docs/superpowers/plans/2026-05-14-aqmar-ui-redesign-integration.md](2026-05-14-aqmar-ui-redesign-integration.md)
- Download `PORT_README`: `C:\Users\MohamedKhamis\Downloads\AQMAR\aqmar-webui\PORT_README.md`

**Run tests:** `python -m http.server 8000` from the project root, then open `http://localhost:8000/webui/tests.html`.

**Decisions locked:** D1-b, D2-a, D3-a, D4-a, D5-a (see integration assessment doc).

---

## Prerequisites (HUMAN BEFORE STARTING)

- [ ] **Merge PR #1 to `master`** at https://github.com/mohamedkhamis/AQMAR/pull/1 . Wait for GitHub Pages to rebuild (~1 min). Verify https://mohamedkhamis.github.io/AQMAR/ shows the polished v1 (search bar, view toggle, etc.).
- [ ] Locally: `git checkout master && git pull origin master`.
- [ ] Branch: `git checkout -b feat/ui-redesign`.
- [ ] Tag the v1 state for rollback safety: `git tag spa-v1 master && git push origin spa-v1`.
- [ ] Confirm the download still exists at `C:\Users\MohamedKhamis\Downloads\AQMAR\aqmar-webui\`.

The implementer subagents assume `feat/ui-redesign` is the current branch and that PR #1 has already been merged into `master`.

---

## Task 1: Scaffold — drop download files into webui/

**Files:**
- Delete: `webui/style.css` (replaced by download's `styles.css`)
- Replace: `webui/index.html`, `webui/app.js`, `webui/config.js`
- Add: `webui/styles.css`
- Preserve unchanged: `webui/filter-logic.js`, `webui/data-loader.js`, `webui/admin-edit.js`, `webui/tests.html`

- [ ] **Step 1: Delete the old `style.css`**

```powershell
Remove-Item webui\style.css
```

- [ ] **Step 2: Copy the 4 download files into `webui/`, overwriting**

```powershell
$src = "C:\Users\MohamedKhamis\Downloads\AQMAR\aqmar-webui"
Copy-Item "$src\index.html" webui\index.html -Force
Copy-Item "$src\app.js"     webui\app.js     -Force
Copy-Item "$src\config.js"  webui\config.js  -Force
Copy-Item "$src\styles.css" webui\styles.css -Force
```

(Do NOT copy `PORT_README.md` — its install instructions are now outdated; this plan is the source of truth.)

- [ ] **Step 3: Verify the new UI scaffold renders structurally**

Start the server if not running:

```powershell
python -m http.server 8000
```

Open `http://localhost:8000/webui/`. What you see depends on whether `data/martyrs.json` exists:

- **Without** `data/martyrs.json`: 36 sample names (placeholders from `config.js`).
- **With** `data/martyrs.json` (the current repo state): the page renders structurally — verse, heading, birthday-match hero, stats strip — but `app.js` throws `TypeError: martyrs.map is not a function` in the console because our data is an envelope (`{generated_at, channel, martyrs: [...]}`) while the new UI expects a bare array. **This is expected at this stage.** Task 4 fixes it via the envelope unwrap.

Confirm only the structural elements (verse, hero card, stat strip) render. Data-driven elements being empty/zero is OK for now. If you see anything other than that envelope error, STOP and report.

- [ ] **Step 4: Commit**

```powershell
git add webui/index.html webui/app.js webui/config.js webui/styles.css
git rm webui/style.css
git commit -m "feat(webui): scaffold new editorial UI design (sample data still active)"
```

---

## Task 2: Add `adaptMartyrToNewSchema()` with TDD

**Files:**
- Modify: `webui/data-loader.js`
- Modify: `webui/tests.html`

Current `data/martyrs.json` has rows shaped like:
```json
{ "msg_id": 20, "name": "...", "name_normalized": "...", "birth_date": "1977-12-24",
  "martyrdom_date": "2025-05-15", "city": "...", "military_rank": "قائد كتيبة",
  "weapon": "", "battalion": "...", "brigade": "...", "photo_path": "../data/photos/20.jpg",
  "message_link": "...", "posted_date": "...", "status": "complete" }
```

The new UI expects:
```json
{ "id": 20, "name": "...", "birth": "1977-12-24", "martyrdom": "2025-05-15",
  "city": "...", "rank": "قائد كتيبة", "weapon": "", "battalion": "...",
  "brigade": "...", "photo": "../data/photos/20.jpg" }
```

- [ ] **Step 1: Write the failing tests**

Add at the end of the test block in `webui/tests.html`:

```js
// ===== adaptMartyrToNewSchema =====

test("adaptMartyrToNewSchema maps full row 1:1", () => {
  const row = {
    msg_id: 20, name: "محمد", name_normalized: "محمد",
    birth_date: "1990-03-15", martyrdom_date: "2023-10-12",
    city: "غزة", military_rank: "رقيب", weapon: "RPG",
    battalion: "كتيبة الشجاعية", brigade: "لواء غزة",
    photo_path: "../data/photos/20.jpg",
    message_link: "https://t.me/AqmarTofan/20",
    posted_date: "2024-01-01", status: "complete",
  };
  const out = adaptMartyrToNewSchema(row);
  assertEq(out, {
    id: 20, name: "محمد",
    birth: "1990-03-15", martyrdom: "2023-10-12",
    city: "غزة", rank: "رقيب", weapon: "RPG",
    battalion: "كتيبة الشجاعية", brigade: "لواء غزة",
    photo: "../data/photos/20.jpg",
  });
});

test("adaptMartyrToNewSchema maps sparse row (only mandatory fields)", () => {
  const row = { msg_id: 5, name: "أحمد", birth_date: "1995-01-01", martyrdom_date: "2024-06-01" };
  const out = adaptMartyrToNewSchema(row);
  assertEq(out.id, 5);
  assertEq(out.name, "أحمد");
  assertEq(out.birth, "1995-01-01");
  assertEq(out.martyrdom, "2024-06-01");
  assertEq(out.city, "");
  assertEq(out.rank, "");
});

test("adaptMartyrToNewSchema returns null for rows without msg_id", () => {
  assertEq(adaptMartyrToNewSchema({ name: "بلا معرّف" }), null);
  assertEq(adaptMartyrToNewSchema(null), null);
  assertEq(adaptMartyrToNewSchema(undefined), null);
});

test("adaptMartyrToNewSchema drops unmapped fields", () => {
  const row = { msg_id: 1, name: "X", name_normalized: "X", posted_date: "2024",
                status: "complete", message_link: "https://...", _delta_days: 99 };
  const out = adaptMartyrToNewSchema(row);
  assertEq(out.name_normalized, undefined);
  assertEq(out.posted_date, undefined);
  assertEq(out.status, undefined);
  assertEq(out.message_link, undefined);
  assertEq(out._delta_days, undefined);
});
```

- [ ] **Step 2: Run tests, confirm failures**

Reload `http://localhost:8000/webui/tests.html`. Expected: 4 new tests fail with `ReferenceError: adaptMartyrToNewSchema is not defined`. 41 existing tests still pass.

- [ ] **Step 3: Implement `adaptMartyrToNewSchema` in `webui/data-loader.js`**

Open `webui/data-loader.js`. Inside the IIFE (`(function (global) { ... })(window);`), AFTER the existing `mergeOverrides` function, add:

```js
  function adaptMartyrToNewSchema(row) {
    if (!row || row.msg_id === undefined || row.msg_id === null) return null;
    return {
      id:        row.msg_id,
      name:      row.name || "",
      birth:     row.birth_date || "",
      martyrdom: row.martyrdom_date || "",
      city:      row.city || "",
      rank:      row.military_rank || "",
      weapon:    row.weapon || "",
      battalion: row.battalion || "",
      brigade:   row.brigade || "",
      photo:     row.photo_path || "",
    };
  }
```

And add to the exports at the bottom (before `})(window);`):

```js
  global.adaptMartyrToNewSchema = adaptMartyrToNewSchema;
```

- [ ] **Step 4: Run tests to verify pass**

Reload `tests.html`. Expected: 45 tests pass total (41 + 4 new).

- [ ] **Step 5: Commit**

```powershell
git add webui/data-loader.js webui/tests.html
git commit -m "feat(webui): add adaptMartyrToNewSchema for current→new schema mapping"
```

---

## Task 3: Add `adaptOverridesToNewSchema()` with TDD

**Files:**
- Modify: `webui/data-loader.js`
- Modify: `webui/tests.html`

Current overrides shape (from existing `data/overrides.json`):
```json
{ "version": 1, "edits": { "20": { "birth_date": "1980-01-01", "_manual_edit_at": "2026-05-13T10:00:00" } } }
```

New UI expects a flat map:
```json
{ "20": { "birth": "1980-01-01" } }
```

- [ ] **Step 1: Write the failing tests**

Append to the test block in `tests.html`:

```js
// ===== adaptOverridesToNewSchema =====

test("adaptOverridesToNewSchema flattens v1 format and renames fields", () => {
  const v1 = {
    version: 1,
    edits: {
      "20": { birth_date: "1980-01-01", military_rank: "قائد", _manual_edit_at: "2026-05-13" },
      "21": { city: "رفح" },
    },
  };
  const out = adaptOverridesToNewSchema(v1);
  assertEq(out, {
    "20": { birth: "1980-01-01", rank: "قائد" },
    "21": { city: "رفح" },
  });
});

test("adaptOverridesToNewSchema strips _manual_edit_at and other meta fields", () => {
  const v1 = { version: 1, edits: { "5": { name: "Y", _manual_edit_at: "2026", _foo: "bar" } } };
  assertEq(adaptOverridesToNewSchema(v1), { "5": { name: "Y" } });
});

test("adaptOverridesToNewSchema handles empty/missing input", () => {
  assertEq(adaptOverridesToNewSchema(null), {});
  assertEq(adaptOverridesToNewSchema(undefined), {});
  assertEq(adaptOverridesToNewSchema({}), {});
  assertEq(adaptOverridesToNewSchema({ version: 1 }), {});
  assertEq(adaptOverridesToNewSchema({ version: 1, edits: {} }), {});
});
```

- [ ] **Step 2: Run tests, confirm failures**

Reload. Expected: 3 new tests fail with `ReferenceError`.

- [ ] **Step 3: Implement `adaptOverridesToNewSchema` in `data-loader.js`**

Inside the IIFE, AFTER `adaptMartyrToNewSchema`, add:

```js
  // Field-name remap used inside override entries.
  const OVERRIDE_FIELD_MAP = {
    birth_date:     "birth",
    martyrdom_date: "martyrdom",
    military_rank:  "rank",
    photo_path:     "photo",
  };

  function adaptOverridesToNewSchema(v1) {
    if (!v1 || !v1.edits) return {};
    const out = {};
    for (const id of Object.keys(v1.edits)) {
      const edit = v1.edits[id];
      const mapped = {};
      for (const k of Object.keys(edit)) {
        if (k.startsWith("_")) continue;  // drop meta fields
        const newKey = OVERRIDE_FIELD_MAP[k] || k;
        mapped[newKey] = edit[k];
      }
      out[id] = mapped;
    }
    return out;
  }
```

And add the export at the bottom:

```js
  global.adaptOverridesToNewSchema = adaptOverridesToNewSchema;
```

- [ ] **Step 4: Run tests to verify pass**

Reload. Expected: **48 tests pass** (41 + 4 + 3).

- [ ] **Step 5: Commit**

```powershell
git add webui/data-loader.js webui/tests.html
git commit -m "feat(webui): add adaptOverridesToNewSchema (v1 → new flat format)"
```

---

## Task 4: Wire the adapters into the new `app.js` `init()`

**Files:**
- Modify: `webui/app.js`
- Modify: `webui/index.html` (load `data-loader.js` BEFORE `app.js`)

The new `webui/app.js` has an `init()` method (around line 62) that fetches `../data/martyrs.json` and `../data/overrides.json` directly. We inject the adapter calls right after those fetches.

- [ ] **Step 1: Load `data-loader.js` in `index.html`**

In `webui/index.html`, find the script tags in `<head>` (around line 23):

```html
<!-- Site config (admin password hash etc.) -->
<script src="config.js"></script>

<!-- Alpine (defer required) -->
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.13.5/dist/cdn.min.js"></script>
```

Replace with:

```html
<!-- Site config (admin password hash etc.) -->
<script src="config.js"></script>

<!-- Preserved helpers from v1: schema adapter, search predicate, admin diff logic.
     Load BEFORE Alpine + app.js so their globals are available at init time. -->
<script src="data-loader.js"></script>
<script src="filter-logic.js"></script>
<script src="admin-edit.js"></script>

<!-- Alpine + focus plugin (plugin must load BEFORE the core). -->
<script defer src="https://unpkg.com/@alpinejs/focus@3.x.x/dist/cdn.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.13.5/dist/cdn.min.js"></script>
```

The download already loads `webui/app.js` at the very end of `<body>` (line 765 of `index.html`: `<script src="app.js"></script>`). Leave that line as-is — do NOT add a duplicate load.

- [ ] **Step 2: Wire `adaptMartyrToNewSchema` into the fetch handler**

In `webui/app.js`, find the `init()` method. The relevant block looks like:

```js
let martyrs = null;
try {
  const res = await fetch('../data/martyrs.json', { cache: 'no-cache' });
  if (res.ok) martyrs = await res.json();
} catch (e) {}
if (!martyrs && window.AQMAR_SAMPLE_DATA) martyrs = window.AQMAR_SAMPLE_DATA;
if (!martyrs) martyrs = [];
```

Replace with:

```js
let martyrs = null;
try {
  const res = await fetch('../data/martyrs.json', { cache: 'no-cache' });
  if (res.ok) {
    const raw = await res.json();
    // Our pipeline produces { generated_at, channel, martyrs: [...] }
    // (an array OR a wrapper) — handle both.
    const rows = Array.isArray(raw) ? raw : (raw.martyrs || []);
    martyrs = rows.map(adaptMartyrToNewSchema).filter(Boolean);
  }
} catch (e) {}
if (!martyrs && window.AQMAR_SAMPLE_DATA) martyrs = window.AQMAR_SAMPLE_DATA;
if (!martyrs) martyrs = [];
```

- [ ] **Step 3: Wire `adaptOverridesToNewSchema` into the overrides fetch handler**

A few lines below the previous block, find:

```js
try {
  const ores = await fetch('../data/overrides.json', { cache: 'no-cache' });
  if (ores.ok) {
    const overrides = await ores.json();
    martyrs = martyrs.map(m => overrides[m.id] ? { ...m, ...overrides[m.id] } : m);
  }
} catch (e) {}
```

Replace with:

```js
try {
  const ores = await fetch('../data/overrides.json', { cache: 'no-cache' });
  if (ores.ok) {
    const raw = await ores.json();
    const overrides = adaptOverridesToNewSchema(raw);
    martyrs = martyrs.map(m => overrides[m.id] ? { ...m, ...overrides[m.id] } : m);
  }
} catch (e) {}
```

- [ ] **Step 4: Verify in the browser**

Open `http://localhost:8000/webui/`. Expected:
- Landing renders real martyr names from `data/martyrs.json`, not the 36 sample placeholders.
- Stats strip shows the real count (e.g. `352 شهيد`).
- Click the "اعرض الأسماء" button → browse view shows the registry.
- Click any card → detail view opens (timeline, related martyrs).

Console must be free of errors. If it isn't, STOP and report.

- [ ] **Step 5: Tests still pass**

Reload `http://localhost:8000/webui/tests.html`. Expected: still 48 passed.

- [ ] **Step 6: Commit**

```powershell
git add webui/index.html webui/app.js
git commit -m "feat(webui): wire schema adapters into new UI init flow"
```

---

## Task 5: Replace the new UI's naive search with `searchPredicate`

**Files:**
- Modify: `webui/app.js`

The new UI's `filtered` getter has this naive substring search:

```js
if (f.q) {
  const q = f.q.toLowerCase();
  list = list.filter(m =>
    (m.name && m.name.toLowerCase().includes(q)) ||
    (m.city && m.city.toLowerCase().includes(q)) ||
    (m.battalion && m.battalion.toLowerCase().includes(q))
  );
}
```

`searchPredicate` from `filter-logic.js` handles Arabic alef/ya/ta-marbuta variants and also covers `brigade` — strictly more correct.

- [ ] **Step 1: Replace the block**

In `webui/app.js`, replace the `if (f.q) { ... }` block above with:

```js
if (f.q) {
  list = list.filter(m => searchPredicate(m, f.q));
}
```

- [ ] **Step 2: Verify in the browser**

Open `http://localhost:8000/webui/`, navigate to the registry (browse view). Type a search like `أحمد` (or any partial Arabic name). Expected: list narrows to matches; works regardless of whether the data has `أحمد` or `احمد` (because `normalizeArabic` is applied to both sides). Try a city name like `غزه` (with ه instead of ة) — should still match `غزة` entries.

- [ ] **Step 3: Tests still pass**

Reload `tests.html`. Expected: 48 still pass.

- [ ] **Step 4: Commit**

```powershell
git add webui/app.js
git commit -m "feat(webui): use searchPredicate (Arabic-aware) for browse search"
```

---

## Task 6: Use `buildEditDiff` + backward-compat localStorage key

**Files:**
- Modify: `webui/app.js`

The new UI's `saveEdit()` writes a raw flat dict. We'll route through `buildEditDiff` so only changed fields are stored, and we'll read both `aqmar.edits` AND `aqmar.pending_overrides` on init so admins who have pending v1 edits don't lose them.

- [ ] **Step 1: Replace the `saveEdit()` method**

In `webui/app.js`, find:

```js
saveEdit() {
  const m = this.editingMartyr();
  if (!m) return;
  const changed = {};
  for (const k of Object.keys(this.draft)) {
    if (this.draft[k] !== m[k]) changed[k] = this.draft[k];
  }
  this.edits = { ...this.edits, [m.id]: changed };
  // Also reflect immediately in this.all so the UI updates without reload
  const idx = this.all.findIndex(x => x.id === m.id);
  if (idx >= 0) this.all[idx] = { ...this.all[idx], ...changed };
  this.editingId = null;
  this.draft = {};
},
```

Replace with:

```js
saveEdit() {
  const m = this.editingMartyr();
  if (!m) return;
  // Compute the diff using the shared v1 helper (ignores untouched fields
  // and underscore-prefixed meta).
  const diff = buildEditDiff(m, this.draft);
  if (Object.keys(diff).length === 0) {
    this.editingId = null;
    this.draft = {};
    return;
  }
  // Merge the new diff into the existing per-id override.
  this.edits = { ...this.edits, [m.id]: { ...(this.edits[m.id] || {}), ...diff } };
  // Reflect immediately so the UI updates without reload.
  const idx = this.all.findIndex(x => x.id === m.id);
  if (idx >= 0) this.all[idx] = { ...this.all[idx], ...diff };
  this.editingId = null;
  this.draft = {};
},
```

- [ ] **Step 2: Add backward-compat read of `aqmar.pending_overrides`**

Still in `webui/app.js`, find the init block that reads localStorage (around line 70):

```js
try {
  const cached = localStorage.getItem('aqmar.edits');
  if (cached) this.edits = JSON.parse(cached);
} catch (e) {}
```

Replace with:

```js
try {
  const cached = localStorage.getItem('aqmar.edits');
  if (cached) {
    this.edits = JSON.parse(cached);
  } else {
    // One-time migration: if the v1 SPA stored pending overrides under
    // the legacy key, lift them into the new key so the admin doesn't
    // lose unexported edits.
    const v1 = localStorage.getItem('aqmar.pending_overrides');
    if (v1) {
      const parsed = JSON.parse(v1);
      this.edits = adaptOverridesToNewSchema(parsed);
      localStorage.setItem('aqmar.edits', JSON.stringify(this.edits));
    }
  }
} catch (e) {}
```

- [ ] **Step 3: Verify in the browser**

Open `http://localhost:8000/webui/`. Log in as admin (`admin` / `aqmar2026`). Navigate to admin view. Edit a martyr's `city`. Save. Reload page. Expected: edit persists, the card shows the updated value.

- [ ] **Step 4: Tests still pass**

48 passing.

- [ ] **Step 5: Commit**

```powershell
git add webui/app.js
git commit -m "feat(webui): saveEdit via buildEditDiff + back-compat read of aqmar.pending_overrides"
```

---

## Task 7: Enable `usePhotos: true`

**Files:**
- Modify: `webui/config.js`

- [ ] **Step 1: Flip the flag**

In `webui/config.js`, find:

```js
usePhotos: false,
```

Replace with:

```js
usePhotos: true,
```

- [ ] **Step 2: Verify in the browser**

Open `http://localhost:8000/webui/`. Expected: portrait components show real photos from `../data/photos/{id}.jpg`. Where a photo is missing (404), it falls back to the monogram (the `onerror` handler in `renderPortrait` hides the `<img>`).

Spot-check: open detail view for a martyr you know has a photo (e.g. id 100) — real face renders. Open detail for a sparse row with no photo on disk — monogram renders.

- [ ] **Step 3: Tests still pass**

48 passing.

- [ ] **Step 4: Commit**

```powershell
git add webui/config.js
git commit -m "feat(webui): enable real photos (usePhotos: true)"
```

---

## Task 8: Add lazy-load to portrait images

**Files:**
- Modify: `webui/app.js`

The `renderPortrait` helper builds `<img>` HTML directly via template string. With 350+ photos potentially in a single browse view, missing `loading="lazy"` will tank mobile initial paint.

- [ ] **Step 1: Edit `renderPortrait`**

In `webui/app.js`, find:

```js
const photoHtml = photo
  ? `<img src="${esc(photo)}" alt="" onerror="this.style.display='none'">`
  : '';
```

Replace with:

```js
const photoHtml = photo
  ? `<img src="${esc(photo)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">`
  : '';
```

- [ ] **Step 2: Verify**

Reload `http://localhost:8000/webui/`, open browse view. In Chrome DevTools → Network tab, scroll the list — images load progressively as they enter the viewport.

- [ ] **Step 3: Commit**

```powershell
git add webui/app.js
git commit -m "fix(webui): add loading=lazy + decoding=async to portrait images"
```

---

## Task 9: Skip-to-content link + ARIA landmarks

**Files:**
- Modify: `webui/index.html`
- Modify: `webui/styles.css`

The new UI has no skip link and inconsistent landmarks. Add what PR #1 had.

- [ ] **Step 1: Add skip-link CSS**

Append to `webui/styles.css`:

```css
/* Skip-to-content link — visible only on keyboard focus */
.skip-link {
  position: absolute; top: -40px; inset-inline-start: 1rem;
  background: var(--forest); color: var(--paper);
  padding: 0.5rem 1rem; border-radius: 0 0 6px 6px;
  font-weight: bold; z-index: 100;
  transition: top 0.15s ease-out;
  font-family: var(--font-body);
}
.skip-link:focus { top: 0; }
```

- [ ] **Step 2: Add the skip-link element + landmark roles**

In `webui/index.html`, find the opening of `<div id="root" x-data="aqmar()" x-init="init()" x-cloak>` (around line 31). Just INSIDE that wrapper, add as the first child:

```html
  <a href="#main-content" class="skip-link" x-text="lang === 'ar' ? 'تخطي إلى المحتوى' : 'Skip to content'"></a>
```

Then for each of the five `<main>` blocks (`view === 'home'`, `'browse'`, `'detail'`, `'admin'`, `'about'`), add `role="main"` and an `id`. Use distinct IDs because Alpine renders all five and toggles via `x-show`:

```html
<main id="main-content" role="main" x-show="view === 'home'" ...>
<main id="main-content-browse" role="main" x-show="view === 'browse'" ...>
<main id="main-content-detail" role="main" x-show="view === 'detail'" ...>
<main id="main-content-admin" role="main" x-show="view === 'admin'" ...>
<main id="main-content-about" role="main" x-show="view === 'about'" ...>
```

(`id="main-content"` on the home view because that's where the skip link lands by default. All five must have `role="main"`.)

Also confirm the `<header>` already has the correct role implicitly via the `<header>` tag, but be explicit:

```html
<header role="banner" class="sticky ...">
```

- [ ] **Step 3: Verify with keyboard**

Open `http://localhost:8000/webui/`. Click the URL bar, press Tab. Expected: a gold pill labeled "تخطي إلى المحتوى" drops down from the top. Press Enter — focus jumps to the home main.

- [ ] **Step 4: Tests still pass**

48 passing.

- [ ] **Step 5: Commit**

```powershell
git add webui/index.html webui/styles.css
git commit -m "feat(webui): add skip-to-content link + role=main/banner landmarks"
```

---

## Task 10: ARIA on modals + result-count live regions

**Files:**
- Modify: `webui/index.html`

The new UI has a login modal (`x-show="showLogin"`). Confirm it gets dialog semantics, and add `aria-live` to the two result-count blocks (browse count + admin count).

- [ ] **Step 1: Inspect the modal markup**

Find the login modal in `webui/index.html` (search for `x-show="showLogin"`). It will look something like:

```html
<div x-show="showLogin" @click.self="showLogin = false" x-cloak class="fixed inset-0 ...">
  <div class="bg-paper ...">
    <h3 ...>دخول المحرّر</h3>
    <form @submit.prevent="doLogin()"> ... </form>
  </div>
</div>
```

Replace the outer wrapper attributes with:

```html
<div x-show="showLogin" @click.self="showLogin = false" x-cloak
     role="dialog" aria-modal="true" aria-labelledby="login-modal-title"
     class="fixed inset-0 ...">
```

And add `id="login-modal-title"` to the `<h3>`.

If there's an in-page edit modal as well (some new-UI variants embed it; others use the admin view's table inline), find it and apply the same `role="dialog" aria-modal="true" aria-labelledby="..."` treatment with a unique `id`.

- [ ] **Step 2: Add `aria-live` to the browse result count**

Find the browse-view result count (around `<span x-text="filtered.length">` near the sort row). Wrap or modify so:

```html
<div class="text-[13px] text-muted" aria-live="polite" aria-atomic="true">
  <span x-text="filtered.length"></span>
  <span x-text="lang === 'ar' ? `من ${all.length} اسماً` : `of ${all.length} names`"></span>
</div>
```

- [ ] **Step 3: Add `aria-live` to the admin result count (if present)**

Find the admin view's count (the row above the admin table). Apply the same treatment with `aria-live="polite" aria-atomic="true"`.

- [ ] **Step 4: Verify**

Reload `http://localhost:8000/webui/`. Open the login modal — inspect with DevTools to confirm the dialog role is present. Type in the browse search and watch the result count update — a screen reader (or the Accessibility tab in DevTools) would announce the change.

- [ ] **Step 5: Commit**

```powershell
git add webui/index.html
git commit -m "feat(webui): add role=dialog + aria-live result counts"
```

---

## Task 11: Modal focus traps + ESC handling

**Files:**
- Modify: `webui/index.html`

The `@alpinejs/focus` plugin was already loaded in Task 4. Now wire `x-trap` and `@keydown.escape.window` to the login modal (and any other modal).

- [ ] **Step 1: Add to the login modal**

Update the login modal's outer wrapper (from Task 10):

```html
<div x-show="showLogin" @click.self="showLogin = false" x-cloak
     @keydown.escape.window="showLogin = false" x-trap="showLogin"
     role="dialog" aria-modal="true" aria-labelledby="login-modal-title"
     class="fixed inset-0 ...">
```

If an edit modal exists, apply the same with its own state var (e.g. `x-trap="editingId !== null"` and `@keydown.escape.window="cancelEdit()"`).

- [ ] **Step 2: Verify**

Reload. Click "دخول المحرّر" — modal opens. Press Tab repeatedly — focus stays inside the modal (username → password → submit → cancel and back). Press Escape — modal closes.

- [ ] **Step 3: Commit**

```powershell
git add webui/index.html
git commit -m "feat(webui): focus trap + ESC-to-close on modals"
```

---

## Task 12: Add lifespan-timeline divide-by-zero guard

**Files:**
- Modify: `webui/app.js`

`renderTimeline` divides by `range = endY - startY`. When `range === 0` (martyr born and martyred in the same year, or unknown dates), result is `NaN%` for positions.

- [ ] **Step 1: Guard**

In `webui/app.js`, find:

```js
renderTimeline(m) {
  if (!m.birth || !m.martyrdom) return '';
  const ar = this.lang === 'ar';
  const birthY = parseInt(m.birth.slice(0,4), 10);
  const martY  = parseInt(m.martyrdom.slice(0,4), 10);
  const endY   = new Date().getFullYear();
  const startY = birthY;
  const range  = endY - startY || 1;
```

It already has `|| 1` — that's a partial guard. Add a stricter early return if `range < 1`:

```js
renderTimeline(m) {
  if (!m.birth || !m.martyrdom) return '';
  const ar = this.lang === 'ar';
  const birthY = parseInt(m.birth.slice(0,4), 10);
  const martY  = parseInt(m.martyrdom.slice(0,4), 10);
  if (!Number.isFinite(birthY) || !Number.isFinite(martY)) return '';
  const endY   = new Date().getFullYear();
  const startY = birthY;
  const range  = Math.max(endY - startY, 1);  // at least 1 to avoid div-by-zero
```

(Drops the `|| 1` short-circuit in favor of an explicit `Math.max`.)

- [ ] **Step 2: Verify**

Open the detail view for any martyr; timeline renders correctly. Open one with `birth_date === ""` (if any exist in the data) — the early `if (!m.birth || !m.martyrdom) return '';` short-circuits, no error.

- [ ] **Step 3: Commit**

```powershell
git add webui/app.js
git commit -m "fix(webui): harden lifespan timeline against NaN/div-by-zero"
```

---

## Task 13: Wire Telegram source link on detail view

**Files:**
- Modify: `webui/data-loader.js`
- Modify: `webui/app.js`
- Modify: `webui/index.html`

The download removed the Telegram message link. The current data has `message_link` per row. Restore it as a small "source" link on the detail page.

- [ ] **Step 1: Pass `message_link` through the adapter**

In `webui/data-loader.js`, edit `adaptMartyrToNewSchema` — add one line to the returned object:

```js
return {
  id:        row.msg_id,
  name:      row.name || "",
  birth:     row.birth_date || "",
  martyrdom: row.martyrdom_date || "",
  city:      row.city || "",
  rank:      row.military_rank || "",
  weapon:    row.weapon || "",
  battalion: row.battalion || "",
  brigade:   row.brigade || "",
  photo:     row.photo_path || "",
  source:    row.message_link || "",   // ← NEW
};
```

- [ ] **Step 2: Update the existing 1:1 mapping test**

In `webui/tests.html`, find the `"adaptMartyrToNewSchema maps full row 1:1"` test. Update the expected object to include `source: "https://t.me/AqmarTofan/20"` to match the new field. Run tests, confirm pass.

- [ ] **Step 3: Render the source link on detail view**

In `webui/index.html`, find the detail view (`<main x-show="view === 'detail'">`). Just below the personal/military info rows, add:

```html
<template x-if="current && current.source">
  <div class="mt-6 pt-4" style="border-top: 1px dashed var(--divider);">
    <a :href="current.source" target="_blank" rel="noopener"
       class="text-[12px] text-olive hover:text-forest inline-flex items-center gap-1.5">
      <span x-text="lang === 'ar' ? 'المصدر على تيليجرام' : 'Source on Telegram'"></span>
      <span aria-hidden="true">↗</span>
    </a>
  </div>
</template>
```

- [ ] **Step 4: Verify**

Open detail view for a martyr with a `message_link`. Source link appears at the bottom of the info panel. Clicking opens Telegram in a new tab.

- [ ] **Step 5: Tests still pass**

48 (with the updated 1:1 test).

- [ ] **Step 6: Commit**

```powershell
git add webui/data-loader.js webui/app.js webui/index.html webui/tests.html
git commit -m "feat(webui): preserve Telegram source link on detail view"
```

---

## Task 14: Live-compute the "days since Oct 7" stat

**Files:**
- Modify: `webui/app.js`

The `stats` getter has hardcoded `'٥٧٢ يوماً'` / `'572 days'`. Replace with a live computation.

- [ ] **Step 1: Compute days since 2023-10-07**

In `webui/app.js`, find the `get stats()` getter. Replace the hardcoded entry:

```js
{ k_ar: '٥٧٢ يوماً', k_en: '572 days', v_ar: 'منذ بدء الطوفان', v_en: 'since Oct 7' },
```

With:

```js
(() => {
  const startDate = new Date('2023-10-07');
  const days = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 86400000));
  return {
    k_ar: this.toArDigits(days) + ' يوماً',
    k_en: days + ' days',
    v_ar: 'منذ بدء الطوفان',
    v_en: 'since Oct 7',
  };
})(),
```

- [ ] **Step 2: Verify**

Reload landing page. Expected: stat shows the actual count of days since 2023-10-07.

- [ ] **Step 3: Commit**

```powershell
git add webui/app.js
git commit -m "fix(webui): live-compute days-since-Oct-7 stat instead of hardcoded"
```

---

## Task 15: Gate the sample data behind `?demo`

**Files:**
- Modify: `webui/config.js`
- Modify: `webui/app.js`

Risk surfaced in the integration assessment: if `martyrs.json` ever fails to load in production, users would silently see 36 fake names. Keep the sample data available for offline preview but gate it.

- [ ] **Step 1: Make the sample data assignment conditional**

In `webui/config.js`, find the IIFE that ends with `window.AQMAR_SAMPLE_DATA = data;`. Wrap the assignment:

```js
// Only expose sample data when explicitly requested via ?demo.
if (new URLSearchParams(location.search).has('demo')) {
  window.AQMAR_SAMPLE_DATA = data;
}
```

- [ ] **Step 2: Test the gate**

Open `http://localhost:8000/webui/` — uses real data.
Open `http://localhost:8000/webui/?demo` (with `data/martyrs.json` temporarily renamed away) — falls back to sample. Or just confirm `window.AQMAR_SAMPLE_DATA` is `undefined` at the console without `?demo`.

- [ ] **Step 3: Commit**

```powershell
git add webui/config.js
git commit -m "fix(webui): gate sample data behind ?demo to prevent prod leakage"
```

---

## Task 16: Self-host Google Fonts (optional, skip if you want to keep CDN)

**SKIP THIS TASK** if you accept the third-party request to fonts.googleapis.com for a public memorial site. The download depends on Google Fonts via CDN; that's working fine.

If you DO want to self-host:
- Download the 5 font families (Reem Kufi, Amiri, Tajawal, Crimson Pro, Inter Tight) into `webui/fonts/`.
- Replace the `<link href="https://fonts.googleapis.com/..." rel="stylesheet">` in `index.html` with local `@font-face` declarations in `styles.css`.
- This is a separate ~30 min task, not detailed here. Decide based on D6 in the integration assessment.

Skip = no commit, move to Task 17.

---

## Task 17: Final acceptance

**Files:** none modified (verification only).

- [ ] **Step 1: Run the full test suite**

Open `http://localhost:8000/webui/tests.html`. Expected: **48 passed, 0 failed**.

Breakdown:
- 41 existing tests (from PR #1)
- 4 `adaptMartyrToNewSchema` tests
- 3 `adaptOverridesToNewSchema` tests

If any failure, fix before declaring complete.

- [ ] **Step 2: Five-view smoke (desktop, 1280 wide)**

| View | Action | Expected |
|---|---|---|
| Home | Load `/webui/` | Verse, hero birthday card, stats, on-this-day if any |
| Home | Pick day/month, click "اعرض الأسماء" | Switches to browse with birthday banner |
| Browse | Type a name in search | List narrows |
| Browse | Click a card | Detail view opens |
| Detail | Verify | Photo or monogram, timeline, info rows, source link, related martyrs |
| Admin | Login as `admin` / `aqmar2026` | Admin table appears |
| Admin | Edit a martyr's city → Save | Card reflects change |
| About | Click "عن الموقع" | Static about page |
| Language | Click `EN` toggle | Whole UI flips to English |

- [ ] **Step 3: Mobile smoke (390×844)**

Same checklist on mobile. Specifically verify:
- Header is not cramped.
- Birthday card stacks vertically.
- Browse card grid uses appropriate columns (1 or 2 on phone).
- Modals are usable.

- [ ] **Step 4: Lighthouse accessibility**

Chrome DevTools → Lighthouse → Accessibility only → Mobile → Analyze.

Target: **score ≥ 95**. If below, the common failures + fixes are:

| Audit | Likely fix |
|---|---|
| Missing image alt | Add `alt` attr to any `<img>` in templates |
| Contrast | Adjust `--muted` or `--faint` color tokens for AA compliance |
| Form labels | Ensure each `<input>` / `<select>` has a `<label>` or `aria-label` |
| Heading order | Ensure `<h1>` then `<h2>` then `<h3>` — no skipped levels |

- [ ] **Step 5: Update README.md**

In the root `README.md`, replace the "Web UI" section to describe the new editorial design:
- Mention the multi-view IA (Home / Registry / Detail / Admin / About).
- Mention the bilingual ar/en toggle.
- Mention the warm earth-tone palette and Reem Kufi / Amiri / Tajawal fonts.
- Update the screenshot/description if one exists.
- Keep admin login instructions.

Commit the README change:

```powershell
git add README.md
git commit -m "docs: update README for the new editorial UI"
```

- [ ] **Step 6: Stop. Ask before pushing**

Per CLAUDE.md (HARD RULE): never `git push` without explicit user approval. Summarize the work, then ASK: "Ready to push and open PR #2?"

Only after the user confirms:

```powershell
git push -u origin feat/ui-redesign
gh pr create --base master --head feat/ui-redesign \
  --title "UI redesign — editorial multi-view layout (ar/en)" \
  --body "$(cat docs/superpowers/plans/2026-05-14-aqmar-ui-redesign.md | head -50)"
```

After merging the PR, GitHub Pages auto-rebuilds within ~1 min with the new editorial UI live.

---

## Done

The SPA now has:
- ✅ Editorial multi-view IA (Home / Browse / Detail / Admin / About)
- ✅ Birthday-match hero with live preview + "On this day" anniversaries
- ✅ Lifespan timeline + related martyrs on detail view
- ✅ Bilingual Arabic / English (with `data-theme` light/dark support pre-wired)
- ✅ Real martyr photos (or calligraphic monogram fallback)
- ✅ Telegram source link preserved on detail view
- ✅ Live "days since Oct 7" stat
- ✅ Sample data gated behind `?demo`
- ✅ Arabic-aware search (preserved from PR #1)
- ✅ Schema adapter so the pipeline doesn't need to change
- ✅ Backward-compat localStorage migration for admin edits
- ✅ 48 passing tests
- ✅ ARIA landmarks + skip link + focus traps + ESC handlers
- ✅ Lighthouse accessibility ≥ 95
