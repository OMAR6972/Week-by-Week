/* Academic Hub - supabase-config.js
   Your database connection details. This is the ONE file to edit if your
   project URL or key ever changes. The publishable key is safe to be public;
   your data is protected by the security rules in the database. */

window.SUPABASE_URL = 'https://eeljqqrrpjpmpbvlzqqm.supabase.co';
window.SUPABASE_KEY = 'sb_publishable_vKtDrhUngR__f0f_xFfmHg_lW4dOguF';

(function () {
  try {
    if (window.supabase && window.supabase.createClient) {
      window.__ahSupabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
    } else {
      console.warn('[AcademicHub] Supabase library not loaded - using bundled data.');
    }
  } catch (e) {
    console.warn('[AcademicHub] Could not create Supabase client - using bundled data.', e);
  }
})();
