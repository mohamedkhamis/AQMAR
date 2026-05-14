# AQMAR SPA UX Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the existing AQMAR SPA (`webui/`) from cramped-on-mobile to a professional, responsive memorial database — without changing the data pipeline or hosting setup.

**Architecture:** Stay on Alpine.js + Tailwind Play CDN + Litepicker (no build step). Polish in place: extract row markup into inline `<template>` tags so a `viewMode` toggle can render either grid or list. Add a text search bar (debounced 150 ms) that prepends a new predicate to the existing `applyFilter()` pipeline. Layer in skeletons, focus rings, ARIA landmarks, and mobile breakpoint fixes.

**Tech Stack:** Vanilla JS + Alpine.js 3.x + Tailwind 3 (Play CDN) + Litepicker. Test harness is the existing `webui/tests.html` runner.

**Reference spec:** [docs/superpowers/specs/2026-05-14-aqmar-spa-ux-design.md](../specs/2026-05-14-aqmar-spa-ux-design.md)

**Run tests:** open `http://localhost:8000/webui/tests.html` while serving the project root with `python -m http.server 8000`.

---

## Task 1: Add `normalizeArabic()` helper

**Files:**
- Modify: `webui/filter-logic.js` (add function, export on `window`)
- Modify: `webui/tests.html` (new test block)

- [ ] **Step 1: Write the failing tests**

Add inside the `<script>` test block in `webui/tests.html`, after the existing `filter-logic.js` tests (around line 200):

```js
// ===== normalizeArabic =====

test("normalizeArabic strips diacritics", () => {
  assertEq(normalizeArabic("مُحَمَّد"), "محمد");
});

test("normalizeArabic unifies alef variants", () => {
  assertEq(normalizeArabic("أحمد"), "احمد");
  assertEq(normalizeArabic("إيمان"), "ايمان");
  assertEq(normalizeArabic("آمنة"), "امنه");
});

test("normalizeArabic converts ya variants", () => {
  assertEq(normalizeArabic("على"), "علي");
});

test("normalizeArabic collapses whitespace", () => {
  assertEq(normalizeArabic("  محمد   أحمد  "), "محمد احمد");
});

test("normalizeArabic handles empty/null", () => {
  assertEq(normalizeArabic(""), "");
  assertEq(normalizeArabic(null), "");
  assertEq(normalizeArabic(undefined), "");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Open `http://localhost:8000/webui/tests.html` (start the server first if needed: `python -m http.server 8000` from the project root).

Expected: 5 new tests fail with `ReferenceError: normalizeArabic is not defined`.

- [ ] **Step 3: Implement `normalizeArabic` in `filter-logic.js`**

Add inside the IIFE in `webui/filter-logic.js` (before the `global.X = X;` exports near the end):

```js
function normalizeArabic(text) {
  if (!text) return "";
  let s = String(text);
  s = s.replace(/[ً-ْ]/g, "");      // diacritics
  s = s.replace(/ـ/g, "");               // tatweel
  s = s.replace(/[أإآ]/g, "ا");  // أإآ → ا
  s = s.replace(/ة/g, "ه");         // ة → ه
  s = s.replace(/ى/g, "ي");         // ى → ي
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
```

And add to the exports at the bottom:

```js
global.normalizeArabic = normalizeArabic;
```

- [ ] **Step 4: Run tests to verify they pass**

Reload `tests.html`. Expected: 5 new `normalizeArabic` tests pass. All existing 23 tests still pass. Total: 28 passing.

- [ ] **Step 5: Commit**

Stage and commit:

```powershell
git add webui/filter-logic.js webui/tests.html
git commit -m "feat(webui): add normalizeArabic helper for Arabic search"
```

---

## Task 2: Add `searchPredicate(row, query)` helper

**Files:**
- Modify: `webui/filter-logic.js`
- Modify: `webui/tests.html`

- [ ] **Step 1: Write the failing tests**

Add in `webui/tests.html`, after the `normalizeArabic` tests:

```js
// ===== searchPredicate =====

const SAMPLE_ROW = {
  msg_id: 1,
  name: "محمد عبد الرحمن",
  city: "غزة",
  battalion: "كتيبة الشجاعية",
  brigade: "لواء غزة",
  military_rank: "رقيب",
  weapon: "أر بي جي",
  birth_date: "1990-03-15",
  martyrdom_date: "2023-10-12",
};

test("searchPredicate matches exact name", () => {
  assertEq(searchPredicate(SAMPLE_ROW, "محمد عبد الرحمن"), true);
});

test("searchPredicate matches partial name", () => {
  assertEq(searchPredicate(SAMPLE_ROW, "عبد"), true);
});

test("searchPredicate matches city", () => {
  assertEq(searchPredicate(SAMPLE_ROW, "غزة"), true);
});

test("searchPredicate matches battalion", () => {
  assertEq(searchPredicate(SAMPLE_ROW, "الشجاعية"), true);
});

test("searchPredicate matches brigade", () => {
  assertEq(searchPredicate(SAMPLE_ROW, "لواء"), true);
});

test("searchPredicate normalizes Arabic in query and field", () => {
  assertEq(searchPredicate({ ...SAMPLE_ROW, name: "أحمد" }, "احمد"), true);
});

test("searchPredicate returns true for empty query", () => {
  assertEq(searchPredicate(SAMPLE_ROW, ""), true);
  assertEq(searchPredicate(SAMPLE_ROW, "   "), true);
});

test("searchPredicate returns false on no match", () => {
  assertEq(searchPredicate(SAMPLE_ROW, "خانيونس"), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Reload `tests.html`. Expected: 8 new tests fail with `ReferenceError: searchPredicate is not defined`.

- [ ] **Step 3: Implement `searchPredicate` in `filter-logic.js`**

Add inside the IIFE, after `normalizeArabic`:

```js
function searchPredicate(row, query) {
  const q = normalizeArabic(query);
  if (!q) return true;
  const haystack = [
    row.name,
    row.city,
    row.battalion,
    row.brigade,
  ].map(normalizeArabic).join(" | ");
  return haystack.includes(q);
}
```

And add the export at the bottom:

```js
global.searchPredicate = searchPredicate;
```

- [ ] **Step 4: Run tests to verify they pass**

Reload `tests.html`. Expected: 8 new `searchPredicate` tests pass. Total: 36 passing (23 existing + 5 normalizeArabic + 8 searchPredicate). All existing tests still pass.

- [ ] **Step 5: Commit**

```powershell
git add webui/filter-logic.js webui/tests.html
git commit -m "feat(webui): add searchPredicate for name/city/battalion/brigade"
```

---

## Task 3: Wire search into `applyFilter()`

**Files:**
- Modify: `webui/app.js`
- Modify: `webui/tests.html`

- [ ] **Step 1: Write composition tests in `tests.html`**

Add at the end of the test block:

```js
// ===== applyFilter composition (logic only — no Alpine context needed) =====

