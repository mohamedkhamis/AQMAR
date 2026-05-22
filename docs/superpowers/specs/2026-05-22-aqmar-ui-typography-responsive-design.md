# AQMAR UI — Typography Refresh + Responsive Overhaul

**Date:** 2026-05-22
**Status:** Design approved (visually, via `webui/preview.html`)
**Area:** `webui/` SPA — presentation layer only

## Goal

Three things the user asked for:

1. **Fonts** — replace the current typefaces with a more refined pairing.
2. **Responsive** — every view works cleanly on phones, tablets, and desktops.
3. **Date pickers** — the Litepicker calendars match the site's dark theme, font, and size.

The user picked each option from a visual preview page (`webui/preview.html`). This
spec records those decisions and how they get applied to the real site.

## Decisions (locked from the preview)

| Choice | Selected |
|---|---|
| Font pairing | **Option 1** — El Messiri (headings) + IBM Plex Sans Arabic (body/UI) |
| Qur'an verse font | **Amiri** — kept (purpose-built classical Naskh) |
| Latin text font | **IBM Plex Sans** (pairs with the Arabic body) |
| Date-picker selected day | **Gold** (`--forest` brand color) |
| Admin table on mobile | **Horizontal scroll** |
| Effort level | **Polish + tidy structure** — also extract inline grid styles into CSS classes |

## Non-goals

- No layout or visual redesign — same page structure, same components.
- No HTML restructuring beyond moving inline `style="..."` rules into CSS classes.
- No backend, no new build step, no new runtime dependencies.

---

## 1. Typography

### 1.1 Font loading
- Update the Google Fonts `<link>` in `webui/index.html`:
  - **Add:** El Messiri (400–700), IBM Plex Sans Arabic (300–700), IBM Plex Sans (400–600).
  - **Keep:** Amiri (400, 700).
  - **Remove:** Reem Kufi, Tajawal, Crimson Pro, Inter Tight.

### 1.2 Font variable remap (`styles.css :root`)
| Variable | New value |
|---|---|
| `--font-display` | `"El Messiri", "Amiri", serif` |
| `--font-naskh` | `"Amiri", serif` |
| `--font-body` | `"IBM Plex Sans Arabic", system-ui, sans-serif` |
| `--font-latin-sans` | `"IBM Plex Sans", system-ui, sans-serif` |
| `--font-latin-serif` | `"IBM Plex Sans", "Amiri", serif` (Crimson Pro removed) |

- The hero title (`index.html` — currently `font-naskh`/Amiri) moves to `--font-display`
  (El Messiri), matching the approved preview. The Qur'anic verse stays `--font-naskh`.

### 1.3 Fluid type scale
- Add a `clamp()`-based scale to `:root` (~8 steps, e.g. `--text-sm` … `--text-display`).
  Each step scales smoothly between a mobile minimum and a desktop maximum.
- Replace hardcoded `font-size` values (`.section-title` 38px, `.h1-display`,
  `.section-sub`, `.section-kicker`, etc.) and the per-element inline `clamp()` calls
  with these tokens.
- **Remove** the `font-size: …!important` overrides in the `max-width: 600px` media
  query — the fluid scale makes them unnecessary.

### 1.4 Spacing
- Line-height: ~1.8 for body text, ~1.2–1.3 for display headings.
- Zero letter-spacing on Arabic text; keep tracking only on the uppercase Latin kickers.

---

## 2. Responsive

### 2.1 Breakpoints
- Replace the current `900px` / `600px` pair with a clean 3-tier set:
  - `1024px` — tablet
  - `768px` — large phone / small tablet
  - `480px` — small phone

### 2.2 Tidy structure (extract inline styles)
- Move inline `style="grid-template-columns: …"` (and similar layout rules) out of
  `index.html` into named CSS classes in `styles.css`. The relevant classes already
  exist (`.grid-detail`, `.grid-2col`, `.grid-bday`, `.grid-filters`, `.stats-strip`,
  `.footer-grid`, `.preview-matches`, `.dates-strip`) — give them their default
  `grid-template-columns` so the inline rule is no longer needed.
- Once defaults live in classes, the media queries override them **without
  `!important`**. Remove the `!important` flags that the inline styles forced.

### 2.3 Admin table on mobile
- Wrap the admin registry `<table>` in a `.table-scroll` container: `overflow-x: auto`
  on small screens so the table scrolls sideways instead of breaking the layout.
- A styled thin scrollbar + a subtle "swipe" affordance.

### 2.4 Touch & coverage
- Minimum 44px touch target for buttons, inputs, and date-picker day cells on mobile.
- All five views verified at the three widths: home, registry, detail, admin, about.

---

## 3. Date picker (Litepicker)

- Add one scoped CSS override block to `styles.css` targeting `.litepicker` and its
  internal parts. It recolors the calendar to the dark forest theme:
  - Container: `--paper` background, `--divider` border, rounded corners, soft shadow.
  - Month / year dropdowns: `--bg-3` background, `--ink` text, `--divider` border.
  - Weekday header row: `--muted` / `--faint`.
  - Day cells: `--ink-2` text; comfortable size (≥36px desktop, ≥44px tap target on
    mobile); rounded hover using `--bg-3`.
  - **Selected day: `--forest` (gold) background, dark text.**
  - Today: a subtle `--olive-2` ring.
  - Font: `--font-body` (IBM Plex Sans Arabic).
- All three pickers (home birthday search + admin birth/martyrdom fields) share the
  `.litepicker` class, so one block restyles them all.

---

## Files touched

| File | Change |
|---|---|
| `webui/index.html` | Font `<link>`; remove inline grid `style="…"` (swap to classes); hero font |
| `webui/styles.css` | Font vars, fluid type scale, breakpoints, extracted grid classes, Litepicker override block |
| `webui/app.js` | Only if a Litepicker init option needs adjusting (expected: none) |
| `webui/preview.html` | **Deleted** — temporary preview, no longer needed |

## Verification

- The 92 `pytest` tests stay green (this is presentation-only — no Python touched).
- Browser check: screenshot all five views at phone (~390px), tablet (~768/1024px),
  and desktop (~1280px) widths; confirm no overflow, no broken grids, readable type,
  and a correctly themed date picker.

## Risks

- **Three new web fonts.** Low risk — the site already loads fonts from Google Fonts
  CDN; this swaps the families, not the mechanism.
- **Extracting inline styles** must reproduce the exact current default layout for
  each grid before the media queries take over — verify each class visually.
