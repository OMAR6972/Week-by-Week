/* Academic Hub - admin-auth.js (Phase 4)
   Puts a login screen in front of the dashboard. Only users listed in the
   `admins` table get in. On entry it loads the LIVE data from the database
   (so you always edit what's actually live), and the Save button writes
   straight back to the database. */

(function () {
  var SB = window.__ahSupabase;
  var KEYS = ['CONFIG', 'COURSE_DATA', 'SUBJECT_DETAILS_DATA', 'SCHEDULE_DATA', 'MIDTERM_DATA',
              'FINAL_DATA', 'STAFF_DATA', 'TIMETABLE_DATA', 'UPDATES_DATA', 'NEWS_DATA'];

  // ---------- build the login overlay ----------
  var ov = document.createElement('div');
  ov.id = 'ah-login-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0a0012;display:flex;' +
                     'align-items:center;justify-content:center;font-family:\'Segoe UI\',sans-serif;';
  ov.innerHTML =
    '<div style="width:320px;max-width:90vw;background:#1a0d2e;border:1px solid #2a1a3e;border-radius:14px;padding:26px 24px;box-shadow:0 10px 40px rgba(0,0,0,.5);">' +
      '<div style="font-size:1.25rem;font-weight:700;color:#fff;margin-bottom:4px;">Admin Login</div>' +
      '<div style="font-size:.8rem;color:#999;margin-bottom:18px;">Academic Hub dashboard</div>' +
      '<input id="ah-email" type="email" placeholder="Email" autocomplete="username" style="width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:10px;background:#0a0012;border:1px solid #2a1a3e;border-radius:8px;color:#fff;font-size:.9rem;">' +
      '<input id="ah-pass" type="password" placeholder="Password" autocomplete="current-password" style="width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:14px;background:#0a0012;border:1px solid #2a1a3e;border-radius:8px;color:#fff;font-size:.9rem;">' +
      '<button id="ah-login-btn" style="width:100%;padding:11px;background:#e91e8c;border:none;border-radius:8px;color:#fff;font-size:.95rem;font-weight:600;cursor:pointer;">Log in</button>' +
      '<div id="ah-login-err" style="color:#ff6b6b;font-size:.8rem;margin-top:12px;min-height:18px;"></div>' +
    '</div>';
  document.body.appendChild(ov);

  var emailEl = ov.querySelector('#ah-email');
  var passEl  = ov.querySelector('#ah-pass');
  var btnEl   = ov.querySelector('#ah-login-btn');
  var errEl   = ov.querySelector('#ah-login-err');

  function setErr(m) { errEl.textContent = m || ''; }
  function busy(b) {
    btnEl.disabled = b;
    btnEl.textContent = b ? 'Please wait…' : 'Log in';
    btnEl.style.opacity = b ? 0.6 : 1;
  }
  function removeOverlay() { ov.remove(); }

  if (!SB) {
    setErr('Cannot reach the database. Check supabase-config.js.');
    btnEl.disabled = true;
    return;
  }

  async function isAdmin(uid) {
    var chk = await SB.from('admins').select('user_id').eq('user_id', uid);
    return !chk.error && chk.data && chk.data.length > 0;
  }

  async function loadAndBoot() {
    var res = await SB.from('site_data').select('key, value');
    if (res.error) { setErr('Could not load data: ' + res.error.message); busy(false); return; }
    (res.data || []).forEach(function (r) { window[r.key] = r.value; });
    removeOverlay();
    if (typeof window.__ahAdminBoot === 'function') window.__ahAdminBoot();
  }

  async function doLogin() {
    setErr(''); busy(true);
    var email = (emailEl.value || '').trim();
    var pass = passEl.value || '';
    if (!email || !pass) { setErr('Enter your email and password.'); busy(false); return; }
    var res = await SB.auth.signInWithPassword({ email: email, password: pass });
    if (res.error) { setErr(res.error.message); busy(false); return; }
    if (!(await isAdmin(res.data.user.id))) {
      setErr('This account is not an admin.');
      await SB.auth.signOut();
      busy(false);
      return;
    }
    await loadAndBoot();
  }

  btnEl.addEventListener('click', doLogin);
  passEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
  emailEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') passEl.focus(); });

  // ---------- Save: write all data back to the database ----------
  window.__ahSaveToDatabase = async function () {
    if (!SB) { alert('Not connected to the database.'); return false; }
    var rows = KEYS.filter(function (k) { return window[k] !== undefined; })
                   .map(function (k) { return { key: k, value: window[k], updated_at: new Date().toISOString() }; });
    var res = await SB.from('site_data').upsert(rows, { onConflict: 'key' });
    if (res.error) { alert('Save failed: ' + res.error.message); return false; }
    return true;
  };

  // ---------- Logout ----------
  window.__ahLogout = async function () {
    try { await SB.auth.signOut(); } catch (e) {}
    location.reload();
  };

  // ---------- stay logged in across refreshes ----------
  (async function () {
    try {
      var s = await SB.auth.getSession();
      if (s.data && s.data.session && s.data.session.user) {
        busy(true);
        if (await isAdmin(s.data.session.user.id)) { await loadAndBoot(); return; }
        await SB.auth.signOut();
        busy(false);
      }
    } catch (e) { /* fall through to login screen */ }
  })();
})();