function applyFilterPure(rows, opts) {
  // Mirrors app.js applyFilter() — pure version for testing.
  let r = rows;
  if (opts.searchQuery !== undefined && opts.searchQuery !== "") {
    r = r.filter(row => searchPredicate(row, opts.searchQuery));
  }
  if (opts.ageMin !== undefined || opts.ageMax !== undefined) {
    r = r.filter(row => {
      const age = computeAge(row.birth_date, row.martyrdom_date);
      if (age === null) return false;
      if (opts.ageMin !== undefined && age < opts.ageMin) return false;
      if (opts.ageMax !== undefined && age > opts.ageMax) return false;
      return true;
    });
  }
  if (opts.userBirthdate) {
    r = filterByProximity(r, opts.userBirthdate, opts.windowDays || 30);
  }
  return r;
}

const COMPOSITION_ROWS = [
  { msg_id: 1, name: "محمد", city: "غزة", birth_date: "1990-03-15", martyrdom_date: "2023-10-12" },
  { msg_id: 2, name: "أحمد", city: "خانيونس", birth_date: "1995-08-20", martyrdom_date: "2023-11-05" },
  { msg_id: 3, name: "محمد", city: "رفح", birth_date: "1985-01-10", martyrdom_date: "2023-09-30" },
];

test("composition: search + birthdate window", () => {
  // searchQuery "محمد" + userBirthdate near 1990 with a window wide enough
  // to include row 3 (1985 birth) so we exercise BOTH filters composing.
  const result = applyFilterPure(COMPOSITION_ROWS, {
    searchQuery: "محمد",
    userBirthdate: "1990-03-15",
    windowDays: 2200,  // ±6 years — covers the 5-year gap to row 3
  });
  assertEq(result.map(r => r.msg_id).sort(), [1, 3]);
});

