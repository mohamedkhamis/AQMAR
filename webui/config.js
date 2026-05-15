/* ============================================================== */
/* AQMAR — site configuration                                     */
/* Drop into webui/config.js                                       */
/* ============================================================== */

window.AQMAR_CONFIG = {
  // Set to true once data/photos/N.jpg files exist on disk (or once Supabase
  // Storage URLs are populated on each row). When false, every portrait
  // renders as a calligraphic monogram.
  usePhotos: true,

  // Public Supabase config. The anon key is PUBLIC by design — RLS on the
  // Postgres tables enforces who-can-do-what server-side. Admin login uses
  // Supabase Auth (see Authentication → Users in the Dashboard); credentials
  // are NOT stored in this file.
  supabaseUrl:     "https://YOURPROJECT.supabase.co",
  supabaseAnonKey: "PASTE_YOUR_ANON_KEY_HERE",
};

// ============================================================
// Sample data — used ONLY if data/martyrs.json is unavailable
// (e.g. when previewing the UI before running the pipeline).
// Once your real martyrs.json exists, this is silently ignored.
// ============================================================
(function () {
  const CITIES    = ['غزة','خان يونس','رفح','جباليا','دير البلح','بيت لاهيا','النصيرات','بيت حانون','الشجاعية','المغازي'];
  const RANKS     = ['مجاهد','مقاتل','قائد مجموعة','نائب قائد سرية','قائد سرية','قائد فصيل','قائد كتيبة'];
  const WEAPONS   = ['RPG','قناص','ناسف','هندسة قتالية','كورنيت','ياسين-105','بندقية اقتحام'];
  const BATTS     = ['كتيبة الشجاعية','كتيبة بيت حانون','كتيبة جباليا','كتيبة الزيتون','كتيبة خان يونس الشرقية','كتيبة رفح','كتيبة دير البلح','كتيبة المغازي'];
  const BRIGADES  = ['لواء غزة','لواء شمال غزة','لواء خان يونس','لواء رفح','لواء الوسطى'];
  const FIRST     = ['محمد','أحمد','عبدالله','إبراهيم','يوسف','خالد','حمزة','أنس','بلال','زكريا','مصطفى','عمر','سامي','كريم','ياسين','نضال','هيثم','أيمن','وليد','طارق','رامي','فادي','مهند','أسامة','جهاد'];
  const MIDDLE    = ['عبدالرحمن','محمود','خليل','سليمان','عبدالعزيز','حسين','عبدالكريم','نبيل','كمال','سعيد','رشيد','فتحي','صبحي','نعيم','حسن'];
  const LAST      = ['أبو شملة','الجعبري','الزواوي','النجار','الفرا','أبو ندى','الحلو','البنا','أبو حصيرة','السقا','العطار','أبو شريعة','اللوح','أبو سيف','الرنتيسي','الفليت','أبو وردة','السبع','الزعانين','أبو طه'];

  function seeded(n) { const x = Math.sin(n * 9973) * 10000; return x - Math.floor(x); }
  function rand(arr, s) { return arr[Math.floor(s * arr.length) % arr.length]; }
  function pad(n) { return String(n).padStart(2, '0'); }

  const data = Array.from({ length: 36 }, (_, i) => {
    const by = 1985 + Math.floor(seeded(i * 13) * 20);
    const bm = 1 + Math.floor(seeded(i * 17) * 12);
    const bd = 1 + Math.floor(seeded(i * 19) * 28);
    const birth = `${by}-${pad(bm)}-${pad(bd)}`;

    const my = 2023 + Math.floor(seeded(i * 23) * 3);
    const mm = my === 2023 ? 10 + Math.floor(seeded(i * 29) * 3) : 1 + Math.floor(seeded(i * 29) * 12);
    const md = 1 + Math.floor(seeded(i * 31) * 28);
    const martyrdom = `${my}-${pad(mm)}-${pad(md)}`;

    return {
      id: i + 1,
      name: `${rand(FIRST, seeded(i*3+1))} ${rand(MIDDLE, seeded(i*7+2))} ${rand(LAST, seeded(i*11+3))}`,
      birth, martyrdom,
      age: my - by,
      city: rand(CITIES, seeded(i*37)),
      rank: seeded(i*41) > 0.25 ? rand(RANKS, seeded(i*41)) : null,
      weapon: seeded(i*43) > 0.40 ? rand(WEAPONS, seeded(i*43)) : null,
      battalion: rand(BATTS, seeded(i*47)),
      brigade: rand(BRIGADES, seeded(i*53)),
      bio: seeded(i*59) > 0.30 ? null : 'التحق بصفوف المقاومة منذ نعومة أظفاره، عُرف بهدوئه وثباته في الميدان، وارتقى شهيداً في عملية نوعية شرق مدينته.',
    };
  });

  // Expose sample data when:
  //  - ?demo is in the URL (manual preview)
  //  - the Supabase URL is still the placeholder (developer hasn't configured
  //    real credentials yet — better to show 36 sample rows than a blank page)
  const cfg = window.AQMAR_CONFIG || {};
  const placeholder = !cfg.supabaseUrl || cfg.supabaseUrl.includes('YOURPROJECT');
  const demoFlag = new URLSearchParams(location.search).has('demo');
  if (demoFlag || placeholder) {
    window.AQMAR_SAMPLE_DATA = data;
    window.AQMAR_SUPABASE_PLACEHOLDER = placeholder;
  }
})();
