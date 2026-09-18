/* VERSION: 2026-09-19h — keeps the activity stats and the chosen stats view with the account. */
/* Guests: settings live in this browser (localStorage), exactly as before.
   Signed in: every setting is also saved to the account, and on sign-in the ACCOUNT wins and
   overwrites what is on the device. Anyone can export their settings as a code / file and
   import someone else's. */

(function () {
  'use strict';

  var SB = window.__ahSupabase;
  var LS;
  try { LS = window.localStorage; } catch (e) { return; }
  if (!LS || typeof Storage === 'undefined') return;

  var proto = Storage.prototype;
  var origSet = proto.setItem;
  var origRemove = proto.removeItem;

  /* ================================================================ registry
     Only these keys are ever synced / exported. Login tokens, the analytics id and
     anything else in the browser are deliberately NOT in here. */
  var EXACT = {
    hiddenSubjectCodes: 'hidden', hiddenWeekKeys: 'hidden', midtermHidden: 'hidden', finalHidden: 'hidden',
    deadlineItemStates: 'deadlines', deadlineTodoDismissed: 'deadlines',
    newsSeenKeys: 'seen', wbw_recent_subjects: 'seen',
    examViewMode: 'look', wbw_default_tab: 'look', wbw_nav_autohide: 'look', wbw_chrome_fade: 'look',
    wbw_dash_order: 'home',
    tt_section: 'timetable', tt_mode: 'timetable', tt_subjects: 'timetable',
    wbw_gpa_state: 'gpa',
    wbw_my_stats: 'stats', wbw_stats_view: 'stats'
  };
  /* values that are plain text rather than JSON */
  var PLAIN = { examViewMode: 1, wbw_default_tab: 1, wbw_nav_autohide: 1, wbw_chrome_fade: 1, tt_section: 1, tt_mode: 1 };

  /* Some families were already being saved to the account by their own screens under
     these names. Reusing the same names keeps ONE copy of the truth instead of two. */
  var PREFIXES = [
    { p: 'ah_my_subjects_showall::',  g: 'subjects', remote: 'my_subjects_showall::', kind: 'flag' },
    { p: 'ah_my_subjects_prompted::', g: 'subjects' },
    { p: 'ah_my_subjects::',          g: 'subjects', remote: 'my_subjects::',         kind: 'json' },
    { p: 'ah_notify::',               g: 'notify',   remote: 'notify::',              kind: 'json' }
  ];

  var GROUP_LABELS = {
    hidden:    'Hidden subjects, weeks & exams',
    subjects:  'My subjects',
    gpa:       'GPA & grades',
    home:      'Home layout',
    notify:    'Notification choices',
    deadlines: 'Deadline ticks',
    timetable: 'Timetable choices',
    look:      'Start tab & appearance',
    seen:      'Read announcements & recent subjects',
    stats:     'Your activity stats'
  };

  function info(key) {
    if (typeof key !== 'string') return null;
    if (Object.prototype.hasOwnProperty.call(EXACT, key)) {
      return { g: EXACT[key], plain: !!PLAIN[key], kind: null, remote: 'ls::' + key };
    }
    for (var i = 0; i < PREFIXES.length; i++) {
      var pf = PREFIXES[i];
      if (key.indexOf(pf.p) === 0 && key.length > pf.p.length) {
        return {
          g: pf.g, plain: false, kind: pf.kind || null,
          remote: pf.remote ? pf.remote + key.slice(pf.p.length) : 'ls::' + key,
          prefix: pf
        };
      }
    }
    return null;
  }

  function allKeys() {
    var out = [];
    try {
      for (var i = 0; i < LS.length; i++) {
        var k = LS.key(i);
        if (k && info(k)) out.push(k);
      }
    } catch (e) {}
    return out;
  }

  /* ------------------------------------------------------ value conversion */
  function toRemote(k, raw) {
    var i = info(k);
    if (i && i.kind === 'flag') return raw === '1';
    if (i && i.kind === 'json') { try { return JSON.parse(raw); } catch (e) { return { raw: raw }; } }
    return { raw: raw };
  }

  /* remote row -> { key, raw|null } for this device, or null if we don't recognise it */
  function fromRemote(rk, val) {
    var key = null, raw = null, i;
    if (rk.indexOf('ls::') === 0) {
      key = rk.slice(4);
      if (!info(key)) return null;
      if (val && val.del) return { key: key, raw: null };
      if (val && typeof val.raw === 'string') return { key: key, raw: val.raw };
      return null;
    }
    for (i = 0; i < PREFIXES.length; i++) {
      var pf = PREFIXES[i];
      if (!pf.remote || rk.indexOf(pf.remote) !== 0 || rk.length <= pf.remote.length) continue;
      key = pf.p + rk.slice(pf.remote.length);
      if (val && typeof val === 'object' && !Array.isArray(val) && val.del) return { key: key, raw: null };
      if (pf.kind === 'flag') return typeof val === 'boolean' ? { key: key, raw: val ? '1' : '0' } : null;
      if (pf.kind === 'json') {
        if (val && typeof val === 'object') return { key: key, raw: JSON.stringify(val) };
        return null;
      }
    }
    return null;
  }

  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(b, ka[i]) || !deepEqual(a[ka[i]], b[ka[i]])) return false;
    }
    return true;
  }
  function sameRaw(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return false;
    try { return deepEqual(JSON.parse(a), JSON.parse(b)); } catch (e) { return false; }
  }

  /* ============================================================ account sync */
  var ready = false;          // true once this sign-in has been reconciled with the account
  var pending = {};           // local keys waiting to be saved to the account
  var timer = null;
  var fails = 0;
  var status = { state: 'guest', at: 0 };
  var lastUser = null, lastReconcile = 0;

  function queue(key) {
    if (!ready || !window.__ahStudent || !SB) return;
    pending[key] = true;
    clearTimeout(timer);
    timer = setTimeout(flush, 900);
  }

  async function flush() {
    clearTimeout(timer); timer = null;
    var st = window.__ahStudent;
    var keys = Object.keys(pending);
    if (!keys.length) return;
    if (!st || !SB || !ready) { pending = {}; return; }
    pending = {};

    var now = new Date().toISOString();
    var rows = [];
    keys.forEach(function (k) {
      var i = info(k);
      if (!i) return;
      var raw = LS.getItem(k);
      rows.push({
        user_id: st.id, key: i.remote,
        value: raw === null ? { del: true } : toRemote(k, raw),
        updated_at: now
      });
    });
    if (!rows.length) return;

    status = { state: 'syncing', at: Date.now() };
    try {
      var r = await SB.from('student_prefs').upsert(rows, { onConflict: 'user_id,key' });
      if (r && r.error) throw r.error;
      fails = 0;
      status = { state: 'ok', at: Date.now() };
    } catch (e) {
      fails++;
      status = { state: 'error', at: Date.now(), msg: String((e && e.message) || e) };
      try { console.warn('[settings] could not save to the account:', status.msg); } catch (x) {}
      if (fails < 3) {                      // try again shortly, a few times at most
        keys.forEach(function (k) { pending[k] = true; });
        timer = setTimeout(flush, 15000);
      }
    }
  }
  window.__ahFlushSettings = flush;

  /* every write to a registered key is noticed here, whichever part of the site made it */
  proto.setItem = function (k) {
    var res = origSet.apply(this, arguments);
    try { if (this === LS && info(k)) queue(k); } catch (e) {}
    return res;
  };
  proto.removeItem = function (k) {
    var res = origRemove.apply(this, arguments);
    try { if (this === LS && info(k)) queue(k); } catch (e) {}
    return res;
  };

  function maybeReload() {
    var last = 0;
    try { last = +sessionStorage.getItem('ah_sync_reload') || 0; } catch (e) {}
    if (Date.now() - last < 20000) return;                 // never loop
    try { sessionStorage.setItem('ah_sync_reload', String(Date.now())); } catch (e) {}
    if (window.__ahToast) window.__ahToast('Loading your saved settings\u2026');
    setTimeout(function () { location.reload(); }, 800);
  }

  /* Sign-in: the ACCOUNT is the master. Its values overwrite this device; anything that exists
     only on this device (e.g. chosen as a guest) is added to the account instead of being lost. */
  async function reconcile(st) {
    if (!SB) return;
    ready = false;
    status = { state: 'syncing', at: Date.now() };
    var r;
    try { r = await SB.from('student_prefs').select('key, value').eq('user_id', st.id); }
    catch (e) { r = { error: e }; }
    if (!r || r.error || !r.data) {
      status = { state: 'error', at: Date.now(), msg: r && r.error ? String(r.error.message || r.error) : 'no answer' };
      try { console.warn('[settings] could not read the account:', status.msg); } catch (x) {}
      return;                                              // stay device-only until next time
    }

    var remote = {};
    r.data.forEach(function (row) {
      var m = fromRemote(row.key, row.value);
      if (m) remote[m.key] = m;
    });

    var changed = 0;
    Object.keys(remote).forEach(function (k) {
      var m = remote[k], cur = LS.getItem(k);
      if (m.raw === null) {
        if (cur !== null) { origRemove.call(LS, k); changed++; }
      } else if (!sameRaw(cur, m.raw)) {
        origSet.call(LS, k, m.raw); changed++;
      }
    });

    ready = true;
    allKeys().forEach(function (k) { if (!Object.prototype.hasOwnProperty.call(remote, k)) pending[k] = true; });
    if (Object.keys(pending).length) await flush();
    else status = { state: 'ok', at: Date.now() };

    lastUser = st.id; lastReconcile = Date.now();
    if (changed) maybeReload();                            // screens read settings at start-up, so reload once
  }

  function onStudent(st) {
    if (!st) {
      ready = false; pending = {}; lastUser = null;
      status = { state: 'guest', at: 0 };
      return;
    }
    if (lastUser === st.id && Date.now() - lastReconcile < 30 * 60 * 1000 && ready) return;
    reconcile(st);
  }
  document.addEventListener('ah-student-changed', function (e) { onStudent(e.detail); });
  if (window.__ahStudentReady && window.__ahStudent) onStudent(window.__ahStudent);

  window.addEventListener('pagehide', function () { try { flush(); } catch (e) {} });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { try { flush(); } catch (e) {} }
  });

  /* signing out on a shared phone / laptop: take this person's settings off the device.
     They are safe in the account and come back when they sign in again. */
  window.__ahClearSettingsLocal = function () {
    allKeys().forEach(function (k) { origRemove.call(LS, k); });
    ready = false; pending = {}; lastUser = null;
    status = { state: 'guest', at: 0 };
    setTimeout(function () { location.reload(); }, 1600);
  };

  window.__ahSyncStatus = function () {
    var s = { state: status.state, at: status.at, signedIn: !!window.__ahStudent };
    if (!window.__ahStudent) s.text = 'Saved on this device. Sign in to keep your settings on every device.';
    else if (status.state === 'ok') s.text = 'Saved to your account \u2014 it follows you to any device.';
    else if (status.state === 'syncing') s.text = 'Saving to your account\u2026';
    else if (status.state === 'error') s.text = 'Couldn\u2019t reach your account just now \u2014 saved on this device for the moment.';
    else s.text = 'Saved on this device.';
    return s;
  };

  /* ============================================================ export / import */
  var PREFIX_CODE = 'WBW1:';

  function collect(includeGpa) {
    var data = {};
    allKeys().forEach(function (k) {
      var i = info(k);
      if (i.g === 'stats') return;                 // personal — never shared
      if (!includeGpa && i.g === 'gpa') return;
      var v = LS.getItem(k);
      if (v !== null) data[k] = v;
    });
    return data;
  }

  function buildBundle(includeGpa) {
    return { app: 'week-by-week', v: 1, at: new Date().toISOString(), data: collect(includeGpa) };
  }

  function encode(bundle) {
    return PREFIX_CODE + btoa(unescape(encodeURIComponent(JSON.stringify(bundle))));
  }

  function parseBundle(text) {
    text = String(text || '').trim();
    if (!text) throw new Error('Paste a settings code or choose a file first.');
    if (text.length > 2000000) throw new Error('That is too big to be a settings code.');
    var json = text;
    if (text.slice(0, PREFIX_CODE.length).toUpperCase() === PREFIX_CODE) {
      try { json = decodeURIComponent(escape(atob(text.slice(PREFIX_CODE.length).replace(/\s+/g, '')))); }
      catch (e) { throw new Error('That code looks damaged \u2014 copy it again in full.'); }
    }
    var obj;
    try { obj = JSON.parse(json); } catch (e) { throw new Error('That isn\u2019t a settings code or file from this site.'); }
    if (!obj || obj.app !== 'week-by-week' || !obj.data || typeof obj.data !== 'object') {
      throw new Error('That isn\u2019t a settings code or file from this site.');
    }
    return obj;
  }

  /* keeps only what we recognise and can safely use */
  function validate(bundle) {
    var good = {}, skipped = 0;
    Object.keys(bundle.data).forEach(function (k) {
      var v = bundle.data[k], i = info(k);
      if (!i || i.g === 'stats' || typeof v !== 'string' || v.length > 400000) { skipped++; return; }
      if (i.kind === 'flag') { if (v !== '0' && v !== '1') { skipped++; return; } }
      else if (!i.plain) { try { JSON.parse(v); } catch (e) { skipped++; return; } }
      good[k] = v;
    });
    return { good: good, skipped: skipped };
  }

  function summarize(keys) {
    var counts = {};
    keys.forEach(function (k) { var g = info(k).g; counts[g] = (counts[g] || 0) + 1; });
    return Object.keys(GROUP_LABELS).filter(function (g) { return counts[g]; })
      .map(function (g) { return GROUP_LABELS[g]; });
  }

  function applyImport(good) {
    Object.keys(good).forEach(function (k) { LS.setItem(k, good[k]); });   // patched: also lands in the account
  }

  /* ------------------------------------------------------------------- UI */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function toast(t) { if (window.__ahToast) window.__ahToast(t); }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        var ok = document.execCommand('copy');
        ta.remove();
        ok ? resolve() : reject(new Error('copy failed'));
      } catch (e) { reject(e); }
    });
  }

  function openBackup() {
    if (document.getElementById('ah-bk-modal')) return;
    var back = document.createElement('div');
    back.id = 'ah-bk-modal';
    back.className = 'ah-auth-back';
    back.innerHTML =
      '<div class="ah-auth-card ah-bk-card">' +
        '<button class="ah-auth-x" id="ah-bk-x" aria-label="Close">&times;</button>' +
        '<div class="ah-auth-title">Backup &amp; share settings</div>' +
        '<div class="ah-auth-sub">Everything you set up \u2014 hidden subjects, My subjects, GPA, Home layout, notifications \u2014 in one code. ' +
          'Keep it as a backup, or send it to a friend so their site looks like yours.</div>' +

        '<div class="ah-bk-sec">Export</div>' +
        '<label class="ah-bk-check"><input type="checkbox" id="ah-bk-gpa" checked> Include my GPA and grades</label>' +
        '<textarea id="ah-bk-code" class="ah-auth-input ah-bk-area" rows="3" readonly></textarea>' +
        '<div class="ah-bk-count" id="ah-bk-count"></div>' +
        '<div class="ah-bk-row">' +
          '<button class="ah-bk-btn main" id="ah-bk-copy"><i class="fa-solid fa-copy"></i> Copy code</button>' +
          '<button class="ah-bk-btn" id="ah-bk-share" style="display:none;"><i class="fa-solid fa-share-nodes"></i> Share</button>' +
          '<button class="ah-bk-btn" id="ah-bk-file"><i class="fa-solid fa-file-arrow-down"></i> Save file</button>' +
        '</div>' +

        '<div class="ah-bk-sec">Import</div>' +
        '<textarea id="ah-bk-paste" class="ah-auth-input ah-bk-area" rows="3" placeholder="Paste a settings code here"></textarea>' +
        '<div class="ah-bk-row">' +
          '<button class="ah-bk-btn" id="ah-bk-pick"><i class="fa-solid fa-folder-open"></i> Choose file</button>' +
          '<button class="ah-bk-btn main" id="ah-bk-import"><i class="fa-solid fa-file-import"></i> Import</button>' +
          '<input type="file" id="ah-bk-fileinput" accept=".json,.txt,application/json,text/plain" style="display:none;">' +
        '</div>' +
        '<div class="ah-auth-msg" id="ah-bk-msg"></div>' +
      '</div>';
    document.body.appendChild(back);

    var $ = function (id) { return back.querySelector('#' + id); };
    var codeEl = $('ah-bk-code'), countEl = $('ah-bk-count'), msgEl = $('ah-bk-msg');

    function setMsg(t, ok) { msgEl.textContent = t || ''; msgEl.className = 'ah-auth-msg' + (ok ? ' ok' : (t ? ' bad' : '')); }
    function close() { back.remove(); }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    $('ah-bk-x').addEventListener('click', close);

    function refreshCode() {
      var b = buildBundle($('ah-bk-gpa').checked);
      var n = Object.keys(b.data).length;
      codeEl.value = n ? encode(b) : '';
      countEl.textContent = n ? ('Contains ' + n + ' saved setting' + (n === 1 ? '' : 's') + '.') : 'You haven\u2019t changed any settings yet, so there is nothing to export.';
    }
    refreshCode();
    $('ah-bk-gpa').addEventListener('change', refreshCode);
    codeEl.addEventListener('focus', function () { codeEl.select(); });

    $('ah-bk-copy').addEventListener('click', function () {
      if (!codeEl.value) { setMsg('Nothing to copy yet.'); return; }
      copyText(codeEl.value).then(function () { setMsg('Code copied. Paste it anywhere to send it.', true); },
        function () { codeEl.focus(); codeEl.select(); setMsg('Couldn\u2019t copy automatically \u2014 the code is selected, copy it by hand.'); });
    });

    if (navigator.share) {
      var sh = $('ah-bk-share');
      sh.style.display = '';
      sh.addEventListener('click', function () {
        if (!codeEl.value) { setMsg('Nothing to share yet.'); return; }
        navigator.share({ title: 'My Week by Week settings', text: codeEl.value }).catch(function () {});
      });
    }

    $('ah-bk-file').addEventListener('click', function () {
      if (!codeEl.value) { setMsg('Nothing to save yet.'); return; }
      var b = buildBundle($('ah-bk-gpa').checked);
      var blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'week-by-week-settings.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      setMsg('Saved as week-by-week-settings.json', true);
    });

    var picker = $('ah-bk-fileinput');
    $('ah-bk-pick').addEventListener('click', function () { picker.click(); });
    picker.addEventListener('change', function () {
      var f = picker.files && picker.files[0];
      if (!f) return;
      if (f.size > 2000000) { setMsg('That file is too big to be a settings file.'); return; }
      var rd = new FileReader();
      rd.onload = function () { $('ah-bk-paste').value = String(rd.result || ''); setMsg('File loaded \u2014 press Import to use it.', true); };
      rd.onerror = function () { setMsg('Couldn\u2019t read that file.'); };
      rd.readAsText(f);
      picker.value = '';
    });

    $('ah-bk-import').addEventListener('click', function () {
      var bundle, v;
      try { bundle = parseBundle($('ah-bk-paste').value); v = validate(bundle); }
      catch (e) { setMsg(e.message || 'That didn\u2019t work.'); return; }
      var keys = Object.keys(v.good);
      if (!keys.length) { setMsg('Nothing usable was found in that code.'); return; }
      var what = summarize(keys);
      var ok = confirm('Import these settings?\n\n\u2022 ' + what.join('\n\u2022 ') +
        '\n\nThis replaces the same settings on this ' + (window.__ahStudent ? 'account and device' : 'device') +
        '. Anything not in the code stays as it is.');
      if (!ok) return;
      applyImport(v.good);
      setMsg('Imported ' + keys.length + ' setting' + (keys.length === 1 ? '' : 's') + (v.skipped ? ' (' + v.skipped + ' skipped)' : '') + '. Reloading\u2026', true);
      flush().then(function () { setTimeout(function () { location.reload(); }, 700); },
                   function () { setTimeout(function () { location.reload(); }, 700); });
    });
  }
  window.__ahOpenBackup = openBackup;
})();
