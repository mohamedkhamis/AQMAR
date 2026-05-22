# AQMAR UI — Typography Refresh + Responsive Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the webui SPA to a new font pairing with a fluid type scale, make every view responsive across phone/tablet/desktop, and restyle the date pickers to match the dark theme.

**Architecture:** Pure presentation-layer change. All work lands in `webui/styles.css` (the existing design-token + component layer) and `webui/index.html` (font link + inline-style cleanup). No backend, no build step, no new runtime dependency. Spec: `docs/superpowers/specs/2026-05-22-aqmar-ui-typography-responsive-design.md`.

**Tech Stack:** Vanilla CSS custom properties, Google Fonts CDN, Litepicker (already loaded), Alpine.js (untouched).

**Verification model:** This is CSS/HTML — there are no unit tests for it. Each task is verified by (a) the 92 `pytest` tests staying green, since no Python changes, and (b) a browser check via the Playwright MCP at the relevant viewport widths. A local server is needed: `python -m http.server 8000` from the repo root, page at `http://127.0.0.1:8000/webui/index.html`.

**Commits:** Per the project git rule, commits require explicit user approval. The executor does the implementation across tasks, then makes **one commit at the end** after the user approves — not per-task.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `webui/index.html` | Markup | Font `<link>`; remove inline grid `style=`; hero/detail heading font class; wrap admin table |
| `webui/styles.css` | Design tokens + components + responsive | Font vars, fluid type scale, breakpoints, extracted grid classes, Litepicker override |
| `webui/preview.html` | Temporary preview | **Deleted** in the final task |

---

## Task 1: New fonts — load + remap variables

**Files:**
- Modify: `webui/index.html` (the `<!-- Fonts -->` `<link>`, ~line 23-26; hero `<h1>` ~line 187; detail name `<h1>` ~line 688)
- Modify: `webui/styles.css` (`:root` font variables, ~lines 20-24)

- [ ] **Step 1: Replace the Google Fonts link in `index.html`**

Replace the existing `<link href="https://fonts.googleapis.com/css2?family=Amiri...">` line with:

```html
<link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=El+Messiri:wght@400;500;600;700&family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Remap the font variables in `styles.css` `:root`**

Replace the five `--font-*` declarations with:

```css
  --font-display: "El Messiri", "Amiri", serif;
  --font-naskh:   "Amiri", serif;
  --font-body:    "IBM Plex Sans Arabic", system-ui, sans-serif;
  --font-latin-sans: "IBM Plex Sans", system-ui, sans-serif;
  --font-latin-serif: "IBM Plex Sans", "Amiri", serif;
```

- [ ] **Step 3: Move the hero + detail-name headings to the display font**

In `index.html`, on the home hero `<h1>` (currently `class="h1-display font-naskh font-bold ..."`) and the detail-page name `<h1>` (currently `class="font-naskh font-bold ..."`), change `font-naskh` → `font-display`. Leave the Qur'an verse and any `font-naskh` on Qur'anic/verse elements unchanged.

- [ ] **Step 4: Verify in the browser**

Start `python -m http.server 8000` (repo root). Open `http://127.0.0.1:8000/webui/index.html`. Expected: hero title "أَقْمَارُ الطّوفان" renders in El Messiri (matches preview Option 1); body text renders in IBM Plex Sans Arabic; the Qur'an verse still renders in Amiri. No missing-glyph boxes. Check the browser console — no font 404s.

---

## Task 2: Fluid type scale

**Files:**
- Modify: `webui/styles.css` (`:root` — add tokens; `.section-title`, `.h1-display`, `.section-sub`, `.section-kicker`, `.field-label`; the `max-width:600px` media query)
- Modify: `webui/index.html` (hero `<h1>` inline `font-size` ~line 187; detail `<h1>` inline `font-size` ~line 688)

- [ ] **Step 1: Add the type-scale tokens to `:root` in `styles.css`**

Add after the font variables:

