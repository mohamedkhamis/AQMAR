// webui/app.js
// Alpine.js root component for the AqmarTofan SPA.

window.app = function () {
  return {
    // === auth state ===
    loggedIn: localStorage.getItem(AQMAR_CONFIG.storage.auth) === "yes",
    loginUser: "",
    loginPass: "",
    loginError: "",
    showLoginModal: false,
    failedAttempts: 0,
    lockedUntil: 0,

    // === data state ===
    martyrs: [],
    overrides: {},
    pendingOverrides: {},                          // unexported localStorage edits
    allRows: [],
    isLoading: true,
    loadError: "",

    // === view state ===
    view: "public",                                // 'public' | 'admin'
    selectedRow: null,                             // photo zoom modal
    editingMsgId: null,                            // admin edit modal target
    editForm: {},                                  // bound to inputs in the modal

    // === public filter state ===
    userBirthdate: "",                             // YYYY-MM-DD string, written by Litepicker
    _picker: null,                                  // Litepicker instance
    windowMode: AQMAR_CONFIG.filterDefaultWindow,
    customDays: 30,
    filteredResults: [],
    customDaysError: "",
    // additional filters + sort
    sortMode: "martyrdom_desc",                    // default: newest martyrdom first
    martyrdomFrom: "",                             // "YYYY-MM-DD"
    martyrdomTo: "",
    ageMin: "",                                    // integer string
    ageMax: "",
    showAdvancedFilters: false,

    initLitepicker(el) {
      const self = this;
      const currentYear = new Date().getFullYear();
      const todayIso = new Date().toISOString().split("T")[0];
      this._picker = new Litepicker({
        element: el,
        format: "YYYY-MM-DD",
        singleMode: true,
        autoApply: true,
        maxDate: todayIso,
        dropdowns: { minYear: 1900, maxYear: currentYear, months: true, years: true },
        setup: (picker) => {
          picker.on("selected", (date) => {
            self.userBirthdate = date.format("YYYY-MM-DD");
            self.applyFilter();
          });
        },
      });
    },
    clearBirthdate() {
      this.userBirthdate = "";
      if (this._picker) this._picker.clearSelection();
      if (this.$refs && this.$refs.birthdate) this.$refs.birthdate.value = "";
      this.applyFilter();
    },

    // === computed-ish helpers (called from templates) ===
    get pendingEditCount() {
      return Object.keys(this.pendingOverrides).length;
    },
    get effectiveOverrides() {
      // Saved overrides + in-progress pending overrides (pending wins).
      const out = { ...this.overrides };
      for (const k of Object.keys(this.pendingOverrides)) {
        out[k] = { ...(out[k] || {}), ...this.pendingOverrides[k] };
      }
      return out;
    },

    // === lifecycle ===
    async init() {
      try {
        const data = await loadData(
          AQMAR_CONFIG.martyrsJson,
          AQMAR_CONFIG.overridesJson,
        );
        this.martyrs = data.martyrs;
        this.overrides = data.overrides;
        const pending = localStorage.getItem(AQMAR_CONFIG.storage.pending);
        if (pending) {
          try { this.pendingOverrides = JSON.parse(pending); }
          catch (e) { console.warn("Bad pendingOverrides in localStorage", e); }
        }
        this.refreshAllRows();
      } catch (e) {
        this.loadError = e.message;
      } finally {
        this.isLoading = false;
      }
    },

    refreshAllRows() {
      this.allRows = mergeOverrides(this.martyrs, this.effectiveOverrides);
      this.applyFilter();
    },

    // === filter pipeline (martyrdom-range → age-range → proximity → sort) ===
    applyFilter() {
      this.customDaysError = "";
      if (this.windowMode === "custom") {
        const n = parseInt(this.customDays, 10);
        if (isNaN(n) || n < AQMAR_CONFIG.filterCustomDaysMin || n > AQMAR_CONFIG.filterCustomDaysMax) {
          this.customDaysError = `${AQMAR_CONFIG.filterCustomDaysMin} - ${AQMAR_CONFIG.filterCustomDaysMax}`;
        }
      }
      let rows = this.allRows;

      // Filter 1: martyrdom date range
      if (this.martyrdomFrom) rows = rows.filter(r => r.martyrdom_date && r.martyrdom_date >= this.martyrdomFrom);
      if (this.martyrdomTo)   rows = rows.filter(r => r.martyrdom_date && r.martyrdom_date <= this.martyrdomTo);

      // Filter 2: age range (computed from birth_date + martyrdom_date)
      const aMin = this.ageMin === "" ? null : parseInt(this.ageMin, 10);
      const aMax = this.ageMax === "" ? null : parseInt(this.ageMax, 10);
      if (aMin !== null || aMax !== null) {
        rows = rows.filter(r => {
          const age = computeAge(r.birth_date, r.martyrdom_date);
          if (age === null) return false;
          if (aMin !== null && age < aMin) return false;
          if (aMax !== null && age > aMax) return false;
          return true;
        });
      }

      // Filter 3: birthdate proximity (only when userBirthdate set)
      if (this.userBirthdate) {
        const days = windowDaysFromMode(this.windowMode, this.customDays);
        rows = filterByProximity(rows, this.userBirthdate, days);
        // proximity also annotates _delta_days and sorts by closeness;
        // if the user explicitly chose a different sortMode, we'll re-sort below.
      }

      // Sort: use sortMode unless user has birthdate AND sortMode === default "martyrdom_desc",
      // in which case proximity ordering (already applied) is more useful.
      const effectiveSort = (this.userBirthdate && this.sortMode === "martyrdom_desc")
        ? "proximity"
        : this.sortMode;
      this.filteredResults = sortRows(rows, effectiveSort);
    },

    // === modals ===
    openPhotoModal(row) {
      this.selectedRow = row;
      document.body.classList.add("modal-open");
    },
    closePhotoModal() {
      this.selectedRow = null;
      document.body.classList.remove("modal-open");
    },
    openEditModal(row) {
      this.editingMsgId = row.msg_id;
      const editableFields = [
        "name", "birth_date", "martyrdom_date", "city",
        "military_rank", "weapon", "battalion", "brigade",
      ];
      this.editForm = {};
      for (const f of editableFields) this.editForm[f] = row[f] || "";
      document.body.classList.add("modal-open");
    },
    closeEditModal() {
      this.editingMsgId = null;
      this.editForm = {};
      document.body.classList.remove("modal-open");
    },

    // === admin actions ===
    saveEdit() {
      const original = this.allRows.find(r => r.msg_id === this.editingMsgId);
      if (!original) return;
      const diff = buildEditDiff(original, this.editForm);
      if (Object.keys(diff).length === 0) {
        this.closeEditModal();
        return;
      }
      this.pendingOverrides = addEdit(
        this.pendingOverrides,
        this.editingMsgId,
        diff,
        new Date().toISOString(),
        "admin",
      );
      localStorage.setItem(
        AQMAR_CONFIG.storage.pending,
        JSON.stringify(this.pendingOverrides),
      );
      this.refreshAllRows();
      this.closeEditModal();
    },

    exportOverrides() {
      const merged = this.effectiveOverrides;
      downloadOverridesJson(merged);
      // Optimistically move pending into overrides since the admin is about
      // to save the file — UI feels responsive even before reload.
      this.overrides = { ...merged };
      this.pendingOverrides = {};
      localStorage.removeItem(AQMAR_CONFIG.storage.pending);
    },

    // === login ===
    async login() {
      const now = Date.now();
      if (now < this.lockedUntil) {
        const remain = Math.ceil((this.lockedUntil - now) / 1000);
        this.loginError = `قُفل الدخول. حاول بعد ${remain} ثانية.`;
        return;
      }
      if (this.loginUser !== AQMAR_CONFIG.adminUsername) {
        this._recordFailedAttempt();
        return;
      }
      const buf = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(this.loginPass),
      );
      const hex = Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
      if (hex !== AQMAR_CONFIG.adminPasswordHash) {
        this._recordFailedAttempt();
        return;
      }
      // success
      this.failedAttempts = 0;
      this.lockedUntil = 0;
      this.loginError = "";
      localStorage.setItem(AQMAR_CONFIG.storage.auth, "yes");
      this.loggedIn = true;
      this.view = "admin";
      this.showLoginModal = false;
      this.loginPass = "";
    },

    _recordFailedAttempt() {
      this.failedAttempts++;
      if (this.failedAttempts >= AQMAR_CONFIG.loginMaxAttempts) {
        this.lockedUntil = Date.now() + AQMAR_CONFIG.loginLockSeconds * 1000;
        this.loginError = `قُفل الدخول بعد ${AQMAR_CONFIG.loginMaxAttempts} محاولات خاطئة.`;
        this.failedAttempts = 0;
      } else {
        this.loginError = "خطأ في اسم المستخدم أو كلمة المرور";
      }
    },

    logout() {
      localStorage.removeItem(AQMAR_CONFIG.storage.auth);
      this.loggedIn = false;
      this.view = "public";
    },
  };
};
