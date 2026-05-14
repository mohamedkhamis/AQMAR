// webui/supabase-client.js
// Initializes the @supabase/supabase-js client and exposes it on window.

(function (global) {
  "use strict";
  if (!global.supabase || typeof global.supabase.createClient !== "function") {
    console.warn("Supabase SDK not loaded yet — webui/supabase-client.js sees no `supabase` global.");
    return;
  }
  const cfg = global.AQMAR_CONFIG;
  if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    console.warn("AQMAR_CONFIG.supabaseUrl / supabaseAnonKey missing — running in offline mode.");
    return;
  }
  global.AQMAR_SB = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "aqmar.sb",   // namespaced localStorage key
    },
  });
})(window);
