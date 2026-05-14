# AQMAR SPA — Responsive UI/UX Polish Design

| | |
|---|---|
| **Date** | 2026-05-14 |
| **Author** | Mohamed Khamis (with Claude Code) |
| **Project** | AQMAR — `webui/` SPA polish pass |
| **Status** | Design approved — pending spec review |
| **Predecessor spec** | [2026-05-13-aqmar-spa-design.md](2026-05-13-aqmar-spa-design.md) |

---

## 1. Goal

Take the existing Alpine.js + Tailwind SPA from "works on desktop, cramped on mobile" to a **professional, polished, responsive SPA** without changing scope or tech stack. The data pipeline, admin auth, and hosting setup stay untouched.

## 2. Scope

In scope:
- Mobile-responsive fixes (filter bar, sticky header behavior, modal sizing).
- Loading & transitions (skeleton cards, smooth filter-result swaps, refined hover/tap).
- Search & discoverability (new text search bar, polished empty/error states).
- Polish details (accessibility, Arabic typography, memorial micro-touches, perf at 350+ rows).
- Card layout: **grid + list with user toggle** (persisted in localStorage).
- Tests in `webui/tests.html` extended.

Out of scope:
- New build step or framework migration (stay on Tailwind Play CDN + Alpine.js).
- Backend pipeline changes.
- Admin authentication redesign.
- Map view, virtualized lists, or any v2-grade redesign.

## 3. Constraints

- **No paid services or build tooling** — Tailwind Play CDN, Alpine.js, Litepicker stay via CDN.
- **GitHub Pages** must keep working — no changes to URL structure, no server-side rendering.
- **Single HTML shell** — `webui/index.html` stays the entry point.
- **Device priority: 50/50** mobile vs desktop. Adaptive layout from one component tree.
- **RTL Arabic primary**, no LTR fallback work.
- **No regressions** on existing tests, Litepicker integration, admin flow, or delta-chip behavior.

## 4. Architecture

### File structure

```
webui/
├── index.html              ← + grid-card / list-row inline <template> tags
│                             + view toggle, search bar, skeleton, empty state
├── config.js               (+ aqmar.viewMode storage key)
├── data-loader.js          (unchanged)
├── filter-logic.js         (+ normalizeArabic, + searchPredicate)
├── admin-edit.js           (unchanged)
├── app.js                  (+ viewMode state, + searchQuery state,
│                             + debounce helper, + search wired into applyFilter)
├── style.css               (+ skeleton, transitions, focus rings, reduced-motion)
└── tests.html              (+ 13 new tests; total = 36)
```

### Principles

1. **Stay on the CDN trio** — no build step.
2. **One component tree, two row templates** — `viewMode` toggles which `<template>` renders.
3. **Reactive state in Alpine** — no extra state library.
4. **Tailwind utilities first** — `style.css` only for what Tailwind doesn't cover (shimmer keyframes, focus-ring polish, reduced-motion overrides).
5. **RTL by default** — no LTR fallback work; LTR class stays only for ISO dates.

### What does NOT change

- `martyrs.json` schema.
- Python pipeline (`src/`, `scripts/`).
- Admin auth model and `aqmar.auth` localStorage key.
- Litepicker integration for birthdate and martyrdom-date range.
- `aqmar.pending_overrides` admin edit flow.
- `data/` folder structure or `data-loader.js` merge logic.

## 5. Components

### 5.1 Grid card (refined)

Existing card design with refinements:
- Rounded corners: 8 px → 10 px.
- Hover: lift transform + brand-color ring (200 ms).
- Mobile tap target: full card area, minimum 44×44 px.
- Type scale tightened (name 14 px / meta 11 px / chip 11 px).
- Edit-dot stays at top-left for overridden rows.

### 5.2 List row (new)

Renders when `viewMode === 'list'`:
- Photo thumbnail (56×72) on the right (RTL).
- Name (bold), battalion + rank (muted), birth → martyrdom dates (LTR).
- Age chip on the left edge.
- Delta chip (when birthdate filter active) replaces the age chip styling — same component, different copy.

### 5.3 Skeleton (new)

