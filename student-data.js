/* VERSION: 2026-07-01 — semesters (7.1) + auto badges/announcements (7.2) + analytics (7.3) + detailed click tracking (7.3c). If this dated line is present, you have the current file. */
/* Academic Hub - student-data.js  (semester-aware, feature 7.1; + 7.3 analytics appended at bottom)
   --------------------------------------------------------------------------
   What this does, in order:
     1. Works out which semester to show:
          ?sem=<slug> in the URL  ->  else the one marked "current"  ->  else first.
     2. Loads THAT semester's data from the database.
     3. Refreshes the page live via the app's existing LIVE_UPDATE mechanism
        (overwrites the window.* globals + re-renders, keeping the student on
        their current page).
     4. Adds a semester dropdown to the navbar - but only when there is more
        than one semester (no clutter while there's just Fall 2026).

   If ANYTHING fails (no client, DB unreachable, table/column missing mid-deploy)
   the page keeps running on the bundled course_data.js. It can never go blank.
*/

(function () {
  var sb = window.__ahSupabase;
  if (!sb) return; // bundled data is already showing

  var KEYS = ['CONFIG', 'COURSE_DATA', 'SUBJECT_DETAILS_DATA', 'SCHEDULE_DATA', 'MIDTERM_DATA',
              'FINAL_DATA', 'STAFF_DATA', 'TIMETABLE_DATA', 'UPDATES_DATA', 'NEWS_DATA'];

  // Empty shapes used to blank a key that a (specific) semester doesn't have,
  // so an empty/new semester never shows the old bundled Fall data.
  // CONFIG is intentionally left out: if it's somehow missing we keep the
  // bundled CONFIG so the page still has resource types/icons to render with.
  var EMPTY = {
    COURSE_DATA: [], SUBJECT_DETAILS_DATA: {}, SCHEDULE_DATA: [], MIDTERM_DATA: [],
    FINAL_DATA: [], STAFF_DATA: [], TIMETABLE_DATA: {}, UPDATES_DATA: [], NEWS_DATA: []
  };

  function urlSem() {
    try { return new URL(location.href).searchParams.get('sem'); } catch (e) { return null; }
  }

  function pickSemester(list, wanted) {
    if (!list || !list.length) return null;
    if (wanted) { for (var i = 0; i < list.length; i++) if (list[i].slug === wanted) return wanted; }
    for (var j = 0; j < list.length; j++) if (list[j].is_current) return list[j].slug;
    return list[0].slug;
  }

  function applyRows(rows, scopedSlug) {
    var payload = {};
    var present = {};
    (rows || []).forEach(function (r) { payload[r.key] = r.value; present[r.key] = true; });

    // For a specific semester, fill any missing key with an empty default.
    if (scopedSlug) {
      Object.keys(EMPTY).forEach(function (k) {
        if (!present[k]) payload[k] = (typeof EMPTY[k] === 'object') ? JSON.parse(JSON.stringify(EMPTY[k])) : EMPTY[k];
      });
    }

    var changed = false;
    Object.keys(payload).forEach(function (k) {
      try { if (JSON.stringify(window[k]) !== JSON.stringify(payload[k])) changed = true; }
      catch (e) { changed = true; }
    });

    if (changed) {
      window.postMessage({ type: 'LIVE_UPDATE', payload: payload }, '*'); // app's own handler re-renders
      console.log('[AcademicHub] \u2705 Live data applied (' + Object.keys(payload).length + ' sets'
        + (scopedSlug ? ', semester ' + scopedSlug : '') + ').');
    } else {
      console.log('[AcademicHub] \u2705 Live data matches what is shown. No refresh needed.');
    }
  }

  function loadSemester(slug) {
    var q = sb.from('site_data').select('key, value');
    if (slug) q = q.eq('semester', slug);
    return q.then(function (res) {
      if (res.error) {
        // e.g. the 'semester' column isn't there yet (mid-deploy) -> retry unfiltered
        if (slug) {
          return sb.from('site_data').select('key, value').then(function (r2) {
            if (r2.error) { console.warn('[AcademicHub] Live load failed - using bundled data.', r2.error.message); return; }
            applyRows(r2.data, null);
          });
        }
        console.warn('[AcademicHub] Live load failed - using bundled data.', res.error.message);
        return;
      }
      applyRows(res.data, slug);
    });
  }

  function mountSwitcher(list, selected) {
    if (!list || list.length < 2) return;          // nothing to switch between
    var nav = document.querySelector('.navbar');
    if (!nav || document.getElementById('ah-sem-switcher')) return;

    var wrap = document.createElement('div');
    wrap.id = 'ah-sem-switcher-wrap';
    wrap.style.cssText = 'display:flex;align-items:center;flex-shrink:0;margin-right:16px;';

    var caret = "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='10'%20height='6'%3E%3Cpath%20d='M1%201l4%204%204-4'%20fill='none'%20stroke='%23ff7ad1'%20stroke-width='1.6'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3C/svg%3E";

    var sel = document.createElement('select');
    sel.id = 'ah-sem-switcher';
    sel.title = 'Switch semester';
    sel.style.cssText =
      'appearance:none;-webkit-appearance:none;-moz-appearance:none;' +
      'background:url("' + caret + '") no-repeat right 11px center,' +
        'linear-gradient(135deg, rgba(168,85,247,0.20), rgba(233,30,140,0.20));' +
      'color:#fff;border:1px solid rgba(233,30,140,0.55);border-radius:999px;' +
      'padding:6px 28px 6px 14px;font-size:0.72rem;font-weight:700;font-family:inherit;' +
      'letter-spacing:0.4px;cursor:pointer;outline:none;max-width:170px;' +
      'box-shadow:0 2px 10px rgba(0,0,0,0.3);text-shadow:0 1px 2px rgba(0,0,0,0.4);';

    list.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.slug;
      o.textContent = s.name || s.slug;                 // clean label, no "• current"
      o.style.cssText = 'background:#0a0012;color:#fff;';
      if (s.slug === selected) o.selected = true;
      sel.appendChild(o);
    });

    sel.addEventListener('change', function () {
      var u = new URL(location.href);
      u.searchParams.set('sem', sel.value);
      location.href = u.toString();   // reload into the chosen semester (hash is preserved)
    });

    wrap.appendChild(sel);
    var brand = nav.querySelector('.nav-brand');
    if (brand && brand.nextSibling) nav.insertBefore(wrap, brand.nextSibling);
    else nav.insertBefore(wrap, nav.firstChild);
  }

  // ---- run ----
  sb.from('semesters').select('slug, name, sort_order, is_current').order('sort_order', { ascending: true })
    .then(function (res) {
      var list = (res && !res.error && res.data) ? res.data : [];
      var selected = pickSemester(list, urlSem());
      var currentSlug = null;
      for (var i = 0; i < list.length; i++) { if (list[i].is_current) { currentSlug = list[i].slug; break; } }
      if (!currentSlug && list.length) currentSlug = list[0].slug;
      // Exposed for the GPA calculator: which semester is the default, and are we on it?
      window.__ahCurrentSemSlug = currentSlug;
      window.__ahIsCurrentSem = currentSlug ? (selected === currentSlug) : true;
      // Name of the semester currently loaded (for the GPA "load preset" button label)
      for (var n = 0; n < list.length; n++) { if (list[n].slug === selected) { window.__ahSemName = list[n].name; break; } }
      mountSwitcher(list, selected);
      return loadSemester(selected);   // selected === null -> plain load (pre-migration)
    }, function () {
      return loadSemester(null);       // semesters table unreachable -> behave like before
    })
    .then(null, function (err) {
      console.warn('[AcademicHub] Live data error - using bundled data.', err);
    });
})();

