/* ============================================================== */
/* AQMAR — Alpine.js application                                  */
/* Drop into webui/app.js                                          */
/* ============================================================== */

function aqmar() {
  return {
    // ----- routing & ui state -----
    view: 'home',            // home | browse | detail | admin | about
    lang: 'ar',
    isAdmin: false,
    showLogin: false,
    loginUser: '',
    loginPass: '',
    loginError: '',
    selectedId: null,
    editingId: null,
    photoZoomed: false,       // admin edit: big-image click opens fullscreen lightbox of carouselCurrent()
    carouselIdx: 0,           // admin edit: index into carouselImages() (portrait + frames combined). Reset to 0 on every editMartyr / cancel / save / reject / logout.
    draft: {},
    edits: {},
    adminSearch: '',
    // Admin table filters + sort. Status filter is the headline control (the
    // verification workflow's whole point), so it gets prominent pill buttons
    // above the table. Per-column filters live in a row below the headers.
    adminStatusFilter: 'all',   // 'all' | 'unverified' | 'verified' | 'rejected'
    // AI verification filter (second pills row): 'all' | 'ai' (AI-checked) |
    // 'pending' (eligible for AI = human-unverified, not yet AI-checked).
    // ANDed with adminStatusFilter — they're independent dimensions.
    adminAiFilter: 'all',
    adminColFilters: {
      name: '', born: '', martyrdom: '', city: '', battalion: '', brigade: '',
    },
    // Default sort puts the most-recently-scraped rows at the top so the admin
    // sees fresh OCR output first when opening the dashboard. Status pills above
    // the table still let them filter to 'unverified' (the verification queue)
    // and the Status column header is one click away if they want isVerified-first.
    adminSortBy: 'addedAt', // any of adminCols[].id
    adminSortDir: 'desc',   // 'asc' | 'desc' — DESC = newest first for addedAt
    adminLimit: 30,           // pagination cap for the admin table — bumped by "Show more"
    mobileNavOpen: false,
    _initialized: false,      // guards init() against Alpine's double-invoke (auto init() + x-init)
    loading: true,            // true until the initial loadData() resolves (or errors out)
    loadError: null,          // set to an i18n error string when all 3 data sources fail — drives the retry UI
    lastSyncIso: null,        // most recent posted_date across all rows — drives the footer "Last sync"
    dataSource: null,         // 'api' | 'static-json' | 'sample-data' | null — drives the banner copy
    publishedVersion: null,   // version number from data/martyrs.json if loaded from snapshot

    // ----- global settings (data/settings.json) -----
    events: [],            // global events, sorted ascending by start_date
    settingsVersion: 1,
    // Admin events editor. eventForm null = closed; otherwise a working copy
    // {id, name_ar, name_en, start_date, end_date} (empty strings for blank).
    eventForm: null,
    eventError: '',
    eventSaving: false,

    // ----- data -----
    all: [],
    cities: [],
    ranks: [],
    weapons: [],
    battalions: [],
    brigades: [],

    // ----- nav config -----
    nav: [
      { id: 'home',   ar: 'الرئيسية',  en: 'Home' },
      { id: 'about',  ar: 'عن الموقع', en: 'About' },
    ],

    // Modern Standard Arabic month names (Gulf/Egyptian convention: يناير…ديسمبر)
    // instead of Levantine (كانون الثاني…كانون الأول). User preference 2026-05-16.
    arMonths: ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'],
    enMonths: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    windowOptions: [
      { v: 7,        ar: 'أسبوع',       en: '1 wk' },
      { v: 30,       ar: 'شهر',         en: '1 mo' },
      { v: 60,       ar: 'شهران',       en: '2 mo' },
      { v: 365,      ar: 'السنة كاملة', en: 'Year' },
      { v: 'custom', ar: 'مخصص',        en: 'Custom' },
    ],
    bdayCustomDays: 14,   // value used when bday.window === 'custom' (1..365)
    // Six sort modes matching the v1 SPA — covers martyrdom/birth/age/name in
    // both directions. Default is martyrdom_desc (newest martyrs first).
    sortOptions: [
      // "Newly added" = order in which rows landed in the DB. Default — what
      // visitors see first is what was added to the registry most recently.
      // Same semantic as the admin grid's default sort.
      { id: 'created_desc',   ar: 'الإضافة ↓ (الأحدث)',    en: 'Added ↓ (newest)' },
      { id: 'created_asc',    ar: 'الإضافة ↑ (الأقدم)',    en: 'Added ↑ (oldest)' },
      { id: 'martyrdom_desc', ar: 'الاستشهاد ↓ (الأحدث)', en: 'Martyrdom ↓ (newest)' },
      { id: 'martyrdom_asc',  ar: 'الاستشهاد ↑ (الأقدم)', en: 'Martyrdom ↑ (oldest)' },
      { id: 'birth_desc',     ar: 'الميلاد ↓ (الأصغر سناً)', en: 'Birth ↓ (youngest)' },
      { id: 'birth_asc',      ar: 'الميلاد ↑ (الأكبر سناً)', en: 'Birth ↑ (oldest)' },
      { id: 'age_asc',        ar: 'الأصغر عُمراً',          en: 'Youngest age' },
      { id: 'name_asc',       ar: 'الاسم (أ → ي)',           en: 'Name A→Z' },
    ],

    // ----- birthday-match -----
    // year is null until the user picks a date via Litepicker. Once a full date
    // is picked the search matches on the whole date (year + month + day);
    // before that, the home "Nearest birthdays" section is empty and shows a
    // "pick your birthday" prompt instead of arbitrary names.
    // Default window is 30 ("شهر") per user request (2026-06-17). NOTE: matching
    // is full-date (year included), so a 1-month window is deliberately narrow —
    // see the birthday-search notes in CLAUDE.md.
    bday: { day: new Date().getDate(), month: new Date().getMonth() + 1, year: null, window: 30 },
    _birthdayPicker: null,
    matchFilter: null,
    // Combined search page (F1): the secondary filters + results start locked.
    // Unlocked by picking a birthday (runBirthdaySearch) OR clicking "browse
    // the full registry" (browseAll). Stays unlocked for the rest of the
    // session once opened.
    filtersUnlocked: false,
    // Secondary-filters panel starts COLLAPSED on every load (2026-06-17) so the
    // landing page stays clean — the heading row toggles it. Independent of
    // filtersUnlocked (lock = whether filters are usable; expanded = whether the
    // panel is open). browseAll() lives in the nav too, so collapsing this panel
    // never hides the only way in.
    filtersExpanded: false,

    // ----- browse filters -----
    filters: { q: '', city: '', rank: '', batt: '', age: '' },
    // Default registry sort puts the most recently added rows on top — matches
    // the admin grid default so what the admin just verified shows up first
    // for visitors too.
    sort: 'created_desc',
    viewMode: 'grid',   // 'grid' (default, multi-column) or 'list' (single-column)
    // Advanced filters — collapsible panel below the primary filter row
    showAdvancedFilters: false,
    martyrdomFrom: '',   // ISO date "YYYY-MM-DD" — filter rows with martyrdom >= this
    martyrdomTo:   '',   // ISO date "YYYY-MM-DD" — filter rows with martyrdom <= this
    ageMin: '',          // number or '' — filter rows with age >= this
    ageMax: '',          // number or '' — filter rows with age <= this
    _datePickers: {},    // private pool of Litepicker instances keyed by target field name

    // ============================================================
    // INIT
    // ============================================================
    async init() {
      // Idempotency guard: Alpine 3 auto-invokes a data method named init(),
      // AND index.html also has x-init="init()" — so without this guard the
      // whole body runs twice (double data fetch, watchers registered twice,
      // SW registered twice). Run once.
      if (this._initialized) return;
      this._initialized = true;

      // Register the offline-cache Service Worker (lazy photo cache + JSON
      // snapshot). Non-blocking and a no-op where unsupported.
      this.registerServiceWorker();
      await this.checkSession();
      // Apply lang/dir
      this.$watch('lang', (l) => {
        document.documentElement.lang = l;
        document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr';
        if (window.__updateTitle) window.__updateTitle(this.view, l);
      });
      // Keep document.title in sync with the active view + language.
      this.$watch('view', (v) => {
        if (window.__updateTitle) window.__updateTitle(v, this.lang);
      });
      if (window.__updateTitle) window.__updateTitle(this.view, this.lang);

      // Restore admin edits from localStorage
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

      // Persist admin edits
      this.$watch('edits', (v) => {
        try { localStorage.setItem('aqmar.edits', JSON.stringify(v)); } catch (e) {}
      });

      // Load martyrs from the priority chain (Supabase → local JSON → sample).
      // Extracted into loadMartyrs() so the Retry button can re-invoke it.
      await this.loadMartyrs();
      await this.loadGlobalSettings();

      // Persist the dataset version ("store ID") and reveal the app — this is
      // what the boot spinner waits for ("spinner till the store ID is in
      // localStorage").
      this.persistCacheVersion();
      this.revealApp();

      // Shareable birthday search: if the URL has ?b=…&w=…, restore + run it so
      // a copied link opens the same results for whoever clicks it.
      this.applyBirthdayFromUrl();

      // Clamp bday.day whenever the month changes — so picking Feb after day=31
      // doesn't leave an out-of-range value floating around.
      this.$watch('bday.month', () => {
        if (this.bday.day > this.bdayDaysInMonth) this.bday.day = this.bdayDaysInMonth;
      });

      // Auto-recompute "Age at martyrdom" whenever the admin edits either
      // date in the edit form. Reuses the (now calendar-accurate) computeAge so
      // freshly-typed values match how rows are seeded on load. The age input
      // stays editable so the admin can still override manually if one date
      // is unparseable but a known age was mentioned elsewhere.
      const recomputeDraftAge = () => {
        if (!this.editingId || !this.draft) return;
        const a = this.computeAge(this.draft.birth, this.draft.martyrdom);
        if (a != null) this.draft.age = a;
      };
      this.$watch('draft.birth', recomputeDraftAge);
      this.$watch('draft.martyrdom', recomputeDraftAge);

      // Phase 1 cover-image (2026-05-25): mirror the current carousel slide
      // into draft.featuredFrame so the "unsaved changes" badge correctly
      // lights up when the admin navigates to a different frame. Stored in
      // raw DB format (no "../" prefix) so it diffs cleanly against the
      // loader's m.featuredFrame.
      this.$watch('carouselIdx', () => {
        if (!this.editingId || !this.draft) return;
        const current = this.carouselCurrent();
        this.draft.featuredFrame = (current?.kind === 'frame')
          ? denormalizePath(current.src)
          : null;
      });

      // Lifespan line: label positions are pixel-measured, so re-run the
      // dodge pass when the viewport resizes (no re-render needed).
      window.addEventListener('resize', () => {
        const el = document.getElementById('lifeline-root');
        if (el) dodgeTimelineLabels(el);
      });
    },

    // Data-loading helper, callable from init() and retryLoad(). Now delegates
    // to data-loader.js's loadData() which tries:
    //   1. /api/martyrs (local FastAPI admin server with live SQL Server data)
    //   2. ../data/martyrs.json (published snapshot from export_to_json.py)
    // Sample data only loads when ?demo is in the URL (set by config.js).
    // If all sources fail, sets loadError so the UI shows the Retry button.
    async loadMartyrs() {
      this.loading = true;
      this.loadError = null;
      let martyrs = null;
      const ingestRows = (rows) => {
        martyrs = rows.map(adaptMartyrToNewSchema).filter(Boolean);
        const dates = rows.map(r => r && r.posted_date).filter(Boolean);
        if (dates.length) this.lastSyncIso = dates.sort().reverse()[0];
      };
      try {
        const data = await loadData();
        ingestRows(data.martyrs || []);
        // loadData reports which source actually succeeded
        this.dataSource = data.source || 'api';
        if (data.version) this.publishedVersion = data.version;
      } catch (e) {
        console.warn('All data sources failed:', e.message);
      } finally {
        this.loading = false;
      }
      if (!martyrs && window.AQMAR_SAMPLE_DATA) {
        martyrs = window.AQMAR_SAMPLE_DATA;
        this.dataSource = 'sample-data';
      }
      if (!martyrs || martyrs.length === 0) {
        // All three sources failed → surface the Retry button.
        martyrs = [];
        this.loadError = this.lang === 'ar'
          ? 'تعذّر تحميل السجلّ. تحقّق من الاتصال ثم أعد المحاولة.'
          : 'Could not load the registry. Check your connection and retry.';
      }
      // Normalize + compute age
      this.all = martyrs.map(m => ({
        ...m,
        age: m.age != null ? m.age : this.computeAge(m.birth, m.martyrdom),
      }));
      // Derive filter universes
      this.cities      = [...new Set(this.all.map(m => m.city).filter(Boolean))].sort();
      this.ranks       = [...new Set(this.all.map(m => m.rank).filter(Boolean))].sort();
      this.weapons     = [...new Set(this.all.map(m => m.weapon).filter(Boolean))].sort();
      this.battalions  = [...new Set(this.all.map(m => m.battalion).filter(Boolean))].sort();
      this.brigades    = [...new Set(this.all.map(m => m.brigade).filter(Boolean))].sort();
    },

    async retryLoad() {
      await this.loadMartyrs();
    },

    // Load global settings (events). Failures leave events empty — the
    // lifespan line just renders without event markers.
    async loadGlobalSettings() {
      const s = await loadSettings();
      this.events = s.events;
      this.settingsVersion = s.version;
    },

    // ---- Global events admin (settings.json) ----
    newEvent() {
      this.eventError = '';
      this.eventForm = { id: null, name_ar: '', name_en: '', start_date: '', end_date: '' };
    },
    editEvent(ev) {
      this.eventError = '';
      this.eventForm = { id: ev.id, name_ar: ev.name_ar, name_en: ev.name_en || '',
                         start_date: ev.start_date, end_date: ev.end_date || '' };
    },
    cancelEventForm() {
      this.eventForm = null;
      this.eventError = '';
    },
    async saveEventForm() {
      const f = this.eventForm;
      if (!f || this.eventSaving) return;
      // Client-side mirror of the server validation → friendlier errors.
      if (!f.name_ar.trim()) {
        this.eventError = this.lang === 'ar' ? 'الاسم بالعربية مطلوب' : 'Arabic name is required';
        return;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.start_date)) {
        this.eventError = this.lang === 'ar' ? 'تاريخ البداية مطلوب' : 'Start date is required';
        return;
      }
      if (f.end_date && f.end_date < f.start_date) {
        this.eventError = this.lang === 'ar' ? 'تاريخ النهاية قبل تاريخ البداية' : 'End date is before start date';
        return;
      }
      const next = this.events.filter(e => e.id !== f.id);
      next.push({
        id: f.id,                       // null → server assigns evt-<n>
        name_ar: f.name_ar.trim(),
        name_en: f.name_en.trim() || null,
        start_date: f.start_date,
        end_date: f.end_date || null,
      });
      await this._putEvents(next, true);
    },
    async deleteEvent(ev) {
      const q = this.lang === 'ar' ? `حذف حدث «${ev.name_ar}»؟` : `Delete event "${ev.name_ar}"?`;
      if (!confirm(q)) return;
      await this._putEvents(this.events.filter(e => e.id !== ev.id), false);
    },
    // Shared save path: await the PUT, replace state from the server's
    // response on success (NOT optimistic — same as saveEdit); any failure
    // (422 validation, 403 token, network) shows inline and changes nothing.
    async _putEvents(nextEvents, closeForm) {
      this.eventSaving = true;
      this.eventError = '';
      try {
        const saved = await saveSettingsViaApi({ version: this.settingsVersion, events: nextEvents });
        const s = adaptSettings(saved);
        this.events = s.events;
        this.settingsVersion = s.version;
        if (closeForm) this.eventForm = null;
      } catch (e) {
        this.eventError = e.message || (this.lang === 'ar' ? 'فشل الحفظ' : 'Save failed');
      } finally {
        this.eventSaving = false;
      }
    },

    // ============================================================
    // OFFLINE CACHE (Service Worker + version "store ID")
    // ============================================================
    // Register the root-scoped Service Worker that lazily caches photos
    // (cache-first, as viewed) and the martyrs.json snapshot (network-first).
    // Registered at '../sw.js' with parent scope so it can reach /data/photos/
    // which lives outside /webui/. Entirely best-effort: unsupported browsers
    // or a failed registration just mean the site loads online as before.
    registerServiceWorker() {
      if (!('serviceWorker' in navigator)) return;
      try {
        navigator.serviceWorker.register('../sw.js', { scope: '../' })
          .catch((e) => console.warn('SW registration failed (offline cache off):', e.message));
      } catch (e) {
        console.warn('SW registration threw (offline cache off):', e.message);
      }
    },

    // The "store ID" is the published dataset version (already carried in
    // data/martyrs.json → publishedVersion). We both READ and WRITE it:
    //   · read the previously-stored version,
    //   · if the published version changed, purge the cache-first PHOTO cache
    //     so a corrected/replaced photo at an existing <id>.jpg reaches
    //     returning visitors ("refresh once per version" — the chosen F2
    //     behavior). The JSON cache is network-first, so it refreshes on its
    //     own; photos re-cache lazily as they're viewed again.
    //   · write the new version as the store ID.
    // Skipped entirely in live-API mode (no published version to key on).
    persistCacheVersion() {
      if (this.publishedVersion == null) return;
      const KEY = 'aqmar.cacheVersion';
      const next = String(this.publishedVersion);
      let prev = null;
      try { prev = localStorage.getItem(KEY); } catch (e) {}
      if (prev !== next && 'caches' in window) {
        caches.delete('aqmar-photos').catch(() => {});
      }
      try { localStorage.setItem(KEY, next); } catch (e) {}
    },

    // Fade out + remove the first-paint boot spinner (#boot-spinner lives
    // outside the Alpine root so it shows before Alpine initializes). Called
    // once the data has loaded and the store ID is written.
    revealApp() {
      const el = document.getElementById('boot-spinner');
      if (!el) return;
      el.classList.add('boot-hide');
      setTimeout(() => { el.remove(); }, 400);
    },

    // ============================================================
    // NAVIGATION
    // ============================================================
    goto(v) {
      // Admin is only reachable where allowed; bounce to the search page
      // otherwise (defensive — the nav button that calls this is also gated).
      if (v === 'admin' && !this.adminAllowed) v = 'home';
      this.view = v;
      this.matchFilter = null;
      this.selectedId = null;
      this.editingId = null;
      this.mobileNavOpen = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    openMartyr(id) {
      this.selectedId = id;
      this.view = 'detail';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // ============================================================
    // DERIVED — on-this-day
    // ============================================================
    // (The old `previewMatches` getter was removed 2026-06-15 when the home
    // "Nearest birthdays" preview was folded into the unified results grid —
    // `filtered` now renders birthday matches directly when matchFilter is set.)
    get onThisDay() {
      const t = new Date();
      const tM = t.getMonth() + 1;
      const tD = t.getDate();
      return this.all
        .filter(m => {
          if (!m.martyrdom) return false;
          const [, mm, dd] = m.martyrdom.split('-').map(Number);
          return dayDelta(`2000-${pad(mm)}-${pad(dd)}`, tM, tD) <= 3;
        })
        .slice(0, 6);
    },
    get todayMonth() { return new Date().getMonth() + 1; },
    get todayDay()   { return new Date().getDate(); },
    get stats() {
      const tufanStart = new Date('2023-10-07');
      const daysSince = Math.max(0, Math.floor((Date.now() - tufanStart.getTime()) / 86400000));
      return [
        { k_ar: this.toArDigits(this.all.length), k_en: this.all.length, v_ar: 'اسماً مُوَثَّقًا', v_en: 'names recorded' },
        { k_ar: this.toArDigits(daysSince) + ' يوماً', k_en: daysSince + ' days', v_ar: 'منذ بدء الطوفان', v_en: 'since Oct 7' },
        { k_ar: this.toArDigits(this.battalions.length) + ' كتيبة', k_en: this.battalions.length + ' bn', v_ar: 'تَشمَلُها السجلات', v_en: 'battalions covered' },
        { k_ar: '٪١٠٠', k_en: '100%', v_ar: 'أرشيفٌ مفتوحٌ ودائم', v_en: 'open · always free' },
      ];
    },
    // True when the SPA is being served from a developer's machine (local
    // http.server or the IIS admin portal). Gates the "data is from the
    // published snapshot, run admin_server.py" hint banner — that hint makes
    // no sense on the public deployment (GitHub Pages), where there is no
    // admin API and never will be.
    get isLocalDev() {
      const h = location.hostname;
      return h === 'localhost' || h === '127.0.0.1' || h === '';
    },

    // Whether the admin portal UI may be shown AT ALL. Gates every admin
    // entry point (login button, admin nav, edit buttons, the admin view).
    // = the config master switch AND a local-dev host. On GitHub Pages
    // isLocalDev is false, so admin never renders there regardless of the
    // flag — and login couldn't work anyway (no API). Distinct from
    // `isAdmin`, which means "a valid token is currently loaded".
    get adminAllowed() {
      const cfg = window.AQMAR_CONFIG || {};
      return cfg.adminEnabled !== false && this.isLocalDev;
    },

    // Compact label for the birthday-match delta badge.
    //   signed delta in days: positive → "+" (younger), negative → "−" (older)
    //   0 → "نفس اليوم" / "SAME DAY"
    //   non-finite (missing/unparseable birth date) → "" (badge hidden)
    deltaLabel(delta) {
      if (!Number.isFinite(delta)) return '';
      if (delta === 0) return this.lang === 'ar' ? 'نفس اليوم' : 'SAME DAY';
      const sign = delta > 0 ? '+' : '−';
      const abs = Math.abs(delta);
      return this.lang === 'ar'
        ? `${sign} ${this.toArDigits(abs)} يوماً`
        : `${sign}${abs}d`;
    },

    get aboutBlocks() {
      return [
        { ar: ['١. الجمع','Telethon يَجلب الرسائل عبر MTProto بلا كلفة، ويحتفظ بحالةِ التشغيل ليستأنف عند توقّفه.'], en: ['1. Collection','Telethon pulls messages via MTProto. State is persisted so a crashed run resumes.'] },
        { ar: ['٢. الاستخلاص','ffmpeg + EasyOCR يَستخرجان الاسمَ والميلادَ والاستشهادَ والمدينةَ من الإطارات والصور.'], en: ['2. Extraction','ffmpeg + EasyOCR pull name, birth/martyrdom dates and city from video frames and photos.'] },
        { ar: ['٣. التحرير','واجهة الإدارة تتيح تصحيحَ كلّ حقلٍ. التعديلاتُ تُحفظ مباشرةً في SQL Server وتَظهر فوراً.'], en: ['3. Editing','The admin UI lets you correct any field. Edits save directly to SQL Server and go live instantly.'] },
        { ar: ['٤. النشر','واجهةٌ ثابتةٌ بدون خادم: انسخْها إلى GitHub Pages أو Netlify أو Cloudflare.'], en: ['4. Publication','A static SPA: deploy to GitHub Pages, Netlify, or Cloudflare — no server required.'] },
      ];
    },

    // ============================================================
    // BROWSE — filtered list
    // ============================================================
    runBirthdaySearch() {
      // Snapshot bday + custom-days at search time so subsequent edits don't
      // retroactively change the active match filter. Unlocks the secondary
      // filters + results on the combined page (no view switch — everything is
      // on one page now) and scrolls the results into view.
      this.matchFilter = { ...this.bday, customDays: this.bdayCustomDays };
      this.filtersUnlocked = true;
      this.syncBirthdayUrl();
      this.scrollToResults();
    },
    // "Browse the full registry" — unlock the filters without a birthday match.
    browseAll() {
      this.filtersUnlocked = true;
      this.matchFilter = null;
      this.syncBirthdayUrl();   // clears any ?b/?w/?d from the address bar
      this.scrollToResults();
    },
    // Mirror the active birthday search into the URL query string so the link
    // can be copied and reopened (applyBirthdayFromUrl reads it on load). Uses
    // replaceState so it doesn't pile up history entries; preserves any other
    // query params (e.g. ?demo). Clears b/w/d when no birthday match is active.
    syncBirthdayUrl() {
      try {
        const params = new URLSearchParams(window.location.search);
        ['b', 'w', 'd'].forEach(k => params.delete(k));
        const bp = buildBirthdayParams(this.matchFilter);
        if (bp) Object.keys(bp).forEach(k => params.set(k, bp[k]));
        const qs = params.toString();
        const url = window.location.pathname + (qs ? '?' + qs : '') + window.location.hash;
        history.replaceState(null, '', url);
      } catch (e) {}
    },
    // On load: if the URL carries a birthday search, restore the picker + window
    // and run the same search so a shared link opens the same results.
    applyBirthdayFromUrl() {
      const parsed = parseBirthdayQuery(window.location.search);
      if (!parsed) return;
      this.bday.year = parsed.year;
      this.bday.month = parsed.month;
      this.bday.day = parsed.day;
      this.bday.window = parsed.window;
      if (parsed.window === 'custom') this.bdayCustomDays = parsed.customDays;
      const pad = (n) => String(n).padStart(2, '0');
      const iso = `${parsed.year}-${pad(parsed.month)}-${pad(parsed.day)}`;
      this.$nextTick(() => {
        try {
          if (this._birthdayPicker) this._birthdayPicker.setDate(new Date(parsed.year, parsed.month - 1, parsed.day));
          const el = this.$refs && this.$refs.birthdate;
          if (el) el.value = iso;
        } catch (e) {}
        this.runBirthdaySearch();
      });
    },
    // Smooth-scroll the results section into view after Alpine has revealed it
    // (it's behind x-show="filtersUnlocked", so wait a tick for the DOM).
    scrollToResults() {
      setTimeout(() => {
        const el = document.getElementById('results');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    },
    clearFilters() {
      this.filters = { q: '', city: '', rank: '', batt: '', age: '' };
    },
    get filtered() {
      let list = this.all.map(m => ({ ...m }));
      if (this.matchFilter) {
        const { month, day, year, window: w, customDays } = this.matchFilter;
        // Resolve 'custom' to the captured customDays value, with a sensible
        // clamp to [1, 365] so a malformed input can't filter to nothing.
        const days = w === 'custom'
          ? Math.max(1, Math.min(365, Number(customDays) || 14))
          : w;
        // Match on the whole picked date (year + month + day) — birthDelta is
        // signed real calendar distance (so the badge can render + / −). Falls
        // back to month+day cyclic matching only if no year was picked.
        const userIso = isoDate(year, month, day);
        list = list
          .map(m => ({ ...m, delta: userIso ? birthDelta(userIso, m.birth)
                                            : dayDelta(m.birth, month, day) }))
          .filter(m => Math.abs(m.delta) <= days);
      }
      const f = this.filters;
      if (f.q) {
        list = list.filter(m => searchPredicate(m, f.q));
      }
      if (f.city) list = list.filter(m => m.city === f.city);
      if (f.rank) list = list.filter(m => m.rank === f.rank);
      if (f.batt) list = list.filter(m => m.battalion === f.batt);
      // Age filters require a finite age — rows with missing/malformed birth or
      // martyrdom dates (35% of the dataset) have m.age=null and must NOT pass
      // any age bucket (null < 20 is true in JS — old bug surfaced them as "Under 20").
      if (f.age === 'u20')   list = list.filter(m => Number.isFinite(m.age) && m.age < 20);
      if (f.age === '20-30') list = list.filter(m => Number.isFinite(m.age) && m.age >= 20 && m.age < 30);
      if (f.age === '30-40') list = list.filter(m => Number.isFinite(m.age) && m.age >= 30 && m.age < 40);
      if (f.age === 'o40')   list = list.filter(m => Number.isFinite(m.age) && m.age >= 40);

      // Advanced filters (panel below primary filters) — martyrdom date range + age range
      if (this.martyrdomFrom) list = list.filter(m => m.martyrdom && m.martyrdom >= this.martyrdomFrom);
      if (this.martyrdomTo)   list = list.filter(m => m.martyrdom && m.martyrdom <= this.martyrdomTo);
      if (this.ageMin !== '' && this.ageMin != null) {
        const minN = Number(this.ageMin);
        if (Number.isFinite(minN)) list = list.filter(m => Number.isFinite(m.age) && m.age >= minN);
      }
      if (this.ageMax !== '' && this.ageMax != null) {
        const maxN = Number(this.ageMax);
        if (Number.isFinite(maxN)) list = list.filter(m => Number.isFinite(m.age) && m.age <= maxN);
      }

      if (this.matchFilter) {
        list.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta));
      } else {
        // Six explicit sort modes. Missing values sort to the end via the
        // U+FFFD sentinel (always greater than real strings) or Infinity for nums.
        const SENTINEL = '�';
        const sortFns = {
          // Newly-added sort uses the addedAt ISO datetime from the API. Falls
          // back to empty string (sorts last via SENTINEL) when missing — only
          // happens for rows from the static JSON snapshot if the exporter
          // stripped created_at, which it currently doesn't.
          'created_desc':   (a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''),
          'created_asc':    (a, b) => (a.addedAt || SENTINEL).localeCompare(b.addedAt || SENTINEL),
          'martyrdom_desc': (a, b) => (b.martyrdom || '').localeCompare(a.martyrdom || ''),
          'martyrdom_asc':  (a, b) => (a.martyrdom || SENTINEL).localeCompare(b.martyrdom || SENTINEL),
          'birth_desc':     (a, b) => (b.birth || '').localeCompare(a.birth || ''),
          'birth_asc':      (a, b) => (a.birth || SENTINEL).localeCompare(b.birth || SENTINEL),
          'age_asc':        (a, b) => (Number.isFinite(a.age) ? a.age : Infinity) - (Number.isFinite(b.age) ? b.age : Infinity),
          'name_asc':       (a, b) => (a.name || SENTINEL).localeCompare(b.name || SENTINEL, 'ar'),
        };
        list.sort(sortFns[this.sort] || sortFns['created_desc']);
      }
      return list;
    },

    // ============================================================
    // DETAIL
    // ============================================================
    get current() {
      return this.selectedId ? this.all.find(m => m.id === this.selectedId) : null;
    },
    get related() {
      if (!this.current) return [];
      return this.all
        .filter(m => m.battalion === this.current.battalion && m.id !== this.current.id)
        .slice(0, 4);
    },
    personalRows(m) {
      return [
        { k: this.lang === 'ar' ? 'الاسم' : 'Name', v: m.name || '—' },
        { k: this.lang === 'ar' ? 'تاريخ الميلاد' : 'Born', v: this.formatDate(m.birth) },
        { k: this.lang === 'ar' ? 'المدينة' : 'City', v: m.city || '—' },
        { k: this.lang === 'ar' ? 'العمر' : 'Age', v: this.ageLabel(m) },
      ];
    },
    militaryRows(m) {
      return [
        { k: this.lang === 'ar' ? 'الرتبة' : 'Rank', v: m.rank || '—' },
        { k: this.lang === 'ar' ? 'السلاح' : 'Weapon', v: m.weapon || '—' },
        { k: this.lang === 'ar' ? 'الكتيبة' : 'Battalion', v: m.battalion || '—' },
        { k: this.lang === 'ar' ? 'اللواء' : 'Brigade', v: m.brigade || '—' },
      ];
    },

    // ============================================================
    // ADMIN — login / edit / export
    // ============================================================
    // Restore the admin session from sessionStorage (if a token is stashed
    // there from a previous login on this tab). Probes a write-protected
    // endpoint to confirm the token is still valid against the running API.
    async checkSession() {
      // Never surface admin on a host where it isn't allowed, even if a token
      // is left over in sessionStorage from a previous local session.
      if (!this.adminAllowed) return;
      if (!window.AQMAR_API || !window.AQMAR_API.hasToken()) return;
      try {
        await window.AQMAR_API.get('/martyrs/unverified');
        this.isAdmin = true;
      } catch (e) {
        // Token rejected (403) or server unreachable — clear it silently.
        window.AQMAR_API.clearToken();
      }
    },
    // The "password" is the ADMIN_TOKEN from .env. The API call below either
    // succeeds (token valid) or 403s (token wrong). No server-side login
    // endpoint needed — auth is stateless via the X-Admin-Token header.
    async doLogin() {
      this.loginError = '';
      if (!window.AQMAR_API) {
        this.loginError = this.lang === 'ar'
          ? 'لم تتم تهيئة عميل الـ API'
          : 'API client not initialized';
        return;
      }
      const token = (this.loginPass || '').trim();
      if (!token) {
        this.loginError = this.lang === 'ar' ? 'أدخل رمز الإدارة' : 'Enter the admin token';
        return;
      }
      window.AQMAR_API.setToken(token);
      try {
        // Verify by calling a write-protected endpoint
        await window.AQMAR_API.get('/martyrs/unverified');
      } catch (e) {
        window.AQMAR_API.clearToken();
        if (e.status === 403) {
          this.loginError = this.lang === 'ar' ? 'رمز الإدارة غير صحيح' : 'Invalid admin token';
        } else {
          this.loginError = this.lang === 'ar'
            ? 'تعذّر الاتصال بخادم الإدارة — هل هو يعمل؟'
            : 'Could not reach the admin server — is it running?';
        }
        return;
      }
      this.isAdmin = true;
      this.showLogin = false;
      this.loginPass = '';
      this.view = 'admin';
    },
    logout() {
      if (window.AQMAR_API) window.AQMAR_API.clearToken();
      this.isAdmin = false;
      this.editingId = null;
      this.photoZoomed = false;
      this.carouselIdx = 0;
      this.view = 'home';
    },

    // Columns for the admin table. Drives both the header rendering AND
    // which fields are sortable / filterable. Status column is required
    // for the verification workflow — kept rightmost as the visual anchor.
    get adminCols() {
      const ar = this.lang === 'ar';
      // Width budget (2026-06-11): the table lives in a ~1176px container
      // (max-w-[1240px] minus px-8). Fixed widths below + the 80px edit
      // column sum to ~1007px so the auto name column keeps ≥160px — when
      // they exceeded the container (pre-fix: 1250px) the browser crushed
      // the name to one word per line and wrapped the ISO dates mid-value.
      return [
        { id: 'id',           label: '#',                          width: '52px',  sortable: true,  filterable: false },
        // "Added" — UTC timestamp when the scraper inserted the row. Sortable so
        // the admin can jump straight to the newest arrivals; not filterable
        // (date range filtering would need a calendar picker, not in scope).
        { id: 'addedAt',      label: ar ? 'تاريخ الإضافة' : 'Added', width: '150px', sortable: true,  filterable: false },
        { id: 'name',         label: ar ? 'الاسم' : 'Name',         width: 'auto',  sortable: true,  filterable: true  },
        { id: 'born',         label: ar ? 'الميلاد' : 'Born',       width: '100px', sortable: true,  filterable: true  },
        { id: 'martyrdom',    label: ar ? 'الاستشهاد' : 'Martyrdom', width: '100px', sortable: true,  filterable: true  },
        { id: 'city',         label: ar ? 'المدينة' : 'City',       width: '90px',  sortable: true,  filterable: true  },
        { id: 'battalion',    label: ar ? 'الكتيبة' : 'Battalion',  width: '150px', sortable: true,  filterable: true  },
        // Brigade (اللواء) — military unit above the battalion. Optional in
        // OCR output (sometimes the video frame doesn't show it, sometimes
        // the caption omits it). Admin can fill it in from the source video.
        { id: 'brigade',      label: ar ? 'اللواء' : 'Brigade',     width: '110px', sortable: true,  filterable: true  },
        // AI verification flag (2026-06-10). Sortable; tooltip shows ai_note.
        { id: 'aiVerified',   label: 'AI',                          width: '60px',  sortable: true,  filterable: false },
        // Status column header sorts by the `isVerified` boolean (false first
        // by default, so unverified + rejected rows bubble to the top of the
        // verification queue). The pill itself still displays the full 3-state
        // verification_status (unverified / verified / rejected).
        { id: 'isVerified',   label: ar ? 'الحالة' : 'Status',     width: '115px', sortable: true,  filterable: false },
      ];
    },
    // Status pills above the table — drives the headline filter.
    get adminStatusOptions() {
      const ar = this.lang === 'ar';
      return [
        { v: 'all',        label: ar ? 'الكل'      : 'All',        color: 'var(--ink)'     },
        { v: 'unverified', label: ar ? 'غير محقق' : 'Unverified', color: 'var(--olive)'  },
        { v: 'verified',   label: ar ? 'محقق'     : 'Verified',    color: 'var(--forest)' },
        { v: 'rejected',   label: ar ? 'مرفوض'    : 'Rejected',    color: 'var(--crimson)' },
      ];
    },
    adminCountByStatus(status) {
      // "All" counts only the active queue (excludes rejected), to match what
      // the default "all" view in adminList() actually shows.
      if (status === 'all') return this.all.filter(m => (m.verification || 'unverified') !== 'rejected').length;
      return this.all.filter(m => (m.verification || 'unverified') === status).length;
    },
    // Pills for the AI filter row. 'pending' is the AI work queue: rows the
    // batch will still process (human-verified rows are skipped by design).
    get adminAiOptions() {
      const ar = this.lang === 'ar';
      return [
        { v: 'all',     label: ar ? 'الكل'     : 'All',     color: 'var(--ink)'   },
        { v: 'ai',      label: ar ? '🤖 تمّ'   : '🤖 Done', color: 'var(--ai)'    },
        { v: 'pending', label: ar ? 'بانتظار' : 'Pending',  color: 'var(--olive)' },
      ];
    },
    adminCountByAi(v) {
      const active = this.all.filter(m => (m.verification || 'unverified') !== 'rejected');
      if (v === 'all') return active.length;
      if (v === 'ai')  return active.filter(m => m.aiVerified).length;
      return active.filter(m => !m.aiVerified && (m.verification || 'unverified') === 'unverified').length;
    },
    // Four numbers for the stats strip (Option B from _preview_ai_verify.html).
    // Rejected rows excluded from every denominator — they're triaged out of
    // both queues. aiRest deliberately excludes human-verified rows: the AI
    // batch skips those by design (user decision 2026-06-10).
    get aiStats() {
      const active = this.all.filter(m => (m.verification || 'unverified') !== 'rejected');
      const humanVerified = active.filter(m => m.verification === 'verified').length;
      const aiVerified = active.filter(m => m.aiVerified).length;
      const aiRest = active.filter(m => !m.aiVerified && m.verification !== 'verified').length;
      return {
        humanVerified,
        humanRest: active.length - humanVerified,
        aiVerified,
        aiRest,
      };
    },
    // Filter + sort applied in one pass. Order matters: status filter first
    // (most selective in the verification workflow), then global search,
    // then per-column filters, then sort.
    adminList() {
      let list = this.all;

      // 1) Status filter (the headline pill bar). The default "all" view shows
      // only ACTIVE rows (unverified + verified). Rejected rows are entries the
      // admin has already triaged out — junk / not-a-person / not-for-public —
      // so they drop off the working queue here and never publish; they remain
      // reachable (and restorable) only via the explicit "Rejected" pill.
      // Selecting any specific pill shows exactly that status.
      if (this.adminStatusFilter === 'all') {
        list = list.filter(m => (m.verification || 'unverified') !== 'rejected');
      } else {
        list = list.filter(m => (m.verification || 'unverified') === this.adminStatusFilter);
      }

      // 1b) AI filter (second pills row) — independent dimension, ANDed.
      if (this.adminAiFilter === 'ai') {
        list = list.filter(m => m.aiVerified);
      } else if (this.adminAiFilter === 'pending') {
        list = list.filter(m => !m.aiVerified && (m.verification || 'unverified') === 'unverified');
      }

      // 2) Global search (Arabic-aware via searchPredicate)
      const q = this.adminSearch.trim();
      if (q) list = list.filter(m => searchPredicate(m, q));

      // 3) Per-column filters (substring match, case-insensitive)
      const f = this.adminColFilters;
      const norm = (s) => (s || '').toString().toLowerCase();
      if (f.name)      list = list.filter(m => norm(m.name).includes(norm(f.name)));
      if (f.born)      list = list.filter(m => norm(m.birth).includes(norm(f.born)));
      if (f.martyrdom) list = list.filter(m => norm(m.martyrdom).includes(norm(f.martyrdom)));
      if (f.city)      list = list.filter(m => norm(m.city).includes(norm(f.city)));
      if (f.battalion) list = list.filter(m => norm(m.battalion).includes(norm(f.battalion)));
      if (f.brigade)   list = list.filter(m => norm(m.brigade).includes(norm(f.brigade)));

      // 4) Sort (copy first so we don't mutate this.all)
      const key = this.adminSortBy;
      const dir = this.adminSortDir === 'desc' ? -1 : 1;
      const SENT = '�';   // sentinel — sorts after all real strings
      // Map status to a numeric priority so default sort puts unverified first
      // (the work that needs doing), then verified, then rejected.
      const STATUS_ORDER = { unverified: 0, verified: 1, rejected: 2 };
      const sorted = [...list].sort((a, b) => {
        let va, vb;
        if (key === 'isVerified') {
          // Primary: isVerified=false first (ascending). Secondary: within the
          // false bucket, unverified comes before rejected (more urgent triage).
          // Encoding: unverified=0, rejected=1, verified=10 — gap between
          // false-group (0–1) and true (10) preserves boolean ordering.
          const score = (m) => (m.isVerified ? 10 : 0) +
                               (m.verification === 'rejected' ? 1 : 0);
          va = score(a); vb = score(b);
        } else if (key === 'verification') {
          va = STATUS_ORDER[a.verification || 'unverified'];
          vb = STATUS_ORDER[b.verification || 'unverified'];
        } else if (key === 'aiVerified') {
          va = a.aiVerified ? 1 : 0; vb = b.aiVerified ? 1 : 0;
        } else if (key === 'id') {
          va = a.id; vb = b.id;
        } else if (key === 'addedAt') {
          // ISO datetime string — lexicographic compare matches chronological.
          // Sentinel-fallback only fires for the static JSON snapshot path.
          va = a.addedAt || SENT; vb = b.addedAt || SENT;
        } else if (key === 'born') {
          va = a.birth || SENT; vb = b.birth || SENT;
        } else if (key === 'martyrdom') {
          va = a.martyrdom || SENT; vb = b.martyrdom || SENT;
        } else {
          va = (a[key] || SENT).toString(); vb = (b[key] || SENT).toString();
        }
        if (va < vb) return -1 * dir;
        if (va > vb) return  1 * dir;
        return 0;
      });
      return sorted;
    },
    // Click a column header to toggle sort. Same key clicked twice flips
    // direction; different key resets direction to ascending.
    adminSetSort(key) {
      if (this.adminSortBy === key) {
        this.adminSortDir = this.adminSortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.adminSortBy = key;
        // For datetime + status columns, the useful first-click direction is
        // descending (newest first / verified-last). Everything else (name,
        // city, brigade, etc.) defaults to ascending which is the alphabetical
        // intuition.
        this.adminSortDir = (key === 'addedAt' || key === 'isVerified' || key === 'aiVerified') ? 'desc' : 'asc';
      }
    },
    adminSortIndicator(key) {
      if (this.adminSortBy !== key) return '';
      return this.adminSortDir === 'asc' ? ' ▲' : ' ▼';
    },
    adminClearFilters() {
      this.adminSearch = '';
      this.adminColFilters = { name: '', born: '', martyrdom: '', city: '', battalion: '', brigade: '' };
      this.adminStatusFilter = 'all';
      this.adminAiFilter = 'all';
    },

    editMartyr(id) {
      if (!this.adminAllowed) return;
      this.editingId = id;
      const m = this.all.find(x => x.id === id);
      const e = this.edits[id] || {};
      this.draft = { ...m, ...e };
      this.view = 'admin';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Open the carousel at the previously-saved frame if any (Phase 1
      // cover-image, 2026-05-25). featuredFrame is stored in raw DB format
      // ("data/frames/X_Y.jpg"); each carousel src is normalized with "../"
      // for the browser, so we compare denormalized.
      this.carouselIdx = 0;
      const saved = m?.featuredFrame;
      if (saved) {
        const imgs = this.carouselImages();
        const idx = imgs.findIndex(im => denormalizePath(im.src) === saved);
        if (idx >= 0) this.carouselIdx = idx;
      }
      // Push the freshly-loaded draft dates into the Litepicker instances so the
      // calendars open to the right month/year. nextTick waits for Alpine to
      // finish rendering — important on the very first edit (before that, the
      // pickers are still being mounted via x-init).
      this.$nextTick(() => {
        this.syncDraftPicker('birth');
        this.syncDraftPicker('martyrdom');
      });
    },
    editingMartyr() {
      return this.editingId ? this.all.find(m => m.id === this.editingId) : null;
    },

    // ----- Image carousel (admin edit panel) -----
    // Combined list of [portrait, ...frames] used by the big right-side
    // carousel. Portrait is always slot 0 when present so editMartyr() can
    // safely reset carouselIdx=0 and land on the most important image.
    // Each entry: { src, kind: 'portrait'|'frame' }.
    carouselImages() {
      const m = this.editingMartyr();
      if (!m) return [];
      const out = [];
      if (m.photo) out.push({ src: m.photo, kind: 'portrait' });
      (m.frames || []).forEach(f => out.push({ src: f, kind: 'frame' }));
      return out;
    },
    carouselCurrent() {
      const imgs = this.carouselImages();
      return imgs.length ? imgs[Math.min(this.carouselIdx, imgs.length - 1)] : null;
    },
    carouselPrev() {
      const n = this.carouselImages().length;
      if (n) this.carouselIdx = (this.carouselIdx - 1 + n) % n;
    },
    carouselNext() {
      const n = this.carouselImages().length;
      if (n) this.carouselIdx = (this.carouselIdx + 1) % n;
    },
    // True when the given carousel image is the same frame currently stored
    // in dbo.martyrs.featured_frame_path. Drives the ★ badge on the matching
    // thumbnail and the "this is the saved cover" banner under the stage.
    isSavedFrame(im) {
      const m = this.editingMartyr();
      if (!m?.featuredFrame || !im) return false;
      return denormalizePath(im.src) === m.featuredFrame;
    },

    draftDirty() {
      const m = this.editingMartyr();
      if (!m) return false;
      const current = { ...m, ...(this.edits[m.id] || {}) };
      // Mirror the save path exactly: a row is "dirty" only if saveEdit would
      // actually persist a change. buildEditDiff does the key-union (so a field
      // cleared in the draft still counts as dirty); translateToDbSchema drops
      // UI-only fields (age, bio) that have no DB column and would otherwise be
      // false positives.
      return Object.keys(translateToDbSchema(buildEditDiff(current, this.draft))).length > 0;
    },
    cancelEdit() {
      this.editingId = null;
      this.draft = {};
      this.photoZoomed = false;
      this.carouselIdx = 0;
    },
    // Saves an admin edit. Async because it round-trips to the local API,
    // which writes to SQL Server + flips verification_status to 'verified'
    // in one statement. Then optimistically patches this.all so the UI
    // updates instantly. this.edits is also updated as a session-scoped
    // dirty-marker cache.
    async saveEdit() {
      const m = this.editingMartyr();
      if (!m) return;
      // Phase 1 cover-image (2026-05-25): the carousel position IS the saved
      // frame. If row has frames AND admin is currently on the portrait, block
      // — they must navigate to a frame first. Rows with no frames at all skip
      // validation (nothing to pick from).
      const hasFrames = (m.frames || []).length > 0;
      const current = this.carouselCurrent();
      if (hasFrames && current?.kind !== 'frame') {
        alert(this.lang === 'ar'
          ? '⚠ اختر إطاراً من الفيديو قبل الحفظ.\nاستخدم الأسهم أو الصور المصغّرة للتنقّل، ثم انقر «حفظ».'
          : '⚠ Pick a frame from the video before saving.\nUse the arrows or thumbnails to navigate, then click Save.');
        return;
      }
      // Inject draft.featuredFrame (raw DB path) from current carousel slide.
      // Set to null on rows with no frames so the column gets cleared if it
      // was previously set and frames were later removed.
      this.draft.featuredFrame = (current?.kind === 'frame')
        ? denormalizePath(current.src)
        : null;
      const diff = buildEditDiff(m, this.draft);
      // Note: empty diff is still a valid "verify only" gesture — the API
      // accepts an empty body and just flips verification_status to 'verified'.
      try {
        await saveEditViaApi(m.id, diff);
      } catch (e) {
        alert((this.lang === 'ar' ? 'تعذّر حفظ التعديل:\n' : 'Save failed:\n') + e.message);
        return;
      }
      // Merge the diff into the in-memory state + mark verified locally.
      // isVerified must stay in sync with verification — the admin grid's
      // default sort is keyed on isVerified, so leaving it stale would leave
      // a row at the top of the queue even after the admin verified it.
      this.edits = { ...this.edits, [m.id]: { ...(this.edits[m.id] || {}), ...diff } };
      const idx = this.all.findIndex(x => x.id === m.id);
      if (idx >= 0) {
        this.all[idx] = {
          ...this.all[idx], ...diff,
          verification: 'verified',
          isVerified: true,
        };
      }
      this.editingId = null;
      this.draft = {};
      this.photoZoomed = false;
      this.carouselIdx = 0;
    },
    // Queue-processing shortcut (admin asked for it 2026-05-25). Same save
    // path as saveEdit(), then jumps straight into the next unverified row
    // sorted by addedAt ASC (oldest scraper output first). When the queue is
    // empty, it just exits to the list view — the status pills above the
    // table already make "0 unverified" obvious.
    //
    // Note: nulls-last on addedAt is defensive — admin always reads from the
    // API which returns created_at, so addedAt should always be set. The null
    // case would only trigger if data ever came from the static JSON fallback
    // (which the exporter strips of created_at).
    async saveAndNext() {
      await this.saveEdit();    // current row → verified, editingId cleared
      const next = this.all
        .filter(m => (m.verification || 'unverified') === 'unverified')
        .sort((a, b) => {
          if (!a.addedAt && !b.addedAt) return 0;
          if (!a.addedAt) return 1;
          if (!b.addedAt) return -1;
          return a.addedAt.localeCompare(b.addedAt);  // ASC = oldest first
        })[0];
      if (next) this.editMartyr(next.id);
    },
    // Trigger a publish from the admin header. Confirms first, then POSTs to
    // /api/publish which writes data/martyrs.json + records publish_versions.
    // Does NOT git-push — admin uses scripts/publish.ps1 for that.
    async publishNow() {
      if (!window.AQMAR_API) return;
      const note = window.prompt(
        this.lang === 'ar'
          ? 'وصفٌ موجزٌ لهذا النشر (اختياري — اضغط Enter للتخطّي):'
          : 'Optional one-line note for this publish (press Enter to skip):',
        ''
      );
      if (note === null) return;    // user cancelled
      try {
        const result = await window.AQMAR_API.post('/publish', { note: note || null });
        const msg = this.lang === 'ar'
          ? `تم النشر! النسخة ${result.version} (${result.row_count} سجلاً).\n\nالخطوة التالية: git add data/martyrs.json && git commit && git push`
          : `Published! Version ${result.version} (${result.row_count} rows).\n\nNext: git add data/martyrs.json && git commit && git push`;
        alert(msg);
      } catch (e) {
        alert((this.lang === 'ar' ? 'فشل النشر:\n' : 'Publish failed:\n') + e.message);
      }
    },

    // Regenerate data/martyrs.json — the file GitHub Pages serves — through
    // the standard publish flow (same valid envelope: version/generated_at/
    // channel/note/martyrs[]). Since 2026-06-11 the publish rule includes
    // AI-verified rows, so this is how the AI run's corrected dates reach
    // the public site. The admin then git-pushes the file manually.
    // Differs from publishNow() only in skipping the note prompt.
    async exportAiModified() {
      if (!window.AQMAR_API) return;
      const ok = confirm(this.lang === 'ar'
        ? 'سيُحدِّث هذا data/martyrs.json بكل السجلات المحقَّقة (بشرياً أو بالذكاء الاصطناعي) وبنسخة جديدة. متابعة؟'
        : 'This rewrites data/martyrs.json with all verified rows (human or AI) as a new version. Continue?');
      if (!ok) return;
      try {
        const result = await window.AQMAR_API.post('/publish', { note: 'AI-verified export (admin AI button)' });
        const msg = this.lang === 'ar'
          ? `تم التصدير! النسخة ${result.version} — ${result.row_count} سجلاً في:\n${result.path}\n\nالخطوة التالية: git add data/martyrs.json && git commit && git push`
          : `Exported! Version ${result.version} — ${result.row_count} rows in:\n${result.path}\n\nNext: git add data/martyrs.json && git commit && git push`;
        alert(msg);
      } catch (e) {
        alert((this.lang === 'ar' ? 'فشل التصدير:\n' : 'Export failed:\n') + e.message);
      }
    },

    // Mark a row 'rejected' (won't be included in published JSON).
    async rejectEdit() {
      const m = this.editingMartyr();
      if (!m) return;
      if (!confirm(this.lang === 'ar'
            ? `هل تريد رفض السجل #${m.id}؟ لن يَظهر في النشر القادم.`
            : `Reject row #${m.id}? It won't appear in the next publish.`)) {
        return;
      }
      try {
        await rejectViaApi(m.id);
      } catch (e) {
        alert((this.lang === 'ar' ? 'تعذّر الرفض:\n' : 'Reject failed:\n') + e.message);
        return;
      }
      // Rejected rows are not isVerified — they bubble back to the top of
      // the admin queue alongside unverified rows for the boolean-flag sort,
      // even though the colored pill still shows the distinct 'rejected' state.
      const idx = this.all.findIndex(x => x.id === m.id);
      if (idx >= 0) this.all[idx] = { ...this.all[idx], verification: 'rejected', isVerified: false };
      this.editingId = null;
      this.draft = {};
      this.photoZoomed = false;
      this.carouselIdx = 0;
    },

    // ============================================================
    // FOOTER
    // ============================================================
    footerCols() {
      // Each link now carries an action: either `go` (internal view switch via
      // goto()) or `href` (real URL, opens in new tab if external). Old version
      // emitted <a> tags with no href — looked clickable but did nothing.
      const ar = this.lang === 'ar';
      return [
        { title: ar ? 'المشروع' : 'Project', links: [
          { text: ar ? 'عن المشروع' : 'About',     go: 'about' },
          { text: ar ? 'الاختبارات' : 'Tests',     href: 'tests.html' },
          { text: ar ? 'الكود المصدري' : 'Source', href: 'https://github.com/mohamedkhamis/AQMAR', external: true },
        ]},
        { title: ar ? 'السجلّ' : 'Registry', links: [
          { text: ar ? 'كل الأسماء' : 'All names',     go: 'home', browseAll: true },
          { text: ar ? 'في مثل هذا اليوم' : 'On this day', go: 'home' },
        ]},
        { title: ar ? 'تواصل' : 'Contact', links: [
          { text: '@AqmarTofan',                      href: 'https://t.me/AqmarTofan', external: true },
        ]},
      ];
    },

    // ============================================================
    // HELPERS (also exposed for templates)
    // ============================================================
    formatDate(iso) { return formatDate(iso, this.lang); },
    computeAge(birth, martyrdom) {
      // Calendar-accurate age (delegates to filter-logic.js's computeAge)
      // with the 0–120 OCR sanity bound. Year-subtraction until 2026-07-22 —
      // that showed 28 for a martyr who died two months before his 28th
      // birthday, and would contradict the event ages on the lifespan line.
      const age = window.computeAge(birth, martyrdom);
      if (age == null || age < 0 || age > 120) return null;
      return age;
    },
    // Short-form "X عاماً" / "X yrs" with em-dash fallback for missing/malformed.
    ageLabel(m) {
      if (!m || !Number.isFinite(m.age)) return '—';
      return `${m.age} ${this.lang === 'ar' ? 'عاماً' : 'yrs'}`;
    },
    // Extracts and locale-converts a 4-digit year from an ISO date.
    // Returns '—' for malformed input.
    yearLabel(iso) {
      const m = String(iso || '').match(/^(\d{4})/);
      if (!m) return '—';
      return this.lang === 'ar' ? this.toArDigits(m[1]) : m[1];
    },
    // Days available in the currently-selected birthday-match month.
    // Lets Feb cap at 29 and short months at 30. Avoids "Feb 31" silently
    // remapping into Mar in dayDelta's flat-365 cumulative table.
    get bdayDaysInMonth() {
      const m = this.bday.month;
      if (m === 2) return 29;
      if ([4, 6, 9, 11].includes(m)) return 30;
      return 31;
    },
    // Formatted birthday ISO/locale string for display in the Litepicker input.
    get bdayLabel() {
      if (!this.bday.year) return '';
      const iso = `${this.bday.year}-${pad(this.bday.month)}-${pad(this.bday.day)}`;
      return formatDate(iso, this.lang);
    },
    // Initialize the Litepicker on the birthday <input>. Called via x-init.
    initBirthdayPicker(el) {
      if (typeof Litepicker === 'undefined') {
        console.warn('Litepicker not loaded — birthday input will be empty');
        return;
      }
      const self = this;
      const currentYear = new Date().getFullYear();
      // No maxDate guard on the BIRTHDAY picker — dayDelta matches martyrs
      // cyclically by month + day regardless of year, so future calendar
      // positions are valid coordinates. The year dropdown still caps at
      // currentYear so users don't accidentally pick 2050 for their birthday.
      this._birthdayPicker = new Litepicker({
        element: el,
        format: 'YYYY-MM-DD',
        singleMode: true,
        autoApply: true,
        dropdowns: { minYear: 1950, maxYear: currentYear, months: true, years: true },
        setup: (picker) => {
          picker.on('selected', (date) => {
            const d = date.toJSDate();
            self.bday.year = d.getFullYear();
            self.bday.month = d.getMonth() + 1;
            self.bday.day = d.getDate();
            // Picking a birthday unlocks the secondary filters and shows the
            // nearest-birthday results immediately (no extra click), matching
            // the user decision "unlock on birthday picked OR browse all".
            self.runBirthdaySearch();
          });
        },
      });
    },
    clearBirthday() {
      this.bday.year = null;
      if (this._birthdayPicker) this._birthdayPicker.clearSelection();
      const el = this.$refs && this.$refs.birthdate;
      if (el) el.value = '';
    },

    // Generic Litepicker wirer for advanced-filter date inputs (martyrdom from/to).
    // The selected ISO string is assigned to `this[targetField]` reactively.
    initDatePicker(el, targetField) {
      if (typeof Litepicker === 'undefined') return;
      const self = this;
      const todayIso = new Date().toISOString().slice(0, 10);
      this._datePickers[targetField] = new Litepicker({
        element: el,
        format: 'YYYY-MM-DD',
        singleMode: true,
        autoApply: true,
        maxDate: todayIso,
        dropdowns: { minYear: 2023, maxYear: new Date().getFullYear(), months: true, years: true },
        setup: (picker) => {
          picker.on('selected', (date) => {
            self[targetField] = date.format('YYYY-MM-DD');
          });
        },
      });
    },
    clearDateField(targetField, el) {
      this[targetField] = '';
      const p = this._datePickers[targetField];
      if (p) p.clearSelection();
      if (el) el.value = '';
    },

    // Litepicker wirer for admin-edit date inputs (draft.birth / draft.martyrdom).
    // Writes the selected ISO string to `this.draft[draftField]` so the existing
    // x-model + save flow picks it up unchanged. Keyed under '_draft_<field>' in
    // the same _datePickers pool the advanced-filter pickers use.
    //
    // minYear differs per field: birth can be as far back as 1900 (some martyrs
    // were elderly), martyrdom is clamped to the war window (2023+) since the
    // AqmarTofan channel only covers post-Oct-2023 casualties.
    initDraftDatePicker(el, draftField) {
      if (typeof Litepicker === 'undefined') return;
      const self = this;
      const currentYear = new Date().getFullYear();
      const todayIso = new Date().toISOString().slice(0, 10);
      const minYear = draftField === 'birth' ? 1900 : 2023;
      const key = `_draft_${draftField}`;
      this._datePickers[key] = new Litepicker({
        element: el,
        format: 'YYYY-MM-DD',
        singleMode: true,
        autoApply: true,
        maxDate: todayIso,
        dropdowns: { minYear, maxYear: currentYear, months: true, years: true },
        setup: (picker) => {
          picker.on('selected', (date) => {
            self.draft[draftField] = date.format('YYYY-MM-DD');
          });
        },
      });
      // Seed the picker with whatever's already in the draft (admin opened
      // the form before the picker had a chance to mount — common on first edit).
      this.syncDraftPicker(draftField);
    },

    // Push the current draft date into the Litepicker so the calendar opens to
    // the right month/year. Called from editMartyr() after this.draft is rebuilt.
    // Tolerant of malformed OCR dates ("1985-06", "فبرايسر") — those just leave
    // the picker uninitialized so the admin can pick a fresh date.
    syncDraftPicker(draftField) {
      const picker = this._datePickers[`_draft_${draftField}`];
      if (!picker) return;
      const v = this.draft && this.draft[draftField];
      if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        try { picker.setDate(v); } catch (e) { /* malformed date, leave picker alone */ }
      } else {
        try { picker.clearSelection(); } catch (e) {}
      }
    },

    // Clear a draft date field — used by the ✕ button next to each picker.
    // Blanks both the draft (x-model bound) and the Litepicker's internal state.
    clearDraftDate(draftField) {
      if (this.draft) this.draft[draftField] = '';
      const picker = this._datePickers[`_draft_${draftField}`];
      if (picker) {
        try { picker.clearSelection(); } catch (e) {}
      }
    },
    clearAdvancedFilters() {
      this.martyrdomFrom = '';
      this.martyrdomTo = '';
      this.ageMin = '';
      this.ageMax = '';
      Object.values(this._datePickers).forEach(p => { if (p) p.clearSelection(); });
      const r = this.$refs || {};
      if (r.martyrdomFromInput) r.martyrdomFromInput.value = '';
      if (r.martyrdomToInput)   r.martyrdomToInput.value = '';
    },
    advancedFilterCount() {
      let n = 0;
      if (this.martyrdomFrom) n++;
      if (this.martyrdomTo) n++;
      if (this.ageMin !== '' && this.ageMin != null) n++;
      if (this.ageMax !== '' && this.ageMax != null) n++;
      return n;
    },
    // Formatted "Last sync" timestamp for the footer. Derived from the
    // max posted_date across all rows (set in init).
    get lastSyncLabel() {
      if (!this.lastSyncIso) return '—';
      return formatDate(this.lastSyncIso, this.lang);
    },
    // Shortened "DD Mon YYYY · HH:MM" for the admin grid's Added column.
    // Falls back to '—' for null / unparseable values (rows loaded from the
    // published JSON snapshot won't carry created_at).
    formatDateTime(iso) { return formatDateTime(iso, this.lang); },
    toArDigits(n) {
      const map = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
      return String(n).replace(/\d/g, d => map[+d]);
    },

    // ============================================================
    // RENDER HELPERS (returning HTML strings for x-html)
    // ============================================================
    // size: pixel size for 'fixed' mode (default). When mode='fill' the portrait
    //   absolutely fills its parent container so callers can size it via
    //   aspect-ratio CSS instead of fixed pixels — used for the big grid cards.
    //
    // No-photo fallback: shows only the calligraphic silhouette + frame corners.
    // The Latin-style first-initial monogram (e.g. "AB") was removed 2026-05-18
    // because it reads oddly in Arabic — connecting letters change shape when
    // standalone, and double-initial conventions aren't a thing in Arabic names.
    renderPortrait(m, size, frame, mode) {
      if (!m) return '';
      const tone = (m.id % 3 === 0) ? 'tone-olive' : '';
      const usePhotos = (window.AQMAR_CONFIG && window.AQMAR_CONFIG.usePhotos);
      const photo = usePhotos ? (m.photo || null) : null;
      const photoHtml = photo
        ? `<img src="${esc(photo)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">`
        : '';
      const fill = mode === 'fill';
      const sizeStyle = fill
        ? 'position:absolute; inset:0; width:100%; height:100%;'
        : `width:${size}px; height:${Math.round(size * 1.18)}px;`;
      return `
        <div class="portrait ${tone} ${frame ? '' : 'naked'}" style="${sizeStyle}">
          ${photoHtml}
          <svg class="silhouette" viewBox="0 0 100 118">
            <circle cx="50" cy="44" r="18" fill="rgba(255,255,255,0.18)" />
            <path d="M18 118 Q18 80 50 80 Q82 80 82 118 Z" fill="rgba(255,255,255,0.18)" />
          </svg>
          <span class="corner tl"></span><span class="corner tr"></span>
          <span class="corner bl"></span><span class="corner br"></span>
        </div>`;
    },

    // Lifespan line — day-precision axis from birth to today, with the
    // global events (data/settings.json) that fall inside this person's
    // lifetime. Emits BOTH the horizontal desktop layout and the vertical
    // ≤480px layout; CSS swaps them. All positions are PHYSICAL left
    // percentages computed here — the old inset-inline-start +
    // translateX(-50%) mix sat markers off-center by half their width in
    // Arabic, and the 90deg gradient ran backwards in RTL (now CSS per-dir).
    // Every event name passes through esc(): settings.json is admin-authored
    // content entering x-html markup.
    renderTimeline(m) {
      if (!m.birth || !m.martyrdom) return '';
      const ar = this.lang === 'ar';
      const t0 = new Date(String(m.birth).slice(0, 10) + 'T00:00:00').getTime();
      const tMart = new Date(String(m.martyrdom).slice(0, 10) + 'T00:00:00').getTime();
      if (!Number.isFinite(t0) || !Number.isFinite(tMart) || tMart <= t0) return '';
      const t1 = Math.max(Date.now(), tMart);
      const span = Math.max(t1 - t0, 86400000);
      const pct = (iso) => {
        const t = new Date(String(iso).slice(0, 10) + 'T00:00:00').getTime();
        return Math.min(Math.max(((t - t0) / span) * 100, 0), 100);
      };
      const phys = (p) => (ar ? 100 - p : p);
      const pBirth = pct(m.birth), pMart = pct(m.martyrdom);
      const birthY = String(m.birth).slice(0, 4);
      const martY = String(m.martyrdom).slice(0, 4);
      const days = Math.floor((tMart - t0) / 86400000);
      const ageStr = Number.isFinite(m.age) ? m.age : '—';
      const evs = eventsForPerson(this.events, m.birth, m.martyrdom);
      const ageLine = (n) => n == null ? '' : (ar ? `عمره ${n} عاماً` : `Age ${n}`);

      // ---- header: lived line + legend ----
      let h = `
        <div class="lifeline-head">
          <div>
            <div class="lifeline-kicker">${ar ? 'خطّ الحياة' : 'Lifespan'}</div>
            <div class="lifeline-lived">
              ${ar
                ? `عاشَ <b>${ageStr}</b> عاماً <span class="days">(${days.toLocaleString('ar-EG')} يوماً)</span>`
                : `Lived <b>${ageStr}</b> years <span class="days">(${days.toLocaleString()} days)</span>`}
            </div>
          </div>
          <div class="lifeline-legend">
            <span><span class="sw sw-birth"></span>${ar ? 'الميلاد' : 'Birth'}</span>
            <span><span class="sw sw-mart"></span>${ar ? 'الاستشهاد' : 'Martyrdom'}</span>
            ${evs.length ? `
            <span><span class="sw sw-event"></span>${ar ? 'حدث' : 'Event'}</span>
            <span><span class="sw sw-band"></span>${ar ? 'فترة حدث' : 'Event period'}</span>` : ''}
          </div>
        </div>`;

      // ---- horizontal layout (hidden ≤480px) ----
      h += `<div class="lifeline"><svg class="lifeline-leaders" aria-hidden="true"></svg>`;
      h += `<div class="lifeline-base"></div>`;
      h += `<div class="lifeline-life" style="left:${Math.min(phys(pBirth), phys(pMart))}%; width:${pMart - pBirth}%;"></div>`;
      evs.forEach((e) => {
        const ps = pct(e.start_date);
        const pe = Math.min(pct(e.end_date || m.martyrdom), pMart); // ongoing/overrunning → clamp
        h += `<div class="lifeline-band" style="left:${Math.min(phys(ps), phys(pe))}%; width:${Math.abs(pe - ps)}%;"></div>`;
      });
      const markerPcts = [pBirth, pMart, ...evs.map(e => pct(e.start_date))];
      const yStart = Math.ceil(parseInt(birthY, 10) / 5) * 5;
      const yEnd = new Date().getFullYear();
      for (let y = yStart; y <= yEnd; y += 5) {
        const tp = pct(`${y}-01-01`);
        if (markerPcts.some(mp => Math.abs(mp - tp) < 3)) continue; // don't collide
        h += `<div class="lifeline-tick" style="left:${phys(tp)}%;"><span>${y}</span></div>`;
      }
      h += `<div class="mk mk-birth" style="left:${phys(pBirth)}%;"></div>
            <div class="mk-year mk-year-birth" style="left:${phys(pBirth)}%;">${birthY}</div>
            <div class="mk mk-mart" style="left:${phys(pMart)}%;"></div>
            <div class="mk-year mk-year-mart" style="left:${phys(pMart)}%;">${martY}</div>`;
      evs.forEach((e, i) => {
        const x = phys(pct(e.start_date));
        const side = i % 2 === 0 ? 'above' : 'below';
        h += `<div class="mk mk-event" style="left:${x}%;"></div>
              <div class="ev-label" data-x="${x}" data-side="${side}">
                <div class="n">${esc(eventDisplayName(e, this.lang))}</div>
                ${e.age_at_start != null ? `<div class="a">${ageLine(e.age_at_start)}</div>` : ''}
              </div>`;
      });
      h += `</div>`;

      // ---- event detail list (hidden ≤480px with the line) ----
      if (evs.length) {
        h += `<div class="ev-list">` + evs.map((e) => `
          <div class="ev-row">
            <span class="bullet"></span>
            <span class="n">${esc(eventDisplayName(e, this.lang))}</span>
            <span class="d">${e.end_date
              ? formatDateRange(e.start_date, e.end_date, this.lang)
              : `${formatDate(e.start_date, this.lang)} — ${ar ? 'مستمر' : 'ongoing'}`}</span>
            ${e.age_at_start != null ? `<span class="age-pill">${ageLine(e.age_at_start)}</span>` : ''}
          </div>`).join('') + `</div>`;
      }

      // ---- vertical layout (shown ≤480px) ----
      h += `<div class="lifeline-v">
        <div class="v-entry">
          <span class="v-mk"><span class="sw sw-birth"></span></span>
          <div class="v-year v-year-birth">${birthY}</div>
          <div class="v-date">${ar ? 'وُلد في' : 'Born'} ${formatDate(m.birth, this.lang)}</div>
        </div>`;
      evs.forEach((e) => {
        h += `<div class="v-entry">
          <span class="v-mk"><span class="sw sw-event"></span></span>
          <div class="v-name">${esc(eventDisplayName(e, this.lang))}</div>
          <div class="v-date">${e.end_date
            ? formatDateRange(e.start_date, e.end_date, this.lang)
            : formatDate(e.start_date, this.lang)}</div>
          <div class="v-meta">
            ${e.age_at_start != null ? `<span class="age-pill">${ageLine(e.age_at_start)}</span>` : ''}
            ${!e.end_date ? `<span class="tag-ongoing">${ar ? 'استمرّ حتى استشهاده' : 'Ongoing at his martyrdom'}</span>` : ''}
          </div>
        </div>`;
      });
      h += `<div class="v-entry">
          <span class="v-mk"><span class="sw sw-mart"></span></span>
          <div class="v-year v-year-mart">${martY}</div>
          <div class="v-date">${ar ? 'استُشهد في' : 'Martyred'} ${formatDate(m.martyrdom, this.lang)}</div>
          ${Number.isFinite(m.age) ? `<div class="v-meta"><span class="age-pill">${ar ? `عن عمر ${m.age} عاماً` : `Aged ${m.age}`}</span></div>` : ''}
        </div>
      </div>`;
      return h;
    },
  };
}

// ===== Free functions ===========================================

// Inverse of normalizePhotoPath() in data-loader.js. Strips the leading "../"
// that the loader prepends so paths resolve from /webui/ → /data/photos/...
// Used by the admin save path to turn a normalized carousel src ("../data/
// frames/41_28.jpg") back into the raw DB shape ("data/frames/41_28.jpg")
// before sending it to the API. Pass-through for absolute URLs and already-
// raw paths.
function denormalizePath(p) {
  if (!p) return p;
  return p.replace(/\\/g, '/').replace(/^\.\.\//, '');
}

function dayDelta(birthIso, targetMonth, targetDay) {
  if (!birthIso) return Infinity;
  const [, mStr, dStr] = birthIso.split('-');
  const m = parseInt(mStr, 10);
  const d = parseInt(dStr, 10);
  const cum = [0,31,59,90,120,151,181,212,243,273,304,334];
  const a = cum[m-1] + d;
  const b = cum[targetMonth-1] + targetDay;
  const diff = Math.abs(a - b);
  return Math.min(diff, 365 - diff);
}

// Build a "YYYY-MM-DD" string from numeric parts, or null when no year is set.
function isoDate(year, month, day) {
  return year ? `${year}-${pad(month)}-${pad(day)}` : null;
}

// Signed calendar-day delta between the user's full birth date and a martyr's
// birth date — honours the year (unlike the month+day-only dayDelta).
//   positive → martyr born AFTER the user → martyr is younger ("+" badge)
//   negative → martyr born BEFORE the user → martyr is older ("−" badge)
//   0        → same calendar date → "نفس اليوم"
//   Infinity → date missing/unparseable; Math.abs(Infinity) keeps the row
//              outside every window and sorts it last.
// daysBetween() comes from filter-logic.js.
function birthDelta(userIso, birthIso) {
  if (!userIso || !birthIso) return Infinity;
  const d = daysBetween(userIso, birthIso);
  return Number.isFinite(d) ? d : Infinity;
}

function pad(n) { return String(n).padStart(2, '0'); }

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}

// Compact date+time for the admin grid's Added column. Accepts ISO strings
// like "2026-05-23T12:34:56.789000" (pyodbc → FastAPI default JSON encoding
// of datetime). Renders "DD Month YYYY · HH:MM" in the matching locale.
function formatDateTime(iso, locale = 'ar') {
  if (!iso || typeof iso !== 'string') return '—';
  const m = iso.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s](\d{1,2}):(\d{2})/);
  if (!m) return formatDate(iso, locale);  // date-only fallback
  const y = m[1];
  const mIdx = parseInt(m[2], 10) - 1;
  const d = parseInt(m[3], 10);
  const hh = String(m[4]).padStart(2, '0');
  const mm = m[5];
  if (mIdx < 0 || mIdx > 11 || d < 1 || d > 31) return '—';
  if (locale === 'en') {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d} ${months[mIdx]} ${y} · ${hh}:${mm}`;
  }
  const arMonths = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${d} ${arMonths[mIdx]} ${y} · ${hh}:${mm}`;
}

