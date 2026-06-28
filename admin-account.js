/* VERSION: 2026-06-30 — account self-service: change password + set username (7.4a). If this dated line is present, you have the current file. */
/* Academic Hub - admin-account.js
   Adds a "🔑 Account" button to the admin topbar (every admin + the owner).
   It opens a modal with:
     • Change password — old password, new password, confirm new password.
       The old password is verified by re-signing-in before the change.
     • Username — show the current one and set/change it (used for quick login).
   Self-contained: injects its button by wrapping __ahAdminBoot, so admin.js /
   admin-auth.js stay untouched. */

(function () {
  var SB = window.__ahSupabase;

  function el(tag, css, html) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ── inject the topbar button after login boot ──
  function injectBtn() {
    if (!SB || document.getElementById('ah-account-btn')) return;
    var bar = document.querySelector('.admin-topbar');
    if (!bar) return;
    var btn = el('button', 'margin-left:6px;background:#5a3a8a;', '\uD83D\uDD11 Account');
    btn.id = 'ah-account-btn';
    btn.className = 'btn';
    btn.title = 'Change your password or username';
    btn.addEventListener('click', openModal);
    bar.appendChild(btn);
  }

  var _origBoot = window.__ahAdminBoot;
  window.__ahAdminBoot = function () {
    if (typeof _origBoot === 'function') _origBoot();
    try { injectBtn(); } catch (e) {}
  };

  var IN = 'width:100%;box-sizing:border-box;padding:9px 11px;margin-bottom:9px;background:#0a0012;' +
           'border:1px solid #2a1a3e;border-radius:8px;color:#fff;font-size:.88rem;';

  function openModal() {
    var back = el('div', 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;' +
                 'align-items:center;justify-content:center;padding:16px;font-family:\'Segoe UI\',sans-serif;');
    var box = el('div', 'width:440px;max-width:94vw;max-height:90vh;overflow:auto;background:#1a0d2e;' +
                 'border:1px solid #2a1a3e;border-radius:14px;padding:22px;');
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">' +
        '<div style="font-size:1.2rem;font-weight:700;color:#fff;">Your account</div>' +
        '<button id="ah-ac-x" style="background:none;border:none;color:#aaa;font-size:1.4rem;cursor:pointer;line-height:1;">&times;</button>' +
      '</div>' +
      '<div id="ah-ac-email" style="font-size:.8rem;color:#999;margin-bottom:18px;">\u2026</div>' +

      // username
      '<div style="border-top:1px solid #2a1a3e;padding-top:14px;">' +
        '<div style="font-size:.9rem;color:#fff;font-weight:700;margin-bottom:4px;">Username</div>' +
        '<div style="font-size:.76rem;color:#999;margin-bottom:8px;">A short handle to log in with instead of your email. 3\u201320 letters, numbers, _ or .</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<input id="ah-ac-uname" type="text" placeholder="username" style="' + IN + 'margin-bottom:0;">' +
          '<button id="ah-ac-uname-btn" class="btn" style="background:#7b3fe4;flex-shrink:0;">Save</button>' +
        '</div>' +
        '<div id="ah-ac-uname-msg" style="font-size:.78rem;margin-top:8px;min-height:16px;"></div>' +
      '</div>' +

      // password
      '<div style="border-top:1px solid #2a1a3e;padding-top:14px;margin-top:14px;">' +
        '<div style="font-size:.9rem;color:#fff;font-weight:700;margin-bottom:8px;">Change password</div>' +
        '<input id="ah-ac-old"  type="password" placeholder="Current password"      autocomplete="current-password" style="' + IN + '">' +
        '<input id="ah-ac-new"  type="password" placeholder="New password (min 6)"   autocomplete="new-password"     style="' + IN + '">' +
        '<input id="ah-ac-new2" type="password" placeholder="Confirm new password"   autocomplete="new-password"     style="' + IN + '">' +
        '<button id="ah-ac-pw-btn" class="btn" style="background:#e91e8c;width:100%;padding:10px;">Update password</button>' +
        '<div id="ah-ac-pw-msg" style="font-size:.78rem;margin-top:10px;min-height:16px;"></div>' +
      '</div>';
    back.appendChild(box);
    document.body.appendChild(back);

    function close() { back.remove(); }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    box.querySelector('#ah-ac-x').addEventListener('click', close);

    var emailEl  = box.querySelector('#ah-ac-email');
    var unameEl  = box.querySelector('#ah-ac-uname');
    var unameMsg = box.querySelector('#ah-ac-uname-msg');
    var pwMsg    = box.querySelector('#ah-ac-pw-msg');
    var myEmail  = null;

    function setMsg(node, m, ok) { node.textContent = m || ''; node.style.color = ok ? '#00c853' : '#ff6b6b'; }

    // load current email + username
    (async function () {
      try {
        var u = await SB.auth.getUser();
        if (u && u.data && u.data.user) {
          myEmail = u.data.user.email;
          emailEl.innerHTML = 'Signed in as <b style="color:#cbb3ff;">' + (myEmail || '') + '</b>';
          var un = await SB.from('app_usernames').select('username').eq('user_id', u.data.user.id);
          if (!un.error && un.data && un.data.length) unameEl.value = un.data[0].username;
        }
      } catch (e) { emailEl.textContent = 'Signed in.'; }
    })();

    // ── save username ──
    box.querySelector('#ah-ac-uname-btn').addEventListener('click', async function () {
      var v = (unameEl.value || '').trim();
      if (!/^[a-zA-Z0-9_.]{3,20}$/.test(v)) { setMsg(unameMsg, 'Username: 3\u201320 letters, numbers, _ or . only.'); return; }
      setMsg(unameMsg, 'Saving\u2026', true);
      var r = await SB.rpc('claim_username', { p_username: v });
      if (r.error) { setMsg(unameMsg, friendly(r.error.message)); return; }
      setMsg(unameMsg, 'Saved. You can now log in with "' + v + '".', true);
    });

    // ── change password (verify old first) ──
    box.querySelector('#ah-ac-pw-btn').addEventListener('click', async function () {
      var oldP = box.querySelector('#ah-ac-old').value || '';
      var newP = box.querySelector('#ah-ac-new').value || '';
      var new2 = box.querySelector('#ah-ac-new2').value || '';
      if (!oldP || !newP) { setMsg(pwMsg, 'Fill in your current and new password.'); return; }
      if (newP.length < 6) { setMsg(pwMsg, 'New password must be at least 6 characters.'); return; }
      if (newP !== new2)   { setMsg(pwMsg, 'New passwords don\u2019t match.'); return; }
      if (!myEmail)        { setMsg(pwMsg, 'Could not read your account. Refresh and try again.'); return; }

      setMsg(pwMsg, 'Checking current password\u2026', true);
      var re = await SB.auth.signInWithPassword({ email: myEmail, password: oldP });
      if (re.error) { setMsg(pwMsg, 'Your current password is incorrect.'); return; }

      setMsg(pwMsg, 'Updating\u2026', true);
      var upd = await SB.auth.updateUser({ password: newP });
      if (upd.error) { setMsg(pwMsg, upd.error.message); return; }
      setMsg(pwMsg, 'Password updated.', true);
      box.querySelector('#ah-ac-old').value = '';
      box.querySelector('#ah-ac-new').value = '';
      box.querySelector('#ah-ac-new2').value = '';
    });

    function friendly(m) {
      m = m || '';
      if (m.indexOf('USERNAME_TAKEN') > -1)    return 'That username is taken. Pick another.';
      if (m.indexOf('BAD_USERNAME') > -1)      return 'Username: 3\u201320 letters, numbers, _ or . only.';
      if (m.indexOf('NOT_AUTHENTICATED') > -1) return 'Session expired. Refresh and try again.';
      if (m.indexOf('function') > -1 && m.indexOf('does not exist') > -1)
        return 'Username feature not enabled yet (run the accounts SQL migration).';
      return m;
    }
  }
})();
