// webui/config.js
// Static configuration for the SPA. Anyone with dev tools can see these
// values — the login is theater, not real security.

window.AQMAR_CONFIG = {
  appName: "أقمار الطوفان — قاعدة بيانات الشهداء",
  appNameEn: "AqmarTofan — Martyrs Database",
  channel: "AqmarTofan",

  // Data file paths, relative to webui/index.html
  martyrsJson:   "../data/martyrs.json",
  overridesJson: "../data/overrides.json",

  // Admin auth.
  // Default password is `aqmar2026`. To change it, compute the new hash with:
  //   python -c "import hashlib; print(hashlib.sha256(b'YOUR_NEW_PASSWORD').hexdigest())"
  // then paste below.
  adminUsername:     "admin",
  adminPasswordHash: "aaa9e482389cd1cff1f7640a22225ac99c65bfbc4d063973163ec388fa59eb53",

  // Anti-bruteforce theater
  loginMaxAttempts:  3,
  loginLockSeconds:  30,

  // Filter defaults
  filterDefaultWindow: "1month",  // '1week' | '1month' | '2months' | 'custom'
  filterCustomDaysMin: 1,
  filterCustomDaysMax: 365,

  // localStorage keys
  storage: {
    auth:    "aqmar.auth",
    pending: "aqmar.pending_overrides",
  },
};
