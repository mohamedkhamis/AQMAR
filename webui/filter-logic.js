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

  // Age at martyrdom: integer years between birth and martyrdom dates.
  // Returns null if either is missing or unparseable.
  function computeAge(birthDate, deathDate) {
    if (!birthDate || !deathDate) return null;
    const b = new Date(birthDate);
    const d = new Date(deathDate);
    if (isNaN(b.getTime()) || isNaN(d.getTime())) return null;
    let age = d.getFullYear() - b.getFullYear();
    const monthDiff = d.getMonth() - b.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && d.getDate() < b.getDate())) age--;
    return age;
  }

  // Compare two ISO date strings ("YYYY-MM-DD" or "YYYY-MM-DD HH:MM").
  // Empty strings sort last in ascending order.
  function dateCmp(a, b, ascending) {
    const av = a || "";
    const bv = b || "";
    if (av === "" && bv !== "") return 1;     // empties last
    if (bv === "" && av !== "") return -1;
    if (av === bv) return 0;
    return ascending ? av.localeCompare(bv) : bv.localeCompare(av);
  }

  // Sort rows by named mode. Modes:
  //   'proximity'         — only valid if rows have _delta_days; closest first
  //   'martyrdom_desc'    — newest martyrdom first
  //   'martyrdom_asc'     — oldest martyrdom first
  //   'birth_asc'         — oldest (born earliest = older today) first
  //   'birth_desc'        — youngest first
  //   'posted_desc'       — newest channel post first
  //   'posted_asc'        — oldest channel post first
  //   'name_asc'          — alphabetical (Arabic-aware via localeCompare)
  function sortRows(rows, mode) {
    const copy = [...rows];
    switch (mode) {
      case "proximity":
        return copy.sort((a, b) => {
          const ad = a._delta_days === undefined ? Infinity : Math.abs(a._delta_days);
          const bd = b._delta_days === undefined ? Infinity : Math.abs(b._delta_days);
          return ad - bd;
        });
      case "martyrdom_asc":  return copy.sort((a, b) => dateCmp(a.martyrdom_date, b.martyrdom_date, true));
      case "martyrdom_desc": return copy.sort((a, b) => dateCmp(a.martyrdom_date, b.martyrdom_date, false));
      case "birth_asc":      return copy.sort((a, b) => dateCmp(a.birth_date, b.birth_date, true));
      case "birth_desc":     return copy.sort((a, b) => dateCmp(a.birth_date, b.birth_date, false));
      case "posted_asc":     return copy.sort((a, b) => dateCmp(a.posted_date, b.posted_date, true));
      case "posted_desc":    return copy.sort((a, b) => dateCmp(a.posted_date, b.posted_date, false));
      case "name_asc":       return copy.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ar"));
      default:               return copy;
    }
  }

  // Short, compact delta — for cards in the grid.
  // "▼ 3 أيام" / "▲ 2 شهر" / "● اليوم".
  function describeDeltaShort(deltaDays) {
    if (deltaDays === 0) return { icon: "●", text: "اليوم", direction: "same" };
    const abs = Math.abs(deltaDays);
    const direction = deltaDays > 0 ? "younger" : "older";
    const icon = deltaDays > 0 ? "▼" : "▲";
    let text;
    if (abs <= 5) {
      text = `${abs} ${abs === 1 ? "يوم" : "أيام"}`;
    } else if (abs <= 60) {
      text = `${abs} يوم`;
    } else if (abs < 365) {
      const m = Math.round(abs / 30);
      text = `${m} ${m <= 10 ? "أشهر" : "شهر"}`;
    } else {
      const y = Math.floor(abs / 365);
      const remDays = abs - y * 365;
      const m = Math.round(remDays / 30);
      text = m > 0
        ? `${y} ${y === 1 ? "سنة" : "سنوات"} و ${m} شهر`
        : `${y} ${y === 1 ? "سنة" : "سنوات"}`;
    }
    return { icon, text, direction };
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

  function normalizeArabic(text) {
    if (!text) return "";
    let s = String(text);
    s = s.replace(/[ً-ْ]/g, "");      // diacritics
    s = s.replace(/ـ/g, "");               // tatweel
    s = s.replace(/[أإآ]/g, "ا");  // أإآ → ا
    s = s.replace(/ة/g, "ه");         // ة → ه
    s = s.replace(/ى/g, "ي");         // ى → ي
    s = s.replace(/\s+/g, " ").trim();
    return s;
  }

  global.daysBetween = daysBetween;
  global.windowDaysFromMode = windowDaysFromMode;
  global.filterByProximity = filterByProximity;
  global.describeDelta = describeDelta;
  global.describeDeltaShort = describeDeltaShort;
  global.computeAge = computeAge;
  global.sortRows = sortRows;
  global.normalizeArabic = normalizeArabic;
})(window);
