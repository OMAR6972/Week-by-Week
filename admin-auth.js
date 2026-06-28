/* VERSION: 2026-06-30 — semesters (7.1) + auto badges/announcements (7.2) + accounts: username login, confirm password, forgot-password code (7.4a). If this dated line is present, you have the current file. */
/* Academic Hub - admin-auth.js
   Login / sign-up / password-reset gate. Only users listed in the `admins`
   table get into the dashboard. On entry it loads the LIVE data for the
   semester you are editing (?sem= in the URL, else the current semester); the
   Save button writes back to that same semester. Also detects OWNER status.

   Accounts upgrade:
     • Log in with USERNAME *or* email (email path is unchanged → existing
       accounts and a not-yet-run migration both keep working).
     • Sign up asks for a username + a confirm-password field.
     • "Forgot password?" emails a 6-digit code; enter code + new password
       (twice) to reset — no long reset links.
   Everything below the "DATA / BOOT" banner is identical to before. */

(function () {
  var SB = window.__ahSupabase;
  var KEYS = ['CONFIG', 'COURSE_DATA', 'SUBJECT_DETAILS_DATA', 'SCHEDULE_DATA', 'MIDTERM_DATA',
              'FINAL_DATA', 'STAFF_DATA', 'TIMETABLE_DATA', 'UPDATES_DATA', 'NEWS_DATA'];

  var EMPTY = {
    COURSE_DATA: [], SUBJECT_DETAILS_DATA: {}, SCHEDULE_DATA: [], MIDTERM_DATA: [],
    FINAL_DATA: [], STAFF_DATA: [], TIMETABLE_DATA: {}, UPDATES_DATA: [], NEWS_DATA: []
  };

  // ── auth-screen state ──
  var mode = 'login';          // 'login' | 'signup' | 'reset'
  var resetStage = 'request';  // 'request' | 'verify'   (only used in reset mode)
  var resetEmail = null;       // email we sent the code to

  var ov = document.createElement('div');
  ov.id = 'ah-login-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0a0012;display:flex;' +
                     'align-items:center;justify-content:center;font-family:\'Segoe UI\',sans-serif;padding:16px;';
  document.body.appendChild(ov);

  var IN = 'width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:10px;background:#0a0012;' +
           'border:1px solid #2a1a3e;border-radius:8px;color:#fff;font-size:.9rem;';

  function card() {
    var head, sub, body, foot;

    if (mode === 'signup') {
      head = 'Create Account'; sub = 'Academic Hub dashboard';
      body =
        '<input id="ah-uname" type="text" placeholder="Username (3–20: letters, numbers, _ .)" autocomplete="username" style="' + IN + '">' +
        '<input id="ah-email" type="email" placeholder="Email" autocomplete="email" style="' + IN + '">' +
        '<input id="ah-pass" type="password" placeholder="Password (min 6)" autocomplete="new-password" style="' + IN + '">' +
        '<input id="ah-conf" type="password" placeholder="Confirm password" autocomplete="new-password" style="' + IN + 'margin-bottom:14px;">' +
        '<button id="ah-go" style="' + goCss() + '">Sign up</button>';
      foot = 'Have an account? <a id="ah-toggle-login" href="#" style="color:#e91e8c;">Log in</a>';
    }
    else if (mode === 'reset' && resetStage === 'request') {
      head = 'Reset Password'; sub = 'We\u2019ll email you a 6-digit code';
      body =
        '<input id="ah-ident" type="text" placeholder="Username or email" autocomplete="username" style="' + IN + 'margin-bottom:14px;">' +
        '<button id="ah-go" style="' + goCss() + '">Send code</button>';
      foot = '<a id="ah-toggle-login" href="#" style="color:#e91e8c;">Back to log in</a>';
    }
    else if (mode === 'reset' && resetStage === 'verify') {
      head = 'Enter Code'; sub = 'Check your email for the 6-digit code';
      body =
        '<input id="ah-code" type="text" inputmode="numeric" placeholder="6-digit code" autocomplete="one-time-code" style="' + IN + '">' +
        '<input id="ah-pass" type="password" placeholder="New password (min 6)" autocomplete="new-password" style="' + IN + '">' +
        '<input id="ah-conf" type="password" placeholder="Confirm new password" autocomplete="new-password" style="' + IN + 'margin-bottom:14px;">' +
        '<button id="ah-go" style="' + goCss() + '">Reset password</button>' +
        '<div style="font-size:.78rem;margin-top:10px;"><a id="ah-resend" href="#" style="color:#aaa;">Resend code</a></div>';
      foot = '<a id="ah-toggle-login" href="#" style="color:#e91e8c;">Back to log in</a>';
    }
    else { // login
      head = 'Admin Login'; sub = 'Academic Hub dashboard';
      body =
        '<input id="ah-ident" type="text" placeholder="Username or email" autocomplete="username" style="' + IN + '">' +
        '<input id="ah-pass" type="password" placeholder="Password" autocomplete="current-password" style="' + IN + 'margin-bottom:14px;">' +
        '<button id="ah-go" style="' + goCss() + '">Log in</button>' +
        '<div style="font-size:.78rem;margin-top:10px;text-align:right;"><a id="ah-forgot" href="#" style="color:#aaa;">Forgot password?</a></div>';
      foot = 'New here? <a id="ah-toggle-signup" href="#" style="color:#e91e8c;">Create an account</a>';
    }

    return '' +
    '<div style="width:340px;max-width:92vw;background:#1a0d2e;border:1px solid #2a1a3e;border-radius:14px;padding:26px 24px;box-shadow:0 10px 40px rgba(0,0,0,.5);">' +
      '<div style="font-size:1.25rem;font-weight:700;color:#fff;margin-bottom:4px;">' + head + '</div>' +
      '<div style="font-size:.8rem;color:#999;margin-bottom:18px;">' + sub + '</div>' +
      body +
      '<div id="ah-msg" style="font-size:.8rem;margin-top:12px;min-height:18px;color:#ff6b6b;"></div>' +
      '<div style="font-size:.8rem;color:#aaa;margin-top:6px;">' + foot + '</div>' +
    '</div>';
  }
  function goCss() {
    return 'width:100%;padding:11px;background:#e91e8c;border:none;border-radius:8px;color:#fff;font-size:.95rem;font-weight:600;cursor:pointer;';
  }

  var goEl, msgEl;
  function $(id) { return ov.querySelector(id); }

  function bind() {
    goEl  = $('#ah-go');
    msgEl = $('#ah-msg');

    if (goEl) {
      var handler =
        mode === 'signup' ? doSignup :
        (mode === 'reset' && resetStage === 'request') ? doResetRequest :
        (mode === 'reset' && resetStage === 'verify')  ? doResetVerify  :
        doLogin;
      goEl.addEventListener('click', handler);
      // Enter submits from the last field
      ov.querySelectorAll('input').forEach(function (inp) {
        inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') handler(); });
      });
    }

    var tLogin = $('#ah-toggle-login');   if (tLogin) tLogin.addEventListener('click', function (e) { e.preventDefault(); mode = 'login';  resetStage = 'request'; render(); });
    var tSignup = $('#ah-toggle-signup'); if (tSignup) tSignup.addEventListener('click', function (e) { e.preventDefault(); mode = 'signup'; render(); });
    var fForgot = $('#ah-forgot');        if (fForgot) fForgot.addEventListener('click', function (e) { e.preventDefault(); mode = 'reset'; resetStage = 'request'; render(); });
    var rResend = $('#ah-resend');        if (rResend) rResend.addEventListener('click', function (e) { e.preventDefault(); resendCode(); });
  }

  function render() { ov.innerHTML = card(); bind(); if (!SB) { msg('Cannot reach the database. Check supabase-config.js.'); if (goEl) goEl.disabled = true; } }
  function msg(m, ok) { if (msgEl) { msgEl.textContent = m || ''; msgEl.style.color = ok ? '#00c853' : '#ff6b6b'; } }
  function busy(b) { if (goEl) { goEl.disabled = b; goEl.style.opacity = b ? .6 : 1; } }
  function removeOverlay() { ov.remove(); }

  // resolve a username (or email) to an email for sign-in. '@' → use as-is, so
  // email login never depends on the username table existing.
  async function resolveEmail(identifier) {
    if (!identifier) return null;
    if (identifier.indexOf('@') > -1) return identifier;
    try {
      var r = await SB.rpc('email_for_identifier', { p_identifier: identifier });
      if (!r.error && r.data) return r.data;
    } catch (e) {}
    return null;
  }

  // ── LOGIN ──
  async function doLogin() {
    msg(''); busy(true);
    var ident = ($('#ah-ident').value || '').trim();
    var pass  = $('#ah-pass').value || '';
    if (!ident || !pass) { msg('Enter your username/email and password.'); busy(false); return; }

    var email = await resolveEmail(ident);
    if (!email) { msg('No account found with that username. Try your email instead.'); busy(false); return; }

    var res = await SB.auth.signInWithPassword({ email: email, password: pass });
    if (res.error) { msg('Wrong username/email or password.'); busy(false); return; }
    var row = await getAdminRow(res.data.user.id);
    if (!row) { msg('This account is not an admin yet. Ask the owner for access.'); await SB.auth.signOut(); busy(false); return; }
    window.__ahIsSuper = !!row.is_super;
    await loadAndBoot();
  }

  // ── SIGN UP ──
  async function doSignup() {
    msg(''); busy(true);
    var username = ($('#ah-uname').value || '').trim();
    var email    = ($('#ah-email').value || '').trim();
    var pass     = $('#ah-pass').value || '';
    var conf     = $('#ah-conf').value || '';

    if (!username || !email || !pass) { msg('Fill in username, email and password.'); busy(false); return; }
    if (!/^[a-zA-Z0-9_.]{3,20}$/.test(username)) { msg('Username: 3\u201320 letters, numbers, _ or . only.'); busy(false); return; }
    if (pass.length < 6) { msg('Password must be at least 6 characters.'); busy(false); return; }
    if (pass !== conf) { msg('Passwords don\u2019t match.'); busy(false); return; }

    // best-effort availability check (skipped silently if the RPC isn't there yet)
    try {
      var a = await SB.rpc('username_available', { p_username: username });
      if (!a.error && a.data === false) { msg('That username is taken. Pick another.'); busy(false); return; }
    } catch (e) {}

    var su = await SB.auth.signUp({ email: email, password: pass });
    if (su.error) { msg(su.error.message); busy(false); return; }
    if (su.data && su.data.session) {
      // logged in immediately (email confirmation is off) → claim username, then sign out
      try { await SB.rpc('claim_username', { p_username: username }); } catch (e) {}
      await SB.auth.signOut();
    }
    mode = 'login'; render();
    msg('Account created. Ask the owner to grant you access, then log in with your username or email.', true);
  }

  // ── FORGOT PASSWORD (code) ──
  async function doResetRequest() {
    msg(''); busy(true);
    var ident = ($('#ah-ident').value || '').trim();
    if (!ident) { msg('Enter your username or email.'); busy(false); return; }
    var email = await resolveEmail(ident);
    if (!email) { msg('No account found with that username. Try your email instead.'); busy(false); return; }

    try { await SB.auth.resetPasswordForEmail(email); } catch (e) {}
    resetEmail = email; resetStage = 'verify'; render();
    msg('If that account exists, a 6-digit code was emailed. Enter it below.', true);
  }

  async function resendCode() {
    if (!resetEmail) return;
    msg('Sending a new code\u2026', true);
    try { await SB.auth.resetPasswordForEmail(resetEmail); msg('New code sent.', true); }
    catch (e) { msg('Could not resend right now. Wait a minute and try again.'); }
  }

  async function doResetVerify() {
    msg(''); busy(true);
    var code = ($('#ah-code').value || '').trim();
    var pass = $('#ah-pass').value || '';
    var conf = $('#ah-conf').value || '';
    if (!code) { msg('Enter the code from your email.'); busy(false); return; }
    if (pass.length < 6) { msg('New password must be at least 6 characters.'); busy(false); return; }
    if (pass !== conf) { msg('Passwords don\u2019t match.'); busy(false); return; }
    if (!resetEmail) { msg('Start over from "Forgot password?".'); busy(false); return; }

    var v = await SB.auth.verifyOtp({ email: resetEmail, token: code, type: 'recovery' });
    if (v.error) { msg('That code is wrong or expired. Check the email or resend.'); busy(false); return; }
    var upd = await SB.auth.updateUser({ password: pass });
    if (upd.error) { msg(upd.error.message); busy(false); return; }
    try { await SB.auth.signOut(); } catch (e) {}
    mode = 'login'; resetStage = 'request'; resetEmail = null; render();
    msg('Password reset. Log in with your new password.', true);
  }

  /* ===========================================================================
     DATA / BOOT  — unchanged from the previous version
     =========================================================================== */

  async function getAdminRow(uid) {
    var r = await SB.from('admins').select('*').eq('user_id', uid);
    if (r.error || !r.data || !r.data.length) return null;
    return r.data[0];
  }

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
      res = await SB.from('site_data').select('key, value');
    }
    if (res.error) { msg('Could not load data: ' + res.error.message); busy(false); return; }

    var present = {};
    (res.data || []).forEach(function (r) { window[r.key] = r.value; present[r.key] = true; });

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