function formatDate(iso, locale = 'ar') {
  // Validate strictly: must be a YYYY-MM-DD prefix with month 1-12 and day 1-31.
  // Malformed OCR output (e.g. "فبرايسر", "٥٤٤ 2025") and missing/null values
  // fall through to em-dash instead of rendering "NaN undefined undefined".
  if (!iso || typeof iso !== 'string') return '—';
  const match = iso.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (!match) return '—';
  const y = match[1];
  const mIdx = parseInt(match[2], 10) - 1;
  const d = parseInt(match[3], 10);
  if (mIdx < 0 || mIdx > 11 || d < 1 || d > 31) return '—';
  if (locale === 'en') {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d} ${months[mIdx]} ${y}`;
  }
  const arMonths = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${d} ${arMonths[mIdx]} ${y}`;
}

// Date-range display for events: same-month ranges compact to
// "24 – 30 نوفمبر 2023"; cross-month ranges join both full dates with an
// arrow matching the reading direction. Falls back to whichever date is
// valid when one side is malformed.
function formatDateRange(startIso, endIso, locale = 'ar') {
  const fs = formatDate(startIso, locale);
  const fe = formatDate(endIso, locale);
  if (fs === '—' || fe === '—') return fs !== '—' ? fs : fe;
  if (String(startIso).slice(0, 7) === String(endIso).slice(0, 7)) {
    const startDay = parseInt(String(startIso).slice(8, 10), 10);
    return `${startDay} – ${fe}`;
  }
  return locale === 'en' ? `${fs} → ${fe}` : `${fs} ← ${fe}`;
}

