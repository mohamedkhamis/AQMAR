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
    draft: {},
    edits: {},
    adminSearch: '',
    adminLimit: 30,           // pagination cap for the admin table — bumped by "Show more"
    mobileNavOpen: false,
    loading: true,            // true until the initial loadData() resolves (or errors out)
    lastSyncIso: null,        // most recent posted_date across all rows — drives the footer "Last sync"
    dataSource: null,         // 'supabase' | 'local-json' | 'sample-data' | null — drives the banner copy

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
      { id: 'browse', ar: 'السجلّ',   en: 'Registry' },
      { id: 'about',  ar: 'عن الموقع', en: 'About' },
    ],

    arMonths: ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'],
    enMonths: ['January','February','March','April','May','June','July','August','September','October','November','December'],
    windowOptions: [
      { v: 7,   ar: 'أسبوع',       en: '1 wk' },
      { v: 30,  ar: 'شهر',         en: '1 mo' },
      { v: 60,  ar: 'شهران',       en: '2 mo' },
      { v: 365, ar: 'السنة كاملة', en: 'Year' },
    ],
    sortOptions: [
      { id: 'recent', ar: 'الأحدث استشهاداً', en: 'Most recent' },
      { id: 'age',    ar: 'الأصغر عُمراً',    en: 'Youngest' },
      { id: 'name',   ar: 'أبجدياً',          en: 'A→Z' },
    ],

    // ----- birthday-match -----
    bday: { day: new Date().getDate(), month: new Date().getMonth() + 1, window: 30 },
    matchFilter: null,

    // ----- browse filters -----
    filters: { q: '', city: '', rank: '', batt: '', age: '' },
    sort: 'recent',

    // ============================================================
    // INIT
    // ============================================================
    async init() {
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

      // Load martyrs. Tries three sources in priority order:
      //   1. Supabase (the canonical source post-migration)
      //   2. Local data/martyrs.json (lets you test locally with real 388-row
      //      dataset before Supabase is configured)
      //   3. AQMAR_SAMPLE_DATA (36 synthetic rows, last resort)
      let martyrs = null;
      const ingestRows = (rows) => {
        martyrs = rows.map(adaptMartyrToNewSchema).filter(Boolean);
        const dates = rows.map(r => r && r.posted_date).filter(Boolean);
        if (dates.length) this.lastSyncIso = dates.sort().reverse()[0];
      };
      try {
        const data = await loadData();
        ingestRows(data.martyrs || []);
        this.dataSource = 'supabase';
      } catch (e) {
        console.warn('Supabase load failed, trying local data/martyrs.json:', e.message);
        try {
          const res = await fetch('../data/martyrs.json', { cache: 'no-cache' });
          if (res.ok) {
            const raw = await res.json();
            const rows = Array.isArray(raw) ? raw : (raw.martyrs || []);
            ingestRows(rows);
            this.dataSource = 'local-json';
            console.info(`Loaded ${rows.length} rows from local data/martyrs.json`);
          }
        } catch (e2) {
          console.warn('Local JSON also unreachable:', e2.message);
        }
      } finally {
        // Flip loading off regardless of which path succeeded so the empty-state
        // message switches from "Loading…" to "No matching names" cleanly.
        this.loading = false;
      }
      if (!martyrs && window.AQMAR_SAMPLE_DATA) {
        martyrs = window.AQMAR_SAMPLE_DATA;
        this.dataSource = 'sample-data';
      }
      if (!martyrs) martyrs = [];
      // overrides.json fetch removed — admin edits live in Supabase as of Task 10.

      // Clamp bday.day whenever the month changes — so picking Feb after day=31
      // doesn't leave an out-of-range value floating around.
      this.$watch('bday.month', () => {
        if (this.bday.day > this.bdayDaysInMonth) this.bday.day = this.bdayDaysInMonth;
      });

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

    // ============================================================
    // NAVIGATION
    // ============================================================
    goto(v) {
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
    // DERIVED — birthday match preview & on-this-day
    // ============================================================
    get previewMatches() {
      return this.all
        .map(m => ({ ...m, delta: dayDelta(m.birth, this.bday.month, this.bday.day) }))
        .sort((a, b) => a.delta - b.delta)
        .slice(0, 3);
    },
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
    get aboutBlocks() {
      return [
        { ar: ['١. الجمع','Telethon يَجلب الرسائل عبر MTProto بلا كلفة، ويحتفظ بحالةِ التشغيل ليستأنف عند توقّفه.'], en: ['1. Collection','Telethon pulls messages via MTProto. State is persisted so a crashed run resumes.'] },
        { ar: ['٢. الاستخلاص','ffmpeg + EasyOCR يَستخرجان الاسمَ والميلادَ والاستشهادَ والمدينةَ من الإطارات والصور.'], en: ['2. Extraction','ffmpeg + EasyOCR pull name, birth/martyrdom dates and city from video frames and photos.'] },
        { ar: ['٣. التحرير','واجهة الإدارة تتيح تصحيحَ كلّ حقلٍ. التعديلاتُ تُحفظ مباشرةً في Supabase وتَظهر فوراً.'], en: ['3. Editing','The admin UI lets you correct any field. Edits save directly to Supabase and go live instantly.'] },
        { ar: ['٤. النشر','واجهةٌ ثابتةٌ بدون خادم: انسخْها إلى GitHub Pages أو Netlify أو Cloudflare.'], en: ['4. Publication','A static SPA: deploy to GitHub Pages, Netlify, or Cloudflare — no server required.'] },
      ];
    },

    // ============================================================
    // BROWSE — filtered list
    // ============================================================
    runBirthdaySearch() {
      this.matchFilter = { ...this.bday };
      this.view = 'browse';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    clearFilters() {
      this.filters = { q: '', city: '', rank: '', batt: '', age: '' };
    },
    get filtered() {
      let list = this.all.map(m => ({ ...m }));
      if (this.matchFilter) {
        const { month, day, window: w } = this.matchFilter;
        list = list
          .map(m => ({ ...m, delta: dayDelta(m.birth, month, day) }))
          .filter(m => m.delta <= w);
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

      if (this.matchFilter) {
        list.sort((a, b) => a.delta - b.delta);
      } else if (this.sort === 'recent') {
        list.sort((a, b) => (b.martyrdom || '').localeCompare(a.martyrdom || ''));
      } else if (this.sort === 'age') {
        list.sort((a, b) => (a.age || 0) - (b.age || 0));
      } else if (this.sort === 'name') {
        list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
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
    async checkSession() {
      if (!window.AQMAR_SB || window.AQMAR_SUPABASE_PLACEHOLDER) return;
      try {
        const { data: { session } } = await window.AQMAR_SB.auth.getSession();
        this.isAdmin = !!session;
      } catch (e) {
        // Network error or bad URL — leave isAdmin=false silently.
      }
    },
    async doLogin() {
      this.loginError = '';
      // Placeholder Supabase URL ("https://YOURPROJECT.supabase.co") would
      // produce a DNS error on signInWithPassword — surface a clearer message
      // and skip the network call entirely so the user understands they need
      // to configure webui/config.js first.
      if (!window.AQMAR_SB || window.AQMAR_SUPABASE_PLACEHOLDER) {
        this.loginError = this.lang === 'ar'
          ? 'الواجهة في وضع المعاينة — حدّث webui/config.js بمفاتيح Supabase لتفعيل الإدارة'
          : 'Preview mode — set real Supabase keys in webui/config.js to enable admin';
        return;
      }
      const { error } = await window.AQMAR_SB.auth.signInWithPassword({
        email: this.loginUser,
        password: this.loginPass,
      });
      if (error) {
        this.loginError = this.lang === 'ar' ? 'بيانات الدخول غير صحيحة' : 'Invalid credentials';
        return;
      }
      this.isAdmin = true;
      this.showLogin = false;
      this.loginPass = '';
      this.view = 'admin';
    },
    async logout() {
      if (window.AQMAR_SB) await window.AQMAR_SB.auth.signOut();
      this.isAdmin = false;
      this.editingId = null;
      this.view = 'home';
    },

    get adminHeaders() {
      // Switches with lang. Previously a static array of "Arabic / English"
      // dual-language strings — inconsistent with the rest of the SPA.
      const ar = this.lang === 'ar';
      return [
        '#',
        ar ? 'الاسم' : 'Name',
        ar ? 'الميلاد' : 'Born',
        ar ? 'الاستشهاد' : 'Martyrdom',
        ar ? 'المدينة' : 'City',
        ar ? 'الكتيبة' : 'Battalion',
        ar ? 'الحالة' : 'Status',
      ];
    },
    adminList() {
      // Delegate to the same Arabic-aware searchPredicate the browse view uses
      // (handles diacritics, alef forms, ta-marbouta vs. ha-marbouta, lam-alef
      // ligatures) instead of plain ASCII lowercase + substring.
      const q = this.adminSearch.trim();
      if (!q) return this.all;
      return this.all.filter(m => searchPredicate(m, q));
    },

    editMartyr(id) {
      this.editingId = id;
      const m = this.all.find(x => x.id === id);
      const e = this.edits[id] || {};
      this.draft = { ...m, ...e };
      this.view = 'admin';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    editingMartyr() {
      return this.editingId ? this.all.find(m => m.id === this.editingId) : null;
    },
    draftDirty() {
      const m = this.editingMartyr();
      if (!m) return false;
      const current = { ...m, ...(this.edits[m.id] || {}) };
      for (const k of Object.keys(this.draft)) {
        if (this.draft[k] !== current[k]) return true;
      }
      return false;
    },
    cancelEdit() {
      this.editingId = null;
      this.draft = {};
    },
    // Saves an admin edit. Asynchronous because it round-trips to Supabase.
    // On success: optimistically patches this.all[idx] so the UI updates
    // instantly. this.edits is also updated as a session-scoped dirty-marker
    // cache (no longer exported — Supabase is canonical).
    async saveEdit() {
      const m = this.editingMartyr();
      if (!m) return;
      const diff = buildEditDiff(m, this.draft);
      if (Object.keys(diff).length === 0) {
        this.editingId = null;
        this.draft = {};
        return;
      }
      try {
        await saveEditToSupabase(m.id, diff);
      } catch (e) {
        alert("تعذّر حفظ التعديل في Supabase:\n" + e.message);
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
          { text: ar ? 'كل الأسماء' : 'All names',     go: 'browse' },
          { text: ar ? 'في مثل هذا اليوم' : 'On this day', go: 'home' },
        ]},
        { title: ar ? 'تواصل' : 'Contact', links: [
          { text: '@AqmarTofan',                      href: 'https://t.me/AqmarTofan', external: true },
          { text: ar ? 'بلّغ عن خطأ' : 'Report correction', href: 'mailto:info@azkapmo.com?subject=AQMAR%20correction' },
        ]},
      ];
    },

    // ============================================================
    // HELPERS (also exposed for templates)
    // ============================================================
    formatDate(iso) { return formatDate(iso, this.lang); },
    computeAge(birth, martyrdom) {
      // Returns null if either date is missing OR malformed (e.g. "فبرايسر")
      // so downstream templates can render '—' instead of "null عاماً".
      if (!birth || !martyrdom) return null;
      const by = parseInt(String(birth).slice(0,4), 10);
      const my = parseInt(String(martyrdom).slice(0,4), 10);
      if (!Number.isFinite(by) || !Number.isFinite(my)) return null;
      const age = my - by;
      // Sanity bound — negative or unrealistic ages indicate scrambled OCR.
      if (age < 0 || age > 120) return null;
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
    // Formatted "Last sync" timestamp for the footer. Derived from the
    // max posted_date across all rows (set in init).
    get lastSyncLabel() {
      if (!this.lastSyncIso) return '—';
      return formatDate(this.lastSyncIso, this.lang);
    },
    toArDigits(n) {
      const map = ['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
      return String(n).replace(/\d/g, d => map[+d]);
    },

    // ============================================================
    // RENDER HELPERS (returning HTML strings for x-html)
    // ============================================================
    renderPortrait(m, size, frame) {
      if (!m) return '';
      const init = initials(m.name || '');
      const tone = (m.id % 3 === 0) ? 'tone-olive' : '';
      // Only try photo if config opts-in (silences 404 spam in dev previews).
      // Photo URLs come from Supabase Storage (post-migration) or are absent;
      // rows without a photo render the silhouette below cleanly. No fallback
      // to ../data/photos/ — that path 404s on GitHub Pages where only webui/
      // is deployed.
      const usePhotos = (window.AQMAR_CONFIG && window.AQMAR_CONFIG.usePhotos);
      const photo = usePhotos ? (m.photo || null) : null;
      const photoHtml = photo
        ? `<img src="${esc(photo)}" alt="" loading="lazy" decoding="async" onerror="this.style.display='none'">`
        : '';
      return `
        <div class="portrait ${tone} ${frame ? '' : 'naked'}"
             style="width:${size}px; height:${Math.round(size * 1.18)}px;">
          ${photoHtml}
          <svg class="silhouette" viewBox="0 0 100 118">
            <circle cx="50" cy="44" r="18" fill="rgba(255,255,255,0.18)" />
            <path d="M18 118 Q18 80 50 80 Q82 80 82 118 Z" fill="rgba(255,255,255,0.18)" />
          </svg>
          <div class="monogram" style="font-size:${Math.round(size * 0.42)}px;">${esc(init)}</div>
          <span class="corner tl"></span><span class="corner tr"></span>
          <span class="corner bl"></span><span class="corner br"></span>
        </div>`;
    },

    renderTimeline(m) {
      if (!m.birth || !m.martyrdom) return '';
      const ar = this.lang === 'ar';
      const birthY = parseInt(m.birth.slice(0,4), 10);
      const martY  = parseInt(m.martyrdom.slice(0,4), 10);
      if (!Number.isFinite(birthY) || !Number.isFinite(martY)) return '';
      const endY   = new Date().getFullYear();
      const startY = birthY;
      const range  = Math.max(endY - startY, 1);
      const birthPos = ((birthY - startY) / range) * 100;
      const martPos  = ((martY  - startY) / range) * 100;

      // Ticks every 5 years
      const ticks = [];
      for (let y = Math.ceil(startY / 5) * 5; y <= endY; y += 5) ticks.push(y);

      const days = Math.floor((new Date(m.martyrdom) - new Date(m.birth)) / 86400000);

      const tickHtml = ticks.map(y => {
        const pos = ((y - startY) / range) * 100;
        return `
          <div style="position:absolute; top:28px; inset-inline-start:${pos}%; width:1px; height:8px; background:var(--faint); transform:translateX(-50%);">
            <div style="position:absolute; top:12px; inset-inline-start:0; transform:translateX(-50%); font-family:var(--font-latin-sans); font-size:10px; color:var(--muted); font-variant-numeric:tabular-nums;">${y}</div>
          </div>`;
      }).join('');

      return `
        <div class="flex items-baseline justify-between mb-6">
          <div>
            <div class="font-latin-sans" style="font-size:11px; letter-spacing:0.2em; color:var(--olive); text-transform:uppercase;">
              ${ar ? 'خطّ الحياة' : 'Lifespan'}
            </div>
            <div class="font-display" style="font-size:22px; font-weight:500; margin-top:4px;">
              ${ar
                ? `عاشَ <b style="color:var(--forest)">${m.age}</b> عاماً <span style="color:var(--muted); font-size:16px;">(${days.toLocaleString('ar-EG')} يوماً)</span>`
                : `Lived <b style="color:var(--forest)">${m.age}</b> years <span style="color:var(--muted); font-size:16px;">(${days.toLocaleString()} days)</span>`}
            </div>
          </div>
          <div class="flex gap-4.5" style="gap:18px; font-size:12px; color:var(--muted);">
            <div class="flex items-center" style="gap:6px;">
              <span style="width:10px; height:10px; border-radius:50%; background:var(--olive); box-shadow: 0 0 0 3px var(--paper), 0 0 0 4px var(--olive);"></span>
              ${ar ? 'الميلاد' : 'Birth'}
            </div>
            <div class="flex items-center" style="gap:6px;">
              <span style="width:10px; height:10px; background:var(--forest); transform:rotate(45deg);"></span>
              ${ar ? 'الاستشهاد' : 'Martyrdom'}
            </div>
          </div>
        </div>
        <div style="position:relative; height:64px; margin-inline:12px;">
          <div style="position:absolute; top:30px; inset-inline:0; height:2px; background:var(--divider);"></div>
          <div style="position:absolute; top:28px; inset-inline-start:${birthPos}%; width:${martPos - birthPos}%; height:6px; background:linear-gradient(90deg, var(--olive), var(--forest)); border-radius:999px;"></div>
          ${tickHtml}
          <div style="position:absolute; top:18px; inset-inline-start:${birthPos}%; transform:translateX(-50%);">
            <div style="width:16px; height:16px; border-radius:50%; background:var(--olive); border:3px solid var(--paper); box-shadow:0 0 0 1px var(--olive);"></div>
            <div style="position:absolute; top:-22px; inset-inline-start:50%; transform:translateX(-50%); font-family:var(--font-naskh); font-size:12px; color:var(--olive); white-space:nowrap; font-weight:700;">${birthY}</div>
          </div>
          <div style="position:absolute; top:22px; inset-inline-start:${martPos}%; transform:translateX(-50%) rotate(45deg); width:14px; height:14px; background:var(--forest); box-shadow:0 0 0 3px var(--paper), 0 0 0 4px var(--forest);">
            <div style="position:absolute; top:-32px; inset-inline-start:50%; transform:translateX(-50%) rotate(-45deg); font-family:var(--font-naskh); font-size:12px; color:var(--forest); white-space:nowrap; font-weight:700;">${martY}</div>
          </div>
        </div>`;
    },
  };
}

// ===== Free functions ===========================================

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

function pad(n) { return String(n).padStart(2, '0'); }

function initials(name) {
  if (!name) return '؟';
  const parts = String(name).trim().split(/\s+/);
  return parts[0][0] + (parts[1] ? parts[1][0] : '');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
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
  const arMonths = ['كانون الثاني','شباط','آذار','نيسان','أيار','حزيران','تموز','آب','أيلول','تشرين الأول','تشرين الثاني','كانون الأول'];
  return `${d} ${arMonths[mIdx]} ${y}`;
}

async function sha256(text) {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}