Replaces the plain "جاري التحميل..." text:
- Shimmer animation (CSS keyframes, 1.5 s loop).
- Renders 12 placeholders (one viewport's worth on a typical phone).
- Same outer dimensions as a grid card or list row, based on `viewMode`.
- Cross-fades into real data (200 ms) when `isLoading` flips to `false`.
- Animation disabled under `prefers-reduced-motion`.

### 5.4 View toggle (new)

Two-button segmented control in the header:
- `▦ شبكة` (grid) / `≡ قائمة` (list).
- Pill background, brand-color fill for active state.
- Click writes `aqmar.viewMode` to localStorage.
- Init reads from localStorage; default `'grid'`.
- Keyboard: Tab into segment, arrow keys switch.

### 5.5 Search bar (new)

Rounded pill input in the header:
- Placeholder: "ابحث · اسم، مدينة، كتيبة، لواء".
- Searches: name, city, battalion, brigade (substring, case-insensitive, Arabic-normalized).
- Adds a new JS helper `normalizeArabic(s)` in `filter-logic.js` mirroring the existing Python `src/name_normalizer.py` (~15 lines: strip diacritics, normalize ا/أ/إ/آ → ا, ة → ه, ى → ي, collapse whitespace).
- Debounce: 150 ms.
- Focus state: brand-color ring (3 px glow).
- Not persisted across reloads.
- Clear-X button appears when `searchQuery.length > 0`.

### 5.6 Empty / no-results state (polished)

Replaces existing inline text:
- Centered, dashed border, icon (🔍), title + hint.
- Triggered whenever any filter is active AND `filteredResults.length === 0`.
- Copy adapts to whether the user has a birthdate filter, advanced filters, or just a search.

### 5.7 Focus rings (polished)

- `:focus-visible` selector — keyboard focus only, not mouse-click focus.
- 2 px solid brand-color (`#fbbf24`), 3 px soft glow.
- Applied to: buttons, inputs, select, anchor links, cards (whole-card focusability for keyboard nav).

## 6. Data flow

### State (added to `app()` in `app.js`)

```js
{
  viewMode:    localStorage.getItem('aqmar.viewMode') || 'grid',
  searchQuery: '',
  _searchDebounceId: null,
}
```

### Filter pipeline (one pass, in order)

```
allRows
  │
  ▼  searchQuery     → match name | city | battalion | brigade
  │                     (substring, case-insensitive, Arabic-normalized)
  ▼  userBirthdate   → window match (existing)
  ▼  windowMode      → ±N days (existing)
  ▼  martyrdomFrom/To → date range (existing)
  ▼  ageMin/ageMax   → age range (existing)
  ▼  sortMode        → existing sorts
  ▼
filteredResults
```

Search runs first as the cheapest discriminator. All existing filter behaviors unchanged.

### Persistence

| Key | When written | When read | Notes |
|---|---|---|---|
| `aqmar.viewMode` | On toggle click | On `init()` | New |
| `aqmar.searchQuery` | Never | Never | Intentionally session-local |
| `aqmar.auth` | Existing | Existing | Unchanged |
| `aqmar.pending_overrides` | Existing | Existing | Unchanged |

### Rendering

```html
<template x-if="viewMode === 'grid'">
  <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
    <template x-for="row in filteredResults" :key="row.msg_id">
      <!-- grid card markup -->
    </template>
  </div>
</template>

<template x-if="viewMode === 'list'">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl mx-auto">
    <template x-for="row in filteredResults" :key="row.msg_id">
      <!-- list row markup -->
    </template>
  </div>
</template>
```

### Mobile-specific behavior

- Header (`<sm`): search bar and view toggle stay always-visible; advanced-filters panel collapses into a bottom-anchored sheet triggered by the existing "فلاتر متقدمة" button.
- Modal sizing (`<sm`): photo modal becomes full-screen; admin edit modal becomes a bottom sheet.

## 7. Error handling

| Scenario | Current behavior | New behavior |
|---|---|---|
| `martyrs.json` fetch fails | Red banner with raw error | Red banner with polished copy + "إعادة المحاولة" button (re-invokes `loadData()`) |
| `overrides.json` missing | Silently treated as `{}` | Unchanged |
| Photo image load fails | Placeholder div appears | Unchanged |
| Filter yields zero results | Inline text | Polished empty state component (5.6) |
| Litepicker date parse fails | Existing handling | Unchanged |
| `localStorage` blocked (private mode) | Existing handling | View toggle silently defaults to `'grid'`; no error shown |

## 8. Accessibility

- ARIA landmarks: `<header role="banner">`, `<main role="main">`, modals `role="dialog" aria-modal="true"` labelled by their header.
- Live region announces result count: `<div aria-live="polite">عدد النتائج: 47</div>`.
- Skip-to-content link at top of `<body>`, visible on focus.
- Tab order: `search → view-toggle → birthdate → window → sort → advanced-filters button → cards (render order)`.
- ESC closes modals; focus traps inside modals; focus returns to opener on close.
- `:focus-visible` rings on every interactive element.
- `prefers-reduced-motion` respected: skeleton shimmer and hover transforms disabled.
- Icon-only buttons get `aria-label` (currently bare emojis).

## 9. Performance

- 352 rows: no virtualization. DOM size is well within budget.
- Image lazy-loading already in place (`loading="lazy"`) — kept.
- Skeleton count: 12 placeholders (~1 mobile viewport).
- Filter result transition: 150 ms opacity crossfade, single repaint.
- Search debounce: 150 ms.
- Tailwind Play CDN payload unchanged.

## 10. Testing

Extends `webui/tests.html` — currently 23 passing tests.

**New tests (13 total → 36 passing):**

| # | Subject | Test |
|---|---|---|
| 1 | `searchPredicate` | exact name match |
| 2 | `searchPredicate` | partial name match |
| 3 | `searchPredicate` | city match |
| 4 | `searchPredicate` | battalion match |
| 5 | `searchPredicate` | brigade match |
| 6 | `searchPredicate` | Arabic normalization (alef variants → ا) |
| 7 | `searchPredicate` | empty query returns all |
| 8 | `searchPredicate` | no match returns empty |
| 9 | `viewMode` | toggle writes localStorage |
| 10 | `viewMode` | init reads from localStorage |
| 11 | Skeleton | renders while `isLoading === true`, gone after |
| 12 | Filter composition | `searchQuery + birthdate window` |
| 13 | Filter composition | `searchQuery + age range` |

**Acceptance criteria:**
- All existing 23 tests pass.
- All new tests pass.
- Manual smoke test on real Chrome + Safari mobile breakpoints.
- Lighthouse accessibility score ≥ 95.

## 11. Open questions

None. All decisions locked during brainstorming:
- Scope: polish in place
- Areas: all four (mobile, loading, search, details)
- Devices: 50/50
- Card layout: grid + list user toggle

## 12. Related documents

- [Original scraper design (2026-05-10)](2026-05-10-aqmar-tofan-scraper-design.md)
- [Original SPA design (2026-05-13)](2026-05-13-aqmar-spa-design.md)

Implementation plan will be written next (`docs/superpowers/plans/2026-05-14-aqmar-spa-ux.md`).