/* ───────────────────────────────────────────────────────────────────────────
   Academic Hub — lightweight usage analytics  (feature 7.3)
   ---------------------------------------------------------------------------
   Logs anonymous usage events to the `click_events` table so the admin Stats
   panel can chart them. Four event types:
       page_view      one per page load
       tab_view       opening a top-level page (home, schedule, gpa, …)
       subject_open   opening a subject's weeks page   (label = subject code)
       resource_open  opening a week/material           (label = subject code,
                                                          detail = week title)
   It is BEST-EFFORT ONLY. No personal data is stored — just a random session
   id kept in localStorage. If anything fails (no DB, offline, table missing)
   it stays completely silent and never affects the page or navigation.
   This is a separate, self-contained block from the live-data loader above.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  var sb = window.__ahSupabase;
  if (!sb) return;                       // bundled-data mode → nothing to log to

  // 1) anonymous per-browser session id (random; not linked to any identity)
  var SID_KEY = 'ah_sid';
  var sid;
  try {
    sid = localStorage.getItem(SID_KEY);
    if (!sid) {
      sid = 's-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(SID_KEY, sid);
    }
  } catch (e) { sid = 's-' + Math.random().toString(36).slice(2, 12); }

  function pagePath() {
    try {
      var f = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
      return f.replace(/\.html?$/, '') || 'index';
    } catch (e) { return 'index'; }
  }
  // which semester is being VIEWED right now (?sem= wins, else the current one)
  function viewedSem() {
    try {
      var u = new URL(location.href).searchParams.get('sem');
      if (u) return u;
    } catch (e) {}
    return window.__ahCurrentSemSlug || null;   // set by the loader above once it resolves
  }

  // 2) batched, fire-and-forget queue (kind to the free tier + mobile data)
  var queue = [];
  var FLUSH_MS = 5000, MAX_BATCH = 12;
  var flushTimer = null;

  function flush() {
    if (!queue.length) return;
    var batch = queue.splice(0, queue.length);
    try {
      sb.from('click_events').insert(batch).then(function (r) {
        if (r && r.error) console.warn('[AcademicHub] stats flush skipped:', r.error.message);
      }, function () { /* network hiccup — drop it, it's only analytics */ });
    } catch (e) { /* ignore */ }
  }
  function scheduleFlush() {
    if (queue.length >= MAX_BATCH) { flush(); return; }
    if (flushTimer) return;
    flushTimer = setTimeout(function () { flushTimer = null; flush(); }, FLUSH_MS);
  }

  function logEvent(type, label, detail) {
    if (!type) return;
    try {
      queue.push({
        session_id: sid,
        semester:   viewedSem(),
        event_type: type,
        label:  (label  != null && label  !== '') ? String(label).slice(0, 120)  : null,
        detail: (detail != null && detail !== '') ? String(detail).slice(0, 200) : null,
        path:   pagePath(),
        created_at: new Date().toISOString()
      });
      scheduleFlush();
    } catch (e) { /* never throw from logging */ }
  }
  window.__ahLogEvent = logEvent;        // exposed for any future manual events

  // flush when the tab is hidden / closed (best effort)
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);

  // 3) one page_view per load
  logEvent('page_view', pagePath(), null);

  // 4) hook the app's central navigation function (defined in student.js, which
  //    loads BEFORE this file). Consecutive identical locations are deduped, so
  //    live-data refreshes — which re-render the same page the student is on —
  //    don't inflate the counts.
  function classify(id, stateData) {
    if (id === 'weeks')   return { type: 'subject_open',  label: stateData && stateData.subCode, detail: null };
    if (id === 'content') return { type: 'resource_open', label: stateData && stateData.subCode,
                                   detail: stateData && stateData.wkObj && stateData.wkObj.title };
    return { type: 'tab_view', label: id, detail: null };
  }

  var lastKey = null;
  function patchNav() {
    if (typeof window.nav !== 'function' || window.__ahNavPatched) return (typeof window.nav === 'function');
    var orig = window.nav;
    window.nav = function (id, push, stateData) {
      try {
        var c = classify(id, stateData);
        var key = c.type + '|' + (c.label || '') + '|' + (c.detail || '');
        if (key !== lastKey) { lastKey = key; logEvent(c.type, c.label, c.detail); }
      } catch (e) { /* never let logging break navigation */ }
      return orig.apply(this, arguments);
    };
    window.__ahNavPatched = true;
    return true;
  }

  // student.js parses before this file, so window.nav already exists; guard anyway.
  if (!patchNav()) document.addEventListener('DOMContentLoaded', patchNav);
})();