```css
  /* Fluid type scale — sizes interpolate between a mobile min and a desktop max */
  --text-xs:      clamp(0.72rem, 0.69rem + 0.15vw, 0.80rem);
  --text-sm:      clamp(0.80rem, 0.76rem + 0.20vw, 0.92rem);
  --text-base:    clamp(0.94rem, 0.89rem + 0.25vw, 1.06rem);
  --text-lg:      clamp(1.05rem, 0.97rem + 0.40vw, 1.30rem);
  --text-xl:      clamp(1.25rem, 1.08rem + 0.85vw, 1.75rem);
  --text-2xl:     clamp(1.55rem, 1.20rem + 1.70vw, 2.55rem);
  --text-hero:    clamp(2.60rem, 1.55rem + 5.2vw, 5.25rem);
```

- [ ] **Step 2: Apply tokens to the heading/text component classes**

In `styles.css`: set `.section-title { font-size: var(--text-2xl); }`, `.section-sub { font-size: var(--text-base); }`, `.section-kicker { font-size: var(--text-xs); }`, `.field-label { font-size: var(--text-xs); }`. Set `.h1-display { font-size: var(--text-hero); }`.

- [ ] **Step 3: Replace the inline `font-size` clamps in `index.html`**

On the hero `<h1>`: remove `style="font-size: clamp(48px, 6vw, 84px);"` (the `.h1-display` class now supplies it via `--text-hero`). On the detail-name `<h1>`: replace `font-size: clamp(28px, 5vw, 46px)` with `font-size: var(--text-2xl)` (keep the `overflow-wrap`/`word-break` properties in the inline style).

- [ ] **Step 4: Remove the now-redundant font-size overrides**

In the `styles.css` `@media (max-width: 600px)` block, delete the `.h1-display { font-size: 44px !important; }` and `.section-title { font-size: 28px !important; }` lines — the fluid scale handles them. Keep `.hero-pad` for now (handled in Task 4).

- [ ] **Step 5: Verify in the browser**

Reload the page. Resize the window from ~1280px down to ~360px: the hero and section titles should shrink **smoothly** (no sudden jumps), never overflow, and stay readable at the smallest width. Body text stays comfortably legible on mobile.

---

## Task 3: Date picker — restyle Litepicker to the dark theme

**Files:**
- Modify: `webui/styles.css` (append a new "Date picker" section)

- [ ] **Step 1: Confirm the Litepicker theming variables**

Open `https://cdn.jsdelivr.net/npm/litepicker/dist/css/litepicker.css` (or read it from the browser devtools on the live page) and confirm the `--litepicker-*` custom-property names used below still match the loaded version. Litepicker v2 themes via these CSS variables — adjust any name that differs.

- [ ] **Step 2: Append the Litepicker override block to `styles.css`**

```css
/* ── Date picker — Litepicker restyled to the AQMAR dark theme ───────── */
.litepicker {
  --litepicker-container-months-color-bg: var(--paper);
  --litepicker-container-months-box-shadow-color: rgba(0,0,0,.55);
  --litepicker-month-header-color: var(--ink);
  --litepicker-button-prev-month-color: var(--muted);
  --litepicker-button-next-month-color: var(--muted);
  --litepicker-button-prev-month-color-hover: var(--forest);
  --litepicker-button-next-month-color-hover: var(--forest);
  --litepicker-month-weekday-color: var(--faint);
  --litepicker-month-week-number-color: var(--faint);
  --litepicker-day-color: var(--ink-2);
  --litepicker-day-color-hover: var(--forest);
  --litepicker-is-today-color: var(--olive-2);
  --litepicker-is-in-range-color: rgba(251,191,36,.14);
  --litepicker-is-locked-color: var(--faint);
  --litepicker-is-start-color: #1a1505;
  --litepicker-is-start-color-bg: var(--forest);
  --litepicker-is-end-color: #1a1505;
  --litepicker-is-end-color-bg: var(--forest);
  font-family: var(--font-body);
}
.litepicker .container__months {
  border: 1px solid var(--divider);
  border-radius: 8px;
}
.litepicker .container__days > div,
.litepicker .container__days > a { font-size: var(--text-sm); }
/* month + year <select> dropdowns (the SPA inits Litepicker with dropdowns) */
.litepicker .month-item-header .dropdowns > select {
  background: var(--bg-3);
  color: var(--ink);
  border: 1px solid var(--divider);
  border-radius: 6px;
  padding: 4px 6px;
  font-family: var(--font-body);
}
@media (max-width: 480px) {
  .litepicker { --litepicker-day-width: 40px; }
}
```

- [ ] **Step 3: Verify in the browser**

