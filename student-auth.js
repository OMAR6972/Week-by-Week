/* VERSION: 2026-09-15b — v7b: subject sync fixed both ways, cleared on sign-out; GPA can add the current semester. */
/* Optional by design: guests keep full access to everything, an account only adds extras. */

(function () {
  var SB = window.__ahSupabase;

  window.__ahStudent = null;          // { id, email, displayName } when signed in
  window.__ahStudentReady = false;

  /* ---------------------------------------------------------------- helpers */
  function el(tag, css, html) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function initials(name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?')[0] + (p[1] ? p[1][0] : '')).toUpperCase();
  }

  /* ------------------------------------------------------- navbar entry point */
  function mountButton() {
    if (document.getElementById('ah-account-btn')) return;
    var settingsBtn = document.getElementById('nav-settings-btn');
    if (!settingsBtn || !settingsBtn.parentNode) return;

    var btn = document.createElement('button');
    btn.className = 'nav-settings-btn ah-account-btn';
    btn.id = 'ah-account-btn';
    btn.title = 'Account';
    btn.setAttribute('aria-label', 'Account');
    btn.innerHTML = '<i class="fa-solid fa-user"></i>';
    btn.addEventListener('click', function () {
      if (window.__ahStudent) openAccountPanel(); else openAuthModal('signin');
    });
    settingsBtn.parentNode.insertBefore(btn, settingsBtn);
    paintButton();
  }

  function paintButton() {
    var btn = document.getElementById('ah-account-btn');
    if (!btn) return;
    if (window.__ahStudent) {
      btn.innerHTML = '<span class="ah-acct-initials">' + esc(initials(window.__ahStudent.displayName)) + '</span>';
      btn.classList.add('signed-in');
      btn.title = window.__ahStudent.displayName || window.__ahStudent.email;
    } else {
      btn.innerHTML = '<i class="fa-solid fa-user"></i>';
      btn.classList.remove('signed-in');
      btn.title = 'Sign in (optional)';
    }
  }

  /* ------------------------------------------------------------- auth modal */
  function openAuthModal(mode) {
    if (document.getElementById('ah-auth-modal')) return;
    if (!SB) { alert('Cannot reach the server right now. You can keep browsing as a guest.'); return; }

    var back = el('div', null);
    back.id = 'ah-auth-modal';
    back.className = 'ah-auth-back';

    back.innerHTML =
      '<div class="ah-auth-card">' +
        '<button class="ah-auth-x" id="ah-auth-x" aria-label="Close">&times;</button>' +
        '<div class="ah-auth-title" id="ah-auth-title"></div>' +
        '<div class="ah-auth-sub" id="ah-auth-sub"></div>' +

        '<div id="ah-auth-name-wrap" style="display:none;">' +
          '<label class="ah-auth-label">Your name</label>' +
          '<input id="ah-auth-name" type="text" class="ah-auth-input" placeholder="e.g. Omar" autocomplete="name">' +
        '</div>' +

        '<label class="ah-auth-label">Email</label>' +
        '<input id="ah-auth-email" type="email" class="ah-auth-input" placeholder="you@example.com" autocomplete="email">' +

        '<label class="ah-auth-label">Password</label>' +
        '<div class="ah-auth-pw-wrap">' +
          '<input id="ah-auth-pass" type="password" class="ah-auth-input" placeholder="At least 6 characters" autocomplete="current-password">' +
          '<button type="button" class="ah-auth-eye" id="ah-auth-eye" aria-label="Show password"><i class="fa-solid fa-eye"></i></button>' +
        '</div>' +

        '<button class="ah-auth-go" id="ah-auth-go"></button>' +
        '<div class="ah-auth-msg" id="ah-auth-msg"></div>' +

        '<button class="ah-auth-link" id="ah-auth-forgot" style="display:none;">Forgot your password?</button>' +
        '<div class="ah-auth-switch">' +
          '<span id="ah-auth-switch-text"></span> ' +
          '<button class="ah-auth-link" id="ah-auth-switch">Switch</button>' +
        '</div>' +

        '<div class="ah-auth-guest">' +
          'You don\'t need an account to use the site \u2014 everything stays free to browse. ' +
          'Signing in just saves your settings and lets you get notified about new material.' +
        '</div>' +
      '</div>';

    document.body.appendChild(back);

    var titleEl  = back.querySelector('#ah-auth-title');
    var subEl    = back.querySelector('#ah-auth-sub');
    var nameWrap = back.querySelector('#ah-auth-name-wrap');
    var nameEl   = back.querySelector('#ah-auth-name');
    var emailEl  = back.querySelector('#ah-auth-email');
    var passEl   = back.querySelector('#ah-auth-pass');
    var goEl     = back.querySelector('#ah-auth-go');
    var msgEl    = back.querySelector('#ah-auth-msg');
    var swText   = back.querySelector('#ah-auth-switch-text');
    var swBtn    = back.querySelector('#ah-auth-switch');
    var forgotEl = back.querySelector('#ah-auth-forgot');

    function close() { back.remove(); }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    back.querySelector('#ah-auth-x').addEventListener('click', close);
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });

    back.querySelector('#ah-auth-eye').addEventListener('click', function () {
      var showing = passEl.type === 'text';
      passEl.type = showing ? 'password' : 'text';
      this.innerHTML = showing ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
      passEl.focus();
    });

    function setMsg(text, ok) {
      msgEl.textContent = text || '';
      msgEl.className = 'ah-auth-msg' + (ok ? ' ok' : (text ? ' bad' : ''));
    }

    function applyMode(m) {
      mode = m;
      var signup = (m === 'signup');
      titleEl.textContent = signup ? 'Create an account' : 'Welcome back';
      subEl.textContent   = signup
        ? 'Optional \u2014 it keeps your settings on every device.'
        : 'Sign in to pick up where you left off.';
      nameWrap.style.display = signup ? 'block' : 'none';
      goEl.textContent = signup ? 'Create account' : 'Sign in';
      passEl.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
      swText.textContent = signup ? 'Already have an account?' : 'New here?';
      swBtn.textContent  = signup ? 'Sign in' : 'Create one';
      forgotEl.style.display = signup ? 'none' : 'block';
      setMsg('');
    }

    swBtn.addEventListener('click', function () { applyMode(mode === 'signup' ? 'signin' : 'signup'); });

    forgotEl.addEventListener('click', async function () {
      var email = (emailEl.value || '').trim();
      if (!email) { setMsg('Type your email above first, then tap this again.'); emailEl.focus(); return; }
      forgotEl.disabled = true;
      setMsg('Sending\u2026', true);
      try {
        var r = await SB.auth.resetPasswordForEmail(email, { redirectTo: location.href });
        if (r.error) setMsg(friendly(r.error.message));
        else setMsg('Check your email for a reset link.', true);
      } catch (e) { setMsg('Something went wrong. Try again.'); }
      forgotEl.disabled = false;
    });

    async function submit() {
      var email = (emailEl.value || '').trim();
      var pass  = passEl.value || '';
      var name  = (nameEl.value || '').trim();

      if (!email) { setMsg('Enter your email.'); emailEl.focus(); return; }
      if (pass.length < 6) { setMsg('Password needs at least 6 characters.'); passEl.focus(); return; }
      if (mode === 'signup' && !name) { setMsg('Enter your name.'); nameEl.focus(); return; }

      goEl.disabled = true;
      setMsg(mode === 'signup' ? 'Creating your account\u2026' : 'Signing in\u2026', true);

      try {
        if (mode === 'signup') {
          var res = await SB.auth.signUp({
            email: email,
            password: pass,
            options: { data: { display_name: name }, emailRedirectTo: location.href }
          });
          if (res.error) { setMsg(friendly(res.error.message)); goEl.disabled = false; return; }
          if (res.data && res.data.session) {
            await refreshSession();
            close();
            toast('Welcome, ' + name + '!');
          } else {
            setMsg('Almost done \u2014 check your email and click the confirmation link.', true);
            goEl.disabled = false;
          }
        } else {
          var r2 = await SB.auth.signInWithPassword({ email: email, password: pass });
          if (r2.error) { setMsg(friendly(r2.error.message)); goEl.disabled = false; return; }
          await refreshSession();
          close();
          toast('Signed in' + (window.__ahStudent && window.__ahStudent.displayName
            ? ', ' + window.__ahStudent.displayName : '') + '.');
        }
      } catch (e) {
        setMsg('Something went wrong. Try again.');
        goEl.disabled = false;
      }
    }

    goEl.addEventListener('click', submit);
    [emailEl, passEl, nameEl].forEach(function (i) {
      i.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    });

    applyMode(mode || 'signin');
    setTimeout(function () { emailEl.focus(); }, 60);
  }

  /* --------------------------------------------------------- account panel */
  function openAccountPanel() {
    if (document.getElementById('ah-acct-modal')) return;
    var s = window.__ahStudent;
    if (!s) return;

    var back = el('div', null);
    back.id = 'ah-acct-modal';
    back.className = 'ah-auth-back';
    back.innerHTML =
      '<div class="ah-auth-card">' +
        '<button class="ah-auth-x" id="ah-acct-x" aria-label="Close">&times;</button>' +
        '<div class="ah-acct-avatar">' + esc(initials(s.displayName)) + '</div>' +
        '<div class="ah-auth-title" style="text-align:center;">' + esc(s.displayName || 'Your account') + '</div>' +
        '<div class="ah-auth-sub" style="text-align:center;">' + esc(s.email) + '</div>' +
        '<button class="ah-auth-go" id="ah-acct-subjects" style="background:rgba(255,255,255,.08);">My subjects</button>' +
        '<button class="ah-auth-go" id="ah-acct-rename" style="background:rgba(255,255,255,.08);">Change my name</button>' +
        '<button class="ah-auth-go" id="ah-acct-out" style="background:rgba(255,59,48,.16); color:#ff8a80;">Sign out</button>' +
        '<div class="ah-auth-msg" id="ah-acct-msg"></div>' +
        '<div class="ah-auth-guest">More is coming to your account soon \u2014 notifications about new material, ' +
          'your settings on every device, and your own study stats.</div>' +
      '</div>';
    document.body.appendChild(back);

    function close() { back.remove(); }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    back.querySelector('#ah-acct-x').addEventListener('click', close);

    back.querySelector('#ah-acct-subjects').addEventListener('click', function () {
      close();
      if (window.__ahOpenMySubjects) window.__ahOpenMySubjects({});
    });

    back.querySelector('#ah-acct-rename').addEventListener('click', async function () {
      var n = prompt('What should we call you?', s.displayName || '');
      if (n === null) return;
      n = n.trim();
      if (!n) return;
      var msg = back.querySelector('#ah-acct-msg');
      msg.textContent = 'Saving\u2026'; msg.className = 'ah-auth-msg ok';
      try {
        var r = await SB.from('student_profiles').update({ display_name: n }).eq('user_id', s.id);
        if (r.error) { msg.textContent = 'Could not save that.'; msg.className = 'ah-auth-msg bad'; return; }
        window.__ahStudent.displayName = n;
        paintButton();
        close();
        toast('Name updated.');
      } catch (e) {
        msg.textContent = 'Could not save that.'; msg.className = 'ah-auth-msg bad';
      }
    });

    back.querySelector('#ah-acct-out').addEventListener('click', async function () {
      try { await SB.auth.signOut(); } catch (e) {}
      window.__ahStudent = null;
      if (window.__ahClearMySubjectsLocal) window.__ahClearMySubjectsLocal();
      paintButton();
      close();
      toast('Signed out. You can still browse everything.');
    });
  }

  /* ------------------------------------------------------------------ toast */
  function toast(text) {
    var t = el('div', null, esc(text));
    t.className = 'ah-toast';
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('in'); });
    setTimeout(function () {
      t.classList.remove('in');
      setTimeout(function () { t.remove(); }, 300);
    }, 2600);
  }

  /* ---------------------------------------------------------------- session */
  async function refreshSession() {
    window.__ahStudent = null;
    if (!SB) { window.__ahStudentReady = true; paintButton(); return; }
    try {
      var u = await SB.auth.getUser();
      var user = u && u.data && u.data.user;
      if (!user) { window.__ahStudentReady = true; paintButton(); return; }

      var name = (user.user_metadata && user.user_metadata.display_name) || null;
      try {
        var p = await SB.from('student_profiles').select('display_name').eq('user_id', user.id).maybeSingle();
        if (p && !p.error && p.data && p.data.display_name) name = p.data.display_name;
      } catch (e) { /* profile table not created yet — fall back to metadata */ }

      window.__ahStudent = {
        id: user.id,
        email: user.email,
        displayName: name || (user.email || '').split('@')[0]
      };

      // quietly record that they were here
      try { SB.from('student_profiles').update({ last_seen_at: new Date().toISOString() }).eq('user_id', user.id); } catch (e) {}
    } catch (e) { /* stay a guest */ }

    window.__ahStudentReady = true;
    paintButton();
    document.dispatchEvent(new CustomEvent('ah-student-changed', { detail: window.__ahStudent }));
  }

  window.__ahOpenSignIn = function () { openAuthModal('signin'); };
  window.__ahToast = toast;
  window.__ahRefreshStudent = refreshSession;

  /* ------------------------------------------------------------------- boot */
  function boot() {
    mountButton();
    refreshSession();
    if (SB && SB.auth && SB.auth.onAuthStateChange) {
      SB.auth.onAuthStateChange(function (event) {
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') refreshSession();
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  /* --------------------------------------------------------- error wording */
  function friendly(m) {
    m = String(m || '');
    if (/already registered|already exists/i.test(m)) return 'That email already has an account. Try signing in instead.';
    if (/invalid login credentials/i.test(m))         return 'Wrong email or password.';
    if (/email not confirmed/i.test(m))               return 'Check your email and click the confirmation link first.';
    if (/rate limit|too many/i.test(m))               return 'Too many tries. Wait a minute and try again.';
    if (/password/i.test(m) && /short|least/i.test(m))return 'Password needs at least 6 characters.';
    if (/unable to validate email|invalid format/i.test(m)) return 'That email doesn\'t look right.';
    return 'Something went wrong. Try again.';
  }
})();
