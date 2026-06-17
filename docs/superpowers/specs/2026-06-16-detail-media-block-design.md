# Person-detail media block — design

**Date:** 2026-06-16
**Status:** Approved (interactive design + visual preview, Option B)
**Scope:** Public person-detail view only. No backend/data-model changes.

## Goal

On the person detail page, replace the inline Telegram **embed preview** with a
**link** to the Telegram video, and add a media block that shows the **portrait
photo** and the **selected video-card frame** (the `featured_frame_path` image
that displays name + birth/martyrdom dates) together in a polished layout.

## Chosen layout — Option B (from `webui/preview-detail-media.html`)

- **Selected frame** is the larger, lead image (main column).
- **Portrait photo** is smaller, in the side column.
- **"Watch on Telegram" button** sits in the side column under the photo,
  opening `message_link` in a new tab. Styled (forest-gradient card, ▶ icon,
  two-line label, ↗ tail) — not a bare text link.
- Columns stack vertically on mobile.

## Decisions (from brainstorming Q&A)

1. Telegram: **button** ("Watch on Telegram"), embed/preview iframe removed.
2. No picked frame → **photo only** (frame slot omitted; no fallback to first frame).
3. Hero header keeps its small portrait photo (photo may appear twice — accepted).
4. The small "↗ Source on Telegram" text link in the Military info panel is **removed**
   (the new button is the single source link).

## Changes

### `webui/data-loader.js`
- Add a derived field `selectedFrame` for **display**:
  `selectedFrame: row.featured_frame_path ? normalizePhotoPath(row.featured_frame_path) : null`
- **Do NOT change `featuredFrame`** — it is deliberately kept raw (no `../`) for
  `admin-edit.js` buildEditDiff comparison. `selectedFrame` is display-only.
- Leave `tgEmbed` field in place (referenced by `tests.html`); it just stops
  being rendered.

### `webui/index.html`
- Replace the "Source video" `<template>`/section (~lines 745–773) with a new
  **Media & source** section implementing Option B:
  - Optional Archive.org inline player branch kept as-is (dormant; `archiveOrgId`
    is currently always null) — genuine inline video, not a "preview".
  - Media block: `selectedFrame` (large) + `photo` (small) + Telegram button.
  - Section hidden entirely when none of {selectedFrame, photo, source, archiveOrgId}.
- Remove the "↗ Source on Telegram" text link from the Military panel (~796–804).

### `webui/styles.css`
- New classes for the media block + Telegram button, using existing design
  tokens only (no hard-coded colors/fonts/breakpoints). Reuse the 768/640
  responsive convention.

## Edge cases
- Photo only / frame only / neither — block adapts or hides.
- Mobile: single column.
- Missing image file → `onerror` hides the `<img>` (existing pattern).

## Out of scope
- No DB schema, exporter, or admin-edit changes.
- No change to how `featured_frame_path` is chosen (admin still picks it).

## Verification
- Serve locally, open a record with a picked frame: frame large + photo small +
  working Telegram button; no iframe preview.
- Open a record with no picked frame: photo + button only.
- Confirm pytest still green (no Python touched) and `webui/tests.html` passes.
