/* VERSION: 2026-09-19 — v16: notification bell in the navbar + "Notifications" card on Home. */
/* Works for guests too (guests just don't get email). What shows is filtered by the student's
   own notification settings and My subjects, the same rules the emails follow. */

(function () {
  'use strict';

  var SB = window.__ahSupabase;
  var feed = [];               // everything the server returned (newest first)
  var loaded = false;
  var seenTs = null;           // newest notification this student has already looked at (ms)
  var panelOpen = false;
  var openUnread = {};         // ids that were unread when the panel was opened (keeps their dot)
  var REFRESH_MS = 120000;

  /* ------------------------------------------------------------ small helpers */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function semKey() {
    return window.__ahLoadedSem || window.__ahSemesterKey || window.__ahCurrentSemSlug || 'default';
  }
  function ago(ms) {
    var d = Date.now() - ms;
    if (d < 60000) return 'just now';
    var m = Math.floor(d / 60000);
    if (m < 60) return m + ' min ago';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' hour' + (h === 1 ? '' : 's') + ' ago';
    var dd = Math.floor(h / 24);
    if (dd < 14) return dd + ' day' + (dd === 1 ? '' : 's') + ' ago';
    return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  function tsOf(r) { return new Date(r.created_at).getTime() || 0; }

  var KIND = {
    announcement: { icon: 'fa-bullhorn',        color: '#4a90e2', name: 'Announcement' },
    exam:         { icon: 'fa-file-pen',        color: '#ff9f43', name: 'Exam' },
    deadline:     { icon: 'fa-hourglass-half',  color: '#e91e8c', name: 'Deadline' },
    material:     { icon: 'fa-book-open',       color: '#00c853', name: 'New material' },
    custom:       { icon: 'fa-bell',            color: '#b519d6', name: 'Notice' }
  };

  /* --------------------------------------------- what THIS student wants to see */
  function prefs() {
    try { if (window.__ahGetNotifyPrefs) return window.__ahGetNotifyPrefs(); } catch (e) {}
    return {};
  }
  function myCodes(p) {
    if (Array.isArray(p.subjects)) return p.subjects;                 // their own list in notification settings
    try {
      var cfg = window.__ahGetMySubjects && window.__ahGetMySubjects();
      if (cfg && cfg.configured && cfg.codes && cfg.codes.length) return cfg.codes;
    } catch (e) {}
    return null;                                                      // never chose = the site shows everything
  }
  function wanted(r, p) {
    if (!r.force) {
      var k = r.kind || 'custom';
      if (k === 'exam') {
        if (p.exams === false) return false;
      } else if (k === 'deadline') {
        if (p.deadlines === false) return false;
        var cats = p.deadlineCats;
        if (Array.isArray(cats) && cats.length && r.resource_type && cats.indexOf(r.resource_type) < 0) return false;
      } else if (k === 'material') {
        var lvl = p.resources || 'week';
        if (lvl === 'off') return false;
        if (r.level === 'resource') {
          if (lvl !== 'all') return false;
          var types = p.resourceTypes;
          if (Array.isArray(types) && types.length && r.resource_type && types.indexOf(r.resource_type) < 0) return false;
        }
      } else {
        if (p.announcements === false) return false;
      }
    }
    if (r.audience_subject) {
      var codes = myCodes(p);
      if (codes && codes.indexOf(r.audience_subject) < 0) return false;
    }
    return true;
  }
  function visibleFeed() {
    var p = prefs();
    return feed.filter(function (r) { return wanted(r, p); });
  }
  function unreadCount() {
    if (seenTs == null) return 0;
    return visibleFeed().filter(function (r) { return tsOf(r) > seenTs; }).length;
  }

  /* -------------------------------------------------- "seen" marker: device + account */
  function seenKey() { return 'ah_bell_seen::' + semKey(); }
  function readLocalSeen() {
    try { var v = parseInt(localStorage.getItem(seenKey()), 10); return isNaN(v) ? null : v; } catch (e) { return null; }
  }
  function writeSeen(ts) {
    seenTs = ts;
    try { localStorage.setItem(seenKey(), String(ts)); } catch (e) {}
    try { if (window.__ahStudent && window.__ahSaveStudentPref) window.__ahSaveStudentPref('bell_seen::' + semKey(), ts); } catch (e) {}
  }
  async function pullRemoteSeen() {
    try {
      var st = window.__ahStudent;
      if (!st || !SB) return;
      var r = await SB.from('student_prefs').select('key, value').eq('user_id', st.id).eq('key', 'bell_seen::' + semKey());
      if (!r.error && r.data && r.data.length) {
        var v = parseInt(r.data[0].value, 10);
        if (!isNaN(v) && (seenTs == null || v > seenTs)) {
          seenTs = v;
          try { localStorage.setItem(seenKey(), String(v)); } catch (e) {}
        }
      }
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ fetching */
  async function refresh() {
    if (!SB) { loaded = true; repaint(); return; }
    try {
      var r = await SB.rpc('recent_notifications', { p_semester: semKey(), p_limit: 40 });
      if (!r.error && Array.isArray(r.data)) feed = r.data;
    } catch (e) {}
    loaded = true;
    if (seenTs == null) seenTs = readLocalSeen();
    await pullRemoteSeen();
    if (seenTs == null) {
      /* first ever visit on this device: what is already there counts as seen, only NEW things get a dot */
      var newest = feed.length ? Math.max.apply(null, feed.map(tsOf)) : Date.now();
      writeSeen(Math.max(newest, 1));
    }
    repaint();
  }

  /* ---------------------------------------------------------------------- styles */
  function injectCss() {
    if (document.getElementById('ah-bell-css')) return;
    var css =
      '.ah-bell-btn{position:relative;}' +
      '.ah-bell-badge{position:absolute;top:-4px;right:-4px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#e91e8c;color:#fff;font:700 .62rem/17px "Work Sans",sans-serif;text-align:center;box-shadow:0 0 0 2px #0a0012;display:none;pointer-events:none;}' +
      '.ah-bell-btn.has-new .ah-bell-badge{display:block;}' +
      '.ah-bell-btn.has-new{color:#fff;border-color:rgba(233,30,140,.6);}' +

      '#ah-bell-panel{position:fixed;z-index:3600;width:390px;max-width:calc(100vw - 16px);max-height:min(72vh,560px);display:none;flex-direction:column;background:#1a0d2e;border:1px solid rgba(233,30,140,.3);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.6);overflow:hidden;}' +
      '#ah-bell-panel.open{display:flex;}' +
      '.ah-bell-head{display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid rgba(255,255,255,.07);}' +
      '.ah-bell-head h3{font:700 .8rem "Orbitron",sans-serif;letter-spacing:1.5px;text-transform:uppercase;color:#fff;margin:0;flex:1;}' +
      '.ah-bell-x{background:none;border:none;color:#8b8397;font-size:1.5rem;line-height:1;cursor:pointer;padding:0 4px;}' +
      '.ah-bell-list{overflow-y:auto;padding:6px 8px;flex:1;-webkit-overflow-scrolling:touch;}' +
      '.ah-bell-foot{display:flex;gap:8px;align-items:center;justify-content:space-between;padding:10px 14px;border-top:1px solid rgba(255,255,255,.07);font-size:.76rem;}' +
      '.ah-bell-link{background:none;border:none;color:#b519d6;font:600 .76rem "Work Sans",sans-serif;cursor:pointer;padding:4px 0;}' +
      '.ah-bell-hint{color:#8b8397;font-size:.74rem;line-height:1.5;}' +

      '.ah-bell-item{display:flex;gap:11px;align-items:flex-start;padding:10px 8px;border-radius:12px;cursor:pointer;position:relative;-webkit-tap-highlight-color:transparent;}' +
      '.ah-bell-item + .ah-bell-item{border-top:1px solid rgba(255,255,255,.05);}' +
      '.ah-bell-item.unread{background:rgba(233,30,140,.07);}' +
      '.ah-bell-ic{flex:0 0 32px;width:32px;height:32px;border-radius:10px;display:inline-flex;align-items:center;justify-content:center;font-size:.85rem;color:#fff;}' +
      '.ah-bell-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}' +
      '.ah-bell-tx b{color:#fff;font-size:.86rem;font-weight:600;line-height:1.35;overflow-wrap:anywhere;}' +
      '.ah-bell-body{color:#b9adc9;font-size:.78rem;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line;}' +
      '.ah-bell-meta{color:#8b8397;font-size:.7rem;font-style:normal;}' +
      '.ah-bell-dot{flex:0 0 9px;width:9px;height:9px;border-radius:50%;background:#e91e8c;margin-top:6px;visibility:hidden;}' +
      '.ah-bell-item.unread .ah-bell-dot{visibility:visible;}' +
      '.ah-bell-empty{color:#8b8397;font-size:.86rem;font-style:italic;padding:22px 12px;text-align:center;}' +
      '@media (hover:hover){.ah-bell-item:hover{background:rgba(255,255,255,.05);}.ah-bell-link:hover{color:#e91e8c;}.ah-bell-x:hover{color:#fff;}}' +

      /* Home card: reuses the site's card look; only the rows are ours */
      '#dw-notifs .ah-bell-item{padding:9px 4px;}' +
      '#dw-notifs .ah-bell-list{padding:0;overflow:visible;}' +
      '#dw-notifs .ah-bell-foot{padding:10px 0 0;border-top:1px solid rgba(255,255,255,.07);margin-top:6px;}' +

      '@media (max-width:600px){#ah-bell-panel{left:8px !important;right:8px !important;width:auto;max-height:78vh;}}';
    var st = document.createElement('style');
    st.id = 'ah-bell-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* ------------------------------------------------------------- rows (shared) */
  function rowHtml(r, unread) {
    var k = KIND[r.kind] || KIND.custom;
    var meta = ago(tsOf(r)) + (r.audience_subject ? ' \u00b7 ' + esc(r.audience_subject) : '') + ' \u00b7 ' + k.name;
    var body = String(r.body || '').trim();
    return '<div class="ah-bell-item' + (unread ? ' unread' : '') + '" data-nid="' + esc(r.id) + '" role="button" tabindex="0">' +
             '<span class="ah-bell-ic" style="background:' + k.color + ';"><i class="fa-solid ' + k.icon + '"></i></span>' +
             '<div class="ah-bell-tx"><b>' + esc(r.title) + '</b>' +
               (body ? '<span class="ah-bell-body">' + esc(body) + '</span>' : '') +
               '<i class="ah-bell-meta">' + meta + '</i></div>' +
             '<span class="ah-bell-dot"></span>' +
           '</div>';
  }
  function footHtml() {
    var guest = !window.__ahStudent;
    return '<div class="ah-bell-foot">' +
             '<button type="button" class="ah-bell-link" data-act="settings"><i class="fa-solid fa-sliders"></i> Notification settings</button>' +
             (guest ? '<button type="button" class="ah-bell-link" data-act="signin">Sign in for email</button>' : '') +
           '</div>';
  }

  /* -------------------------------------------------------------- what a click does */
  function openTarget(r) {
    try {
      if (window.__ahOpenFromBell) window.__ahOpenFromBell(r.kind, r.audience_subject);
    } catch (e) {}
  }
  function handleClick(e, container) {
    var act = e.target.closest && e.target.closest('[data-act]');
    if (act && container.contains(act)) {
      var a = act.getAttribute('data-act');
      closePanel();
      if (a === 'settings' && window.__ahOpenNotifySettings) window.__ahOpenNotifySettings();
      if (a === 'signin') { var b = document.getElementById('ah-account-btn'); if (b) b.click(); }
      if (a === 'all') openPanel();
      return true;
    }
    var it = e.target.closest && e.target.closest('.ah-bell-item');
    if (it && container.contains(it)) {
      var id = it.getAttribute('data-nid');
      var row = feed.filter(function (r) { return String(r.id) === String(id); })[0];
      if (row) {
        markAllSeen();
        closePanel();
        openTarget(row);
      }
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------------- the bell */
  function mountBell() {
    if (document.getElementById('ah-bell-btn')) return true;
    var ref = document.getElementById('ah-account-btn') || document.getElementById('nav-settings-btn');
    if (!ref || !ref.parentNode) return false;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'ah-bell-btn';
    btn.className = 'nav-settings-btn ah-bell-btn';
    btn.title = 'Notifications';
    btn.setAttribute('aria-label', 'Notifications');
    btn.innerHTML = '<i class="fa-solid fa-bell"></i><span class="ah-bell-badge" id="ah-bell-badge"></span>';
    btn.addEventListener('click', function (e) { e.stopPropagation(); panelOpen ? closePanel() : openPanel(); });
    ref.parentNode.insertBefore(btn, ref);
    return true;
  }
  function paintBell() {
    var btn = document.getElementById('ah-bell-btn');
    if (!btn) return;
    var n = unreadCount();
    btn.classList.toggle('has-new', n > 0);
    var b = document.getElementById('ah-bell-badge');
    if (b) b.textContent = n > 9 ? '9+' : String(n || '');
    btn.title = n ? (n + ' new notification' + (n === 1 ? '' : 's')) : 'Notifications';
  }

  /* --------------------------------------------------------------------- the panel */
  function ensurePanel() {
    var p = document.getElementById('ah-bell-panel');
    if (p) return p;
    p = document.createElement('div');
    p.id = 'ah-bell-panel';
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-label', 'Notifications');
    p.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.ah-bell-x')) { closePanel(); return; }
      handleClick(e, p);
    });
    p.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('ah-bell-item')) {
        e.preventDefault(); e.target.click();
      }
    });
    document.body.appendChild(p);
    return p;
  }
  function paintPanel() {
    var p = document.getElementById('ah-bell-panel');
    if (!p || !panelOpen) return;
    var list = visibleFeed();
    p.innerHTML =
      '<div class="ah-bell-head"><h3>Notifications</h3><button type="button" class="ah-bell-x" aria-label="Close">&times;</button></div>' +
      '<div class="ah-bell-list">' +
        (list.length
          ? list.map(function (r) { return rowHtml(r, !!openUnread[r.id]); }).join('')
          : '<div class="ah-bell-empty">' + (loaded ? "Nothing yet. When something new is posted for your subjects, it shows up here." : 'Loading\u2026') + '</div>') +
      '</div>' +
      footHtml();
  }
  function positionPanel() {
    var p = document.getElementById('ah-bell-panel');
    var b = document.getElementById('ah-bell-btn');
    if (!p || !b) return;
    var r = b.getBoundingClientRect();
    p.style.top = Math.round(r.bottom + 10) + 'px';
    p.style.right = Math.max(8, Math.round(window.innerWidth - r.right - 4)) + 'px';
    p.style.left = 'auto';
  }
  function openPanel() {
    ensurePanel();
    openUnread = {};
    var vis = visibleFeed();
    vis.forEach(function (r) { if (seenTs != null && tsOf(r) > seenTs) openUnread[r.id] = true; });
    panelOpen = true;
    document.getElementById('ah-bell-panel').classList.add('open');
    positionPanel();
    paintPanel();
    markAllSeen();
    refresh();                       // grab anything newer while it is open
  }
  function closePanel() {
    panelOpen = false;
    var p = document.getElementById('ah-bell-panel');
    if (p) p.classList.remove('open');
  }
  function markAllSeen() {
    var vis = feed.map(tsOf);
    if (!vis.length) return;
    var newest = Math.max.apply(null, vis);
    if (seenTs == null || newest > seenTs) writeSeen(newest);
    paintBell();
    paintWidget();
  }

  /* -------------------------------------------------------------------- Home card */
  function ensureHost() {
    if (document.getElementById('dw-notifs')) return;
    var cols = document.querySelectorAll('#dashboard-page .dash-col');
    if (cols.length < 2) return;
    var h = document.createElement('div');
    h.className = 'dash-w';
    h.id = 'dw-notifs';
    h.addEventListener('click', function (e) { handleClick(e, h); });
    cols[0].insertBefore(h, cols[0].firstChild);
  }
  function paintWidget() {
    var h = document.getElementById('dw-notifs');
    if (!h) return;
    var list = visibleFeed();
    var top = list.slice(0, 4);
    var n = unreadCount();
    h.innerHTML =
      '<div class="dash-w-head"><span class="dash-w-ic"><i class="fa-solid fa-bell"></i></span><h2>Notifications' +
        (n ? ' <span style="color:#e91e8c;">(' + n + ' new)</span>' : '') + '</h2>' +
        (list.length ? '<span class="dash-see" data-act="all">See all</span>' : '') + '</div>' +
      '<div class="ah-bell-list">' +
        (top.length
          ? top.map(function (r) { return rowHtml(r, seenTs != null && tsOf(r) > seenTs); }).join('')
          : '<div class="dash-empty">' + (loaded ? "You're all caught up." : 'Loading\u2026') + '</div>') +
      '</div>' +
      footHtml();
  }

  function repaint() { paintBell(); paintPanel(); paintWidget(); }

  /* the Home page calls these (see student.js) */
  window.__ahDashNotifsHost = ensureHost;
  window.__ahDashNotifsPaint = paintWidget;

  /* --------------------------------------------------------------------- start up */
  function start() {
    injectCss();
    seenTs = readLocalSeen();
    var tries = 0;
    (function mount() {
      if (mountBell()) { paintBell(); return; }
      if (++tries < 40) setTimeout(mount, 250);
    })();

    setTimeout(refresh, 900);
    setTimeout(refresh, 4000);
    setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
    document.addEventListener('ah-student-changed', function () { seenTs = readLocalSeen(); refresh(); });
    window.addEventListener('resize', function () { if (panelOpen) positionPanel(); });
    window.addEventListener('scroll', function () { if (panelOpen) positionPanel(); }, { passive: true });

    document.addEventListener('click', function (e) {
      if (!panelOpen) return;
      var p = document.getElementById('ah-bell-panel');
      var b = document.getElementById('ah-bell-btn');
      if (p && !p.contains(e.target) && b && !b.contains(e.target)) closePanel();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panelOpen) closePanel(); });
    /* keep the settings-dependent view fresh if the student changes their notification settings */
    window.addEventListener('storage', repaint);
    setInterval(paintBell, 15000);
    window.__ahBellRepaint = repaint;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