Open the home page, click the "تاريخ ميلادك" date input → the calendar opens. Confirm: dark `--paper` background, gold (`--forest`) selected day with dark text, styled month/year dropdowns, `--muted` weekday row, readable day numbers. Then open the admin edit form (login required) and confirm the birth-date and martyrdom-date pickers look identical. If any element is still light/unstyled, inspect it in devtools and add a matching rule (the variable name probably differs — fix it).

---

## Task 4: Breakpoints + extract the 8 named grid classes

**Files:**
- Modify: `webui/styles.css` (the `/* Responsive */` block, ~lines 255-281, and `@media` at ~323)
- Modify: `webui/index.html` (8 elements — remove inline `grid-template-columns`)

- [ ] **Step 1: Give the 8 named grid classes their default layout in `styles.css`**

Add these base rules (near the existing component styles, before the `/* Responsive */` block):

```css
/* Grid layouts — defaults live here so media queries override without !important */
.grid-bday      { grid-template-columns: 1.4fr 1.2fr auto; align-items: end; }
.preview-matches{ grid-template-columns: repeat(3, 1fr); }
.stats-strip    { grid-template-columns: repeat(4, 1fr); }
.grid-filters   { grid-template-columns: 1.4fr 1fr 1fr 1fr 1fr auto; align-items: end; }
.grid-detail    { grid-template-columns: 200px 1fr; }
.grid-detail.is-admin { grid-template-columns: 260px 1fr; }
.dates-strip    { grid-template-columns: 1fr 1fr 1fr; }
.grid-2col      { grid-template-columns: 1fr 1fr; }
.footer-grid    { grid-template-columns: 1.5fr 1fr 1fr 1fr; }
```

Note: `.grid-detail` is used twice in `index.html` — the home/detail view (`200px 1fr`) and the admin edit view (`260px 1fr`). In Step 2, add `is-admin` to the admin one's class list so both defaults are class-driven.

- [ ] **Step 2: Remove the inline grid styles in `index.html`**

On each of these elements, delete the `grid-template-columns: …` (and the `align-items: end` where present) from the inline `style="…"`; keep any non-grid properties (borders) — move borders into the class rule from Step 1 if cleaner. Targets:
`.grid-bday` (~line 210), `.preview-matches` (~266), `.stats-strip` (~312, keep its border in the class), `.grid-filters` (~354), `.grid-detail` home (~683), `.dates-strip` (~697, border into class), `.grid-2col` (~737), `.grid-detail` admin (~848 — add `is-admin` to its class), `.footer-grid` (~1304).

- [ ] **Step 3: Rewrite the responsive media queries in `styles.css`**

Replace the existing `@media (max-width: 900px)` and `@media (max-width: 600px)` blocks (the first responsive block, ~lines 256-281) with the 3-tier set — note: **no `!important`**, since defaults are now in classes:

```css
/* Responsive — tablet / large-phone / small-phone */
@media (max-width: 1024px) {
  .nav-links { display: none; }
  .nav-hamburger { display: inline-flex; }
  .mobile-nav { display: block; }
  .grid-filters { grid-template-columns: 1fr 1fr 1fr; }
  .grid-detail, .grid-detail.is-admin { grid-template-columns: 1fr; }
  .grid-detail-portrait { justify-self: center; }
}
@media (max-width: 768px) {
  .grid-bday { grid-template-columns: 1fr; }
  .grid-bday > .grid-bday-window,
  .grid-bday > .grid-bday-submit { grid-column: 1 / -1; }
  .grid-filters { grid-template-columns: 1fr 1fr; }
  .grid-2col { grid-template-columns: 1fr; }
  .stats-strip { grid-template-columns: 1fr 1fr; }
  .footer-grid { grid-template-columns: 1fr 1fr; }
  .footer-grid > *:first-child { grid-column: 1 / -1; }
  .admin-banner { flex-direction: column; align-items: flex-start; gap: 16px; }
  .preview-matches { grid-template-columns: 1fr; }
  .dates-strip { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 480px) {
  .grid-filters { grid-template-columns: 1fr; }
  .stats-strip { grid-template-columns: 1fr 1fr; }
  .hero-pad { padding: clamp(20px, 5vw, 44px); }
}
```

