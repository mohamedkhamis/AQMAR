# AQMAR — UX & UI Code Review (2026-05-29)

Read-only UX-focused review of the `webui/` SPA (the public memorial site **and** the
admin verification tool). Scope was the live front-end: `webui/index.html` (~1425 lines),
`webui/app.js` (~1225), `webui/styles.css` (~552), and the helper modules
(`filter-logic.js`, `data-loader.js`, `admin-edit.js`, `api-client.js`, `config.js`).

This **complements** the prior structural audit ([`code-review-2026-05-20.md`](code-review-2026-05-20.md)),
which covered dead code, duplication, and refactoring. Those topics were deliberately out of scope here;
this pass is purely about what *users* experience: accessibility, RTL/Arabic correctness, responsive
behaviour, interaction design, the admin workflow, visual tone, and UI bugs.

## How this was produced

Seven parallel reviewers (one per UX dimension) read the front-end independently; every finding was
then **adversarially verified** by a separate agent that re-opened the cited code to confirm the issue
is real and to rank its **user impact** (not a generic bug-confidence gate — that would have discarded
legitimate UX/a11y issues). A strategy agent produced the higher-level directions in Part C. A handful
of the highest-impact findings were additionally hand-verified by the author of this doc; corrections
are noted inline.

**Result:** 62 findings raised, 60 verified, 2 dropped as false positives. After merging one duplicate and downgrading one on hand-review, **59 distinct issues** remain: **10 high · 22 medium · 27 low**.

Impact legend: **High** = excludes users, breaks a task, or hits everyone on a common device. **Medium** = noticeable friction or broken for a subset. **Low** = polish / edge case.

> Note: `webui/_preview_edit_layout.html` is an uncommitted scratch artifact and was excluded from review — it should be deleted or git-ignored.

---

# Part A — Concrete issues

## High impact (10)

### 1. No URL/deep-linking or browser-history state — detail pages are not shareable and Back button leaves the site

`webui/app.js:234-246` · _Public flow_ · confidence 98

**Problem.** All navigation (home/browse/detail/about and which martyr is open) lives only in Alpine state via goto()/openMartyr(); there is no location.hash, history.pushState, or popstate handling anywhere in the SPA (grep confirms none exist outside the scratch/test files). Consequences for real visitors of a memorial site: (1) you cannot share or bookmark a link to a specific martyr — the URL is always the bare page; (2) the browser Back button does not return from a detail view to the registry — it navigates away from the site entirely, and Forward cannot bring you back to the same martyr; (3) refreshing always dumps the visitor back to the home view, losing their place. For a memorial whose entire purpose is letting people find and share an individual's name, non-shareable detail pages are a significant loss.

**Fix.** Add minimal hash-based routing: write location.hash on goto()/openMartyr() (e.g. #/m/<id>, #/browse) and add a hashchange/popstate listener in init() that restores view + selectedId. This is a no-build-friendly change (pure JS, no router lib) and makes detail links shareable and the Back button intuitive.

```
openMartyr(id) {
      this.selectedId = id;
      this.view = 'detail';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
```

### 2. View changes never move keyboard focus, stranding SR/keyboard users on the now-hidden trigger

`webui/app.js:234-246, 610-616` · _Accessibility_ · confidence 95

**Problem.** goto(), openMartyr(), and editMartyr() swap the Alpine `view` (which display:none-hides the old <section> and reveals a new one) and smooth-scroll to top, but never move DOM focus. After a keyboard or screen-reader user activates a martyr card button in the browse grid and lands on the detail view, focus stays on the button that is now inside a display:none section — so the next Tab jumps to an unpredictable place (often back to the header or nowhere), and a screen reader announces nothing about the new page. This is a single-page app where every navigation is a focus dead-end; it affects every keyboard and AT user on every view transition (home->detail, detail->browse, table row Edit->edit form, Save & Next between records).

**Fix.** After setting `this.view`, in `$nextTick` move focus to the new view's container (e.g. give each <section> tabindex="-1" and call the matching element's `.focus({preventScroll:true})`), or focus the new view's <h1>/<h2>. For editMartyr/saveAndNext, focus the edit form's name input or its heading so the admin's keyboard position follows the record.

**Verifier note.** The cited code and behavior are accurate. Two refinements: (1) editMartyr already runs a $nextTick block (for Litepicker sync, lines 632-635) but does NOT focus anything — so the fix's natural hook point already exists there. (2) The SR impact is slightly worse than stated: each section also carries :aria-hidden="view !== '<id>'" (index.html 178, 324), so the stranded focus lands inside an aria-hidden="true" subtree, which is an explicit WCAG 4.1.2 conflict (focusable element within an aria-hidden region), not merely "announces nothing."

```
goto(v) { this.view = v; ... window.scrollTo({ top: 0, behavior: 'smooth' }); }
```

### 3. Admin verification table forces heavy horizontal scroll and cramped per-column filters on phones

`webui/styles.css:413-419` · _Responsive_ · confidence 95

**Problem.** The admin registry table caps min-width at 720px, but adminCols defines fixed column widths totaling far more: 80+160(Added)+130(Born)+130(Martyrdom)+120(City)+160(Battalion)+150(Brigade)+140(Status)+90(Edit) = ~1160px of FIXED widths alone, plus the auto-width Name column. So the actual table is ~1200px+ wide and the 720px min-width is moot. On a 360-414px phone the admin (who uses this daily) must scroll a 1200px grid sideways, and the per-column filter <input>s (index.html ~1188) sit inside ~120-160px columns at font-size:12px, so typing a filter shows only 2-3 characters. The headline workflow tool is the hardest screen to use on mobile.

**Fix.** On <=768px collapse the table to a stacked card layout (one card per row, label:value pairs) instead of a wide grid, OR drop the lower-priority columns (Added/City/Battalion/Brigade) into the detail edit view and show only Name/Born/Martyrdom/Status/Edit on narrow screens. At minimum, move the per-column filter row into a single collapsible filter panel on mobile so the 12px inputs aren't squeezed into 120px columns.