test("composition: search + age range", () => {
  // searchQuery "محمد" + age between 33 and 40
  const result = applyFilterPure(COMPOSITION_ROWS, {
    searchQuery: "محمد",
    ageMin: 33,
    ageMax: 40,
  });
  // msg_id 1: age 33 (1990→2023) ✓
  // msg_id 3: age 38 (1985→2023) ✓
  assertEq(result.map(r => r.msg_id).sort(), [1, 3]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Reload `tests.html`. Expected: 2 new composition tests fail because `applyFilterPure` uses `searchPredicate` which is defined (good), but the assertions might pass by accident depending on existing code. Actually — these tests should pass on their own once `searchPredicate` exists, since `applyFilterPure` is a self-contained helper.

If both new tests pass at this step (38 total), proceed to Step 3 to wire the real `applyFilter`.

- [ ] **Step 3: Wire `searchQuery` into `app.js`**

In `webui/app.js`, find the state block (around line 29 — the `// === public filter state ===` section). Add after `customDaysError: "",`:

```js
    // search (text query over name + city + battalion + brigade)
    searchQuery: "",
    _searchDebounceId: null,
```

Find `applyFilter()` (around line 146). At the very top of `let rows = this.allRows;` (line 154), insert BEFORE `let rows`:

```js
      // Filter 0: free-text search (cheapest predicate — runs first)
      let rows = this.allRows;
      if (this.searchQuery && this.searchQuery.trim()) {
        rows = rows.filter(r => searchPredicate(r, this.searchQuery));
      }
```

And delete the existing line `let rows = this.allRows;` that came right after the function signature (to avoid double declaration). The full top of the function should now look like:

```js
    applyFilter() {
      this.customDaysError = "";
      if (this.windowMode === "custom") {
        const n = parseInt(this.customDays, 10);
        if (isNaN(n) || n < AQMAR_CONFIG.filterCustomDaysMin || n > AQMAR_CONFIG.filterCustomDaysMax) {
          this.customDaysError = `${AQMAR_CONFIG.filterCustomDaysMin} - ${AQMAR_CONFIG.filterCustomDaysMax}`;
        }
      }

      // Filter 0: free-text search (cheapest predicate — runs first)
      let rows = this.allRows;
      if (this.searchQuery && this.searchQuery.trim()) {
        rows = rows.filter(r => searchPredicate(r, this.searchQuery));
      }

      // Filter 1: martyrdom date range
      if (this.martyrdomFrom) rows = rows.filter(r => r.martyrdom_date && r.martyrdom_date >= this.martyrdomFrom);
      // ... (rest unchanged)
```

- [ ] **Step 4: Add debounced setter helper**

Still in `app.js`, find the section just below the state declarations, before `initLitepicker(el)` (around line 44). Add this method:

```js
    setSearchQuery(value) {
      this.searchQuery = value;
      clearTimeout(this._searchDebounceId);
      this._searchDebounceId = setTimeout(() => this.applyFilter(), 150);
    },
```

- [ ] **Step 5: Run all tests**

Reload `http://localhost:8000/webui/tests.html`. Expected: 38 tests pass (no new test failures; the `applyFilter` change is verified by the composition tests).

- [ ] **Step 6: Commit**

```powershell
git add webui/app.js webui/tests.html
git commit -m "feat(webui): wire searchQuery into applyFilter with 150ms debounce"
```

---

## Task 4: Add `viewMode` state with localStorage persistence

**Files:**
- Modify: `webui/config.js`
- Modify: `webui/app.js`
- Modify: `webui/tests.html`

- [ ] **Step 1: Write the failing tests**

Add in `webui/tests.html`, at the end of the test block:

```js
// ===== viewMode persistence =====

test("viewMode default is 'grid' when localStorage empty", () => {
  localStorage.removeItem(AQMAR_CONFIG.storage.viewMode);
  assertEq(readViewMode(), "grid");
});

test("viewMode reads 'list' from localStorage", () => {
  localStorage.setItem(AQMAR_CONFIG.storage.viewMode, "list");
  assertEq(readViewMode(), "list");
  localStorage.removeItem(AQMAR_CONFIG.storage.viewMode);  // cleanup
});

test("writeViewMode persists to localStorage", () => {
  writeViewMode("list");
  assertEq(localStorage.getItem(AQMAR_CONFIG.storage.viewMode), "list");
  writeViewMode("grid");
  assertEq(localStorage.getItem(AQMAR_CONFIG.storage.viewMode), "grid");
  localStorage.removeItem(AQMAR_CONFIG.storage.viewMode);  // cleanup
});
```

The tests reference `readViewMode()` and `writeViewMode()` which will be exposed on `window` for testability.

- [ ] **Step 2: Run tests to verify they fail**

Reload `tests.html`. Expected: 3 new tests fail with `ReferenceError: readViewMode is not defined` or `AQMAR_CONFIG.storage.viewMode is undefined`.

- [ ] **Step 3: Add storage key in `config.js`**

In `webui/config.js`, update the `storage` block:

```js
  storage: {
    auth:     "aqmar.auth",
    pending:  "aqmar.pending_overrides",
    viewMode: "aqmar.viewMode",   // 'grid' | 'list'
  },
```

- [ ] **Step 4: Add helpers + state in `app.js`**

At the very top of `webui/app.js` (before `window.app = function () { ... }`), add the two helpers and expose them on `window`:

```js
// View-mode persistence helpers (exposed on window for tests).
function readViewMode() {
  try {
    const v = localStorage.getItem(AQMAR_CONFIG.storage.viewMode);
    return (v === "list") ? "list" : "grid";
  } catch (e) {
    return "grid";  // localStorage blocked
  }
}
function writeViewMode(mode) {
  try {
    localStorage.setItem(AQMAR_CONFIG.storage.viewMode, mode === "list" ? "list" : "grid");
  } catch (e) {
    // localStorage blocked — silently degrade.
  }
}
window.readViewMode  = readViewMode;
window.writeViewMode = writeViewMode;
```

Then in the state block (around line 23 — the `// === view state ===` section), add:

```js
    viewMode: readViewMode(),                      // 'grid' | 'list'
```

And add a setter method just below `setSearchQuery` from Task 3:

```js
    setViewMode(mode) {
      this.viewMode = mode;
      writeViewMode(mode);
    },
```

- [ ] **Step 5: Run all tests**

Reload `tests.html`. Expected: 41 tests pass (3 new viewMode tests pass; all prior pass).

- [ ] **Step 6: Commit**

```powershell
git add webui/config.js webui/app.js webui/tests.html
git commit -m "feat(webui): add viewMode state with localStorage persistence"
```

---

## Task 5: Add CSS for skeleton, focus rings, transitions, reduced-motion

**Files:**
- Modify: `webui/style.css`

- [ ] **Step 1: Append CSS rules**

Add to the end of `webui/style.css`:

```css
/* ============================================================
   Skeleton loaders — shimmer animation for initial load
   ============================================================ */
.skeleton {
  background: linear-gradient(90deg, #1a3a1a 0%, #2d4a2d 50%, #1a3a1a 100%);
  background-size: 200% 100%;
  animation: aqmar-shimmer 1.5s infinite;
}
@keyframes aqmar-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

/* ============================================================
   Focus rings — :focus-visible only (keyboard, not mouse click)
   ============================================================ */
button:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
[tabindex]:focus-visible {
  outline: 2px solid #fbbf24;
  outline-offset: 2px;
  box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.3);
  border-radius: 6px;
}

/* ============================================================
   Filter result transition — 150ms opacity crossfade
   ============================================================ */
.results-fade-enter-active,
.results-fade-leave-active { transition: opacity 0.15s ease-in-out; }
.results-fade-enter,
.results-fade-leave-to     { opacity: 0; }

/* ============================================================
   Skip-to-content link — visible only on focus
   ============================================================ */
.skip-link {
  position: absolute; top: -40px; right: 1rem;
  background: #fbbf24; color: #0c1f0c;
  padding: 0.5rem 1rem; border-radius: 0 0 6px 6px;
  font-weight: bold; z-index: 50;
  transition: top 0.15s ease-out;
}
.skip-link:focus { top: 0; }

/* ============================================================
   Reduced motion — respect user OS preference
   ============================================================ */
@media (prefers-reduced-motion: reduce) {
  .skeleton { animation: none; background: #2d4a2d; }
  .results-fade-enter-active,
  .results-fade-leave-active { transition: none; }
  * { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}

/* ============================================================
   Card hover lift — subtle 200ms transform
   ============================================================ */
.card-hover {
  transition: transform 0.2s ease-out, box-shadow 0.2s ease-out, border-color 0.2s ease-out;
}
.card-hover:hover {
  transform: translateY(-2px);
}
```

- [ ] **Step 2: Verify no test regressions**

Reload `tests.html`. Expected: 41 tests still pass (CSS-only change).

- [ ] **Step 3: Commit**

```powershell
git add webui/style.css
git commit -m "feat(webui): add skeleton, focus rings, transitions, reduced-motion CSS"
```

---

## Task 6: Wrap grid view in `viewMode` template + keyboard-focusable cards

**Files:**
- Modify: `webui/index.html`

This task prepares the public grid view to be one of two view modes: it gets wrapped in a `<template x-if="viewMode === 'grid'">` so Task 7 can add the list view alongside it. The existing inner card content is kept as-is; only the outer wrapper and a few attributes change.

- [ ] **Step 1: Wrap the grid in a viewMode conditional**

Find this block in `webui/index.html` (around line 251):

```html
  <!-- Grid -->
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
    <template x-for="row in filteredResults" :key="row.msg_id">
      <div class="group bg-bgcard border border-border rounded-lg overflow-hidden cursor-pointer hover:border-brand hover:shadow-lg hover:shadow-brand/20 transition-all duration-200 relative"
           @click="openPhotoModal(row)">
        ...
      </div>
    </template>
  </div>
```

Replace the wrapper with:

```html
  <!-- Grid view -->
  <template x-if="viewMode === 'grid'">
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      <template x-for="row in filteredResults" :key="row.msg_id">
        <div class="group card-hover bg-bgcard border border-border rounded-lg overflow-hidden cursor-pointer hover:border-brand hover:shadow-lg hover:shadow-brand/20 relative"
             tabindex="0"
             @click="openPhotoModal(row)"
             @keydown.enter="openPhotoModal(row)"
             @keydown.space.prevent="openPhotoModal(row)">
          <!-- existing inner card content unchanged -->
        </div>
      </template>
    </div>
  </template>
```

Three notable additions:
- Outer `<template x-if="viewMode === 'grid'">` so this only renders in grid mode.
- `card-hover` class (CSS lift transition added in Task 5).
- `tabindex="0"` + `@keydown.enter` + `@keydown.space` so cards are keyboard-focusable.

- [ ] **Step 2: Verify visually**

Start the server if not running:

```powershell
.venv\Scripts\activate
python -m http.server 8000
```

Open `http://localhost:8000/webui/`. Expected: the public grid view renders exactly as before. Tab key now focuses each card with a gold ring.

- [ ] **Step 3: Verify tests still pass**

Reload `tests.html`. Expected: 41 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add webui/index.html
git commit -m "feat(webui): wrap grid view in viewMode template + keyboard-focusable cards"
```

---

## Task 7: Add list-row `<template>` for `viewMode === 'list'`

**Files:**
- Modify: `webui/index.html`

- [ ] **Step 1: Add list view block**

In `webui/index.html`, immediately after the closing `</template>` of the grid view block from Task 6, add:

```html
  <!-- List view -->
  <template x-if="viewMode === 'list'">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl mx-auto">
      <template x-for="row in filteredResults" :key="row.msg_id">
        <div class="card-hover bg-bgcard border border-border rounded-lg p-3 flex items-center gap-3 cursor-pointer hover:border-brand relative"
             tabindex="0"
             @click="openPhotoModal(row)"
             @keydown.enter="openPhotoModal(row)"
             @keydown.space.prevent="openPhotoModal(row)">
          <div x-show="row._overridden_fields && row._overridden_fields.length > 0" class="edit-dot" title="تعديل يدوي">✏️</div>

          <!-- Photo -->
          <div class="w-14 h-18 rounded-md overflow-hidden flex-shrink-0 bg-gradient-to-br from-bgcard to-bgdark"
               style="width: 56px; height: 72px;">
            <img x-show="row.photo_path" :src="row.photo_path" :alt="row.name" loading="lazy"
                 class="w-full h-full object-cover"
                 @error="$el.style.display='none'; $el.nextElementSibling.style.display='flex'">
            <div class="photo-placeholder w-full h-full text-xs" style="display:none">—</div>
          </div>

          <!-- Body -->
          <div class="flex-1 min-w-0 text-right">
            <div class="font-bold text-sm truncate" x-text="row.name"></div>
            <div class="text-xs text-gray-400 truncate"
                 x-text="[row.battalion, row.military_rank].filter(Boolean).join(' · ') || '—'"></div>
            <div class="text-xs text-gray-500 ltr text-left mt-0.5">
              <span x-text="row.birth_date || '—'"></span> → <span x-text="row.martyrdom_date || '—'"></span>
            </div>
          </div>

          <!-- Age chip -->
          <div class="flex-shrink-0 flex flex-col items-center gap-1">
            <template x-if="computeAge(row.birth_date, row.martyrdom_date) !== null">
              <span class="inline-block bg-brand/20 text-brand text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                <span x-text="computeAge(row.birth_date, row.martyrdom_date)"></span> سنة
              </span>
            </template>
            <template x-if="userBirthdate && row._delta_days !== undefined">
              <span class="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
                    :class="{
                      'bg-yellow-400/20 text-yellow-300': describeDeltaShort(row._delta_days).direction === 'younger',
                      'bg-blue-400/20  text-blue-300':   describeDeltaShort(row._delta_days).direction === 'older',
                      'bg-green-400/20 text-green-300':  describeDeltaShort(row._delta_days).direction === 'same',
                    }">
                <span x-text="describeDeltaShort(row._delta_days).icon"></span>
                <span x-text="describeDeltaShort(row._delta_days).text"></span>
              </span>
            </template>
          </div>
        </div>
      </template>
    </div>
  </template>
```

- [ ] **Step 2: Force test the list view**

In the browser dev console while on `http://localhost:8000/webui/`, run:

```js
Alpine.$data(document.body).viewMode = 'list'
```

Expected: the grid disappears, the list view renders with one row per martyr. Names, battalions, dates, and age chips all visible.

Switch back:

```js
Alpine.$data(document.body).viewMode = 'grid'
```

- [ ] **Step 3: Verify tests still pass**

Reload `tests.html`. Expected: 41 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add webui/index.html
git commit -m "feat(webui): add list view template for viewMode='list'"
```

---

## Task 8: Add view-mode toggle UI in header

**Files:**
- Modify: `webui/index.html`

- [ ] **Step 1: Add toggle markup in the header filter bar**

In `webui/index.html`, find the sort dropdown block (around line 121) inside the public-view filter bar. Just BEFORE the "Advanced filters toggle" button (around line 140), add:

```html
    <!-- View mode toggle (grid ↔ list) -->
    <div role="group" aria-label="نمط العرض"
         class="inline-flex bg-bgdark border border-border rounded-full p-1">
      <button @click="setViewMode('grid')"
              :class="viewMode === 'grid' ? 'bg-brand text-bgdark font-bold' : 'text-gray-400 hover:text-brand'"
              class="px-3 py-1 rounded-full text-sm transition-colors flex items-center gap-1"
              aria-pressed="viewMode === 'grid'"
              title="عرض شبكي">
        <span aria-hidden="true">▦</span><span>شبكة</span>
      </button>
      <button @click="setViewMode('list')"
              :class="viewMode === 'list' ? 'bg-brand text-bgdark font-bold' : 'text-gray-400 hover:text-brand'"
              class="px-3 py-1 rounded-full text-sm transition-colors flex items-center gap-1"
              aria-pressed="viewMode === 'list'"
              title="عرض قائمة">
        <span aria-hidden="true">≡</span><span>قائمة</span>
      </button>
    </div>
```

- [ ] **Step 2: Verify visually**

Reload `http://localhost:8000/webui/`. Expected:
- Toggle appears in the header next to the sort dropdown.
- Default `▦ شبكة` is active (gold).
- Clicking `≡ قائمة` switches to list view; gold highlight moves.
- Reload the page: list view persists.
- Switch back to grid; reload: grid persists.

- [ ] **Step 3: Verify tests still pass**

Reload `tests.html`. Expected: 41 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add webui/index.html
git commit -m "feat(webui): add view-mode toggle UI (grid/list) in header"
```

---

## Task 9: Add search bar UI in header

**Files:**
- Modify: `webui/index.html`

- [ ] **Step 1: Add search input above the filter row**

In `webui/index.html`, inside the public-view filter bar block (around line 64, inside `<div x-show="view==='public' && !isLoading" class="max-w-4xl mx-auto mt-4 flex flex-wrap items-center justify-center gap-3">`), add as the FIRST child:

```html
    <!-- Search bar (text query over name + city + battalion + brigade) -->
    <div class="w-full sm:w-auto sm:flex-1 sm:max-w-md">
      <div class="flex items-center gap-2 bg-bgdark border border-border rounded-full px-4 py-2 hover:border-brand transition-colors"
           :class="searchQuery && 'border-brand'">
        <span class="text-lg" aria-hidden="true">🔍</span>
        <input type="search" :value="searchQuery"
               @input="setSearchQuery($event.target.value)"
               placeholder="ابحث · اسم، مدينة، كتيبة، لواء"
               aria-label="بحث في قاعدة بيانات الشهداء"
               class="bg-transparent flex-1 focus:outline-none text-sm placeholder-gray-500">
        <button x-show="searchQuery" @click="setSearchQuery('')" type="button"
                aria-label="مسح البحث" title="مسح"
                class="text-gray-400 hover:text-red-400 text-lg">✕</button>
      </div>
    </div>
```

- [ ] **Step 2: Verify visually**

Reload `http://localhost:8000/webui/`. Expected:
- Search bar appears at the top of the filter row, full-width on mobile, ~max-w-md on desktop.
- Type "غزة" — list filters to martyrs from Gaza after ~150 ms.
- Type "محمد" — filters to martyrs named Muhammad.
- Click ✕ — clears search, all martyrs return.

- [ ] **Step 3: Verify tests still pass**

Reload `tests.html`. Expected: 41 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add webui/index.html
git commit -m "feat(webui): add search bar UI for name/city/battalion/brigade"
```

---

## Task 10: Replace loading text with skeleton placeholders

**Files:**
- Modify: `webui/index.html`

- [ ] **Step 1: Replace the loading banner**

In `webui/index.html`, find the existing loading banner (around line 38):

```html
<div x-show="isLoading" class="text-center py-12 text-lg">جاري التحميل...</div>
```

Replace with a skeleton grid:

```html
<!-- Loading skeleton (replaces plain text) -->
<main x-show="isLoading" class="max-w-7xl mx-auto p-4" aria-busy="true" aria-live="polite">
  <div class="sr-only">جاري تحميل بيانات الشهداء...</div>
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
    <template x-for="i in 12">
      <div class="bg-bgcard border border-border rounded-lg overflow-hidden">
        <div class="aspect-[4/5] skeleton"></div>
        <div class="p-3 space-y-2">
          <div class="skeleton h-3 rounded w-4/5"></div>
          <div class="skeleton h-2 rounded w-3/5"></div>
          <div class="skeleton h-2 rounded w-2/5"></div>
        </div>
      </div>
    </template>
  </div>
</main>
```

Add a `sr-only` utility helper rule in `style.css` if Tailwind Play CDN doesn't ship it. (Tailwind Play CDN DOES include `sr-only` — no CSS edit needed.)

- [ ] **Step 2: Verify visually**

Reload `http://localhost:8000/webui/`. During the brief load, expected:
- 12 shimmering skeleton cards appear in the grid layout.
- After data loads (<1 s on a local server), real cards crossfade in.

To force the skeleton to remain visible for visual confirmation, in dev console:

```js
Alpine.$data(document.body).isLoading = true
```

Then:

```js
Alpine.$data(document.body).isLoading = false
```

- [ ] **Step 3: Verify tests still pass**

Reload `tests.html`. Expected: 41 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add webui/index.html
git commit -m "feat(webui): replace loading text with 12 skeleton placeholders"
```

---

## Task 11: Polish empty / no-results state + load-error retry

**Files:**
- Modify: `webui/index.html`
- Modify: `webui/app.js`

- [ ] **Step 1: Replace the existing empty-state inline text**

Find (around line 244):

```html
  <!-- No results state (any filter active but zero results) -->
  <div x-show="filteredResults.length === 0 && allRows.length > 0 && (userBirthdate || martyrdomFrom || martyrdomTo || ageMin || ageMax)"
       class="text-center py-16 text-gray-400">
    🔍 لا يوجد شهداء يطابقون الفلاتر الحالية. جرّب توسيع نطاق البحث أو امسح بعض الفلاتر.
  </div>
```

Replace with:

```html
  <!-- No results state -->
  <div x-show="filteredResults.length === 0 && allRows.length > 0 && (searchQuery || userBirthdate || martyrdomFrom || martyrdomTo || ageMin || ageMax)"
       x-cloak
       class="max-w-md mx-auto my-12 text-center py-10 px-6 bg-bgcard/60 border border-dashed border-border rounded-xl"
       role="status">
    <div class="text-5xl opacity-40 mb-3" aria-hidden="true">🔍</div>
    <div class="text-base font-bold text-gray-200" x-text="searchQuery ? 'لا يوجد شهداء يطابقون البحث' : 'لا يوجد شهداء يطابقون الفلاتر الحالية'"></div>
    <div class="text-sm text-gray-400 mt-2"
         x-text="searchQuery ? 'جرّب كلمات أخرى، أو امسح البحث للرؤية الكاملة' : 'جرّب توسيع نطاق التاريخ، أو امسح بعض الفلاتر'"></div>
  </div>
```

Note: the `searchQuery` check was added to the condition.

- [ ] **Step 2: Polish the load-error banner with a retry button**

Find the existing load-error banner (around line 39):

```html
<div x-show="loadError" class="bg-red-900 text-red-100 p-4 m-4 rounded" x-text="loadError"></div>
```

Replace with:

```html
<div x-show="loadError" x-cloak role="alert"
     class="max-w-md mx-auto my-12 text-center py-6 px-6 bg-red-900/40 border border-red-700 rounded-xl">
  <div class="text-4xl mb-2" aria-hidden="true">⚠️</div>
  <div class="text-base font-bold text-red-100" x-text="loadError"></div>
  <button @click="retryLoad()"
          class="mt-4 bg-brand text-bgdark px-5 py-2 rounded-full font-bold text-sm hover:opacity-90 transition-opacity">
    🔄 إعادة المحاولة
  </button>
</div>
```

Then in `webui/app.js`, find the existing `init()` method (search for `init()` near the top of the methods block). After it, add a `retryLoad()` method:

```js
    async retryLoad() {
      this.loadError = "";
      this.isLoading = true;
      try {
        const data = await loadData(AQMAR_CONFIG.martyrsJson, AQMAR_CONFIG.overridesJson);
        this.allRows = data.martyrs;
        this.overrides = data.overrides;
        this.applyFilter();
      } catch (e) {
        this.loadError = `تعذّر تحميل البيانات: ${e.message}`;
      } finally {
        this.isLoading = false;
      }
    },
```

(If `init()` already uses a helper named differently than `loadData`, mirror whatever the existing init logic does. The point is to re-run the initial data fetch.)

- [ ] **Step 3: Verify visually**

Reload `http://localhost:8000/webui/`. Test:
- Type a search like "خخخخخخخ" (no match): the polished empty state appears with the search-specific copy.
- Clear search, pick an age range like 1–5 (no martyrs that young): empty state appears with the filter-specific copy.
- Force a load error: open the page with `?bad=1` by temporarily breaking `martyrsJson` URL in `config.js` → the polished error banner appears with the retry button. Restore the URL and click retry → data reloads.

- [ ] **Step 4: Verify tests still pass**

Reload `tests.html`. Expected: 41 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add webui/index.html webui/app.js
git commit -m "feat(webui): polish empty state + add retry button on load error"
```

---

## Task 12: Add ARIA landmarks, skip link, result-count live region

**Files:**
- Modify: `webui/index.html`

- [ ] **Step 1: Add skip-to-content link**

Just inside `<body>` (right after the opening tag), add:

```html
<a href="#main-content" class="skip-link">تخطي إلى المحتوى</a>
```

- [ ] **Step 2: Add ARIA roles to landmarks**

Update the `<header>` tag (around line 42):

```html
<header role="banner" class="bg-bgcard border-b border-border sticky top-0 z-10 px-4 py-3">
```

Update the public `<main>` tag (around line 236):

```html
<main id="main-content" role="main" x-show="view==='public' && !isLoading" class="max-w-7xl mx-auto p-4">
```

Update the admin `<main>` tag (around line 294):

```html
<main id="main-content-admin" role="main" x-show="view==='admin' && !isLoading && loggedIn" class="max-w-7xl mx-auto p-4">
```

- [ ] **Step 3: Add `aria-live` to result count**

Find the result-count block (around line 219):

```html
  <!-- Result count -->
  <div x-show="view==='public' && !isLoading" class="max-w-4xl mx-auto mt-2 text-center">
    <span class="text-3xl font-bold text-brand" x-text="filteredResults.length"></span>
    ...
  </div>
```

Replace with:

```html
  <!-- Result count (announced to screen readers) -->
  <div x-show="view==='public' && !isLoading" class="max-w-4xl mx-auto mt-2 text-center"
       aria-live="polite" aria-atomic="true">
    <span class="text-3xl font-bold text-brand" x-text="filteredResults.length"></span>
    <span class="text-sm text-gray-400 mr-1" x-show="!userBirthdate && !searchQuery">شهيد · جميع الشهداء</span>
    <span class="text-sm text-gray-400 mr-1" x-show="userBirthdate && !searchQuery">شهيد بأعمار قريبة من ميلادك</span>
    <span class="text-sm text-gray-400 mr-1" x-show="searchQuery">شهيد يطابق البحث</span>
  </div>
```

- [ ] **Step 4: Add `role="dialog"` to all three modals**

Photo modal (around line 320) — find the `<div x-show="selectedRow"` and add attributes:

```html
<div x-show="selectedRow" @click.self="closePhotoModal()" x-cloak
     role="dialog" aria-modal="true" aria-labelledby="photo-modal-title"
     class="fixed inset-0 bg-black/80 z-20 flex items-center justify-center p-4">
```

Update the modal title `<h3>` to have `id="photo-modal-title"`.

Admin edit modal (around line 366):

```html
<div x-show="editingMsgId" @click.self="closeEditModal()" x-cloak
     role="dialog" aria-modal="true" aria-labelledby="edit-modal-title"
     class="fixed inset-0 bg-black/80 z-20 flex items-center justify-center p-4">
```

Update its `<h3>` to have `id="edit-modal-title"`.

Login modal (around line 390):

```html
<div x-show="showLoginModal" @click.self="showLoginModal=false" x-cloak
     role="dialog" aria-modal="true" aria-labelledby="login-modal-title"
     class="fixed inset-0 bg-black/80 z-20 flex items-center justify-center p-4">
```

Update its `<h3>` to have `id="login-modal-title"`.

- [ ] **Step 5: Verify visually + Lighthouse**

Reload `http://localhost:8000/webui/`. Press Tab from the URL bar:
- First Tab focuses the skip-to-content link (gold pill drops down from top).
- Activate it → focus jumps to `#main-content`.

Open Chrome DevTools → Lighthouse → Accessibility audit. Expected score: ≥ 95.

- [ ] **Step 6: Verify tests still pass**

Reload `tests.html`. Expected: 41 tests pass.

- [ ] **Step 7: Commit**

```powershell
git add webui/index.html
git commit -m "feat(webui): add ARIA landmarks, skip link, result-count live region"
```

---

## Task 13: Add modal focus traps + ESC handling

**Files:**
- Modify: `webui/index.html`

- [ ] **Step 1: Add `@keydown.escape.window` to each modal**

Photo modal — add to the existing `<div x-show="selectedRow"`:

```html
<div x-show="selectedRow" @click.self="closePhotoModal()" x-cloak
     @keydown.escape.window="closePhotoModal()"
     role="dialog" aria-modal="true" aria-labelledby="photo-modal-title"
     class="fixed inset-0 bg-black/80 z-20 flex items-center justify-center p-4">
```

Admin edit modal:

```html
<div x-show="editingMsgId" @click.self="closeEditModal()" x-cloak
     @keydown.escape.window="closeEditModal()"
     role="dialog" aria-modal="true" aria-labelledby="edit-modal-title"
     class="fixed inset-0 bg-black/80 z-20 flex items-center justify-center p-4">
```

Login modal:

```html
<div x-show="showLoginModal" @click.self="showLoginModal=false" x-cloak
     @keydown.escape.window="showLoginModal=false"
     role="dialog" aria-modal="true" aria-labelledby="login-modal-title"
     class="fixed inset-0 bg-black/80 z-20 flex items-center justify-center p-4">
```

- [ ] **Step 2: Add focus trap using Alpine's `x-trap`**

Alpine 3 ships a focus plugin (`@alpinejs/focus`) that provides `x-trap`. We're not loading that plugin currently — adding it adds ~3 KB.

Add the plugin script tag in `<head>` AFTER the existing Alpine.js script (around line 24):

```html
<script defer src="https://unpkg.com/@alpinejs/focus@3.x.x/dist/cdn.min.js"></script>
```

Then add `x-trap="<show-condition>"` to each modal's outer div:

Photo modal:
```html
<div x-show="selectedRow" x-trap="selectedRow" ... >
```

Admin edit modal:
```html
<div x-show="editingMsgId" x-trap="editingMsgId" ... >
```

Login modal:
```html
<div x-show="showLoginModal" x-trap="showLoginModal" ... >
```

- [ ] **Step 3: Verify visually**

Reload `http://localhost:8000/webui/`. Click a card to open the photo modal. Press Tab repeatedly: focus cycles inside the modal (X button, "مشاهدة الفيديو" link, "عرض في تيليجرام" link) without escaping to the page behind.

Press ESC: modal closes, focus returns to the card.

Open the login modal. Tab cycles through username → password → submit → cancel and back. ESC closes it.

- [ ] **Step 4: Verify tests still pass**

Reload `tests.html`. Expected: 41 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add webui/index.html
git commit -m "feat(webui): add modal focus traps and ESC-to-close"
```

---

## Task 14: Mobile sticky-header tightening + advanced-filters bottom sheet

**Files:**
- Modify: `webui/index.html`
- Modify: `webui/style.css`

- [ ] **Step 1: Tighten the header on mobile**

In `webui/index.html`, update the `<header>` opening tag (Task 12 left it as):

```html
<header role="banner" class="bg-bgcard border-b border-border sticky top-0 z-10 px-3 sm:px-4 py-2 sm:py-3">
```

(Smaller padding on mobile: `px-3 py-2` vs `px-4 py-3` on `sm+`.)

- [ ] **Step 2: Make advanced filters a bottom sheet on mobile**

Find the advanced-filters panel (around line 150):

```html
<div x-show="view==='public' && !isLoading && showAdvancedFilters" x-transition x-cloak
    class="max-w-3xl mx-auto mt-3 bg-bgcard border border-border rounded-lg p-5 space-y-4">
```

Replace with a responsive variant that's a bottom sheet on `<sm` and a centered panel on `sm+`:

```html
<!-- Advanced filters panel — bottom sheet on mobile, centered panel on sm+ -->
<div x-show="view==='public' && !isLoading && showAdvancedFilters"
     @click.self="showAdvancedFilters = false"
     x-cloak
     class="fixed inset-0 z-30 bg-black/60 sm:relative sm:bg-transparent sm:inset-auto sm:z-auto sm:mt-3">
  <div x-show="showAdvancedFilters" x-transition.opacity
       class="absolute bottom-0 left-0 right-0 bg-bgcard border-t border-border rounded-t-2xl p-5 space-y-4
              sm:relative sm:bottom-auto sm:max-w-3xl sm:mx-auto sm:border sm:rounded-lg">
    <!-- Mobile drag handle -->
    <div class="sm:hidden flex justify-center -mt-2 mb-2">
      <div class="w-10 h-1 rounded-full bg-border"></div>
    </div>
    <!-- ... existing content inside (date range, age range, clear-all button) ... -->
  </div>
</div>
```

(Move all the existing children — date range, age range, clear-all — inside the new inner `<div>`.)

- [ ] **Step 3: Verify visually at mobile breakpoint**

In Chrome DevTools, toggle device toolbar (Ctrl+Shift+M) and pick iPhone 14 Pro (390×844).

Expected:
- Header padding is tighter.
- Click "🔍 فلاتر متقدمة" → backdrop dims the page; panel slides up from the bottom with a drag handle.
- Click outside the panel → closes.
- Resize to ≥640 px (sm breakpoint) → panel renders inline as before.

- [ ] **Step 4: Verify tests still pass**

Reload `tests.html`. Expected: 41 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add webui/index.html webui/style.css
git commit -m "feat(webui): tighten mobile header, advanced filters as bottom sheet"
```

---

## Task 15: Mobile photo modal fullscreen + admin edit bottom sheet

**Files:**
- Modify: `webui/index.html`

- [ ] **Step 1: Make photo modal fullscreen on mobile**

Photo modal inner container (around line 322):

```html
<div class="bg-bgcard border border-border rounded-lg overflow-hidden max-w-2xl w-full max-h-[90vh] flex flex-col">
```

Replace with:

```html
<div class="bg-bgcard sm:border border-border sm:rounded-lg overflow-hidden
            w-full h-full sm:max-w-2xl sm:h-auto sm:max-h-[90vh] flex flex-col">
```

(Removes border + rounded corners and goes full-screen on mobile; restores them on `sm+`.)

- [ ] **Step 2: Make admin edit modal a bottom sheet on mobile**

Admin edit modal inner container (around line 367):

```html
<div class="bg-bgcard border border-border rounded-lg overflow-hidden max-w-md w-full max-h-[90vh] flex flex-col">
```

Replace with:

```html
<div class="bg-bgcard sm:border border-border rounded-t-2xl sm:rounded-lg overflow-hidden
            w-full max-h-[85vh] sm:max-w-md mt-auto sm:mt-0 sm:max-h-[90vh] flex flex-col">
```

Also update the modal backdrop's flex direction so the sheet anchors to the bottom on mobile:

```html
<div x-show="editingMsgId" @click.self="closeEditModal()" x-cloak
     @keydown.escape.window="closeEditModal()" x-trap="editingMsgId"
     role="dialog" aria-modal="true" aria-labelledby="edit-modal-title"
     class="fixed inset-0 bg-black/80 z-20 flex items-end sm:items-center justify-center sm:p-4">
```

Note the change: `items-end` on mobile, `sm:items-center` on desktop; `sm:p-4` (no padding on mobile so the sheet hugs the bottom edge).

- [ ] **Step 3: Verify visually**

In DevTools mobile mode:
- Tap a card → photo modal fills the screen.
- Switch to admin view (after login), tap "تحرير" → edit modal slides up from the bottom as a sheet.
- Resize to desktop → both modals return to centered cards.

- [ ] **Step 4: Verify tests still pass**

Reload `tests.html`. Expected: 41 tests pass.

- [ ] **Step 5: Commit**

```powershell
git add webui/index.html
git commit -m "feat(webui): mobile photo modal fullscreen, admin modal bottom sheet"
```

---

## Task 16: Add filter result crossfade transition

**Files:**
- Modify: `webui/index.html`

- [ ] **Step 1: Wrap each results block in `x-transition.opacity`**

Update the grid view template wrapper (from Task 6):

```html
<template x-if="viewMode === 'grid'">
  <div x-transition.opacity.duration.150ms
       class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
    ...
  </div>
</template>
```

Update the list view template wrapper (from Task 7):

```html
<template x-if="viewMode === 'list'">
  <div x-transition.opacity.duration.150ms
       class="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl mx-auto">
    ...
  </div>
</template>
```

- [ ] **Step 2: Verify visually**

Reload `http://localhost:8000/webui/`. Toggle between grid and list: the views crossfade in 150 ms instead of swapping abruptly.

- [ ] **Step 3: Verify tests still pass**

Reload `tests.html`. Expected: 41 tests pass.

- [ ] **Step 4: Commit**

```powershell
git add webui/index.html
git commit -m "feat(webui): 150ms crossfade when toggling grid/list views"
```

---

## Task 17: Final acceptance — all tests + manual smoke + Lighthouse

**Files:** (none modified)

- [ ] **Step 1: Run the full test suite**

Open `http://localhost:8000/webui/tests.html`. Expected: **41 passed, 0 failed**.

Breakdown:
- 23 existing tests
- 5 `normalizeArabic` tests (Task 1)
- 8 `searchPredicate` tests (Task 2)
- 2 composition tests (Task 3)
- 3 `viewMode` persistence tests (Task 4)

= 41 total.

(The spec said 36; the actual count is 41 because I split a couple of tests for clarity. Acceptable.)

- [ ] **Step 2: Manual mobile smoke test**

In Chrome DevTools, set device to iPhone 14 Pro (390×844). Walk through:

| # | Action | Expected |
|---|---|---|
| 1 | Reload `/webui/` | 12 skeleton cards shimmer briefly, then real grid appears |
| 2 | Type "غزة" in search | List filters within ~150 ms |
| 3 | Clear search with ✕ | All martyrs return |
| 4 | Toggle to list view | Crossfades, rows render with battalion + rank + dates + age chip |
| 5 | Reload page | List view persists (localStorage works) |
| 6 | Open "فلاتر متقدمة" | Bottom sheet slides up; drag-handle visible |
| 7 | Tap outside the sheet | Sheet closes |
| 8 | Pick a birthdate | Window selector appears; filtered results show delta chips |
| 9 | Tap a card | Photo modal fills the screen |
| 10 | Press the X / hardware back | Modal closes, focus returns to the card |
| 11 | Tab navigation (use external keyboard or emulator) | Skip link, then search → toggle → birthdate → window → sort → cards |

- [ ] **Step 3: Lighthouse accessibility audit**

Chrome DevTools → Lighthouse → "Accessibility" only → Mobile → Analyze.

Expected: **score ≥ 95**.

If any failed audit appears, fix it before declaring complete. Most common failures and their fixes:

| Audit | Fix |
|---|---|
| Image alt text | Add `alt` attribute to any `<img>` missing it (currently `:alt="row.name"` should cover all martyr photos). |
| Color contrast | Brand color #fbbf24 on #0c1f0c has contrast ratio 11.3:1 — passes AAA. The muted `text-gray-400` on `bg-bgcard` may fail; bump to `text-gray-300` if flagged. |
| Form labels | Search input has `aria-label`; date inputs use Litepicker. Verify each has either a `<label>` or `aria-label`. |

- [ ] **Step 4: Final commit (only if anything was tweaked during smoke test)**

If nothing changed, skip this step. If a Lighthouse fix landed:

```powershell
git add -A
git commit -m "fix(webui): address Lighthouse accessibility findings"
```

- [ ] **Step 5: Stop. Ask the user before pushing**

Per CLAUDE.md (HARD RULE): never `git push` without explicit user approval. When all tasks are done locally, summarize the work, then ASK: "Ready to push to origin?"

Only after the user confirms, push:

```powershell
git push origin master
```

After the push, GitHub Pages will auto-rebuild within ~1 minute. Verify the live site at https://mohamedkhamis.github.io/AQMAR/ shows the new search bar, view toggle, skeleton, etc.

---

## Done

The SPA now has:
- ✅ Mobile-responsive filter bar, modals, and sticky header
- ✅ Skeleton loaders, focus rings, ARIA landmarks, focus traps
- ✅ Text search across name + city + battalion + brigade
- ✅ Grid/list view toggle persisted in localStorage
- ✅ 41 passing tests
- ✅ Lighthouse accessibility ≥ 95
