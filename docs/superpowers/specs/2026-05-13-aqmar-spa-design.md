# AqmarTofan SPA — Design Document

| | |
|---|---|
| **Date** | 2026-05-13 |
| **Author** | Mohamed Khamis (with Claude Code) |
| **Project** | AQMAR — Single Page Application for browsing and editing martyr data |
| **Status** | Draft awaiting user approval |
| **Data source** | `data/martyrs.xlsx` (~388 rows) produced by the existing scraper |
| **Companion spec** | [Scraper design](2026-05-10-aqmar-tofan-scraper-design.md) |

---

## 1. Goal

A single-page web application built on top of the Excel data the scraper produces, with two purposes:

1. **Admin workflow** — let an authenticated user (one static account) view each martyr's photo and video link, manually fix incorrect or missing fields (most importantly birth dates), and have those manual edits persist across pipeline re-runs.
2. **Public memorial browsing** — show the photos in a polished, info-dense grid; let any visitor enter their own birthdate and a window (1 week / 1 month / 2 months / custom days) to find martyrs whose birthdate is closest to theirs, sorted by proximity in days.

All processing happens in the user's browser. No backend, no database — only browser-side storage and two static JSON files.

## 2. Constraints

- **No backend, no database.** Only static files (`.html`, `.js`, `.css`, `.json`, photos) served either from disk (`file://`) or any static host (GitHub Pages, Netlify, Cloudflare Pages).
- **Local now, host later.** Design must work without modification when moved to a static host.
- **Browser-side processing only.** Filter math, sorting, data merging all run in JS.
- **No build step.** Alpine.js and Tailwind CSS loaded via CDN.
- **Login is theater, not security.** A static username / SHA-256-hashed password gate. Anyone with dev tools can bypass — acceptable because the data is meant to be public eventually.
- **Manual admin edits survive pipeline re-runs.** Edits stored in a separate `overrides.json` file so a fresh `martyrs.json` (regenerated from Excel) doesn't wipe them.
- **Arabic-first UI.** RTL layout, Arabic-aware date formatting and sorting where applicable.

## 3. Architecture

### High-level

```
data/martyrs.xlsx  →  scripts/excel_to_json.py  →  data/martyrs.json
                                                       │
                                                       ▼
                                              webui/index.html
                                              (Alpine.js root component)
                                                       │
                                       ┌───────────────┼───────────────┐
                                       ▼               ▼               ▼
                                  Public View      Login Modal    Admin View
                                  (filter +        (gates the     (edit form +
                                   grid)            admin view)    export overrides)
                                       │                               │
                                       ▼                               ▼
                                  reads + merges:                 writes deltas to:
                                  martyrs.json                    localStorage
                                  overrides.json                  → exports overrides.json
```

### Principles

1. **One root Alpine component.** Two views (`public` / `admin`) toggled by state. No SPA router needed for v1.
2. **Data is read-only at runtime.** Files load once on init. Manual edits accumulate in `localStorage`; admin clicks "Export" to download a new `overrides.json`.
3. **Pipeline owns the canonical data.** Admin overrides are an additive layer on top — never written to `martyrs.json` directly.
4. **Photos load relatively.** `<img src="../data/photos/<msg_id>.jpg">` works for `file://`, `localhost`, or any host.
5. **All UI lives in one HTML file.** Modules are small (≤80 lines), focused, and re-usable.

