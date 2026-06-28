/* Academic Hub - student-data.js  (semester-aware, feature 7.1)
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
    wrap.style.cssText = 'display:flex;align-items:center;flex-shrink:0;margin-right:14px;';

    var sel = document.createElement('select');
    sel.id = 'ah-sem-switcher';
    sel.title = 'Switch semester';
    sel.style.cssText =
      'background:rgba(10,0,18,0.6);color:#fff;border:1px solid rgba(233,30,140,0.4);' +
      'border-radius:8px;padding:5px 8px;font-size:0.72rem;font-weight:700;font-family:inherit;' +
      'letter-spacing:0.4px;cursor:pointer;outline:none;max-width:150px;';

    list.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.slug;
      o.textContent = (s.name || s.slug) + (s.is_current ? ' \u2022 current' : '');
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
      mountSwitcher(list, selected);
      return loadSemester(selected);   // selected === null -> plain load (pre-migration)
    }, function () {
      return loadSemester(null);       // semesters table unreachable -> behave like before
    })
    .then(null, function (err) {
      console.warn('[AcademicHub] Live data error - using bundled data.', err);
    });
})();