**Verifier note.** The fixed-width sum is exactly 1160px (the reviewer's component list is correct); including the auto-width Name column the rendered table is ~1300px, not just "~1200px+". Minor arithmetic refinement only — the substance of the finding (720px min-width is moot, heavy horizontal scroll, cramped 12px filter inputs in 120-160px columns, no mobile collapse) is accurate.

```
.table-scroll > table { min-width: 720px; }   /* but adminCols fixed widths already sum to ~1160px */
```

### 4. Unsaved edits are silently discarded by Cancel, Sign out, and every header nav link — no confirm despite the 'unsaved changes' badge

`webui/app.js:234-241` · _Admin tool_ · confidence 95

**Problem.** draftDirty() (app.js 675-685) is computed and shown as an olive 'unsaved changes' badge (index.html 982-984), but nothing actually guards navigation. The site header (index.html 116-149) is always rendered during an edit — the Home/Registry/About links call goto() and the 'Admin' button calls goto('admin'), both of which set editingId=null and matchFilter=null with zero dirty check (app.js 234-241). cancelEdit() (686-691) and logout() (480-487) likewise wipe this.draft instantly. So after typing a name fix and picking two dates, one stray click on the always-visible nav, the language toggle path, Cancel, or Sign out throws all of it away. The dirty badge promises safety the app doesn't deliver.

**Fix.** When draftDirty() is true, intercept cancelEdit(), logout(), and goto() with a window.confirm ('You have unsaved changes — discard them?'). Optionally add a `beforeunload` handler so a tab close / reload also warns. The badge already tells the admin there are unsaved changes; the guard should match that promise.

**Verifier note.** Accurate except one mechanism detail: logout() (app.js 480-487) does NOT clear this.draft — it only clears editingId (and photoZoomed/carouselIdx) and switches view to 'home'. The draft object is left orphaned in state rather than wiped. The user-visible effect is identical to cancelEdit() (the edit panel closes and the in-progress changes are abandoned), so the finding stands; only the 'wipes this.draft' phrasing for logout is imprecise.

```
goto(v): `this.view = v; this.matchFilter = null; this.selectedId = null; this.editingId = null; ...` — no draftDirty() check. cancelEdit(): `this.editingId = null; this.draft = {};`
```

### 5. Lifespan timeline renders "عاشَ null عاماً" when age is out-of-range but years parse

`webui/app.js:1070-1106` · _UI bug_ · confidence 95

**Problem.** renderTimeline() only bails out when birth/martyrdom are missing (line 1071) or their 4-digit years are unparseable (line 1075). It never checks m.age. computeAge() (app.js:844-855) returns null whenever the year delta is < 0 or > 120 — exactly the scrambled-OCR rows the project says are ~35% of the data. For such a row both years still parse fine, so the function proceeds and line 1104/1105 interpolate m.age directly: 'عاشَ <b>null</b> عاماً' / 'Lived <b>null</b> years'. With reversed dates (birth 2024 / martyrdom 2023) it also prints a negative day count, e.g. '(-365 days)'. This is on the public detail page every visitor can reach.

**Fix.** Guard the same way the rest of the UI does: after computing birthY/martY, also bail (return '') when this.computeAge(m.birth, m.martyrdom) == null, or substitute ageLabel(m) ('—') into the string instead of the raw m.age. Also clamp/skip the days line when days < 0.

**Verifier note.** Accurate overall. One nuance: m.age is null (not "years parse but age out-of-range" directly) — both years DO parse (Number.isFinite passes at 1075), but computeAge returns null due to the <0/>120 bound, so the raw `m.age` interpolated is literally `null`. Also note public-site exposure is gated by the verified-only export to data/martyrs.json, so the highest-frequency victim is the ADMIN reviewing unverified scrambled rows; published-row exposure is possible but less frequent. The proposed fix is correct: in renderTimeline, after computing birthY/martY add `if (this.computeAge(m.birth, m.martyrdom) == null) return ''` (or substitute ageLabel(m)), and clamp/skip the days line when days < 0.

```
if (!m.birth || !m.martyrdom) return '';  ...  if (!Number.isFinite(birthY) || !Number.isFinite(martY)) return '';  ...  ? `عاشَ <b style="color:var(--forest)">${m.age}</b> عاماً <span ...>(${days.toLocaleString('ar-EG')} يوماً)</span>`
```

### 6. A row with frames cannot be verified while showing the portrait — forces an unwanted video frame as cover

`webui/app.js:704-711` · _Admin tool_ · confidence 93

**Problem.** saveEdit hard-blocks the save whenever the row has any frames AND the admin is currently on the portrait slide: it alerts '⚠ Pick a frame from the video before saving'. This means a row that has a perfectly good portrait photo plus some OCR frames CANNOT be saved/verified unless the admin navigates off the portrait onto a (lower-quality, often date-overlay) video frame and lets that frame become the cover. The admin cannot choose 'use the portrait as the cover, no frame'. For records that have a real portrait, this forces a worse cover image and adds mandatory clicks to every verify. It also interacts with the critical saveAndNext bug above: 'Save & next' on such a row silently fails and skips ahead.

**Fix.** Allow the portrait (or 'no frame') to be a valid cover choice — drop the hard block, or change it to a soft confirm ('No video frame selected; use the portrait photo as the cover?'). The featured-frame concept should be optional, consistent with the project rule that optional fields never block a row.

**Verifier note.** Minor precision: the guard is `current?.kind !== 'frame'`, so it blocks on any non-frame slide, not strictly the portrait. In practice, when frames exist the only non-frame slide is the portrait (carouselImages = [portrait?, ...frames]), so the reviewer's 'on the portrait slide' framing is effectively accurate. Also note the block is reached only when the admin is actively sitting on the portrait slide at save time; editMartyr() opens on slot 0 (portrait if present), so newly-opened rows with both a portrait and frames land in the blocked state by default.

```
`const hasFrames = (m.frames || []).length > 0; const current = this.carouselCurrent(); if (hasFrames && current?.kind !== 'frame') { alert(... 'Pick a frame from the video before saving.' ...); return; }`
```

### 7. saveAndNext advances to the next row even when the save was blocked or failed — silently discarding the admin's edits

`webui/app.js:697-766` · _Admin tool_ · confidence 90

**Problem.** saveEdit() aborts with a plain `return` (NOT a throw) in two cases: (1) the row has frames but the admin is on the portrait slide (lines 706-711), and (2) the API call fails (lines 723-726). saveAndNext() does `await this.saveEdit()` then UNCONDITIONALLY computes the next unverified row and calls editMartyr(next.id) (lines 757-765), which overwrites this.draft and resets the carousel. So if the admin clicks 'Save & next' on a row where save was blocked (frame-not-picked alert) or the SQL Server write 5xx'd, the alert flashes, the current row stays unverified, ALL the admin's typed corrections for that row are thrown away, and the form jumps to a different record — with no indication anything was lost. In the daily verify queue this corrupts the workflow: the admin thinks they verified+saved record N, but N is still unverified and their edits are gone, while they're now staring at record N+1.

**Fix.** Make saveEdit() return a boolean (or throw) to signal success, e.g. `return false` on the two abort paths and `return true` at the end. In saveAndNext(): `const ok = await this.saveEdit(); if (!ok) return;` before computing/advancing to the next row. This keeps the admin on the failed/blocked row so they can fix the frame selection or retry the save.

**Verifier note.** saveAndNext does advance unconditionally after a blocked/failed saveEdit, silently discarding the admin's typed corrections (they live only in this.draft, which editMartyr() overwrites at line 614 before this.edits was updated). However, in the typical oldest-first verify queue the row that gets reloaded is usually the SAME row the admin was editing (it is still the oldest unverified row), not a different record N+1 — so the admin lands back on the same row with edits wiped and the frame selection reset to idx 0, rather than being whisked to N+1. The reviewer's 'jumps to a different record / staring at record N+1' only happens if another unverified row sorts older by addedAt. The core problem (silent edit loss + form/carousel reset on a blocked or failed save, with no boolean gate on saveEdit's result) is fully confirmed and the proposed fix is correct.

```
saveEdit: `if (hasFrames && current?.kind !== 'frame') { alert(...); return; }` and `catch (e) { alert(...); return; }`  // saveAndNext: `await this.saveEdit(); const next = this.all.filter(...)[0]; if (next) this.editMartyr(next.id);`
```

### 8. Header overflows at 360px — lang toggle + login/admin button + hamburger never collapse

`webui/index.html:93-149` · _Responsive_ · confidence 88

**Problem.** At <=1024px the nav-links hide and the hamburger appears, but the EN/ع language toggle (134-137) AND the 'Editor login' / 'Admin' button (139-149) stay in the top bar next to the large logo (22px Arabic title + 'AQMAR · MEMORIAL' subtitle, 95-108). On a 360px phone the row is: logo block + hamburger + lang pill + 'دخول المحرّر' text button. 'دخول المحرّر' / 'Editor login' is a full-width-text btn-text with no wrap control, so the row can overflow horizontally or the logo subtitle wraps. The 768px rule only tightens padding/gap (styles.css 448-450); it never reduces what's shown.

**Fix.** On <=480px hide the logo subtitle ('AQMAR · MEMORIAL') and/or move the Editor-login and language toggle into the mobile-nav drawer, leaving only logo + hamburger in the bar. Alternatively shrink the logo title with the fluid scale and set the login button to icon-only on narrow widths.

**Verifier note.** Minor precision: the subtitle "AQMAR · MEMORIAL" is `text-[10px]` (line 106), and the login button does NOT set a 12px size — `.btn-text` inherits the ~15px body font, making it wider than implied. The depending-on-content outcome is "row overflows horizontally OR the logo title/subtitle wraps (growing the bar taller and misaligning items)." Otherwise the finding, cited lines, and proposed fix (hide subtitle and/or move lang toggle + login into the mobile drawer at ≤480px, leaving only logo + hamburger) are accurate.

```
<button @click="showLogin = true" class="btn btn-text"> <span x-text="lang === 'ar' ? 'دخول المحرّر' : 'Editor login'"></span>
```

### 9. Login modal is fixed 420px wide and overflows viewports narrower than 420px

`webui/index.html:1303` · _Responsive_ · confidence 88

**Problem.** The editor-login modal card is hardcoded w-[420px] with no max-width. On phones at 360-390px CSS width the card is wider than the viewport, so it either clips at the screen edges or triggers horizontal page scroll, and the centered dialog can push its left/right padding off-screen. The admin logs in from a phone (the whole admin flow is mobile-relevant per the table), so this is the first screen they hit.

**Fix.** Change to a responsive width, e.g. class "w-full max-w-[420px] mx-4" (or `width:min(420px, calc(100vw - 32px))`) so the modal shrinks on small screens while capping at 420px on desktop.

```
<div class="bg-paper w-[420px] rounded-lg p-8 border border-divider"
```

### 10. Inspecting a video frame to read the birth date silently reassigns the cover image on next Save

`webui/app.js:712-717` · _Admin tool_ · confidence 88

**Problem.** saveEdit derives draft.featuredFrame from whatever carousel slide is currently showing: `this.draft.featuredFrame = (current?.kind === 'frame') ? denormalizePath(current.src) : null`. But the form's own hint (index.html 921-923) tells the admin 'Birth date is usually visible at video second 28-32' — i.e. it actively directs them to navigate to a text/date frame to read the birth date into the form. If they then click Save (or Save & next), THAT date-overlay frame silently becomes the public cover image, replacing whatever was the right cover. The cover changes as a side effect of reading data, not as a deliberate choice. Compounding it, the $watch('carouselIdx') at app.js 168-174 sets draft.featuredFrame on every slide change, so merely clicking through frames to inspect them lights up the 'unsaved changes' badge even when the admin changed nothing.

**Fix.** Decouple 'currently viewing' from 'chosen as cover'. Add an explicit 'Set as cover' button (or click on the ★ overlay) that sets a separate draft.featuredFrame, and have the status banner read that explicit selection rather than the live carousel index. Do not mutate featuredFrame on every carouselIdx change. At minimum, default featuredFrame to the previously-saved frame and only change it on an explicit user gesture.

**Verifier note.** The reassignment is NOT "silent": when the admin is on a non-saved frame, index.html 886-900 displays an explicit banner ("✓ This frame will be saved as the cover on Save") and the matching thumbnail shows a ★ badge. The real issue is the design coupling — "currently viewing" equals "chosen as cover" with no separate Set-as-cover gesture — combined with a hint (index.html 918-923) that steers the admin to navigate to a date-overlay frame to read the birth date. So clicking Save after reading the date reassigns the cover to that text frame unless the admin remembers to navigate back, and the $watch (app.js 168-174) flips the unsaved-changes indicator from mere frame inspection. The fix (explicit "Set as cover" action, status banner reading the explicit selection rather than live carouselIdx) is correct.

```
saveEdit: `this.draft.featuredFrame = (current?.kind === 'frame') ? denormalizePath(current.src) : null;`  and  $watch: `this.$watch('carouselIdx', () => { ... this.draft.featuredFrame = (current?.kind === 'frame') ? denormalizePath(current.src) : null; });`
```

## Medium impact (22)

### 11. Birthday-match banner shows literal "±custom days" instead of the actual window

`webui/index.html:332-333` · _UI bug_ · confidence 98

**Problem.** When the visitor picks the 'مخصص / Custom' window and runs the search, runBirthdaySearch() snapshots matchFilter = {...this.bday} so matchFilter.window holds the string 'custom' (the filtering itself correctly resolves customDays in get filtered(), app.js:341). The results banner binds x-text="matchFilter?.window" directly, so it renders 'ضمنَ نطاق ±custom يوماً' / 'within ±custom days' — the word 'custom' where a number belongs. The user has no idea what range they are actually viewing. (Numeric windows also render Western digits e.g. 365 in the Arabic UI, an i18n inconsistency, but 'custom' is the broken case.)

**Fix.** Compute the effective day count for display: show matchFilter.window === 'custom' ? matchFilter.customDays : matchFilter.window, and run it through toArDigits() in the Arabic branch so it reads e.g. '±١٤ يوماً'.

```
عرضُ الأسماءِ المولودةِ حولَ <b ... x-text="`${matchFilter?.day}/${matchFilter?.month}`"></b>، ضمنَ نطاق ±<span x-text="matchFilter?.window"></span> يوماً
```

### 12. Dates show Western digits in Arabic mode — formatDate/formatDateTime never apply toArDigits

`webui/app.js:1208-1224, 1190-1206` · _RTL/Arabic_ · confidence 97

**Problem.** formatDate (and formatDateTime) interpolate the raw numeric day and year directly: in Arabic locale it returns `${d} ${arMonths[mIdx]} ${y}` — Arabic month name but Western digits for day and year. Verified live: formatDate('2001-03-23','ar') returns '23 مارس 2001'. These functions drive every visible date on the site: card birth/martyrdom dates (index.html 611,613,642,644), the detail dates strip (696,701), personalRows (414), the footer 'Last sync' label (1022-1024), and the admin 'Added' column (1207-1208). Meanwhile toArDigits IS applied to the stats counts (283-285), the delta badge (309), the carousel counter (874), and yearLabel (866) — so the same screen mixes Arabic-Indic digits (counts/years) with Western digits (full dates). Every Arabic visitor hits this on every record.

**Fix.** In formatDate/formatDateTime, when locale==='ar' wrap the day, year (and HH:MM) through the Arabic-Indic digit map (the same map toArDigits uses), e.g. return `${toArDigits(d)} ${arMonths[mIdx]} ${toArDigits(y)}`. Keep the English branch on Western digits. This is a localized, self-contained fix in two functions.

**Verifier note.** The issue is real and accurately described. Only nuance: it is a cosmetic/i18n-consistency defect (legible Western digits mixed with Arabic-Indic digits on the same screen), not a functional break — medium impact rather than high.

```
const arMonths = ['يناير', ...]; return `${d} ${arMonths[mIdx]} ${y}`;   // d and y are Western digits, no toArDigits
```

### 13. Age labels show Western digits in Arabic ('23 عاماً' instead of '٢٣ عاماً')

`webui/app.js:857-860` · _RTL/Arabic_ · confidence 97

**Problem.** ageLabel returns `${m.age} ${this.lang === 'ar' ? 'عاماً' : 'yrs'}` — the numeric age is emitted as a Western digit even in Arabic mode, producing '23 عاماً'. Age appears on every browse card (index.html 606,640), the detail dates strip (706), the related-martyr cards (779), the admin name cell (1215), and personalRows (416). Combined with the formatDate leak, an Arabic visitor sees a record where the registry counts and years are Arabic-Indic but the person's age and dates are Western — internally inconsistent on a single card.

**Fix.** Localize the number in the Arabic branch: `return `${this.lang === 'ar' ? this.toArDigits(m.age) : m.age} ${this.lang === 'ar' ? 'عاماً' : 'yrs'}`;`

**Verifier note.** The core ageLabel claim is accurate. The aside about a 'formatDate leak' belongs to a separate finding and was not validated here; this verdict covers only the ageLabel digit-localization issue. Severity adjusted from 'high' to 'medium' — pervasive cosmetic i18n inconsistency, not a task-blocking defect.

```
ageLabel(m) { if (!m || !Number.isFinite(m.age)) return '—'; return `${m.age} ${this.lang === 'ar' ? 'عاماً' : 'yrs'}`; }
```

### 14. 'Save & verify' does not enforce the mandatory fields (name + birth + martyrdom) and there is no required-field indicator

`webui/app.js:697-718` · _Admin tool_ · confidence 97

**Problem.** The project's core rule is that name + birth date + martyrdom date are mandatory. The edit form labels a 'Mandatory fields' section (index.html 988-991) but nothing enforces it: saveEdit() does no presence/validity check before flipping verification_status to 'verified'. Worse, each date field has a ✕ clear button (index.html 1016-1021, 1037-1042) that blanks the date, and the name input has no validation — so the admin can clear a mandatory date (or leave a row with blank name) and still click 'Save & verify', publishing an incomplete record to the public site. There is no visual 'required' marker (asterisk/red outline) and no inline 'this field is required' message, so the admin gets no signal that a mandatory value is missing.

**Fix.** In saveEdit() (before the API call) validate that draft.name is non-empty and draft.birth / draft.martyrdom match a YYYY-MM-DD pattern; if any is missing, block the save with an inline message naming the missing field(s) rather than silently verifying. Add a required-field marker (e.g. a red asterisk on the three labels) and a red border on an empty/invalid mandatory field so the requirement is visible before the admin clicks Save.

**Verifier note.** The finding is accurate. One small line-range note: saveEdit() spans webui/app.js 697-744 (the cited 697-718 only covers the opening). The save-without-validation path is: buildEditDiff at line 718 → saveEditViaApi at 722 → verification flipped to 'verified'/isVerified:true at 736-737. Additionally, neither the server endpoint (src/admin_app.py 143-156) nor the exporter (src/sqlserver_client.py get_verified_for_export, 243-245, filters only on verification_status='verified') enforces the mandatory fields, so an incomplete-but-verified row does reach the published data/martyrs.json — confirming the 'publishes an incomplete record to the public site' claim.

```
field label section: `x-text="lang === 'ar' ? 'الحقول الإلزامية' : 'Mandatory fields'"`  but saveEdit goes straight to: `const diff = buildEditDiff(m, this.draft); ... await saveEditViaApi(m.id, diff);` with no presence check; date ✕ buttons call `clearDraftDate('birth')` / `clearDraftDate('martyrdom')`.
```

### 15. Lifespan timeline mixes Western and Arabic-Indic digits in the same Arabic sentence

`webui/app.js:1102-1106, 1119-1129` · _RTL/Arabic_ · confidence 96

**Problem.** renderTimeline builds, for Arabic, `عاشَ <b>${m.age}</b> عاماً (${days.toLocaleString('ar-EG')} يوماً)` — the age uses a Western digit (m.age, raw) while the day-count is run through `toLocaleString('ar-EG')` which produces Arabic-Indic digits. So a single Arabic sentence reads e.g. 'عاشَ 23 عاماً (٨٬٤٠٥ يوماً)' — Western age, Arabic-Indic day count, side by side. The birth/martyrdom year labels on the same timeline (birthY/martY, lines 1125/1128) are also rendered as raw Western digits. This is the clearest internal contradiction proving the digit-localization policy isn't applied uniformly.

**Fix.** Use the same Arabic-Indic conversion for ALL numbers in the Arabic branch: convert m.age, birthY, martY via toArDigits and keep days on `toLocaleString('ar-EG')` (or convert all four with toArDigits for consistency). For the English branch keep Western digits.

**Verifier note.** Minor refinement: the reviewer lumped the 5-year axis tick labels (line 1092) into the same problem, but those are styled with var(--font-latin-sans) and font-variant-numeric:tabular-nums, i.e. deliberately a Western-digit numeric axis, and are not language-gated — they are defensible. The strongest, unambiguous evidence is (a) the prose sentence at 1103-1104 mixing Western m.age with Arabic-Indic days in one Arabic line, and (b) birthY/martY at lines 1125/1128 rendered as Western digits inside spans that use the Arabic naskh font.

```
? `عاشَ <b style="color:var(--forest)">${m.age}</b> عاماً <span ...>(${days.toLocaleString('ar-EG')} يوماً)</span>`
```

### 16. "Add photo" button on the detail view is a dead control with no @click handler

`webui/index.html:710-715` · _Public flow_ · confidence 96

**Problem.** In the admin-only action row on the martyr detail view, the "Add photo" (إضافة صورة) button has no @click handler at all — unlike the adjacent "Edit record" button which calls editMartyr(current.id). Clicking it does absolutely nothing: no modal, no file picker, no feedback. The admin (the one user who sees it, since the whole row is gated by x-show="isAdmin") will click it, see nothing happen, and be left guessing whether the app is broken. A clickable, fully-styled button that silently does nothing is a classic broken-affordance UX bug.

**Fix.** Either wire it to a real handler (open the carousel/upload flow, e.g. @click="editMartyr(current.id)" then focus the photo area, or a dedicated addPhoto(current.id) method), or remove the button until the feature exists. If the feature is pending, at minimum disable it and add a title/tooltip like 'Coming soon' so it does not read as functional.

**Verifier note.** Accurate as stated, with one severity nuance: it is admin-only (one user) and the admin has a working alternative (the "Edit record" button opens the photo carousel), so the impact is medium friction rather than high — it confuses but does not block.

**Author note.** (Independently flagged by two reviewers — ui-bugs and interaction-public.)

```
<button class="btn btn-ghost" x-text="lang === 'ar' ? 'إضافة صورة' : 'Add photo'"></button>
```

### 17. "edits this session" counter and per-row "edited this session" markers persist across all sessions

`webui/app.js:117-138` · _UI bug_ · confidence 96

**Problem.** init() restores this.edits from localStorage('aqmar.edits') on every page load (lines 118-132) and never clears it. The admin banner counter binds Object.keys(edits).length with the label 'تعديلٌ في هذه الجلسة / edits this session' (index.html:824-828), and rows with edits[m.id] get a highlight (index.html:1202) plus an 'edited this session' badge (index.html:1255). Because edits is cumulative and durable, on a fresh page load where the admin has touched nothing the counter still reads e.g. 247 and dozens of rows show the 'edited this session' badge — directly contradicting the label and making the dirty-state markers meaningless over time.

**Fix.** Either retitle the counter/badges to 'edited (all time)', or track a separate in-memory session set (not persisted) for the 'this session' counter and badge while keeping localStorage only as a dirty-marker cache. Simplest: keep a sessionEdits Set populated only in saveEdit()/saveAndNext() and bind that for the count + badge.

**Verifier note.** Accurate overall. Two refinements: (1) the per-row badge text is 'مُعَدَّل في هذه الجلسة' / 'edited this session' (index.html:1256). (2) The developer's stated intent (per inline comments at app.js:825 and index.html:1254) is even narrower than 'session' — index.html:1254 says it means 'you touched this in this browser tab' — which the persistent localStorage implementation also fails to honor (localStorage is shared across tabs and survives restarts). This strengthens, not weakens, the finding: the label/comment intent and the actual cumulative-durable behavior clearly diverge.

```
const cached = localStorage.getItem('aqmar.edits'); if (cached) { this.edits = JSON.parse(cached); }  ...  <div ... x-text="Object.keys(edits).length"></div> ... x-text="lang === 'ar' ? 'تعديلٌ في هذه الجلسة' : 'edits this session'"
```

### 18. --faint (#5a7a5a) body text fails WCAG AA contrast (3.6:1)

`webui/styles.css:15` · _Accessibility_ · confidence 95

**Problem.** The --faint token #5a7a5a measures 3.59:1 against --bg #0c1f0c and 3.22:1 against --paper #142914 — below the 4.5:1 AA threshold for normal-size text. It is used as real content text at tiny sizes: the Quran-citation line 'آل عمران · ١٦٩' (index.html:184, 10px) and the OCR-frame timing hint 'تاريخ الميلاد يَظهر عادةً في الثانية ٢٨–٣٢' (index.html:921, 10px). Low-vision users and anyone in bright ambient light cannot reliably read these. (Note: --muted #9bbf94 measures 8.4:1 and is fine — only --faint is the problem.)

**Fix.** Either darken-the-background-relative lightness of --faint to ~#7fa07f (≈4.6:1 on bg) for any text use, or introduce a separate `--faint-text` token that passes AA and keep #5a7a5a only for non-text decoration (tick marks, scrollbar thumb).

**Verifier note.** Accurate as stated. Minor refinements: (1) at 10px the text is far below the large-text size threshold (18.66px bold / 24px), so the strict 4.5:1 normal-text rule applies — the failure is more pronounced than the framing implies. (2) The third text-faint usage at index.html:962 is a disabled "Coming soon" button; disabled controls are WCAG-exempt, so the reviewer correctly limited the citation to lines 184 and 921. (3) #5a7a5a is also legitimately used for non-text decoration (tick marks app.js:1091, scrollbar thumbs styles.css:385/419, Litepicker weekday labels), which supports the reviewer's "introduce a separate --faint-text token" option over globally lightening --faint.

```
--faint:     #5a7a5a;   /* used as text-faint on index.html:184, 921 */
```

### 19. Admin per-column filter inputs have no accessible name

`webui/index.html:1185-1195` · _Accessibility_ · confidence 95

**Problem.** The per-column filter <input>s in the admin table header are not wrapped in a <label> and have only a generic placeholder ('تصفية…' / 'filter…') — placeholders are not accessible names and vanish on input. A screen-reader admin tabbing across the filter row hears eight identical 'edit text' fields with no indication which column (Name? City? Battalion?) each one filters. This makes the table's filtering — a primary admin tool for finding records — effectively unusable without sight.

**Fix.** Add `:aria-label="(lang==='ar' ? 'تصفية ' : 'Filter ') + col.label"` to the input so each filter is announced with its column name.

```
<input x-show="col.filterable" :value="adminColFilters[col.id]" @input="..." class="input w-full" ... :placeholder="lang === 'ar' ? 'تصفية…' : 'filter…'">
```

### 20. Litepicker date pickers render in English with Western digits (not localized to Arabic)

`webui/app.js:895-909, 920-936, 953-972` · _RTL/Arabic_ · confidence 95

**Problem.** All three Litepicker instances — the homepage birthday-search input (the site's HEADLINE feature) and both admin birth/martyrdom date pickers — are constructed with no `lang`/locale option. Litepicker defaults to en-US, so an Arabic visitor (Arabic is the default language) opening the calendar sees English month names and Western/Latin digits throughout. Verified live in-browser: month dropdown options were 'January, February, March...', and day cells/weekday headers used Western digits '1,2,3...' while the page lang was 'ar' and dir was 'rtl'. The whole rest of the UI uses Arabic months (يناير…) and Arabic-Indic digits via toArDigits, so the calendar is a jarring English island inside the primary Arabic flow.

**Fix.** Pass `lang: 'ar'` to each `new Litepicker({...})` (Litepicker localizes month/weekday names from the BCP-47 tag). For Arabic-Indic digits in the calendar grid, also supply a custom `numbersFormatter`/locale-aware renderer, or at minimum set lang so month names are Arabic. Bind it to the current `this.lang` and recreate the picker when the language toggle flips so it tracks the EN/ع switch.

**Verifier note.** Core finding is correct. One nuance: the reviewer states passing `lang: 'ar'` localizes month/weekday names (true), but Litepicker does not auto-render Arabic-Indic day-cell digits from the BCP-47 tag alone — Arabic numerals would still need a custom renderer (the reviewer does note this in the proposed fix). Also, the user-facing severity is better characterized as medium polish than high: the calendars are functional and the selected values are correctly localized; only the open popup is in English with Western digits.

```
this._birthdayPicker = new Litepicker({ element: el, format: 'YYYY-MM-DD', singleMode: true, autoApply: true, dropdowns: { minYear: 1950, maxYear: currentYear, months: true, years: true }, ... });  // no `lang`/locale anywhere
```

### 21. Ghost silhouette overlays real martyr photos with an 18%-opacity white figure

`webui/app.js + webui/styles.css:app.js 1058-1067; styles.css 350` · _Visual/tone_ · confidence 95

**Problem.** In renderPortrait the <img> is emitted first in normal flow, then the .silhouette SVG (an abstract head+shoulders shape filled rgba(255,255,255,0.18)) is rendered after it as position:absolute; inset:0. The silhouette is NOT hidden when a real photo loads (only the img's onerror hides the img on FAILURE). So every successfully-loaded portrait — the actual face of a martyr — gets a translucent white generic-body shape painted on top of it across the whole card grid, browse list, detail hero, related cards and admin table. On a memorial this both degrades the dignity of the person's image and looks like a rendering bug. The placeholder silhouette should only show when there is no photo.

**Fix.** Render the silhouette + corners only in the no-photo branch (when photo is falsy), or set the silhouette to display:none when a sibling img is present (e.g. .portrait:has(img) .silhouette { display:none }, or add the silhouette markup only inside the `${photo ? '' : silhouetteHtml}` path). Keep corners as the only ornament over a real photo.

**Author note.** Hand-verified: the overlay is `opacity:.18` on the `.silhouette` element AND `rgba(255,255,255,0.18)` fills, compounding to ~3% white — faint, not 18%. Still painted over every real photo (it is meant only for the no-photo placeholder). Downgraded high -> medium on review.

```
photoHtml = `<img src="${esc(photo)}" ... onerror="this.style.display='none'">`; … return `<div class="portrait ...">${photoHtml}<svg class="silhouette" ...>` ; .portrait .silhouette { position: absolute; inset: 0; opacity: .18; }
```

### 22. Birthday-match banner shows window in days but no birth-year, and "View all" anniversaries reuses the birthday search confusingly

`webui/index.html:292-294` · _Public flow_ · confidence 93

**Problem.** The home 'On this day' section's 'View all' button (line 292) sets bday.month/day to today and bday.window = 7, then calls runBirthdaySearch(). But runBirthdaySearch snapshots this.bday which has year=null, so the browse banner falls into the month+day cyclic path and the user lands on a BIRTHDAY-proximity search (people BORN near today) when they clicked a control under a MARTYRDOM-ANNIVERSARY heading ('ذكرى استشهاد'). The mental model breaks: 'View all anniversaries' silently switches the meaning from death-anniversary to birthday. Additionally the browse match banner (lines 331-333) renders the window as '±N days' but, when a full date with year was picked, the matching is by full calendar distance (birthDelta) — '±7 days' around a specific full date is correct, but for the year-less anniversary path the same banner text is shown, conflating two different semantics for the user.

**Fix.** Make 'View all' on the anniversaries block run an actual martyrdom-date filter (set martyrdomFrom/To around today, or a dedicated anniversary view), not the birthday search. Keep the two concepts (born-near / died-near) visually and behaviorally distinct so the banner copy always matches what was searched.

**Verifier note.** The primary defect is real: the anniversaries-section "View all" button reuses the birthday (born-near) search and lands the user on a "Showing names born around …" banner, contradicting the "martyrdom anniversary" heading they came from, because bday.year is never set so the filter uses the month+day birthDate cyclic path (dayDelta). Minor correction to the reviewer's second point: the browse banner copy is static "born around …, ±N days" — it does not actually "conflate two different semantics in the same text"; rather, that single birthday-oriented copy is simply incorrect/misleading when reached from the anniversary entry point. Fix: have "View all" run a real martyrdom-date filter (e.g. martyrdomFrom/To around today, or a dedicated anniversary view) with its own banner copy, keeping born-near vs died-near behaviorally and textually distinct.

```
<button @click="bday.month = todayMonth; bday.day = todayDay; bday.window = 7; runBirthdaySearch()"
                  class="btn btn-text"
                  x-text="lang === 'ar' ? 'عرض الكلّ ←' : 'View all ←'">
```

### 23. No success confirmation after Save/Save&verify/Reject — only failures are signalled

`webui/app.js:740-744` · _Admin tool_ · confidence 93

**Problem.** On a successful save, saveEdit() just clears editingId and returns to the table; on a successful reject, rejectEdit() does the same (lines 808-814). There is no toast / confirmation that the write to SQL Server actually succeeded — only the error paths alert(). The admin's only feedback is the row vanishing from the edit view and the status pill changing color in the table. By contrast publishNow() DOES show a success alert (line 784). This asymmetry means in the most-repeated daily action (verify), the admin can't easily distinguish 'saved' from 'I clicked but nothing happened'. The 'edits this session' counter in the banner (index.html 824) also counts session edits, not server confirmations, so it isn't reliable proof of a persisted save.

**Fix.** Show a brief non-blocking success toast after a successful saveEdit/saveAndNext/rejectEdit (e.g. 'Saved & verified #NNN' / 'Rejected #NNN'), consistent with the publish success alert. A toast (rather than alert) keeps the Save & next queue flow fast.

**Verifier note.** One sub-claim is slightly imprecise: the reviewer says the 'edits this session' counter (index.html line 824, `Object.keys(edits).length`) 'counts session edits, not server confirmations.' In fact `this.edits[m.id]` is populated at app.js line 731, AFTER the awaited API call at line 722 (which throws on failure), so the counter increments only on a server-confirmed write. The real weakness is that it is a cumulative tally of distinct touched IDs sitting in the banner — not a discrete, immediate per-save 'this one saved' signal — so it is still poor feedback, just not for the reason stated. The core finding (no success confirmation on the daily Save/verify/reject actions, asymmetric with publishNow's success alert) is fully confirmed.

```
saveEdit success tail: `this.editingId = null; this.draft = {}; this.photoZoomed = false; this.carouselIdx = 0;` — no success message, whereas publishNow has `alert(msg)` on success.
```

### 24. Home "Nearest birthdays" preview is misleading before the user picks a date and has no loading/empty state

`webui/app.js:251-264` · _Public flow_ · confidence 92

**Problem.** previewMatches always returns 3 names, even before the visitor has picked any birthday: bday defaults to today's month/day (bday: { day: new Date().getDate(), month: ... , year: null }), so the getter falls back to dayDelta proximity around TODAY and labels them 'Nearest birthdays to your date' / 'أقربُ الأسماءِ مولداً ليومك'. The visitor has supplied no date yet, so 'your date' is a lie — these are simply names near today's calendar day. This undercuts the site's headline feature: the user can't tell the difference between 'I haven't searched yet' and 'these are my matches'. There is also no skeleton/placeholder while data loads (during the initial async loadMartyrs(), all is empty so the x-for renders nothing — the card just shows an empty dashed section with a header), and no empty/guidance state.

**Fix.** Gate the preview on bday.year being set: before a date is picked, either hide the preview list and show a one-line prompt ('Pick your birthday above to see the closest names'), or relabel it honestly (e.g. 'Born near today'). While loading (all.length === 0 && loading), show 3 small skeleton rows so the section does not flash empty.

**Verifier note.** Minor clarification: the app DOES gate the real search and the clear-button on bday.year (the ✕ at index.html:227 uses x-show="bday.year", and yearLabel/getter logic at app.js:879-880 returns '' without a year). The mislabeling is specific to the home PREVIEW teaser, which is not year-gated — the reviewer correctly scoped it there. So the issue is real but narrowly about the preview card's label/empty-state, not about the search feature as a whole.

```
get previewMatches() {
      const iso = isoDate(this.bday.year, this.bday.month, this.bday.day);
      return this.all
        .map(m => ({ ...m, delta: iso ? birthDelta(iso, m.birth) : dayDelta(m.birth, this.bday.month, this.bday.day) }))
```

### 25. Successful Save / Save & verify gives screen-reader users no confirmation

`webui/app.js:697-744, 791-806` · _Accessibility_ · confidence 90

**Problem.** saveEdit() (and rejectEdit) only surface FAILURE via alert(); on SUCCESS the form just silently closes (editingId=null) with no announcement. A sighted admin infers success from the form disappearing, but a screen-reader admin working through the verification queue hears nothing — they cannot tell whether 'Save & verify' actually persisted the record or whether the click was ignored. Save & Next compounds this: it saves, closes, and re-opens the next record with zero spoken feedback about what just happened. This is the admin's core daily workflow.

**Fix.** Add a visually-hidden aria-live="polite" status region (one per app, bound to a `statusMessage` state field) and set it on every save/reject/publish success ('Record #N saved and verified', 'Moved to next unverified record'), not just on failure. This also lets you replace the blocking alert()s on failure with the same region for a consistent pattern.

**Verifier note.** Accurate, with one nuance: a sর-only CSS class already exists (styles.css:483), and the app already has aria-live regions elsewhere — but none cover the admin save/verify/reject success path, so the gap stands. Severity is better rated medium than high because the affected population is a single admin user using assistive tech, and the save still functions (only the spoken confirmation is missing).

```
await saveEditViaApi(m.id, diff); ... this.editingId = null; this.draft = {}; // (no success announcement anywhere)
```

### 26. Language toggle, status pills, view-mode toggle and date clear-buttons are below the 44px touch-target minimum

`webui/index.html:134-137` · _Responsive_ · confidence 90

**Problem.** Several primary controls render well under the 44px recommended touch target. The lang toggle is px-3.5 py-1.5 (~28px tall). Admin status pills are px-3 py-1 text-[12px] (~26px tall, index.html 1151). The grid/list view-mode buttons are px-3 py-1.5 text-[12px] (index.html 500/508). The date-input clear ✕ buttons are padding:0 4px (index.html 230, 431, 446) — roughly 20px wide. On touch these are easy to mis-tap, and the ✕ clear buttons sit right next to the readonly date field that opens the picker, so a fat-finger tap clears instead of editing.

**Fix.** Give interactive controls a min-height/min-width of 44px on touch (e.g. add `min-height:44px` to .btn small variants and pills, and enlarge the ✕ clear buttons to a 32-44px hit area via padding even if the glyph stays small). The lang toggle especially is a top-bar primary control.

**Verifier note.** Minor: the proposed fix references ".btn small variants" but these controls (lang toggle, pills, view-mode, clear ✕) are NOT built from a `.btn` small variant — they use inline Tailwind utilities and inline `style` padding, so the `.btn` base rule (padding:10px 18px) does not apply to them. The fix should add min-height/min-width (or larger padding / a transparent expanded hit area) directly to these specific controls. Also note the date clear ✕ buttons use an inline `style` attribute (`padding: 0 4px`), not a CSS class, so they must be enlarged via that inline style or a new class rather than by editing existing CSS.

```
class="bg-transparent border border-divider rounded-full px-3.5 py-1.5 font-latin-sans text-[12px] text-muted"
```

### 27. Three disconnected "Clear" controls — no single way to reset all active filters

`webui/app.js:332-334` · _Public flow_ · confidence 90

**Problem.** The browse view has three independent filter mechanisms with three separate clears: clearFilters() resets only filters (q/city/rank/batt/age); clearAdvancedFilters() resets only the martyrdom-range/age-range panel; and the birthday match is cleared by a third button (matchFilter = null at index.html:340). A user who has a birthday match active, plus a city filter, plus an advanced age range, sees results that combine all three but has no single 'reset everything' button — they must find and click up to three different controls in three different places (one of which lives inside a collapsed Advanced panel). It is easy to end up with a near-empty result set and not realize a hidden advanced filter is still applied, since the primary 'Clear' button does not touch it.

**Fix.** Add one prominent 'Clear all filters' button on the browse toolbar that resets filters, advanced filters (martyrdomFrom/To, ageMin/Max + their pickers), AND matchFilter in one click. Show it only when any filter is active. Keep the scoped clears if desired, but guarantee one global reset.

**Verifier note.** The core finding is accurate, but the claim that a user "has no way to realize a hidden advanced filter is still applied" is overstated: the Advanced-filters toggle button displays a live count badge (advancedFilterCount(), index.html:404-405) whenever a martyrdom-range or age-range filter is set even while the panel is collapsed, and the birthday match shows a prominent banner with its own clear button. The genuine defect is the absence of a single global reset — three independent clears in three locations — not a complete lack of visibility into active filters.

```
clearFilters() {
      this.filters = { q: '', city: '', rank: '', batt: '', age: '' };
    },
```

### 28. badge-forest pill is nearly invisible: 10%-opacity dark-green fill on a dark-green ground

`webui/styles.css:192-193` · _Visual/tone_ · confidence 90

**Problem.** badge-forest fills with rgba(31,61,43,0.10) and badge-olive with rgba(138,109,59,0.13). The --forest token is actually GOLD (#fbbf24), but these badge fills use a leftover dark-green (31,61,43) at 10% over the dark ground (--paper #142914) — so the pill background is essentially imperceptible; only the gold text shows, with no readable chip shape. Rank/weapon badges (shown on every card, list row and detail hero) therefore look like floating colored words rather than badges, inconsistent with the solid neutral .badge. The 31,61,43 value is also an orphaned hardcoded color from the old green-brand era that no longer matches the gold --forest.

**Fix.** Give badge-forest a visible gold-tinted fill consistent with the gold brand, e.g. background: rgba(251,191,36,0.12) (matching the carousel-status is-good token already used at line 316) plus a subtle border, so the pill reads as a chip. Align badge-olive opacity to match. Pull these into named tokens if reused.

**Verifier note.** Minor precision: badge-olive at rgba(138,109,59,0.13) is somewhat more visible than badge-forest (it composites to a faintly warmer ~(35,50,25) wash vs the ~(21,43,22) of badge-forest), so "nearly invisible" applies most strongly to badge-forest specifically. Also, the proposed-fix reference value is rgba(251,191,36,0.08) (styles.css:316), not 0.12 as stated — the 0.12 figure is the reviewer's suggested target, not the existing token.

```
.badge-forest  { background: rgba(31,61,43,0.10);   color: var(--forest); } .badge-olive   { background: rgba(138,109,59,0.13); color: var(--olive); }
```

### 29. Emoji icons (🎂 📅 📤 ⚙ 🔄 ⚠️ 📂) undercut memorial gravitas

`webui/index.html:221, 422/437, 835, 402, 553, 550, 74/82` · _Visual/tone_ · confidence 90

**Problem.** The UI leans on full-color OS emoji for primary affordances: a birthday cake 🎂 on the hero's main search, 📅 calendars on date pickers, 📤 on Publish, ⚙ on advanced filters, 🔄 on retry, ⚠️/📂 in banners. Emoji render in each platform's playful multicolor style, are visually inconsistent with the restrained custom SVG crescent/star ornaments elsewhere, and the cake in particular reads as celebratory on a martyrs' memorial. They also clash with the carefully tuned dark-gold palette (random reds/yellows/blues from the emoji font).

**Fix.** Replace the load-bearing emoji with the same thin-stroke inline-SVG icon language already used for the logo/hamburger (a simple line calendar, upload arrow, gear, refresh glyph). At minimum drop the 🎂 cake on the hero search — use a subtle SVG or no icon — since it is the single most tonally-off element on the landing page.

```
<span aria-hidden="true">🎂</span>  …  📤 <span x-text="lang === 'ar' ? 'نشر' : 'Publish'"></span>  …  <span aria-hidden="true">⚙</span>
```

### 30. In-page anchors and skip-link land under the sticky blurred header (no scroll-margin-top)

`webui/index.html:92-93` · _Responsive_ · confidence 88

**Problem.** The header is sticky top-0 z-50 with backdrop blur. The skip-to-content link targets #main-content / #main-content-<view> (index.html 57) and the footer has internal links, but no section has scroll-margin-top. When a keyboard or screen-reader user activates the skip link, the focused content scrolls to y=0 and is hidden behind the ~60px sticky header. On mobile where the header is proportionally taller relative to the small viewport this hides the first heading/control of each view.

**Fix.** Add `scroll-margin-top` equal to the header height (e.g. `scroll-margin-top: 72px`) to the main view sections / #main-content anchors so skip-link and hash navigation land below the sticky header.

**Verifier note.** The skip link targets the per-view section ids (#main-content-browse / -detail / -about / -admin) for non-home views, and the always-present <main id="main-content"> wrapper only on home. Fix should add scroll-margin-top to those section/main anchors. Note also that none of the targets have tabindex="-1", so the skip link may scroll without reliably moving focus in all browsers — a related a11y gap beyond the scroll-margin issue cited.

```
<header role="banner" class="sticky top-0 z-50 ..."> ... <a :href="'#main-content' ..." class="skip-link">
```

### 31. Portrait placeholder gradient is a bright spring-pastel that breaks the somber dark palette

`webui/styles.css:334-343` · _Visual/tone_ · confidence 88

**Problem.** The .portrait placeholder background is a hardcoded gradient of light mint/sage pastels (#cfd9c8 → #94ae93) and the tone-olive variant is cream (#e8dcc0 → #c9b48a). Against the near-black forest ground (--bg #0c1f0c) every martyr lacking a photo renders as a glowing pale rectangle. With usePhotos likely off / many rows photo-less, the registry grid becomes a wall of bright pastel tiles — tonally cheerful and generic, the opposite of memorial gravitas, and the brightest thing on the page competing with the actual content. These are also hardcoded hex values bypassing the --token system (a CLAUDE.md violation): #cfd9c8, #94ae93, #e8dcc0, #c9b48a have no token.

**Fix.** Replace the placeholder gradient with muted, dark tokens (e.g. linear-gradient from --bg-3 to --paper or a desaturated --faint/--divider blend) so a missing photo reads as a quiet recess, not a bright card. Define any new shades as :root tokens. Keep the monogram/silhouette subtle and low-contrast.

**Verifier note.** The gradient only shows for rows WITHOUT a photo — when a photo exists, `.portrait img` (width:100% height:100% object-fit:cover) fully covers the gradient, so it is invisible. The reviewer's premise that 'usePhotos likely off' is wrong: config.js defaults usePhotos:true and photos exist on disk. The issue is real but scoped to photo-less rows (a subset), not 'every martyr lacking a photo renders as a glowing pale rectangle' across the whole grid. The token-bypass observation is correct: #cfd9c8/#94ae93/#e8dcc0/#c9b48a are hardcoded with no :root token.

```
.portrait { … background: linear-gradient(160deg, #cfd9c8 0%, #94ae93 60%, var(--forest-2) 100%); … } .portrait.tone-olive { background: linear-gradient(160deg, #e8dcc0 0%, #c9b48a 70%, var(--olive-2) 100%); }
```

### 32. Picking a birthday gives no in-place feedback — the user must hunt for the separate "Show names" button

`webui/index.html:256-262` · _Public flow_ · confidence 85

**Problem.** After the user opens the Litepicker and selects a birth date, nothing visibly confirms the search will run — the only thing that changes is the read-only input text and the 3 preview cards quietly re-sorting. The actual results require clicking a separate 'Show names' (اعرض الأسماء) button in a third grid cell (grid-bday-submit), which then jumps to the browse view. New visitors commonly pick a date and then wait/expect results, not realizing they must press a button in a different column. The flow has two separated actions (pick date, then find+press submit) where users expect one.

**Fix.** Tighten the loop: either auto-run the search on date selection (the Litepicker 'selected' callback already fires — call runBirthdaySearch() from there, or update the preview prominently), or, at minimum, make the 'Show names' button visually react when a date is picked (e.g. pulse/enable emphasis) and show a count preview like 'Show 12 names' so the button reflects state. Consider scrolling the preview into view on selection.

**Verifier note.** After picking a birth date there IS some in-place feedback — the 3 preview cards under the picker reactively re-sort to the nearest birthdays (app.js get previewMatches, lines 251-264) — but it is subtle and easy to miss, and it shows only 3 names rather than the full result set. The real issue is the two-step flow: date selection does not run the search (the Litepicker 'selected' callback at app.js:902-907 only stores the date), so users must locate and press the separate "Show names" button (index.html:257-262), which lives in a third grid column on desktop (styles.css:389) and only then switches to the browse view with full results.

```
<button @click="runBirthdaySearch()" class="btn btn-primary">
              <span x-text="lang === 'ar' ? 'اعرض الأسماء' : 'Show names'"></span>
```

## Low impact / polish (27)

### 33. 'ltr' class on all date inputs is a no-op (undefined class), leaving inputs RTL

`webui/index.html:225, 426, 441, 1014, 1035` · _RTL/Arabic_ · confidence 95

**Problem.** Every date-picker input carries `class="... ltr ..."` intending to force the YYYY-MM-DD value left-to-right. Verified live in-browser: no stylesheet defines a bare `.ltr` rule (Tailwind Play CDN ships the `ltr:`/`rtl:` VARIANT prefixes, not a standalone `.ltr` utility), and the input's computed `direction` is `rtl`, not `ltr`. So the class does nothing. Practical visual impact is near-zero because the values are read-only numeric `YYYY-MM-DD` strings, which Unicode bidi (rule W4) already resolves to a single LTR number run even inside an RTL field — but the class is dead and signals intent that isn't met, and would silently fail to protect any future non-numeric value.

**Fix.** Either define the utility once in styles.css (`.ltr { direction: ltr; text-align: left; }`) so the inputs honor the intended LTR, or remove the dead `ltr` class from the five inputs to avoid implying behavior that doesn't exist. Defining it is the safer choice if any picker might ever hold mixed text.

**Verifier note.** Accurate as stated. Minor clarification: styles.css line 64 does define `html[lang="en"] body { direction: ltr; }`, so in English (LTR) mode the inputs are already effectively LTR via inheritance; the no-op only matters in the default Arabic (RTL) view, where bidi rule W4 nonetheless keeps the numeric date value laid out left-to-right. Net current user-visible impact is effectively nil; the issue is unmet intent / latent risk rather than a visible bug.

```
class="bg-transparent flex-1 ltr focus:outline-none cursor-pointer"  /* no .ltr rule exists; computed direction = rtl */
```

### 34. View-mode (grid/list) and sort choices are not persisted across navigation or reload

`webui/app.js:89-91` · _Public flow_ · confidence 95

**Problem.** viewMode ('grid'|'list') and sort are plain reactive state with no localStorage persistence (only edits is persisted, app.js:136-138). A visitor who switches to list view or changes the sort, opens a martyr detail, then returns to the registry keeps the choice in-session (state isn't reset by openMartyr), but ANY reload or returning later resets to grid + martyrdom_desc. For a registry people browse repeatedly, re-selecting the preferred density every visit is needless friction. (Contrast: the admin table even has its own filters, but viewMode is the public-facing preference most worth remembering.)

**Fix.** Persist viewMode and sort to localStorage in init() (a $watch like the edits one) and restore on load. Small change, removes a recurring annoyance for returning visitors.

```
sort: 'martyrdom_desc',
    viewMode: 'grid',   // 'grid' (default, multi-column) or 'list' (single-column)
```

### 35. Inline template numbers leak Western digits inside Arabic copy (anniversaries heading, match banner, record IDs)

`webui/index.html:290, 332-333, 978, 1204` · _RTL/Arabic_ · confidence 93

**Problem.** Several Arabic strings interpolate raw numbers without toArDigits. Home 'On this day' heading: `ذكرى استشهاد · ${todayDay}/${todayMonth}` shows Western day/month. Browse match banner: `حولَ <b>${matchFilter?.day}/${matchFilter?.month}</b>، ضمنَ نطاق ±<span x-text="matchFilter?.window"></span> يوماً` shows Western digits for the date and window. Admin edit header 'SHID #' uses String(editingId).padStart (Western), and the admin table # column uses String(m.id).padStart (Western). While IDs/SHID are arguably technical, the public-facing anniversaries heading and birthday-match banner are prominent Arabic UI where the surrounding text is Arabic-Indic elsewhere, so the Western digits read as a localization bug to Arabic users. Note: these are digit-localization issues, not bidi-reordering — the numeric runs themselves stay LTR correctly under Unicode bidi.

**Fix.** Wrap the user-facing numbers in toArDigits for the Arabic branch: e.g. `ذكرى استشهاد · ${toArDigits(todayDay)}/${toArDigits(todayMonth)}` and `${toArDigits(matchFilter?.day)}/${toArDigits(matchFilter?.month)}` plus `x-text="toArDigits(matchFilter?.window)"`. Public-facing strings should be prioritized over the admin SHID/# columns.

**Verifier note.** The finding is accurate. Caveat on prioritization: the two public-facing cases (home anniversaries heading line 290; browse match banner lines 332-333) are the legitimate core. The two admin cases (line 978 "SHID #" header, line 1204 "#" column) are weaker — "SHID #" is a Latin technical prefix and the # column is explicitly styled `font-latin-sans tabular-nums` as a technical ID, so Western digits there are arguably intentional rather than a localization bug. The reviewer already concedes IDs are "arguably technical," so this is just emphasis: fix lines 290 and 332-333; the admin digit columns are optional/defensible.

```
x-text="lang === 'ar' ? `ذكرى استشهاد · ${todayDay}/${todayMonth}` : `Anniversaries · ${todayDay}/${todayMonth}`"
```

### 36. dates-strip and stats-strip leave stray inline-start borders on wrapped items at 2-column breakpoints

`webui/index.html:692-707` · _Responsive_ · confidence 93

**Problem.** The detail dates-strip (3 cells, each with inline `border-inline-start: 1px solid var(--divider)`) collapses to 2 columns at <=768px (styles.css 446), so the 3rd cell wraps to a new row but keeps its left divider, drawing a divider line with nothing to its start. The stats-strip has the same pattern: items use `:style="i > 0 ? 'border-inline-start...'"` (index.html 314) and collapse to 2 columns at 768 and 480 (styles.css 441/454), so the first item of each wrapped row (i=2) shows a leading border. Cosmetic but looks like a misaligned/broken line on phones.

**Fix.** Replace the per-item inline-start borders with grid `gap` + a container border, or use CSS to drop the inline-start border on the first item of each row (e.g. nth-child rules tied to the 2-col breakpoint). Lowest effort: use column gap with dividers via `:not(:first-child)` that resets per visual row.

**Verifier note.** The finding is accurate. One nuance the reviewer omitted: in dates-strip the FIRST cell (line 693) does the same inline `border-inline-start` PLUS `margin-inline-start: -1px` precisely to hide its leading border on the desktop row — which actually corroborates the intent to suppress leading borders, and the proposed nth-child/gap fix is the right pattern to extend that suppression to every wrapped row.

```
<div class="py-4 text-center" style="border-inline-start: 1px solid var(--divider); ...">  (3 cells, grid becomes 1fr 1fr at 768)
```

### 37. Data-source banner hardcodes amber/red light-mode colors that clash with the dark theme

`webui/index.html:69-71` · _Visual/tone_ · confidence 93

**Problem.** The static-json / sample-data notice bar is styled with inline light-mode hex: background:#fef3c7; color:#78350f (amber) and background:#fee2e2; color:#7f1d1d (red). These bright cream/pink bars sit at the very top of an otherwise deep-dark memorial and look like a foreign Bootstrap alert; they bypass the --token system entirely (CLAUDE.md violation — no token for any of these four hexes). The admin sees the amber bar daily in local dev.

**Fix.** Restyle both states with dark-theme tokens: a muted warning surface (e.g. the olive needs-action pattern rgba(184,146,74,0.10) + olive text/border already used at styles.css 320-323) for static-json, and the existing crimson token treatment (rgba(122,42,42,0.06) + --crimson) for sample-data. Move to a .data-banner class.

**Verifier note.** Minor: the static-json amber bar is suppressed on the public production site (gated by isLocalDev), so the public-facing impact is limited to ?demo mode (the red sample-data bar). The amber bar is essentially admin/dev-only, which is why low severity is appropriate. Also note the #fbbf24 border value equals the --forest/--gold token but is still hardcoded inline rather than referencing var(--forest).

```
:style="dataSource === 'static-json' ? 'background:#fef3c7; color:#78350f; border-bottom:1px solid #fbbf24;' : 'background:#fee2e2; color:#7f1d1d; border-bottom:1px solid #f87171;'"
```

### 38. Required vs optional fields in the edit form are only signalled visually, not to assistive tech

`webui/index.html:988-1044` · _Accessibility_ · confidence 90

**Problem.** The edit form splits fields into 'الحقول الإلزامية / Mandatory fields' and 'حقولٌ اختيارية / Optional fields' using only a styled <div> sub-heading; the mandatory inputs (name, age, birth date, martyrdom date) carry no `required`/`aria-required` attribute and the grouping <div> is not a fieldset/legend or otherwise associated with the inputs. A screen-reader admin tabbing field-to-field cannot tell which fields are mandatory — and since name+birth+martyrdom are the project's hard requirement, mistakenly leaving one blank is a data-integrity risk that AT users cannot detect.

**Fix.** Wrap each section in <fieldset> with a <legend> ('Mandatory fields'), and add aria-required="true" to the name/birth/martyrdom controls. Ideally also expose client-side validation errors via aria-describedby on the offending field rather than relying on a backend alert().

**Verifier note.** The mandatory inputs lack required/aria-required and the section heading is a plain <div> rather than a fieldset/legend — confirmed. However, the reviewer's premise that errors currently surface "via a backend alert()" is inaccurate: there is no mandatory-field validation anywhere (client saveEdit() only validates the cover frame; the API accepts an empty diff as a verify-only action), so a blank mandatory field saves silently with no alert at all. Also, this is a single-operator owner-only admin tool, so the AT-user impact is low in practice even though the a11y gap is genuinely present.

```
<div class="font-display ... mb-3 mt-1" x-text="lang === 'ar' ? 'الحقول الإلزامية' : 'Mandatory fields'"></div> ... <input class="input" x-model="draft.name">
```

### 39. Admin sortable column-header buttons don't expose sort state via aria-sort

`webui/index.html:1168-1181` · _Accessibility_ · confidence 90

**Problem.** The table column headers are <th> containing a <button> that toggles sort, with a visual arrow indicator from adminSortIndicator(col.id). But the <th> has no `aria-sort` attribute and the arrow is plain text inside the button label, so a screen-reader admin cannot tell which column the table is currently sorted by or in which direction — they only hear 'Name, button' identically whether or not it's the active sort.

**Fix.** Bind `:aria-sort` on the <th> ('ascending'/'descending'/'none' based on adminSortBy and direction). Optionally add an sr-only span describing current sort to the button.

```
<th class="p-3.5 text-start" ...> <button @click="adminSetSort(col.id)" ...> <span x-text="col.label"></span> <span class="font-latin-sans" x-text="adminSortIndicator(col.id)"></span>
```

### 40. Heading hierarchy skips levels (h1 -> h3, h2 -> h4) within views

`webui/index.html:190-289, 346-767` · _Accessibility_ · confidence 90

**Problem.** Within the home view the only h1 (line 190) is followed directly by h3 'ابحث عمّن شاركك يوم ميلادك' (207) and h3 'On this day' (289) with no intervening h2. On the detail view the name is an h1 (683) but the 'Personal'/'Military' panels are h4 (734,744) and 'From the same battalion' is h3 (767) — again skipping h2. Screen-reader users navigating by heading level get a broken outline and may assume content is missing between levels. (The single-h1-per-view pattern via x-show is otherwise fine since only one view is visible.)

**Fix.** Re-map the in-view section headings to consecutive levels: under each view's h1/h2, the first sub-section should be h2/h3 respectively, with no skips. E.g. the home birthday card and 'On this day' become h2; detail's Personal/Military/Related become h2.

**Verifier note.** Title says "h1 -> h3, h2 -> h4". The h1->h3 skip is exact (home view) and the detail view skip is actually h1->h4 / h1->h3 (the detail view has NO h2 at all, not h2->h4). The literal "h2 -> h4" skip occurs in the About view (h2@795 -> h4@803), which the finding did not cite. Substance is fully correct; only the level-pair labeling is slightly imprecise about which view each skip lives in.

```
<h1 class="h1-display ...">أَقْمَارُ الطّوفان</h1> ... <h3 ... x-text="... 'ابحث عمّن شاركك يوم ميلادك' ...">
```

### 41. Initial registry load has no spoken progress; only the skeleton grid is announced

`webui/index.html:478-481, 520-526` · _Accessibility_ · confidence 90

**Problem.** On the browse view the skeleton has aria-busy + sr-only 'Loading registry…' and the result count is aria-live="polite" (good). But the HOME view — the default landing page — fetches the same data and shows previewMatches/onThisDay/stats with no loading indicator and no live region, so a screen-reader user landing on home during the fetch hears an empty page with no 'loading' cue and no announcement when content arrives. The result-count live region only exists on browse.

**Fix.** Reuse the same sr-only aria-live status used for the browse skeleton on the home view (announce 'loading' then 'N names loaded'), or expose a single app-level polite live region that announces data readiness regardless of current view.

**Verifier note.** The reviewer's claim that the SR user "hears an empty page" overstates it. The home view's static content (verse, hero headings, intro paragraph, the entire birthday-search form) is plain markup that renders and is fully readable immediately. What is actually missing is (a) any loading/progress cue and (b) any polite announcement when the data-derived teasers populate. Note also that onThisDay is hidden via x-show until data exists, so that block never announces at all rather than announcing late. Otherwise the finding, file, and line citations are accurate.

```
<div class="text-[13px] text-muted" aria-live="polite" aria-atomic="true"> <span x-text="filtered.length"></span> ... </div>  <!-- exists only in browse, not home -->
```

### 42. Hero subtitle renders Arabic text in a Latin serif stack and forces synthetic italic

`webui/index.html:191-192` · _RTL/Arabic_ · confidence 90

**Problem.** The hero subtitle uses `class="font-latin-serif italic ..."` but its x-text is Arabic ('ذاكرةٌ موصولةٌ بأسماءِ شهداءِ معركةِ طوفان الأقصى'). --font-latin-serif is defined as `"IBM Plex Sans", "Amiri", serif` (styles.css 30): IBM Plex Sans has no Arabic glyphs, so the Arabic falls through to Amiri (a Naskh serif) and then gets a CSS `italic` applied. Arabic script has no italic form, so the browser synthesizes a slanted/obliqued Arabic — typographically incorrect and visually awkward for the most prominent tagline on the landing page. The English variant of the same line legitimately wants italic serif, but the Arabic should not.

**Fix.** Use the Arabic display/naskh font for the Arabic branch and drop italic for Arabic — e.g. apply `font-display` (El Messiri) without `italic` when lang==='ar', and keep `font-latin-serif italic` only for the English string. Bind the class with `:class="lang === 'ar' ? 'font-display' : 'font-latin-serif italic'"`.

```
<div class="font-latin-serif italic text-[22px] text-muted mt-3.5" x-text="lang === 'ar' ? 'ذاكرةٌ موصولةٌ بأسماءِ شهداءِ معركةِ طوفان الأقصى' : 'A living memory ...'"></div>
```

### 43. Name/city search input filters live but has no debounce, no clear (✕) button, and no "searching" affordance

`webui/index.html:354-358` · _Public flow_ · confidence 90

**Problem.** The browse search box (filters.q, x-model) re-runs the filtered getter on every keystroke over the full dataset. There is no inline clear (✕) affordance inside the field (every date field in this same view has one — see clearBirthday/clearDateField — but the most-used text search does not), so to clear it the user must select-all-delete or hunt for the separate 'Clear' button that resets all five filters at once. With Arabic IME typing and a growing dataset this also means no debounce and no momentary 'filtering…' feedback; on slower devices the grid can stutter as it re-sorts on each character. The result count updates (good) but nothing signals that the empty grid is a no-results state versus mid-typing.

**Fix.** Add an inline ✕ clear button inside the search input (mirroring the date fields) bound to filters.q. Optionally debounce the input ~150ms (x-model.debounce.150ms) so large datasets stay smooth. The existing empty state already covers no-results once typing settles.

**Verifier note.** Accurate overall. Minor nuance: the user is not entirely without a clear mechanism — a shared "Clear" button exists (resets all 5 filters at once) and select-all-delete works; the real gap is the absence of a per-field inline ✕ that the date fields have. The "stutter on each character" claim is plausible but conditional (slower device + large dataset), so it is the weaker half of the finding; the missing inline clear is the more concrete, always-present part.

```
<input type="text" class="input" x-model="filters.q"
               :placeholder="lang === 'ar' ? 'اكتب اسماً…' : 'Type a name…'">
```

### 44. Whole registry renders at once — no pagination/virtualization on the public grid (admin table has it, public does not)

`webui/index.html:580-581` · _Public flow_ · confidence 90

**Problem.** The public browse grid does x-for over the full filtered list with no slice/limit, while each card runs renderPortrait (an HTML-string build with an <img>) — so every matching martyr is rendered immediately. The admin table deliberately caps at adminLimit (30) with a 'Show more' control (index.html:1200, 1279-1289), but the public grid has no equivalent. As the registry grows (the copy itself repeatedly says 'the registry keeps growing'), an unfiltered browse will mount hundreds/thousands of cards and images at once, causing a slow first paint and jank on mobile — the exact devices most visitors use. There is also no 'showing N of M' progressive control, only the total count.

**Fix.** Add a simple incremental cap to the public grid (e.g. render first 60, 'Show more' button or IntersectionObserver infinite scroll), reusing the adminLimit pattern. Images already use loading="lazy", but the DOM node count is the bottleneck — capping initial render is the high-leverage fix.

**Verifier note.** The reviewer's description is accurate. Minor refinement: because each card already uses loading="lazy" on its <img> (app.js:1052), off-screen image network/decode is deferred, so the dominant cost is Alpine's reactive binding overhead and raw DOM node count for hundreds of richly-bound cards — not image loading. The reviewer's proposed fix already correctly identifies "the DOM node count is the bottleneck," so the fix recommendation stands. At the current 426-record scale the impact is low (tolerable but degrading as the registry grows), not high.

```
<template x-for="m in filtered" :key="m.id">
        <button @click="openMartyr(m.id)" class="card card-hover text-right cursor-pointer relative overflow-hidden flex"
```

### 45. Detail-view "Back to registry" loses the visitor's previous filters/scroll and is the only way back

`webui/index.html:667-669` · _Public flow_ · confidence 90

**Problem.** The detail breadcrumb's only return path is a button that sets view='browse' (it does NOT call goto, so filters survive in state — good), but combined with the no-history finding, the browser Back button can't be used to return, and openMartyr scrolls to top, so after viewing a martyr and pressing 'Back to registry' the visitor lands at the top of the (still-filtered) list with no memory of which card they came from. On a long filtered list this means re-scrolling to find their place every time they open and close a detail — a real friction point when browsing several names in a battalion.

**Fix.** Remember the browse scroll position (capture window.scrollY before openMartyr, restore it when returning to browse via the breadcrumb), and pair with the hash-routing fix so the native Back button also works. This makes 'open a name, read, go back, open the next' fluid.

**Verifier note.** Minor clarification: the scroll-to-top occurs at open time (openMartyr), and the breadcrumb return path (view='browse') performs no scroll at all — it neither restores the prior position nor resets to top; the page simply remains where the detail view left it (top). The visitor-facing outcome the reviewer describes (lands at top of the still-filtered list, must re-scroll) is accurate.

```
<button @click="view = 'browse'" class="btn btn-text" style="padding:0;"
                  x-text="lang === 'ar' ? '← العودة إلى السجلّ' : '← Back to registry'"></button>
```

### 46. Editing the portrait slide flags spurious "unsaved changes" and the save validator then blocks Save

`webui/app.js:168-174` · _UI bug_ · confidence 90

**Problem.** The $watch('carouselIdx') handler sets draft.featuredFrame = null whenever the current slide is NOT a frame (i.e. the portrait). So for a row that already has a saved cover frame: editMartyr() opens on the saved frame, then if the admin clicks Prev back to the portrait, the watcher sets draft.featuredFrame = null, which makes draftDirty() (app.js:675-685) compare null vs the saved frame and light the 'تغييرات غير محفوظة / unsaved changes' badge — even though the admin only navigated and changed nothing of intent. If they then click Save, saveEdit()'s guard (lines 704-711) alerts '⚠ pick a frame before saving' and aborts. The net effect is a confusing 'you have unsaved changes' that you cannot save without navigating back to a frame.

**Fix.** Only mutate draft.featuredFrame from the watcher when the current slide is a frame; leave it untouched (don't null it) on the portrait so navigating away from a saved cover doesn't register as a pending change. Clearing the cover should be an explicit action, not a side effect of viewing the portrait.

```
this.$watch('carouselIdx', () => { ... this.draft.featuredFrame = (current?.kind === 'frame') ? denormalizePath(current.src) : null; });
```

### 47. Martyr portrait <img> always gets empty alt, so the detail-hero and zoom photo are invisible to screen readers

`webui/app.js:1046-1067` · _Accessibility_ · confidence 88

**Problem.** renderPortrait() hard-codes alt="" on every martyr photo regardless of context. In the browse cards that is acceptable (the card button is labelled by the adjacent name text), but the same function renders the LARGE detail-page hero portrait (index.html:679, size 200) and is the primary subject there, and the zoom lightbox uses the same `:src` photo. On the detail page a screen-reader user gets a heading with the name but the portrait — the emotional and informational centre of a memorial entry — is announced as nothing. For a memorial site whose purpose is to preserve faces and names, the person's own photo being alt="" is a real loss.

**Fix.** Pass an `alt`/`decorative` argument into renderPortrait. For the detail hero and lightbox render alt = `lang==='ar' ? 'صورة الشهيد '+name : 'Portrait of '+name`; keep alt="" only for the redundant card/list thumbnails where the name is already in the labelled control.

**Verifier note.** renderPortrait (webui/app.js:1051-1053) hard-codes alt="" on the photo img; this function renders the public detail-page hero portrait (index.html:679, size 200), which is the primary subject yet gets no accessible name, while the redundant browse-card thumbnails correctly stay decorative. The reviewer's claim that the zoom lightbox shares this bug is wrong: the lightbox/carousel (index.html:875-878) is admin-only, does not use renderPortrait, and already sets `:alt="editingMartyr()?.name || ''"`. Fix: pass an alt argument into renderPortrait and set `alt = lang==='ar' ? 'صورة الشهيد '+name : 'Portrait of '+name` for the detail hero only; keep alt="" for the card/list thumbnails.

```
const photoHtml = photo ? `<img src="${esc(photo)}" alt="" loading="lazy" ...>` : '';
```

### 48. Breadcrumb 'Back to registry' arrow is hardcoded ← for both languages (wrong direction in RTL)

`webui/index.html:668-669` · _RTL/Arabic_ · confidence 88

**Problem.** The detail-view back button hardcodes a left-pointing arrow in both languages: `lang === 'ar' ? '← العودة إلى السجلّ' : '← Back to registry'`. In an RTL layout 'back/previous' should point to the right (→), so in Arabic the arrow points the wrong way. This is confirmed as an oversight (not a deliberate choice) by contrast: the dev DID mirror the edit carousel prev/next arrows (lines 860/866: `lang === 'ar' ? '→' : '←'`) and the Save & Next arrow (line 1119: `lang === 'ar' ? '←' : '→'`), so directional mirroring is the established pattern everywhere except this breadcrumb.

**Fix.** Mirror the arrow by language like the other controls: `lang === 'ar' ? '→ العودة إلى السجلّ' : '← Back to registry'` (Arabic back = →). Keep the English ←.

**Verifier note.** Reviewer severity "medium" is slightly overstated. The button has explicit clarifying text ("العودة إلى السجلّ"), so the wrong-direction arrow is a decorative/consistency blemish only — it does not impair the button's function or comprehensibility. Real but low-impact polish. The proposed fix (`lang === 'ar' ? '→ العودة إلى السجلّ' : '← Back to registry'`) is correct and matches the codebase's existing mirroring pattern.

```
x-text="lang === 'ar' ? '← العودة إلى السجلّ' : '← Back to registry'"
```

### 49. Admin edit carousel has no touch swipe — navigation relies on arrows that overlap the image

`webui/styles.css:232-248` · _Responsive_ · confidence 88

**Problem.** The edit carousel (index.html 853-916) is navigated only by prev/next arrow buttons and the thumbstrip; there is no touchstart/touchmove swipe handler in app.js (carouselPrev/carouselNext are click-only). The arrows are absolutely positioned 44px circles inset 12px over the image (.edit-carousel-arrow), so on a phone the admin taps directly on the photo region to advance, and tapping the image itself fires @click="photoZoomed = true" (index.html 877) — opening the zoom modal instead of advancing. The intuitive mobile gesture (swipe) does nothing, and the touch zones for arrow-vs-zoom overlap.

**Fix.** Add touchstart/touchmove swipe handlers that call carouselPrev/carouselNext, and/or move the next/prev arrows out from over the image into a control bar below the stage on touch widths so they don't fight the zoom tap target.

**Verifier note.** Code confirmed (styles.css 232-248; index.html 856/863/877; no swipe handler in app.js). One refinement: the arrows do not actually fight the zoom tap target on the same pixels — they are corner-inset (inset 12px, vertically centered) with z-index:2, so tapping an arrow advances correctly. The real issue is two-fold: (a) no touchstart/touchmove swipe gesture, so the intuitive mobile swipe does nothing, and (b) the large central region of the image is bound to the zoom modal, so a tap there zooms rather than advancing. Also note this is the admin-only edit screen (single owner user), not the public site, which is why impact is low rather than medium.

```
.edit-carousel-arrow { position: absolute; top: 50%; ... width: 44px; height: 44px; ... }  /* arrows over image; no swipe in app.js */
```

### 50. Per-column filter row has no per-cell clear and is visually indistinguishable from a data row; status filter not reset by it

`webui/index.html:1185-1197` · _Admin tool_ · confidence 88

**Problem.** The per-column filter inputs sit in a second <tr> styled identically to the header band (bg-page-2) and have only a generic 'filter…' placeholder — there's no per-input ✕ to clear a single column, and no visual affordance that this row is interactive filter inputs vs. frozen header. To clear one column the admin must select-all/delete in that input or hit the global 'Clear filters' button (which also resets search AND the status pill, line 604-608). When a filter yields nothing, the empty-state row (1268-1274) offers 'Clear filters' which nukes everything including the status filter the admin deliberately set, rather than just the column filter that emptied the result.

**Fix.** Add a small ✕ inside each filled per-column filter input to clear just that column. Consider a lighter background or a 'filter' icon so the row reads as inputs. Optionally split 'Clear filters' into 'Clear column filters' vs 'Reset all' so clearing a too-narrow column filter doesn't also drop the status selection.

**Verifier note.** The core code claims are accurate, but the reviewer's line reference "604-608" for the global Clear-filters button is wrong as written: in webui/index.html lines 604-608 are a martyr card info block. The actual global "Clear filters" button is at index.html:1139-1141 (shown when adminSearch || adminStatusFilter !== 'all' || any adminColFilters value); the function that resets the status pill (adminClearFilters) is at webui/app.js:604-608 — the reviewer conflated the two files. Substance otherwise holds.

```
`<input x-show="col.filterable" :value="adminColFilters[col.id]" @input="adminColFilters[col.id] = $event.target.value" class="input w-full" ... :placeholder="lang === 'ar' ? 'تصفية…' : 'filter…'">` — no clear button per cell.
```

### 51. Date fields are readonly so birth/martyrdom dates cannot be typed — picker-only entry slows correction of OCR dates

`webui/index.html:1009-1015` · _Admin tool_ · confidence 88

**Problem.** Both draft date inputs are `type="text" readonly`, forcing every date through the Litepicker calendar. The inline comment (1000-1003) explains this is deliberate — to stop the admin re-introducing malformed strings like the OCR output. That rationale is sound, but for the common case where the admin already knows the exact date (e.g. correcting OCR '1985-06' to a precise day), navigating a calendar's year/month dropdowns is several clicks vs. typing 8 digits. There's no keyboard fast-path.

**Fix.** Keep the picker as the safe default, but consider allowing typed input that is validated against the same YYYY-MM-DD regex before being accepted (reject malformed input rather than blocking all typing). Acknowledged trade-off — low priority given the stated intent.

```
`<input type="text" readonly x-ref="draftBirthInput" x-init="initDraftDatePicker($el, 'birth')" x-model="draft.birth" ... class="... cursor-pointer">`
```

### 52. CLAUDE.md describes side-by-side raw OCR review, but the edit form surfaces only source-frame images — no raw ocr_* text

`webui/admin-edit.js:17-38` · _Admin tool_ · confidence 88

**Problem.** The project notes describe the admin reviewing rows 'side-by-side with the raw OCR (kept in ocr_* columns)'. In practice the edit form shows the parsed/structured values in the editable inputs (on an unverified row those inputs ARE the OCR parse) plus the original video frames as images in the carousel — but the raw ocr_* text strings are never displayed for comparison. The field-reverse map and adapter both intentionally exclude ocr_* columns. So the admin compares 'parsed value' against 'frame image' (a deliberate, reasonable design per the index.html ~845-852 comment), but cannot see the raw OCR string the parser worked from — useful when the parser mangled an otherwise-correct OCR read. This is a gap between the documented expectation and the shipped UI, not a daily blocker.

**Fix.** If raw-OCR comparison is desired, add a small collapsible 'raw OCR' panel under each frame showing the ocr_name/ocr_birth/ocr_martyrdom text the parser ingested. Otherwise, update CLAUDE.md to say the admin verifies parsed fields against the source frame images (the actual implemented design).

```
FIELD_REVERSE_MAP comment: `// ... no msg_id / verification_status / audit timestamps / ocr_* fields`; grep for ocr_ in webui/ returns only this comment — ocr_* values are never rendered.
```

### 53. Vertical rhythm between landing sections is set by scattered ad-hoc inline/utility margins

`webui/index.html:201, 284, 312` · _Visual/tone_ · confidence 88

**Problem.** Landing section spacing is hand-tuned with mismatched mechanisms: the birthday card uses mt-14 (Tailwind), the 'On this day' section uses class mt-18 AND an inline style="margin-top: 72px;" (the inline value wins and 72px ≠ mt-18's intent of 4.5rem), and the stats strip uses mt-14 again. The double-declared margin on 'On this day' is a smell, and the rhythm between the three stacked blocks is uneven (card→anniversaries gap differs from anniversaries→stats). On a memorial, consistent calm spacing reinforces gravitas; uneven gaps read as floaty.

**Fix.** Pick one spacing source. Define a vertical-rhythm token/utility (e.g. a --space-section value) and apply the same top margin to the three landing blocks; remove the redundant inline margin-top:72px so the class is authoritative.

**Verifier note.** The reviewer said "the inline value wins and 72px ≠ mt-18's intent of 4.5rem." That is slightly imprecise. The project uses the plain Tailwind Play CDN (https://cdn.tailwindcss.com at L29) with NO tailwind.config extending the spacing scale (confirmed: no tailwind.config anywhere in webui/). In default Tailwind the spacing scale has mt-14 (3.5rem) and mt-16 (4rem) but NO mt-18 — so `mt-18` generates no CSS at all and is inert. There is therefore no class-vs-inline "conflict" being won; the inline `margin-top: 72px` is the SOLE source of that section's top margin, and the `mt-18` class is dead. This actually strengthens the finding (a no-op utility class is sitting in the markup alongside the real inline value). Also note mt-18's "intent of 4.5rem" is the reviewer's inference; 4.5rem = 72px, so the author likely added the inline 72px precisely because mt-18 didn't exist. The substantive UX point — inconsistent/uneven vertical rhythm (56/72/56) hand-tuned via two different mechanisms — is correct.

```
<div class="hero-pad mt-14 ..."> … <section class="mt-18" x-show="onThisDay.length > 0" style="margin-top: 72px;"> … <div class="stats-strip mt-14 grid gap-0">
```

### 54. Detail-hero name uses the same type size as section titles, weakening the page's focal point

`webui/index.html:683, 369-373` · _Visual/tone_ · confidence 85

**Problem.** On the martyr detail page the person's name — the single most important element, the reason the page exists — is rendered at font-size: var(--text-2xl), the exact same step used for generic section titles like 'Names not forgotten' and 'An open, faithful memory'. The name should sit at the top of the type hierarchy (closer to --text-hero / a dedicated larger step) to give the individual gravitas; at --text-2xl it competes with the surrounding chrome (the 'الشهيد/Martyr' kicker, dates strip headers) rather than commanding the layout.

**Fix.** Bump the detail name to a larger, distinct step (e.g. a clamp between --text-2xl and --text-hero, or introduce a --text-name token) so the name is unambiguously the primary text on the page, with breathing room above the badges.

**Verifier note.** The reviewer cited "lines 369-373" as the section-title comparison, but in webui/index.html those lines are actually the Rank-filter dropdown options, not a section title. The real section titles are at index.html lines 346 and 795 (class="section-title"); the shared --text-2xl sizing is defined in webui/styles.css lines 369-371 (the styles.css line range coincidentally matches the cited numbers). Also, the name uses font-bold (700) vs the section-title's font-weight 500, so the type is not literally identical — only the font-size step (--text-2xl) is shared. The hierarchy point stands.

```
<h1 class="font-display font-bold text-ink m-0 leading-[1.1]" style="font-size: var(--text-2xl); overflow-wrap: break-word; word-break: break-word;" x-text="current.name"></h1>
```

### 55. Grid-mode delta badge fixed white-on-tan ignores the gold brand and is the loudest thing on each card

`webui/index.html:592-597` · _Visual/tone_ · confidence 80

**Problem.** In grid cards the birthday-proximity badge is overlaid on the photo with color:var(--paper) on rgba(31,61,43,0.85) (dark green, same-day) or rgba(138,109,59,0.85) (tan, otherwise). The tan-on-photo pill is bright and busy over the (already pastel) portrait, and it uses the orphaned green 31,61,43 that no longer matches the gold --forest used everywhere else for accents. The list-mode equivalent (lines 627-632) uses tasteful low-opacity tinted text instead, so the two view modes are inconsistent. The badge dominates the card visually over the martyr's name.

**Fix.** Bring the grid badge in line with the gold accent system and the quieter list-mode treatment — e.g. a small gold-tinted translucent pill (rgba(251,191,36,0.16) bg, --forest text) with a backdrop blur, sized down so the name remains the primary element.

**Verifier note.** The grid badge text is color:var(--paper) where --paper = #142914 (a dark green), NOT white, and the same-day background rgba(31,61,43,0.85) is also dark green — so the same-day badge is dark-green-on-dark-green (low contrast / hard to read), not "white-on-tan." The only tan pill is the non-same-day variant rgba(138,109,59,0.85). The badge is also not always present: it only renders during a birthday-proximity search (when m.delta is finite), so normal browsing never shows it. The core point stands: grid mode uses a loud near-opaque pill while list mode uses quiet 0.10-opacity tinted text (inconsistent), and the grid pill ignores the gold --forest accent in favor of the orphaned rgba(31,61,43) green.

```
:style="m.delta === 0 ? 'color: var(--paper); background: rgba(31,61,43,0.85); backdrop-filter: blur(4px);' : 'color: var(--paper); background: rgba(138,109,59,0.85); backdrop-filter: blur(4px);'"
```

### 56. Birthday-search 'custom days' number input is too narrow and the ± row can crowd at 480px

`webui/index.html:249-254` · _Responsive_ · confidence 72

**Problem.** When the 'custom' window pill is active, an inline ± + number input (width:80px, padding 6px 10px) + 'days' label render in the same flex row as the five window pills (index.html 235-254). At 480px the pills already wrap (flex-wrap), but the custom input row appends after them; the 80px number field plus stepper spinner can be tight, and on touch the native number spinner arrows are below 44px. Minor since 'custom' is an opt-in path.

**Fix.** On narrow widths give the custom row its own full-width line (it already lives in .grid-bday-window which is full width <=768px), and bump the number input height to ~40-44px for touch. Consider hiding native spinners and providing larger +/- buttons.

**Verifier note.** The custom input row already wraps (flex-wrap on the parent at index.html:235) and the window block already occupies a full-width line at <=768px (styles.css:436-438, grid-column:1/-1), so it does not "crowd" or overflow at 480px — it wraps. The genuinely valid concern is just the touch-target size: the inline override (padding:6px 10px; font-size:13px) makes the number input ~28-30px tall, below the ~44px touch minimum, and the native number-spinner arrows are smaller still. Fix = increase the input height to ~40-44px on touch widths (and optionally swap native spinners for larger +/- buttons); the "full-width line" part of the original fix is already in place.

```
<input type="number" min="1" max="365" x-model.number="bdayCustomDays" class="input" style="width: 80px; padding: 6px 10px; font-size: 13px;">
```

### 57. Birthday-search and date-picker fields rely on click-only readonly inputs with no keyboard hint

`webui/index.html:222-231, 1009-1021, 1030-1036` · _Accessibility_ · confidence 60

**Problem.** The birthday picker and the admin birth/martyrdom date inputs are `<input type="text" readonly>` whose placeholder says 'انقر لاختيار / Click to pick'. They are wired to open Litepicker on focus/click. A readonly field is focusable and Litepicker generally opens on focus, but the visible affordance and placeholder explicitly say *click* — keyboard-only users get no signal that focusing (Tab) opens the picker, and `readonly` removes the field from some form-control expectations. If Litepicker is configured to open on click only, keyboard users cannot set a date at all.

**Fix.** Confirm Litepicker opens on focus/Enter (it does by default) and reword the placeholder/aria to 'اختر تاريخاً / Choose a date' rather than 'click'. Add an aria-label on each picker input ('تاريخ الميلاد'/'Birth date') since the .field-label <div> is not programmatically associated, and ensure the Litepicker popup is keyboard-navigable.

**Verifier note.** The placeholders on the birthday and admin birth/martyrdom date inputs (index.html:224, 1013, 1034) say "انقر لاختيار / Click to pick", which gives keyboard-only users no hint that focusing the field (Tab) opens the Litepicker — mild friction. Recommended fix: reword to "اختر تاريخاً / Choose a date". The reviewer's two stronger claims are incorrect: (a) the inputs ARE programmatically labeled via the wrapping `<label>` element (implicit association with the field-label div), so an added aria-label is redundant; and (b) keyboard users CAN open the picker — Litepicker is created with `element: el` (app.js:895, 960) with no click-only restriction, so focus opens it by default. There is no risk that keyboard users "cannot set a date at all."

```
<input type="text" x-ref="birthdate" readonly x-init="initBirthdayPicker($refs.birthdate)" :placeholder="lang === 'ar' ? 'انقر لاختيار تاريخ ميلادك' : 'Click to pick your birthday'" ...>
```

### 58. Sort <select> has min-width:200px that can overflow / push the view-mode toggle off the row on small phones

`webui/index.html:485-491` · _Responsive_ · confidence 60

**Problem.** The browse sort control is a <select> with inline `min-width: 200px`, sitting in a flex row with the grid/list view-mode toggle group and wrapped in flex-wrap (index.html 483). At 360px the 200px select plus its label plus the toggle group exceed the row; flex-wrap rescues it by stacking, but the 200px min-width forces the select nearly edge-to-edge and, combined with the 'Sort' label, can still cause the toggle to wrap awkwardly under it. Functional but not tuned for the smallest widths.

**Fix.** Drop the min-width to e.g. min-width:160px or let it be width:100% on <=480px so the select fills its line cleanly and the view toggle sits on its own row predictably.

**Verifier note.** The select does NOT overflow. flex-wrap on the row (index.html:483 and :477) handles it without any horizontal scroll, and 200px is well under any real phone viewport, so nothing is clipped or pushed off-screen. The view-mode toggle wrapping to its own line on a narrow phone is benign, expected responsive behavior — not "awkward." The only genuine, purely cosmetic residual is that the select stays pinned at 200px (inline min-width overrides the .select width:100%) and does not fill its wrapped line on small phones, leaving dead space; the proposed min-width:160px / width:100%@480px tweak cleans that up.

```
<select class="select" style="padding: 6px 32px 6px 12px; font-size: 13px; min-width: 200px;" x-model="sort">
```

### 59. Admin banner uses a loud gold gradient that reads as a generic SaaS dashboard header

`webui/index.html + styles.css:index.html 816-820; styles.css 107` · _Visual/tone_ · confidence 55

**Problem.** The admin banner is a full-bleed bright gold gradient (.bg-forest-grad = linear-gradient of --forest #fbbf24 → --forest-2) with large bold white text 'Registry editing dashboard' and an 'EDITOR · ADMIN MODE' kicker. It is by far the most saturated, brightest block in the entire product and tonally pivots the experience from solemn memorial to a typical bright admin SaaS panel. The same loud gradient is reused for the 'Watch source video' CTA (index.html 945), doubling the startup-dashboard feel inside the edit flow.

**Fix.** Mute the admin banner to a dark surface with a thin gold accent (e.g. background var(--bg-2)/--paper with a 3px border-inline-start in --forest, gold kicker text) so admin mode stays visually within the memorial's restrained system rather than overriding it. Reserve full gold fills for tiny accents.

**Verifier note.** The admin banner (index.html:816) and the reused "Watch source video" CTA (index.html:945) both use `.bg-forest-grad` (styles.css:107), a bright gold-to-gold gradient (#fbbf24 → #d4a020) — by far the most saturated blocks in an otherwise very dark green palette, which tonally shifts admin mode toward a generic bright dashboard. Two corrections to the reviewer's wording: (a) the banner text is `text-paper` = dark green (#142914), NOT white; it is dark text on gold. (b) The loudness of the video CTA is an explicit, documented design choice (index.html:939 comment) to highlight the sole OCR-recovery path. The concern is valid but subjective/low-impact: it affects only the single admin user, in admin mode only, and breaks nothing.

```
<div class="admin-banner bg-forest-grad text-paper px-7 py-5 rounded-lg ...">  …  .bg-forest-grad { background: linear-gradient(110deg, var(--forest) 0%, var(--forest-2) 100%); }
```

---

# Part B — Cross-cutting themes

A few findings are really one root cause showing up in many places — fixing the root fixes the list:

- **Arabic-Indic digits leak everywhere.** Dates, ages, the lifespan timeline, record IDs, and the
  Litepicker calendars all render Western digits in Arabic mode. `toArDigits()` exists but is not applied
  in `formatDate`/`formatDateTime`/`ageLabel`/`renderTimeline`. One systemic fix clears findings on RTL.
- **No focus management on view changes.** The SPA swaps `view` and scrolls to top but never moves DOM
  focus, so keyboard/screen-reader users are stranded after every navigation — and the destination view
  is `aria-hidden`-toggled, so focus can land in a hidden subtree. One `$nextTick` focus helper fixes the
  whole class (home->detail, Edit->form, Save & Next).
- **The admin cover-frame model is "carousel position == saved cover".** That single decision produces
  three findings: cannot verify while on the portrait, inspecting a frame silently reassigns the cover,
  and viewing the portrait flags spurious unsaved changes. Decoupling "currently viewing" from "chosen
  cover" (an explicit "Set as cover" action) resolves all three.
- **Success is never confirmed.** Save / Save & verify / Reject only signal *failure* (via `alert`).
  Sighted admins infer success from the form closing; screen-reader admins get nothing. An
  `aria-live` status region used on success covers it.

---

# Part C — Higher-level UX directions

Bigger moves worth considering, beyond line-level fixes.

### 1. Give every martyr a real, shareable URL (deep-link routing + Open Graph cards)  ·  _large effort_

This is the single biggest gap for a memorial. Confirmed: openMartyr() (app.js:242) only sets selectedId + view in memory — there is no location.hash, pushState, or popstate anywhere (grep confirms), and grep for 'og:' in index.html returns 0. So a martyr's page cannot be linked, bookmarked, opened in a new tab, found by search engines, or shared to WhatsApp/Telegram/X with a name+photo preview. For a memorial whose entire purpose is 'أَسْمَاءٌ لا تُنسَى' (names not forgotten) and that explicitly invites sharing, an un-shareable individual page defeats the mission. The back button also does nothing useful today. On GitHub Pages you can do hash routing (#/m/123) with zero server, and pre-render lightweight per-martyr static HTML stubs (name, dates, photo, OG/Twitter tags) at publish time so link unfurls show the person.

- **Touches:** app.js (goto/openMartyr/init — add hash sync + popstate listener), index.html <head> (per-view OG/Twitter meta updated alongside __updateTitle), a new publish-time step in scripts/export_to_json or a small generator to emit per-martyr static stub pages with baked-in meta for crawlers/unfurlers.
- **Payoff:** A shared link to شهيد X shows his name and photo in the chat preview and opens directly on his page; browser back/forward and bookmarks work; search engines can index each name. This turns the site from a private browser into a memorial people actually circulate — the reach a memorial lives or dies by.

### 2. Deepen the individual memorial page beyond a data sheet  ·  _medium effort_

The detail view (index.html:661-790) is dominated by two key/value tables (personalRows/militaryRows, app.js:411-426) plus a lifespan tick-chart. The only narrative field is current.bio, which is null for most rows (config sample sets it null ~70% of the time, and OCR rarely produces prose). So most martyrs render as a name, two dates, an age, and a few military pills — emotionally flat for a memorial. The hero verse and 'الموتى لا يَموتون ما دامت أسماؤُهم تُذكَر' framing set an expectation the per-person page doesn't meet. There is also no way for a family member or comrade who lands on the page to add a memory, correction, or photo — 'Add photo' (index.html:714) and the upload button (index.html:962) are disabled/non-functional.

- **Touches:** index.html detail section (bio block ~719, the disabled Add-photo buttons ~714/962), app.js (a contribute handler; could route to @AqmarTofan or a mailto with the row id), optionally a 'tributes' field surfaced read-only from a moderated source.
- **Payoff:** Each شهيد feels remembered as a person, not a row: a dignified empty-state when bio is missing ('سيرته قيد التوثيق — أضف ما تعرفه'), a prominent, working 'contribute a memory / correction' path (even just a pre-filled Telegram/mailto to the channel), and room for multiple photos. This is what makes families return and share.

### 3. Make mobile the lead experience, not a reflow of desktop  ·  _medium effort_

Most visitors are on phones, but the layout is desktop-first reflowed down: the home hero leads with a birthday-search card (index.html:201-281) whose primary action (runBirthdaySearch) shows nothing until the user opens a Litepicker and picks a full date — a heavy first interaction on a small screen. The browse grid renders fixed 260px min-column cards (index.html:579) and the detail page uses 44-48px padding (index.html:677). Filters collapse to 1-2 columns but there are still 5 selects + an advanced panel stacked vertically — a long scroll before any name appears on a phone. Nothing greets a phone visitor with martyrs immediately; discovery is gated behind form input.

- **Touches:** index.html home section ordering (lead with content, demote the birthday form or make it a one-tap entry), browse card sizing + filter collapse behavior, styles.css breakpoints (768/480 already exist — tighten card minmax and spacing there).
- **Payoff:** A phone visitor sees faces and names in the first screen (e.g. 'On this day' / recent / a rotating remembered martyr) before touching a control; tap targets, card density, and filter ergonomics are tuned for thumbs. The emotional first impression lands instead of a form.

### 4. Plan for scale: paginate/virtualize browse and serve responsive thumbnails  ·  _medium effort_

The public browse grid renders the entire filtered list in one x-for with no slice or virtualization (index.html:580 'x-for="m in filtered"'), unlike the admin table which caps at adminLimit=30. Today that is 426 rows (martyrs.json is 255KB and growing), each rendering a portrait <img> of a full-resolution JPG (renderPortrait, app.js:1046, only loading="lazy", no srcset/thumbnail). The registry is described as 'قيدُ النموّ المستمر' — at a few thousand rows this becomes thousands of DOM nodes + thousands of full-size images decoded on a phone, with a single monolithic JSON blocking first paint. The skeleton (index.html:520) hides the cold start but not the steady-state cost.

- **Touches:** index.html browse grid (add a render cap + 'show more' like the admin table, or windowed rendering), app.js (a visibleCount mirroring adminLimit), a thumbnail-generation step in the photo pipeline / export, renderPortrait srcset, possibly chunking martyrs.json.
- **Payoff:** Browse stays fast as the archive grows to thousands: incremental rendering (load-more or windowing) keeps the DOM light, and pre-generated thumbnails (or width-constrained srcset) cut image bytes by an order of magnitude. The site honors visitors on slow mobile connections in Gaza-adjacent regions instead of stalling.

### 5. Turn the admin verification loop into a keyboard-driven, low-friction workflow  ·  _medium effort_

The admin uses this daily to clear the unverified queue, and the bones are good (Save & next at app.js:755 jumps to the oldest unverified row). But the flow is entirely mouse-driven: no keyboard shortcuts to Save/Reject/Next or to cycle carousel frames (carouselPrev/Next, app.js:658, are arrow-button only), and destructive/important actions use blocking native dialogs — confirm() on reject (app.js:794), window.prompt() for the publish note (app.js:772), alert() for the frame-not-picked guard (app.js:707) and every error. There are also no batch actions: each row is verified one modal-screen at a time, and there's no 'bulk verify these N obviously-good rows' or multi-select.

- **Touches:** app.js (saveEdit/saveAndNext/rejectEdit/carouselPrev/Next — add @keydown.window bindings in the admin edit view; replace alert/confirm/prompt with an in-app toast + confirm component), index.html admin edit panel + table (selection checkboxes, shortcut hints), a small toast/confirm UI in styles.css.
- **Payoff:** The admin clears the daily queue far faster: J/K or arrows to move through frames, Enter to Save & next, R to reject, all without leaving the keyboard; non-blocking toasts replace alert()/confirm() so saves don't freeze the page; optional multi-select for batch-verifying clean rows. Higher throughput means more martyrs published sooner.

### 6. Add a guided, emotionally-paced discovery layer (timeline / on-this-day as a destination)  ·  _medium effort_

Discovery today is three disconnected mechanisms: a birthday-proximity search (the hero), an 'On this day' anniversary strip (index.html:284, capped at 6, only on home), and a filter-heavy registry. There is no coherent narrative entry for a casual visitor who doesn't have a name or birthday in mind — no 'browse by the day they fell', no chronological timeline of the war, no 'remember someone at random'. The dayDelta anniversary logic (app.js:265-276) is rich but buried as a home teaser. The IA (home/browse/detail/about) is functional but treats the archive as a database to query rather than a memorial to walk through.

- **Touches:** app.js nav array (app.js:49 — add a discovery/timeline view), onThisDay getter (lift the cap, give it its own route), a new grouped-by-date browse mode reusing filtered/sortRows, index.html new section.
- **Payoff:** A visitor with no specific person in mind is still drawn in: a dedicated 'في مثل هذا اليوم' page, a war-timeline view grouping martyrs by date of martyrdom, and a 'remember one' prompt give emotional on-ramps. Anniversaries become a reason to return, and the archive reads as remembrance, not search results.

### 7. Treat accessibility as first-class for an Arabic, screen-reader, low-vision audience  ·  _small effort_

Several concrete gaps: every portrait renders alt="" unconditionally (renderPortrait, app.js:1052) — real martyr photos are marked decorative, so a screen-reader user hearing the registry gets names with no indication a face is present, and the name should be the img's accessible label. All five views are always in the DOM (x-show, not x-if) with content present; :aria-hidden is toggled (index.html:178 etc.) which helps, but it's fragile and every off-screen view's controls still exist. The status banners use color + emoji to convey meaning, and admin status pills lean on color (olive/forest/crimson) — borderline for color-blind users. Native confirm/alert (noted above) are also poor for AT. For a memorial meant to be 'للجميع' (for everyone), the names must be reachable by everyone.

- **Touches:** app.js renderPortrait (set alt to the martyr name when a real photo is shown, keep empty only for the monogram placeholder), index.html (audit x-show vs x-if for views, ensure status/pills carry text or aria-label not just color), the alert/confirm replacement from the admin direction.
- **Payoff:** Screen-reader and low-vision visitors can navigate the registry and read each martyr; the experience matches the inclusive promise in the About copy. Small, high-confidence fixes with outsized dignity payoff.

### 8. Add a clear public 'how to correct or contribute' channel surfaced site-wide  ·  _small effort_

The project's stated ethos is an open archive that 'يقبل التصحيح والإضافة' (index.html:348-349) and 'كلّ اسم مدخلٌ مفتوحٌ يقبل التصحيح والإضافة'. But for the public there is no actual mechanism to submit a correction or a missing martyr — the only contribution surface is the disabled admin-only upload button and the @AqmarTofan footer link. A family member who spots a wrong birth date or a missing شهيد has nowhere to go. Given OCR provenance (dates are machine-extracted and often wrong), crowd correction is exactly the safety net the data needs, and it deepens the memorial's communal ownership.

- **Touches:** index.html detail view + about view + footer (a visible 'صحّح هذه البيانات / أضف شهيداً' affordance), app.js (a handler building a pre-filled mailto/Telegram deep link with the martyr id, or posting to a lightweight moderated suggestions endpoint surfaced as a new admin status).
- **Payoff:** Visitors who knew the martyr can flag errors or propose additions (routed to the admin queue or to Telegram/email with the row id pre-filled), making the archive more accurate over time and giving the community a genuine stake — fulfilling the 'open, faithful memory' promise the About page makes.

---

# Appendix — Findings dropped on verification

- **Viewport meta lacks viewport-fit=cover and no safe-area insets — sticky header/footer clip on notched phones in landscape** (`webui/index.html:20`) — impact none, confidence 88, real=False. The cited code exists exactly as described: webui/index.html line 20 is `<meta name="viewport" content="width=device-width, initial-scale=1" />` with no `viewport-fit=cover`, and a grep across all of webui/ found ZERO uses of `viewport-fit` or `env(safe-area-inset-*)`. The header at line 92 is `clas
- **Hero card top-corner accent bars: olive bar carries a redundant inline color override and reads as a stray mark** (`webui/index.html:203-204`) — impact none, confidence 90, real=False. The cited code exists verbatim at webui/index.html:203-204:
  <div class="absolute top-[-1px] start-6 w-16 h-[3px] bg-forest"></div>
  <div class="absolute top-[-1px] end-6 w-6 h-[3px] bg-olive" style="background: var(--olive);"></div>

But the finding's central, actionable claim is FACTUALLY WRONG.

---

_Report only — no code was changed. Generated from a 7-reviewer verified UX workflow on 2026-05-29._