Delete the now-duplicate second `@media (max-width: 900px)` block (the nav-hamburger one ~line 323) — its rules are folded into the 1024px block above. Keep the `.nav-hamburger`/`.mobile-nav` base rules.

- [ ] **Step 4: Verify in the browser**

Reload. At 1280px: all grids look exactly as before this task (regression check). Resize to 1024 / 768 / 480: grids collapse cleanly — filters step 6→3→2→1 columns, stats 4→2, footer 4→2→stack, detail/edit two-column → single column, birthday search stacks. No element overflows the viewport; no horizontal page scrollbar appears. Confirm the browser nav switches to the hamburger ≤1024px.

---

## Task 5: Admin table scroll + remaining mobile grids

**Files:**
- Modify: `webui/index.html` (admin `<table>` ~line 1139; admin edit form grid ~line 974; advanced-filter grids ~lines 419, 457)
- Modify: `webui/styles.css` (add `.table-scroll`; mobile rules for the form grids)

- [ ] **Step 1: Wrap the admin table in a scroll container**

In `index.html`, wrap the admin registry `<table class="w-full ...">` (~line 1139) in:

```html
<div class="table-scroll">
  <table class="w-full bg-paper border border-divider rounded-md overflow-hidden text-[14px]" style="border-collapse: collapse;">
    ...
  </table>
</div>
```

- [ ] **Step 2: Add `.table-scroll` to `styles.css`**

```css
/* Admin registry table — scrolls sideways on screens too narrow for all columns */
.table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.table-scroll > table { min-width: 720px; }
.table-scroll::-webkit-scrollbar { height: 8px; }
.table-scroll::-webkit-scrollbar-thumb { background: var(--faint); border-radius: 999px; }
```

- [ ] **Step 3: Give the two-column form grids a class + mobile collapse**

In `index.html`, the admin edit form grid (~line 974, inline `grid-template-columns: 1fr 1fr`) and the two advanced-filter grids (~lines 419, 457, inline `grid-template-columns: 1fr 1fr`): add the class `grid-pair` to each and remove the inline `grid-template-columns`. In `styles.css`:

```css
.grid-pair { grid-template-columns: 1fr 1fr; }
@media (max-width: 768px) { .grid-pair { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Verify in the browser**

Log into the admin view. At 390px width: the registry table scrolls horizontally inside its container (the page itself does NOT scroll sideways); the edit form fields and advanced filters stack to one column. At desktop width everything is unchanged.

---

## Task 6: Full verification + cleanup

**Files:**
- Delete: `webui/preview.html`

- [ ] **Step 1: Run the Python test suite**

Run: `.venv\Scripts\python.exe -m pytest -q`
Expected: `92 passed` — unchanged (no Python was touched).

- [ ] **Step 2: Cross-device browser pass**

With the local server running, screenshot each of the 5 views at 390px, 768px, and 1280px: home, registry/browse, detail, admin, about. Confirm on every screenshot: no horizontal overflow, no overlapping elements, readable type, correct fonts, themed date picker. Fix any issue found before continuing.

- [ ] **Step 3: Delete the temporary preview page**

Delete `webui/preview.html` (and any leftover `preview-*.png` verification screenshots in the repo root).

- [ ] **Step 4: Commit (requires user approval)**

Summarize the diff for the user and ask "Ready to commit?". On approval:

```bash
git add webui/index.html webui/styles.css
git rm webui/preview.html
git commit -m "feat(webui): typography refresh + responsive overhaul + themed date picker"
```

---

## Self-review

- **Spec coverage:** Fonts (T1) ✓ · fluid type scale (T2) ✓ · Litepicker dark theme + gold day (T3) ✓ · breakpoints + inline-style extraction + no-`!important` (T4) ✓ · admin table horizontal scroll + mobile grids (T5) ✓ · 44px touch / day-cell size (T3 step 2, T4) ✓ · 5-view verification + preview.html deletion (T6) ✓.
- **Placeholders:** none — every CSS block is complete; the one "confirm variable names" step (T3.1) is a real verification action against the loaded library, not a deferred decision.
- **Type/name consistency:** class names used consistently — `.grid-pair`, `.table-scroll`, `.grid-detail.is-admin`, `--text-*` tokens defined in T2 and used in T2/T3. The `.grid-detail` admin variant gets `is-admin` added in T4.S2 and styled in T4.S1.