/* ───────────────────────────────────────────────────────────────────────────
   Academic Hub — DETAILED click tracking  (feature 7.3c)
   ---------------------------------------------------------------------------
   Captures the granular interactions the basic logger above doesn't:
       resource_click   a material opened inside a week  (label=subject,
                        detail="<resource> · <week>")
       link_click       a Useful Link opened             (label=link title)
       staff_click      a staff contact opened           (label=contact)
       outbound_click   any other external link          (detail=page)
   It's a single capture-phase click listener — it only LISTENS, never alters
   navigation or rendering, so it can't break the live site. It reads the app's
   current subject/week/page state (globals defined in student.js) defensively;
   if anything is missing it just logs less, never throws.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  if (!window.__ahSupabase || typeof window.__ahLogEvent !== 'function') return;
  var log = window.__ahLogEvent;

  // read student.js globals safely (they live in the shared global scope)
  function G(fn) { try { return fn(); } catch (e) { return undefined; } }
  function subCode()   { return G(function () { return currSub && currSub.code; }) || null; }
  function weekTitle() { return G(function () { return currentContentObj && currentContentObj.title; }) || null; }
  function curPage()   { return G(function () { return currentPageId; }) ||
                                G(function () { return window.getActivePageId && window.getActivePageId(); }) || null; }

  function cleanLabel(elem, fallback) {
    try {
      var strong = elem.querySelector('span[style*="font-weight:6"], span[style*="font-weight:7"], h3, strong, b');
      var txt = (strong ? strong.textContent : elem.textContent) || '';
      txt = txt.replace(/\s+/g, ' ').replace(/NEW!?/g, '').replace(/[→›▼]/g, '').trim();
      return txt.slice(0, 90) || fallback || null;
    } catch (e) { return fallback || null; }
  }

  document.addEventListener('click', function (ev) {
    try {
      var t = ev.target; if (!t || !t.closest) return;

      // 1) a material card inside a week's content grid → precise attribution
      var card = t.closest('#resources-grid .card');
      if (card) {
        var name = '';
        var divs = card.querySelectorAll('div');
        for (var i = 0; i < divs.length; i++) {
          var s = divs[i].getAttribute('style') || '';
          if (s.indexOf('uppercase') > -1) { name = (divs[i].textContent || '').replace(/NEW!?/g, '').trim(); break; }
        }
        if (!name) name = cleanLabel(card, 'resource');
        var wk = weekTitle();
        log('resource_click', subCode(), name + (wk ? ' · ' + wk : ''));
        return;
      }

      // 2) external links / link-rows (ignore internal #hash navigations)
      var a = t.closest('a[href]');
      var el = a || t.closest('[data-link]');
      if (!el) return;
      var href = a ? el.getAttribute('href') : el.getAttribute('data-link');
      if (!href || href === '#' || href.charAt(0) === '#') return;
      if (!/^(https?:|mailto:|tel:)/i.test(href)) return;

      var page = curPage();
      var isContact = /^(mailto:|tel:)/i.test(href) ||
                      /(wa\.me|whatsapp|t\.me|telegram|messenger|facebook\.com\/|instagram\.com\/)/i.test(href);
      var label = cleanLabel(el, href);

      if (page === 'useful-links')            log('link_click',  label, null);
      else if (page === 'directory' || isContact) log('staff_click',  label, page || null);
      else                                    log('outbound_click', label, page || null);
    } catch (e) { /* never let tracking break a click */ }
  }, true);
})();
