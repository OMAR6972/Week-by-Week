/* VERSION: 2026-07-01 — stats dashboard: hourly view, most/avg/lowest, per-subject drill-down, recent-activity list (7.3b). If this dated line is present, you have the current file. */
/* Academic Hub - admin-stats.js  (feature 7.3)
   ---------------------------------------------------------------------------
   "📊 Stats" sidebar item + dashboard charting the anonymous usage events that
   student-data.js logs into `click_events`. Reads are scoped to the semester
   you're EDITING (window.__ahSemester), with an "all semesters" toggle and a
   time range (Today-hourly / 7 / 30 / 90 days / all).

   What's here now (from the data we currently collect — page/tab/subject/week):
     • KPI cards + Most / Average / Lowest summary
     • Activity chart (hourly when "Today", daily otherwise; Y axis = events)
     • Per-subject drill-down: click a subject → its weeks ranked, with
       most/avg/lowest for that subject
     • Top pages, event mix, and a Recent-activity list with exact timestamps
   Resource-/staff-/link-level detail needs extra click tracking in student.js
   (no data for it yet) — that's a separate package.

   Self-contained: injects its own nav button by wrapping __ahAdminBoot.
   Chart.js loads from a CDN the first time the panel opens.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  var SB = window.__ahSupabase;

  var C = {
    pink:'#e91e8c', purple:'#a855f7', blue:'#4a90e2', green:'#00c853',
    orange:'#ff9500', cyan:'#00E5FF', grid:'rgba(255,255,255,0.06)', tick:'#9a8cc0'
  };

  var rangeMode = '30';     // 'today' | '7' | '30' | '90' | 'all'
  var allSemesters = false;
  var charts = {};
  var lastRows = [];        // cached so the drill-down recomputes without refetching
  var drillSubject = null;

  function el(tag, css, html) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' })[c]; }); }

  // ───────────────── nav button injection (after login boot) ─────────────────
  function injectNav() {
    var nav = document.getElementById('sidebar-nav');
    if (!nav || document.getElementById('nav-stats')) return;
    var label = el('div', 'margin-top:4px;', 'Insights');
    label.className = 'nav-section-label';
    var btn = el('div', null, '📊 Stats');
    btn.className = 'nav-btn';
    btn.id = 'nav-stats';
    btn.addEventListener('click', window.toggleStats);
    nav.appendChild(label);
    nav.appendChild(btn);
  }

  var _origBoot = window.__ahAdminBoot;
  window.__ahAdminBoot = function () {
    if (typeof _origBoot === 'function') _origBoot();
    try { injectNav(); } catch (e) {}
  };

  // ───────────────────────────── open the panel ──────────────────────────────
  window.toggleStats = function () {
    if (typeof setView === 'function') setView('stats');
    document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
    var nb = document.getElementById('nav-stats'); if (nb) nb.classList.add('active');
    if (typeof closeSidebar === 'function') closeSidebar();
    drawShell();
    loadAndRender();
  };

  // ─────────────────────────────── shell / UI ───────────────────────────────
  function rangeBtn(mode, txt) {
    var on = rangeMode === mode;
    return '<button data-mode="' + mode + '" class="ah-st-range" style="' +
      'background:' + (on ? 'linear-gradient(135deg,#a855f7,#e91e8c)' : '#241338') + ';' +
      'color:#fff;border:1px solid ' + (on ? '#e91e8c' : '#3a2a52') + ';' +
      'padding:6px 12px;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;">' + txt + '</button>';
  }

  function card(title, inner) {
    return '<div style="background:#1d0f33;border:1px solid #2f1d4a;border-radius:12px;padding:16px;">' +
      '<div style="font-size:0.82rem;font-weight:700;color:#cbb3ff;letter-spacing:0.4px;margin-bottom:12px;text-transform:uppercase;">' +
      title + '</div>' + inner + '</div>';
  }
  // a canvas MUST live in a relatively-positioned, fixed-HEIGHT box or Chart.js grows it forever
  function chartBox(id, h) {
    return '<div style="position:relative;height:' + h + 'px;width:100%;"><canvas id="' + id + '"></canvas></div>';
  }
  function kpi(value, label, color) {
    return '<div style="background:#1d0f33;border:1px solid #2f1d4a;border-radius:12px;padding:14px 16px;">' +
      '<div style="font-size:1.7rem;font-weight:800;color:' + color + ';line-height:1;">' + value + '</div>' +
      '<div style="font-size:0.72rem;color:#9a8cc0;margin-top:6px;text-transform:uppercase;letter-spacing:0.6px;font-weight:700;">' + label + '</div>' +
      '</div>';
  }
  function status(msg, isError) {
    var s = document.getElementById('ah-st-status');
    if (s) { s.textContent = msg || ''; s.style.color = isError ? '#ff6b6b' : '#9a8cc0'; }
  }

  function drawShell() {
    var area = document.getElementById('editor-area');
    if (!area) return;
    destroyCharts();
    var semName = window.__ahSemester || 'current semester';
    area.innerHTML =
      '<div style="max-width:1000px;margin:0 auto;width:100%;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:6px;">' +
          '<h3 style="border:none;margin:0;padding:0;color:#e91e8c;font-size:1.3rem;">📊 Usage Stats</h3>' +
          '<button id="ah-st-refresh" class="btn" style="background:#3a7bd5;font-size:0.78rem;">↻ Refresh</button>' +
        '</div>' +
        '<div style="color:#9a8cc0;font-size:0.8rem;margin-bottom:14px;">' +
          'Anonymous, by random session — no logins, no personal data. ' +
          'Showing <b style="color:#cbb3ff;">' + (allSemesters ? 'all semesters' : ('“' + esc(semName) + '”')) + '</b>.' +
        '</div>' +

        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:18px;">' +
          rangeBtn('today','Today (hourly)') + rangeBtn('7','7 days') + rangeBtn('30','30 days') +
          rangeBtn('90','90 days') + rangeBtn('all','All time') +
          '<label style="display:flex;align-items:center;gap:6px;margin-left:auto;background:rgba(0,0,0,0.25);' +
            'padding:6px 10px;border-radius:8px;font-size:0.78rem;color:#ddd;cursor:pointer;font-weight:600;">' +
            '<input type="checkbox" id="ah-st-allsem" ' + (allSemesters ? 'checked' : '') + ' style="width:15px;height:15px;"> All semesters' +
          '</label>' +
        '</div>' +

        '<div id="ah-st-kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;"></div>' +
        '<div id="ah-st-summary" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:20px;"></div>' +

        card('Activity over time', chartBox('ah-st-line', 250)) +

        '<div style="height:18px;"></div>' +
        card('Subjects — click one to drill in',
          '<div style="display:grid;grid-template-columns:minmax(180px,260px) 1fr;gap:16px;" id="ah-st-subwrap">' +
            '<div id="ah-st-sublist" style="display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto;"></div>' +
            '<div id="ah-st-subdetail" style="min-width:0;"></div>' +
          '</div>') +

        '<div style="height:18px;"></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;">' +
          card('Most-viewed pages', chartBox('ah-st-tabs', 260)) +
          card('Event mix', chartBox('ah-st-mix', 260)) +
        '</div>' +

        '<div style="height:18px;"></div>' +
        card('Recent activity (newest first)',
          '<div id="ah-st-recent" style="max-height:300px;overflow:auto;font-size:0.8rem;"></div>') +

        '<div id="ah-st-status" style="text-align:center;color:#9a8cc0;margin:24px 0;font-size:0.9rem;"></div>' +
      '</div>';

    area.querySelectorAll('.ah-st-range').forEach(function (b) {
      b.addEventListener('click', function () { rangeMode = b.getAttribute('data-mode'); drillSubject = null; drawShell(); loadAndRender(); });
    });
    var allCb = document.getElementById('ah-st-allsem');
    if (allCb) allCb.addEventListener('change', function () { allSemesters = !!allCb.checked; drillSubject = null; drawShell(); loadAndRender(); });
    var rf = document.getElementById('ah-st-refresh');
    if (rf) rf.addEventListener('click', loadAndRender);

    // responsive: stack the subject drill on narrow screens
    if (window.matchMedia && window.matchMedia('(max-width: 760px)').matches) {
      var w = document.getElementById('ah-st-subwrap');
      if (w) w.style.gridTemplateColumns = '1fr';
    }
  }

  // ───────────────────────── Chart.js lazy loader ───────────────────────────
  function ensureChart(cb) {
    if (window.Chart) return cb();
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload = function () { cb(); };
    s.onerror = function () { status('Could not load the charting library (offline?). The numbers and lists above are still accurate.', true); };
    document.head.appendChild(s);
  }
  function destroyCharts() {
    Object.keys(charts).forEach(function (k) { try { charts[k].destroy(); } catch (e) {} delete charts[k]; });
  }

  // ───────────────────────────── data fetch ─────────────────────────────────
  function sinceIso() {
    if (rangeMode === 'today') return new Date(Date.now() - 24 * 3600000).toISOString();
    if (rangeMode === '7')     return new Date(Date.now() - 7  * 86400000).toISOString();
    if (rangeMode === '30')    return new Date(Date.now() - 30 * 86400000).toISOString();
    if (rangeMode === '90')    return new Date(Date.now() - 90 * 86400000).toISOString();
    return null; // all
  }

  function loadAndRender() {
    if (!SB) { status('Not connected to the database.', true); return; }
    status('Loading…');
    var q = SB.from('click_events')
      .select('created_at, event_type, label, detail, session_id, semester')
      .order('created_at', { ascending: true })
      .limit(20000);
    var s = sinceIso();
    if (s) q = q.gte('created_at', s);
    if (!allSemesters && window.__ahSemester) q = q.eq('semester', window.__ahSemester);

    q.then(function (res) {
      if (res.error) {
        status('Could not load stats: ' + res.error.message + '  (Did you run academic_hub_stats.sql?)', true);
        return;
      }
      lastRows = res.data || [];
      renderKpis(lastRows);
      renderSummary(lastRows);
      renderSubjectList(lastRows);
      renderRecent(lastRows);
      if (!lastRows.length) {
        status('No events recorded yet for this selection. As students browse the live site, data shows up here.');
        clearCanvasArea();
        return;
      }
      status('');
      ensureChart(function () { renderCharts(lastRows); });
    }, function (e) {
      status('Could not load stats: ' + (e && e.message ? e.message : e), true);
    });
  }
  function clearCanvasArea() { destroyCharts(); }

  // ───────────────────────────── aggregation ────────────────────────────────
  function countBy(rows, type, keyFn) {
    var m = {};
    rows.forEach(function (r) { if (r.event_type !== type) return; var k = keyFn(r); if (k == null || k === '') k = '(unknown)'; m[k] = (m[k] || 0) + 1; });
    return m;
  }
  function toSortedPairs(map, n) {
    var arr = Object.keys(map).map(function (k) { return [k, map[k]]; });
    arr.sort(function (a, b) { return b[1] - a[1]; });
    return n ? arr.slice(0, n) : arr;
  }
  function stats(values) {
    if (!values.length) return { most: 0, avg: 0, low: 0 };
    var sum = 0, most = -Infinity, low = Infinity;
    values.forEach(function (v) { sum += v; if (v > most) most = v; if (v < low) low = v; });
    return { most: most, avg: Math.round((sum / values.length) * 10) / 10, low: low };
  }

  function renderKpis(rows) {
    var sessions = {}, subj = 0, res = 0, pv = 0;
    rows.forEach(function (r) {
      if (r.session_id) sessions[r.session_id] = 1;
      if (r.event_type === 'subject_open') subj++;
      else if (r.event_type === 'resource_open') res++;
      else if (r.event_type === 'page_view') pv++;
    });
    var box = document.getElementById('ah-st-kpis'); if (!box) return;
    box.innerHTML =
      kpi(Object.keys(sessions).length, 'Unique visitors', C.pink) +
      kpi(pv,   'Page loads',     C.purple) +
      kpi(subj, 'Subject opens',  C.blue) +
      kpi(res,  'Week opens',     C.green);
  }

  // Most / Average / Lowest — computed across subjects (by subject-open count)
  function renderSummary(rows) {
    var box = document.getElementById('ah-st-summary'); if (!box) return;
    var subjMap = countBy(rows, 'subject_open', function (r) { return r.label; });
    var pairs = toSortedPairs(subjMap);
    if (!pairs.length) {
      box.innerHTML = '<div style="grid-column:1/-1;color:#9a8cc0;font-size:0.82rem;background:#1d0f33;border:1px solid #2f1d4a;border-radius:12px;padding:14px 16px;">No subject opens yet — Most / Average / Lowest will fill in once subjects get opened.</div>';
      return;
    }
    var st = stats(pairs.map(function (p) { return p[1]; }));
    var busiest = pairs[0], quietest = pairs[pairs.length - 1];
    box.innerHTML =
      kpi(esc(busiest[0]) + ' · ' + busiest[1], 'Most-opened subject', C.green) +
      kpi(st.avg,                               'Avg opens / subject', C.cyan) +
      kpi(esc(quietest[0]) + ' · ' + quietest[1], 'Least-opened subject', C.orange);
  }

  // ── subject list + drill-down detail ──
  function renderSubjectList(rows) {
    var listEl = document.getElementById('ah-st-sublist'); if (!listEl) return;
    var subjMap = countBy(rows, 'subject_open', function (r) { return r.label; });
    // also surface subjects that only have week-opens
    countBy(rows, 'resource_open', function (r) { return r.label; });
    rows.forEach(function (r) { if (r.event_type === 'resource_open' && r.label && subjMap[r.label] == null) subjMap[r.label] = 0; });
    var pairs = toSortedPairs(subjMap);
    listEl.innerHTML = '';
    if (!pairs.length) { listEl.innerHTML = '<div style="color:#9a8cc0;font-size:0.82rem;">No subjects opened yet.</div>'; document.getElementById('ah-st-subdetail').innerHTML = ''; return; }
    if (!drillSubject) drillSubject = pairs[0][0];
    pairs.forEach(function (p) {
      var on = p[0] === drillSubject;
      var row = el('button',
        'text-align:left;display:flex;justify-content:space-between;gap:8px;align-items:center;' +
        'background:' + (on ? 'rgba(74,144,226,0.22)' : '#150a25') + ';border:1px solid ' + (on ? C.blue : '#2f1d4a') + ';' +
        'color:#fff;border-radius:8px;padding:9px 11px;font-size:0.85rem;cursor:pointer;font-weight:600;',
        '<span>' + esc(p[0]) + '</span><span style="color:' + C.blue + ';font-weight:800;">' + p[1] + '</span>');
      row.addEventListener('click', function () { drillSubject = p[0]; renderSubjectList(rows); renderSubjectDetail(rows); });
      listEl.appendChild(row);
    });
    renderSubjectDetail(rows);
  }

  function renderSubjectDetail(rows) {
    var box = document.getElementById('ah-st-subdetail'); if (!box) return;
    if (!drillSubject) { box.innerHTML = ''; return; }
    var weekMap = {};
    rows.forEach(function (r) {
      if (r.event_type === 'resource_open' && r.label === drillSubject) {
        var w = r.detail || '(week)'; weekMap[w] = (weekMap[w] || 0) + 1;
      }
    });
    var opens = rows.filter(function (r) { return r.event_type === 'subject_open' && r.label === drillSubject; }).length;
    var pairs = toSortedPairs(weekMap);
    var head = '<div style="font-size:1.05rem;font-weight:800;color:#fff;margin-bottom:4px;">' + esc(drillSubject) + '</div>' +
      '<div style="font-size:0.78rem;color:#9a8cc0;margin-bottom:14px;">' + opens + ' subject open' + (opens === 1 ? '' : 's') +
      ' · ' + pairs.length + ' week' + (pairs.length === 1 ? '' : 's') + ' opened</div>';

    if (!pairs.length) {
      box.innerHTML = head + '<div style="color:#9a8cc0;font-size:0.82rem;background:#150a25;border:1px solid #2f1d4a;border-radius:8px;padding:12px;">No week opens recorded yet for this subject.</div>';
      return;
    }
    var st = stats(pairs.map(function (p) { return p[1]; }));
    var summary = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">' +
      pill('Most', pairs[0][0] + ' · ' + pairs[0][1], C.green) +
      pill('Avg / week', String(st.avg), C.cyan) +
      pill('Lowest', pairs[pairs.length - 1][0] + ' · ' + pairs[pairs.length - 1][1], C.orange) +
      '</div>';
    var max = pairs[0][1] || 1;
    var bars = pairs.map(function (p) {
      var pct = Math.round((p[1] / max) * 100);
      return '<div style="margin-bottom:8px;">' +
        '<div style="display:flex;justify-content:space-between;font-size:0.78rem;color:#ddd;margin-bottom:3px;">' +
          '<span>' + esc(p[0]) + '</span><span style="color:' + C.blue + ';font-weight:700;">' + p[1] + '</span></div>' +
        '<div style="height:8px;background:#150a25;border-radius:5px;overflow:hidden;">' +
          '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#4a90e2,#a855f7);"></div></div>' +
      '</div>';
    }).join('');
    box.innerHTML = head + summary + bars;
  }
  function pill(label, value, color) {
    return '<div style="background:#150a25;border:1px solid #2f1d4a;border-radius:9px;padding:8px 11px;min-width:120px;">' +
      '<div style="font-size:0.62rem;color:#9a8cc0;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;">' + label + '</div>' +
      '<div style="font-size:0.9rem;color:' + color + ';font-weight:800;margin-top:3px;">' + esc(value) + '</div></div>';
  }

  // ── recent activity list (exact timestamps → the hours & minutes you wanted) ──
  function renderRecent(rows) {
    var box = document.getElementById('ah-st-recent'); if (!box) return;
    var TYPE = { page_view:'Page load', tab_view:'Tab', subject_open:'Subject', resource_open:'Week' };
    var COLOR = { page_view:C.purple, tab_view:C.cyan, subject_open:C.blue, resource_open:C.green };
    var recent = rows.slice().sort(function (a, b) { return (b.created_at || '').localeCompare(a.created_at || ''); }).slice(0, 40);
    if (!recent.length) { box.innerHTML = '<div style="color:#9a8cc0;">Nothing yet.</div>'; return; }
    box.innerHTML = recent.map(function (r) {
      var d = new Date(r.created_at);
      var when = isNaN(d) ? '' : d.toLocaleString([], { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      var what = (TYPE[r.event_type] || r.event_type);
      var extra = [r.label, r.detail].filter(Boolean).map(esc).join(' · ');
      return '<div style="display:flex;gap:10px;align-items:baseline;padding:6px 0;border-bottom:1px solid #221634;">' +
        '<span style="color:#7a6aa0;white-space:nowrap;font-variant-numeric:tabular-nums;">' + when + '</span>' +
        '<span style="color:' + (COLOR[r.event_type] || '#fff') + ';font-weight:700;white-space:nowrap;">' + what + '</span>' +
        '<span style="color:#cbb3ff;">' + extra + '</span></div>';
    }).join('');
  }

  // ───────────────────────────── charts ─────────────────────────────────────
  function activityBuckets(rows) {
    if (rangeMode === 'today') {
      var counts = {}, now = new Date();
      rows.forEach(function (r) { var t = new Date(r.created_at); if (isNaN(t)) return;
        var k = t.getFullYear() + '-' + t.getMonth() + '-' + t.getDate() + '-' + t.getHours(); counts[k] = (counts[k] || 0) + 1; });
      var labels = [], data = [];
      for (var i = 23; i >= 0; i--) {
        var d = new Date(now.getTime() - i * 3600000);
        var k = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate() + '-' + d.getHours();
        labels.push(('0' + d.getHours()).slice(-2) + ':00'); data.push(counts[k] || 0);
      }
      return { labels: labels, data: data };
    }
    // daily
    var c2 = {};
    rows.forEach(function (r) { var dd = (r.created_at || '').slice(0, 10); if (dd) c2[dd] = (c2[dd] || 0) + 1; });
    var span = rangeMode === '7' ? 7 : rangeMode === '90' ? 90 : 30;
    if (rangeMode === 'all') {
      var keys = Object.keys(c2).sort();
      if (keys.length) { var first = new Date(keys[0] + 'T00:00:00');
        span = Math.min(180, Math.max(1, Math.round((Date.now() - first.getTime()) / 86400000) + 1)); }
    }
    var L = [], D = [], today = new Date();
    for (var j = span - 1; j >= 0; j--) {
      var dt = new Date(today.getTime() - j * 86400000); var iso = dt.toISOString().slice(0, 10);
      L.push(iso.slice(5)); D.push(c2[iso] || 0);
    }
    return { labels: L, data: D };
  }

  function renderCharts(rows) {
    destroyCharts();
    if (!window.Chart) return;

    var ab = activityBuckets(rows);
    var lc = document.getElementById('ah-st-line');
    if (lc) charts.line = new Chart(lc.getContext('2d'), {
      type: 'line',
      data: { labels: ab.labels, datasets: [{ data: ab.data, label: 'events',
        borderColor: C.pink, backgroundColor: 'rgba(233,30,140,0.15)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, resizeDelay: 120,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 10 }, maxRotation: 60, minRotation: 0 },
               title: { display: true, text: rangeMode === 'today' ? 'Hour (last 24h)' : 'Day', color: C.tick, font: { size: 10 } } },
          y: { beginAtZero: true, grid: { color: C.grid }, ticks: { color: C.tick, precision: 0 },
               title: { display: true, text: 'Events (loads + opens)', color: C.tick, font: { size: 11 } } }
        }
      }
    });

    // top pages
    var tabs = toSortedPairs(countBy(rows, 'tab_view', function (r) { return r.label; }), 8);
    barChart('ah-st-tabs', tabs, C.purple, 'pages');

    // event mix doughnut
    var mix = { page_view:0, tab_view:0, subject_open:0, resource_open:0 };
    rows.forEach(function (r) { if (mix[r.event_type] != null) mix[r.event_type]++; });
    var mc = document.getElementById('ah-st-mix');
    if (mc) charts.mix = new Chart(mc.getContext('2d'), {
      type: 'doughnut',
      data: { labels: ['Page loads','Tab views','Subject opens','Week opens'],
        datasets: [{ data: [mix.page_view, mix.tab_view, mix.subject_open, mix.resource_open],
          backgroundColor: [C.purple, C.cyan, C.blue, C.green], borderColor: '#1d0f33', borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, resizeDelay: 120,
        plugins: { legend: { position: 'bottom', labels: { color: C.tick, font: { size: 11 }, padding: 10 } } } }
    });
  }

  function barChart(canvasId, pairs, color, emptyWord) {
    var c = document.getElementById(canvasId); if (!c) return;
    if (!pairs.length) {
      var x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = C.tick; x.font = '12px Segoe UI'; x.textAlign = 'center';
      x.fillText('No ' + emptyWord + ' yet', c.width / 2, 40); return;
    }
    charts[canvasId] = new Chart(c.getContext('2d'), {
      type: 'bar',
      data: { labels: pairs.map(function (p) { return p[0]; }),
        datasets: [{ data: pairs.map(function (p) { return p[1]; }), backgroundColor: color, borderRadius: 5 }] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, resizeDelay: 120,
        plugins: { legend: { display: false } },
        scales: { x: { beginAtZero: true, grid: { color: C.grid }, ticks: { color: C.tick, precision: 0 } },
                  y: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 11 } } } }
      }
    });
  }
})();
