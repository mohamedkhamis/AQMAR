// webui/filter-logic.js
// Birthdate-proximity filter math. Pure functions — no DOM, no fetch.

(function (global) {
  "use strict";

  const MS_PER_DAY = 86400000;

  function daysBetween(fromIsoDate, toIsoDate) {
    const a = new Date(fromIsoDate).getTime();
    const b = new Date(toIsoDate).getTime();
    return Math.round((b - a) / MS_PER_DAY);
  }

  function windowDaysFromMode(mode, customDays) {
    const named = { "1week": 7, "1month": 30, "2months": 60 };
    if (named[mode] !== undefined) return named[mode];
    if (mode === "custom") {
      const n = parseInt(customDays, 10);
      if (isNaN(n) || n < 1) return 1;
      if (n > 365) return 365;
      return n;
    }
    return 30;  // fallback for unknown mode
  }

  function filterByProximity(rows, userBirthdate, windowDays) {
    if (!userBirthdate) return [];
    return rows
      .filter(r => r.birth_date)
      .map(r => ({ ...r, _delta_days: daysBetween(userBirthdate, r.birth_date) }))
      .filter(r => Math.abs(r._delta_days) <= windowDays)
      .sort((a, b) => Math.abs(a._delta_days) - Math.abs(b._delta_days));
  }

  global.daysBetween = daysBetween;
  global.windowDaysFromMode = windowDaysFromMode;
  global.filterByProximity = filterByProximity;
})(window);
