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

  // Describe the age delta in Arabic, choosing the right unit (days / months /
  // years) and direction word ("أكبر" / "أصغر").
  //   deltaDays = (martyr_birth_date - user_birth_date) in days
  //     positive → martyr born AFTER user → martyr is younger (smaller age)
  //     negative → martyr born BEFORE user → martyr is older (greater age)
  // Returns { icon, text, direction }.
  function describeDelta(deltaDays) {
    if (deltaDays === 0) return { icon: "●", text: "نفس يوم ميلادك", direction: "same" };
    const abs = Math.abs(deltaDays);
    const direction = deltaDays > 0 ? "younger" : "older";
    const word = deltaDays > 0 ? "أصغر" : "أكبر";
    const icon = deltaDays > 0 ? "▼" : "▲";
    let unit;
    if (abs <= 5) {
      unit = `${abs} ${abs === 1 ? "يوم" : "أيام"}`;
    } else if (abs <= 60) {
      unit = `${abs} يوم`;
    } else if (abs < 365) {
      const months = Math.round(abs / 30);
      unit = `${months} ${months <= 10 ? "أشهر" : "شهر"}`;
    } else {
      const years = Math.floor(abs / 365);
      const remDays = abs - years * 365;
      const months = Math.round(remDays / 30);
      const yearsStr = `${years} ${years === 1 ? "سنة" : (years <= 10 ? "سنوات" : "سنة")}`;
      unit = months > 0 ? `${yearsStr} و ${months} شهر` : yearsStr;
    }
    return { icon, text: `${word} منك بـ ${unit}`, direction };
  }

  global.daysBetween = daysBetween;
  global.windowDaysFromMode = windowDaysFromMode;
  global.filterByProximity = filterByProximity;
  global.describeDelta = describeDelta;
})(window);