## 4. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Markup / structure | HTML 5 | — |
| Reactivity | [Alpine.js 3](https://alpinejs.dev/) via CDN (~14 KB) | x-data, x-model, x-show — React-like state without a build |
| Styling | [Tailwind CSS](https://tailwindcss.com/) via Play CDN | Utility-first, professional UI in minutes, no build |
| Hashing | `crypto.subtle.digest('SHA-256', ...)` (browser-native) | Password hash check, zero deps |
| Data files | Plain JSON | Trivially loadable via `fetch()` |
| Local dev server | `python -m http.server 8000` (already installed) | Stable for `fetch()` calls |

### What we explicitly DON'T use

- ❌ No npm, no build, no `node_modules`, no bundler
- ❌ No React/Vue/Svelte (overkill for ~400 rows + filter + form)
- ❌ No SPA router (one HTML file, two views via Alpine state)
- ❌ No backend (everything in-browser; admin exports edits as a file)
- ❌ No SheetJS or in-browser Excel parsing (Python helper does the conversion)

## 5. File & Folder Layout

```
D:\Repo\01-Khamis-Projects\AQMAR\
├── webui/                          # ← NEW (the SPA, ~7 small files)
│   ├── index.html                  # Entry — Alpine.js root, Tailwind CDN
│   ├── config.js                   # Username, password hash, paths
│   ├── app.js                      # Alpine `app()` factory: state + methods
│   ├── data-loader.js              # fetch + merge martyrs.json + overrides.json
│   ├── filter-logic.js             # birthdate proximity math + sort
│   ├── admin-edit.js               # form save → overrides → localStorage → export
│   └── style.css                   # ~30 lines custom on top of Tailwind
│
├── scripts/
│   └── excel_to_json.py            # NEW — runs once after each pipeline run
│
├── data/
│   ├── martyrs.xlsx                # existing
│   ├── martyrs.json                # NEW — generated, gitignored (regenerable)
│   ├── overrides.json              # NEW — admin manual edits (committed)
│   └── photos/                     # existing
│
└── docs/superpowers/
    ├── specs/2026-05-13-aqmar-spa-design.md           # this file
    └── plans/2026-05-13-aqmar-spa.md                  # next step
```

## 6. Data Shapes

### 6.1 `data/martyrs.json` (pipeline-generated, ~150 KB)

```json
{
  "generated_at": "2026-05-13T08:00:00",
  "channel": "AqmarTofan",
  "martyrs": [
    {
      "msg_id": 20,
      "name": "مهدي جبر كوارع \"أبو أحمد\"",
      "name_normalized": "مهدي جبر كوارع \"ابو احمد\"",
      "birth_date": "1977-12-24",
      "martyrdom_date": "2025-05-15",
      "city": "",
      "military_rank": "قائد كتيبة",
      "weapon": "",
      "battalion": "كتيبة الشهيد رائد العطار",
      "brigade": "لواء رفح",
      "photo_path": "../data/photos/20.jpg",
      "posted_date": "2024-05-08 14:32",
      "message_link": "https://t.me/AqmarTofan/20",
      "extraction_status": "complete"
    }
  ]
}
```

- `photo_path` is **relative to `webui/index.html`** — works on disk and on any host.
- Empty fields are `""` (not `null`) for cleaner Alpine bindings.
- `martyrdom_date` is `YYYY-MM-DD` or `YYYY-MM-15` (mid-month for partials).

### 6.2 `data/overrides.json` (admin-managed, kilobytes)

```json
{
  "version": 1,
  "edits": {
    "830": {
      "birth_date": "1991-02-26",
      "city": "غزة",
      "_manual_edit_at": "2026-05-13T10:00:00",
      "_editor": "admin"
    }
  }
}
```

- Keyed by stringified `msg_id`.
- Only the **fields the admin changed** are stored (partial diffs).
- Underscore-prefixed metadata: edit timestamp + editor identity (always `admin` in v1).
- File is **committed to git** (it's manual work that's valuable to back up).

### 6.3 Merge rule (executed in `data-loader.js`)

```
for each msg_id:
    effective_row[msg_id] = martyrs_row[msg_id] (base)
                          updated with overrides[msg_id] (admin wins)
                          + "_overridden_fields" = list of field names that were overridden
```

Rows with any override get a small ✏️ icon in the UI so admins can see the manual layer at a glance.

## 7. Alpine Component Shape

One root component on `<body x-data="app()">`:

```js
function app() {
  return {
    // === auth ===
    loggedIn: localStorage.getItem('aqmar.auth') === 'yes',
    loginUser: '', loginPass: '', loginError: '',
    showLoginModal: false,

    // === data ===
    martyrs: [],
    overrides: {},
    allRows: [],
    isLoading: true,
    loadError: '',

    // === view state ===
    view: 'public',       // 'public' | 'admin'
    selectedRow: null,    // for photo zoom modal

    // === public filter state ===
    userBirthdate: '',
    windowMode: '1month',                   // '1week' | '1month' | '2months' | 'custom'
    customDays: 30,
    filteredResults: [],

    // === admin form state ===
    editingMsgId: null,
    editForm: { /* all editable fields */ },
    pendingEditCount: 0,                    // unexported localStorage edits

    // === methods (implementations in app.js / data-loader.js / etc.) ===
    async init() { /* fetch + merge data, parse hash route */ },
    async login() { /* sha256 check */ },
    logout() { /* clear auth flag */ },
    applyFilter() { /* see Section 8 */ },
    openEditModal(msgId) { /* load form from effective row */ },
    saveEdit() { /* form → overrides → localStorage */ },
    exportOverrides() { /* merge + download overrides.json */ },
  }
}
```

## 8. Filter Math

User enters their birthdate as `YYYY-MM-DD`, picks a window. Show martyrs whose birthdate falls within ±N days of the user's input, sorted by absolute difference.

```js
function applyFilter() {
  if (!this.userBirthdate) {
    this.filteredResults = [];
    return;
  }
  const userTime = new Date(this.userBirthdate).getTime();
  const windowDays = {
    '1week':   7,
    '1month':  30,
    '2months': 60,
    'custom':  Math.max(1, Math.min(365, parseInt(this.customDays) || 30)),
  }[this.windowMode];

  this.filteredResults = this.allRows
    .filter(r => r.birth_date)                                       // must have birth date
    .map(r => ({
      ...r,
      _delta_days: Math.round(
        (new Date(r.birth_date).getTime() - userTime) / 86400000
      ),
    }))
    .filter(r => Math.abs(r._delta_days) <= windowDays)
    .sort((a, b) => Math.abs(a._delta_days) - Math.abs(b._delta_days));
}
```

- `_delta_days` is signed: negative = born before you, positive = born after.
- The card shows `±N يوم` badge using `Math.abs(_delta_days)`.
- Custom days clamped to `[1, 365]` to keep UI sensible.

## 9. Admin Edit Flow

1. Admin clicks "✏️ Edit" on a row card → modal opens with form pre-filled from the **effective row** (base + any existing overrides).
2. Admin changes a field → `saveEdit()`:
   - Writes the diff (only changed fields) to `this.overrides[msg_id]`
   - Mirrors that diff to `localStorage.aqmar.pending_overrides`
   - Re-runs `applyFilter()` so the public view updates if currently active
   - Increments `pendingEditCount` badge
3. A floating "💾 Export N unsaved edits" button appears in admin view.
4. Admin clicks Export → browser downloads `overrides.json` (existing edits + new pending edits, merged).
5. Admin saves the downloaded file into `data/overrides.json` (overwrites the previous file).
6. On next page reload, `pendingEditCount` resets to 0 — the file is now the source of truth.

### Conflict handling

If two admins were ever editing simultaneously (rare given one account, but theoretically possible across browsers), the second one to export "wins". v1 doesn't try to merge concurrent edits — the simple model is "one admin at a time".

## 10. Login Flow

```js
// config.js
export const ADMIN_USERNAME = "admin";
export const ADMIN_PASSWORD_HASH = "<sha256-hex-of 'aqmar2026'>";

// app.js → login()
async login() {
  if (this.loginUser !== config.ADMIN_USERNAME) {
    this.loginError = 'خطأ في اسم المستخدم أو كلمة المرور';
    return;
  }
  const hash = await sha256Hex(this.loginPass);
  if (hash !== config.ADMIN_PASSWORD_HASH) {
    this.loginError = 'خطأ في اسم المستخدم أو كلمة المرور';
    return;
  }
  localStorage.setItem('aqmar.auth', 'yes');
  this.loggedIn = true;
  this.view = 'admin';
  this.showLoginModal = false;
}

function logout() {
  localStorage.removeItem('aqmar.auth');
  this.loggedIn = false;
  this.view = 'public';
}
```

- Password is checked against SHA-256 hash, not plaintext (still bypassable via dev tools, but raises the bar).
- Persistence: `localStorage` flag survives reload until logout or manual clear.
- Public view always accessible without login. Login only required to **switch to admin view**.
- Anti-bruteforce: 3 wrong attempts → 30-second lock (UI feedback only, not enforced server-side).

## 11. UI Layout (Memorial Cards style — approved)

Top filter bar fixed at top:
- Date input (user's birthdate)
- Window dropdown: 1 week / 1 month / 2 months / custom (with input)
- "Apply filter" button (or live update on change)
- Result count: "12 martyrs found"
- "Admin" button (right side) → opens login modal

Below: a responsive grid of portrait cards (`grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4`):

Each card:
- Photo (top, aspect-ratio 4:5)
- Name (bold, RTL)
- Birth → Martyrdom dates (small, gold accent)
- ±N day badge (gold pill)
- Optional ✏️ icon if there's an override on this row
- Click → photo zoom modal
- (Admin only) "✏️ Edit" button → edit modal

Theme: dark green background (matching the channel's palette), yellow/gold accents for important info, Arabic-aware font stack.

## 12. Error Handling

| Failure | Behavior |
|---|---|
| `martyrs.json` 404 | Top banner: "Run `python scripts/excel_to_json.py` first." Empty grid. |
| `overrides.json` 404 | Silent — treated as `{ "edits": {} }` |
| Invalid JSON in either file | Banner with file name + line number. App still loads base data if possible. |
| Photo file 404 | `<img onerror>` swaps to placeholder div with "صورة غير متوفرة" |
| Login: 3 wrong attempts | 30-second lock with countdown |
| User enters invalid birthdate | Empty results + hint "أدخل تاريخ ميلاد صالح" |
| Custom days non-numeric or out of range | Clamped to [1, 365], hint shown |
| `localStorage` quota exceeded (rare) | Toast: "تم الوصول للحد الأقصى — صدّر التعديلات الآن" |

## 13. Operations

### Running locally (development)

```powershell
cd D:\Repo\01-Khamis-Projects\AQMAR

# 1) Generate JSON from current Excel (run once, or after each pipeline run)
python scripts\excel_to_json.py

# 2) Start a tiny local web server
cd webui
python -m http.server 8000

# 3) Open in browser
start http://localhost:8000
```

### Daily workflow (after pipeline runs or after manual Excel edits)

```powershell
python scripts\excel_to_json.py    # regenerate martyrs.json
# Refresh browser tab — SPA picks up new rows
```

### Future hosting (any static host)

1. `rsync` or `git push` the `webui/` directory + `data/martyrs.json` + `data/overrides.json` + `data/photos/` to the host.
2. The same `../data/photos/N.jpg` relative paths work as long as the host preserves the `webui/` ↔ `data/` directory relationship.
3. Zero code changes.

## 14. Acceptance Criteria

The SPA is considered complete (v1) when:

1. ✅ Opening `webui/index.html` from a local `python -m http.server` shows the public view with all photos in the grid layout.
2. ✅ Entering a birthdate + selecting "1 month" shows only martyrs within ±30 days, sorted by closest first.
3. ✅ Login with correct credentials reveals admin view. Login with wrong credentials shows error and locks after 3 attempts.
4. ✅ Clicking "✏️ Edit" on a row opens a form pre-filled with that row's data; saving stores the diff to localStorage and updates the displayed row.
5. ✅ Clicking "💾 Export overrides" triggers a browser download of `overrides.json` containing all edits.
6. ✅ Replacing `data/overrides.json` with the downloaded file and reloading the page preserves all edits and shows ✏️ icons on the edited rows.
7. ✅ Re-running `python scripts\excel_to_json.py` regenerates `data/martyrs.json` but does not affect `data/overrides.json` — admin edits are preserved.
8. ✅ Photos load without errors. Missing photo files fall back to a placeholder div.

## 15. Out of Scope (v1)

- Hijri calendar support
- Search by name (different filter than birthdate proximity)
- Bulk admin edits (CSV import of corrections)
- Multi-admin support / concurrent edit merging
- Photo upload / re-crop
- Public sharing of filter results (URL parameters)
- Mobile-app-style PWA installation
- Analytics or visitor tracking

If any of these are wanted later, they're additive — the architecture supports them.
