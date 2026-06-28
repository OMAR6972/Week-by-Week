/* VERSION: 2026-06-28 — semesters (7.1) + auto badges & announcements (7.2). If this dated line is present, you have the current file. */
/* Academic Hub - admin-auth.js (Phase 4 + admin management + semesters 7.1)
   Login / sign-up gate. Only users listed in the `admins` table get into the
   dashboard. On entry it loads the LIVE data for the semester you are editing
   (?sem= in the URL, else the current semester); the Save button writes back to
   that same semester. Also detects whether you are the OWNER. */

(function () {
  var SB = window.__ahSupabase;
  var KEYS = ['CONFIG', 'COURSE_DATA', 'SUBJECT_DETAILS_DATA', 'SCHEDULE_DATA', 'MIDTERM_DATA',
              'FINAL_DATA', 'STAFF_DATA', 'TIMETABLE_DATA', 'UPDATES_DATA', 'NEWS_DATA'];

  // Empty shapes so a brand-new/empty semester opens blank in the editor instead
  // of showing the old bundled Fall data. CONFIG is left out on purpose (a new
  // semester is always seeded with a CONFIG, and if it weren't, keeping the
  // bundled CONFIG is safer than blanking the resource-type list).
  var EMPTY = {
    COURSE_DATA: [], SUBJECT_DETAILS_DATA: {}, SCHEDULE_DATA: [], MIDTERM_DATA: [],
    FINAL_DATA: [], STAFF_DATA: [], TIMETABLE_DATA: {}, UPDATES_DATA: [], NEWS_DATA: []
  };

  var mode = 'login';

  var ov = document.createElement('div');
  ov.id = 'ah-login-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0a0012;display:flex;' +
                     'align-items:center;justify-content:center;font-family:\'Segoe UI\',sans-serif;padding:16px;';
  document.body.appendChild(ov);

  function card() {
    var isLogin = mode === 'login';
    return '' +
    '<div style="width:330px;max-width:92vw;background:#1a0d2e;border:1px solid #2a1a3e;border-radius:14px;padding:26px 24px;box-shadow:0 10px 40px rgba(0,0,0,.5);">' +
      '<div style="font-size:1.25rem;font-weight:700;color:#fff;margin-bottom:4px;">' + (isLogin ? 'Admin Login' : 'Create Account') + '</div>' +
      '<div style="font-size:.8rem;color:#999;margin-bottom:18px;">Academic Hub dashboard</div>' +
      '<input id="ah-email" type="email" placeholder="Email" autocomplete="username" style="width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:10px;background:#0a0012;border:1px solid #2a1a3e;border-radius:8px;color:#fff;font-size:.9rem;">' +
      '<input id="ah-pass" type="password" placeholder="Password" autocomplete="' + (isLogin ? 'current-password' : 'new-password') + '" style="width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:14px;background:#0a0012;border:1px solid #2a1a3e;border-radius:8px;color:#fff;font-size:.9rem;">' +
      '<button id="ah-go" style="width:100%;padding:11px;background:#e91e8c;border:none;border-radius:8px;color:#fff;font-size:.95rem;font-weight:600;cursor:pointer;">' + (isLogin ? 'Log in' : 'Sign up') + '</button>' +
      '<div id="ah-msg" style="font-size:.8rem;margin-top:12px;min-height:18px;color:#ff6b6b;"></div>' +
      '<div style="font-size:.8rem;color:#aaa;margin-top:6px;">' +
        (isLogin ? 'New here? <a id="ah-toggle" href="#" style="color:#e91e8c;">Create an account</a>'
                 : 'Have an account? <a id="ah-toggle" href="#" style="color:#e91e8c;">Log in</a>') +
      '</div>' +
    '</div>';
  }

  var emailEl, passEl, goEl, msgEl;
  function bind() {
    emailEl = ov.querySelector('#ah-email');
    passEl  = ov.querySelector('#ah-pass');
    goEl    = ov.querySelector('#ah-go');
    msgEl   = ov.querySelector('#ah-msg');
    goEl.addEventListener('click', doAuth);
    passEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') doAuth(); });
    emailEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') passEl.focus(); });
    ov.querySelector('#ah-toggle').addEventListener('click', function (e) {
      e.preventDefault(); mode = (mode === 'login') ? 'signup' : 'login'; render();
    });
  }
  function render() { ov.innerHTML = card(); bind(); if (!SB) { msg('Cannot reach the database. Check supabase-config.js.'); goEl.disabled = true; } }
  function msg(m, ok) { if (msgEl) { msgEl.textContent = m || ''; msgEl.style.color = ok ? '#00c853' : '#ff6b6b'; } }
  function busy(b) { if (goEl) { goEl.disabled = b; goEl.style.opacity = b ? .6 : 1; } }

  function removeOverlay() { ov.remove(); }

  async function getAdminRow(uid) {
    // select('*') so this still works whether or not the is_super column exists yet
    var r = await SB.from('admins').select('*').eq('user_id', uid);
    if (r.error || !r.data || !r.data.length) return null;
    return r.data[0];
  }

  // Which semester am I editing? ?sem= wins, else the current one, else the first.
  // Returns null when there are no semesters yet (pre-migration) so the old
  // single-row behaviour still works.
  async function resolveAdminSemester() {
    var wanted = null;
    try { wanted = new URL(location.href).searchParams.get('sem'); } catch (e) {}
    var r = await SB.from('semesters').select('slug, name, sort_order, is_current').order('sort_order', { ascending: true });
    var list = (r && !r.error && r.data) ? r.data : [];
    window.__ahSemesterList = list;
    if (!list.length) return null;
    if (wanted) { for (var i = 0; i < list.length; i++) if (list[i].slug === wanted) return wanted; }
    for (var j = 0; j < list.length; j++) if (list[j].is_current) return list[j].slug;
    return list[0].slug;
  }

  async function loadAndBoot() {
    window.__ahSemester = await resolveAdminSemester();

    var sel = SB.from('site_data').select('key, value');
    if (window.__ahSemester) sel = sel.eq('semester', window.__ahSemester);
    var res = await sel;
    if (res.error && window.__ahSemester) {
      // column may not exist yet (mid-deploy) -> fall back to unfiltered
      res = await SB.from('site_data').select('key, value');
    }
    if (res.error) { msg('Could not load data: ' + res.error.message); busy(false); return; }

    var present = {};
    (res.data || []).forEach(function (r) { window[r.key] = r.value; present[r.key] = true; });

    // Blank any key this (specific) semester doesn't have, so a new/empty
    // semester opens empty instead of inheriting the bundled Fall data.
    if (window.__ahSemester) {
      Object.keys(EMPTY).forEach(function (k) {
        if (!present[k]) window[k] = (typeof EMPTY[k] === 'object') ? JSON.parse(JSON.stringify(EMPTY[k])) : EMPTY[k];
      });
    }

    removeOverlay();
    if (typeof window.__ahAdminBoot === 'function') window.__ahAdminBoot();
    if (typeof window.__ahInitAdminPanel === 'function') window.__ahInitAdminPanel();
    if (typeof window.__ahInitSemesterUI === 'function') window.__ahInitSemesterUI();
  }

  async function doAuth() {
    msg(''); busy(true);
    var email = (emailEl.value || '').trim();
    var pass = passEl.value || '';
    if (!email || !pass) { msg('Enter your email and password.'); busy(false); return; }

    if (mode === 'signup') {
      var su = await SB.auth.signUp({ email: email, password: pass });
      if (su.error) { msg(su.error.message); busy(false); return; }
      if (su.data && su.data.session) {
        // logged in immediately (email confirmation is off) - but not an admin yet
        await SB.auth.signOut();
      }
      mode = 'login'; render();
      msg('Account created. Ask the owner to grant you admin access, then log in.', true);
      return;
    }

    var res = await SB.auth.signInWithPassword({ email: email, password: pass });
    if (res.error) { msg(res.error.message); busy(false); return; }
    var row = await getAdminRow(res.data.user.id);
    if (!row) { msg('This account is not an admin yet. Ask the owner for access.'); await SB.auth.signOut(); busy(false); return; }
    window.__ahIsSuper = !!row.is_super;
    await loadAndBoot();
  }

  // ---------- Save: write data back to the database (scoped to the semester) ----------
  window.__ahSaveToDatabase = async function () {
    if (!SB) { alert('Not connected to the database.'); return false; }
    var sem = window.__ahSemester || null;
    var rows = KEYS.filter(function (k) { return window[k] !== undefined; })
                   .map(function (k) {
                     var row = { key: k, value: window[k], updated_at: new Date().toISOString() };
                     if (sem) row.semester = sem;
                     return row;
                   });
    var res = await SB.from('site_data').upsert(rows, { onConflict: sem ? 'key,semester' : 'key' });
    if (res.error) { alert('Save failed: ' + res.error.message); return false; }
    return true;
  };

  // ---------- Logout ----------
  window.__ahLogout = async function () { try { await SB.auth.signOut(); } catch (e) {} location.reload(); };

  // ---------- stay logged in across refreshes ----------
  render();
  (async function () {
    if (!SB) return;
    try {
      var s = await SB.auth.getSession();
      if (s.data && s.data.session && s.data.session.user) {
        busy(true);
        var row = await getAdminRow(s.data.session.user.id);
        if (row) { window.__ahIsSuper = !!row.is_super; await loadAndBoot(); return; }
        await SB.auth.signOut(); busy(false);
      }
    } catch (e) { /* show login */ }
  })();
})();