// Y of the horizontal line inside .lifeline, in px. MUST match the CSS tops
// in the "Lifespan line + global events" block of styles.css.
const LIFELINE_TOP = 112;

// Post-render label layout for the lifespan line. Event labels keep their
// side (above/below) but may slide horizontally so they never overlap; an
// SVG leader line connects each label back to its true marker position.
// Runs after every renderTimeline() insertion (x-effect + $nextTick in
// index.html) and on window resize. No-op while the horizontal layout is
// hidden (≤480px shows the vertical layout instead).
function dodgeTimelineLabels(root) {
  if (!root) return;
  const tl = root.querySelector('.lifeline');
  if (!tl || tl.offsetParent === null) return;
  const svg = tl.querySelector('.lifeline-leaders');
  const labels = Array.from(tl.querySelectorAll('.ev-label'));
  if (!svg || labels.length === 0) return;
  const W = tl.clientWidth;
  svg.setAttribute('viewBox', `0 0 ${W} ${tl.clientHeight}`);
  svg.innerHTML = '';
  const GAP = 14;
  ['above', 'below'].forEach((side) => {
    const group = labels
      .filter((l) => l.dataset.side === side)
      .map((l) => ({ el: l, target: (parseFloat(l.dataset.x) / 100) * W, w: l.offsetWidth }))
      .sort((a, b) => a.target - b.target);
    // Two sweeps: push right off earlier labels, then clamp back from the
    // container edge — labels end up as close to their true x as fits.
    let prevRight = 0;
    group.forEach((g) => {
      g.c = Math.max(g.target, prevRight + g.w / 2);
      prevRight = g.c + g.w / 2 + GAP;
    });
    let nextLeft = W;
    for (let i = group.length - 1; i >= 0; i--) {
      const g = group[i];
      g.c = Math.min(g.c, nextLeft - g.w / 2);
      nextLeft = g.c - g.w / 2 - GAP;
    }
    group.forEach((g) => {
      g.el.style.left = `${g.c - g.w / 2}px`;
      g.el.style.visibility = 'visible';
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', g.target);
      line.setAttribute('y1', side === 'above' ? LIFELINE_TOP - 12 : LIFELINE_TOP + 12);
      line.setAttribute('x2', g.c);
      line.setAttribute('y2', side === 'above' ? LIFELINE_TOP - 34 : LIFELINE_TOP + 28);
      svg.appendChild(line);
    });
  });
}
