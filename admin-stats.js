/* VERSION: 2026-06-30 — stats dashboard (7.3) + fixed chart heights (no more runaway-tall charts). If this dated line is present, you have the current file. */
/* Academic Hub - admin-stats.js  (feature 7.3)
   ---------------------------------------------------------------------------
   Adds a "📊 Stats" item to the admin sidebar and a full-width dashboard that
   charts the anonymous usage events logged by student-data.js into the
   `click_events` table. Reads are scoped to the semester you are EDITING
   (window.__ahSemester), with an "all semesters" toggle and a time-range
   picker (7 / 30 / 90 days / all).

   Self-contained: it injects its own nav button by wrapping __ahAdminBoot, so
   admin.js / admin-auth.js / admin.html logic stay untouched (admin.html only
   needs the <script> tag). Chart.js is loaded from a CDN the first time the
   panel is opened, so it never slows down a normal admin session.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
  var SB = window.__ahSupabase;

  // ---- palette (matches admin.css) ----
  var C = {
    pink:'#e91e8c', purple:'#a855f7', blue:'#4a90e2', green:'#00c853',
    orange:'#ff9500', cyan:'#00E5FF', grid:'rgba(255,255,255,0.06)', tick:'#9a8cc0'
  };

  // ---- state ----
  var rangeDays = 30;       // 7 | 30 | 90 | 0(all)
  var allSemesters = false;
  var charts = {};          // live Chart.js instances, destroyed before each redraw

  function el(tag, css, html) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    return e;
  }

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
    try { injectNav(); } catch (e) { /* non-fatal */ }
  };

  // ───────────────────────────── open the panel ──────────────────────────────
  window.toggleStats = function () {
    if (typeof setView === 'function') setView('stats');   // hides middle + subjects panels
    document.querySelectorAll('.nav-btn').forEach(function (b) { b.classList.remove('active'); });
    var nb = document.getElementById('nav-stats'); if (nb) nb.classList.add('active');
    if (typeof closeSidebar === 'function') closeSidebar();
    drawShell();
    loadAndRender();
  };

  // ─────────────────────────────── shell / UI ───────────────────────────────
  function rangeBtn(days, txt) {
    var on = rangeDays === days;
    return '<button data-range="' + days + '" class="ah-st-range" style="' +
      'background:' + (on ? 'linear-gradient(135deg,#a855f7,#e91e8c)' : '#241338') + ';' +
      'color:#fff;border:1px solid ' + (on ? '#e91e8c' : '#3a2a52') + ';' +
      'padding:6px 12px;border-radius:8px;font-size:0.78rem;font-weight:700;cursor:pointer;">' + txt + '</button>';
  }

  function drawShell() {
    var area = document.getElementById('editor-area');
    if (!area) return;
    destroyCharts();
    var semName = window.__ahSemester || 'current semester';
    area.innerHTML =
      '<div style="max-width:980px;margin:0 auto;width:100%;">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:6px;">' +
          '<h3 style="border:none;margin:0;padding:0;color:#e91e8c;font-size:1.3rem;">📊 Usage Stats</h3>' +
          '<button id="ah-st-refresh" class="btn" style="background:#3a7bd5;font-size:0.78rem;">↻ Refresh</button>' +
        '</div>' +
        '<div style="color:#9a8cc0;font-size:0.8rem;margin-bottom:14px;">' +
          'Anonymous, by random session — no logins, no personal data. ' +
          'Showing <b id="ah-st-scope" style="color:#cbb3ff;">' + (allSemesters ? 'all semesters' : ('“' + semName + '”')) + '</b>.' +
        '</div>' +

        '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:18px;">' +
          rangeBtn(7,'7 days') + rangeBtn(30,'30 days') + rangeBtn(90,'90 days') + rangeBtn(0,'All time') +
          '<label style="display:flex;align-items:center;gap:6px;margin-left:auto;background:rgba(0,0,0,0.25);' +
            'padding:6px 10px;border-radius:8px;font-size:0.78rem;color:#ddd;cursor:pointer;font-weight:600;">' +
            '<input type="checkbox" id="ah-st-allsem" ' + (allSemesters ? 'checked' : '') + ' style="width:15px;height:15px;"> All semesters' +
          '</label>' +
        '</div>' +

        '<div id="ah-st-kpis" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;"></div>' +

        '<div id="ah-st-body" style="display:grid;grid-template-columns:1fr;gap:18px;">' +
          card('Activity over time', chartBox('ah-st-line', 240)) +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;">' +
            card('Most-opened subjects', chartBox('ah-st-subjects', 260)) +
            card('Most-viewed pages', chartBox('ah-st-tabs', 260)) +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;">' +
            card('Most-opened materials', chartBox('ah-st-res', 260)) +
            card('Event mix', chartBox('ah-st-mix', 260)) +
          '</div>' +
        '</div>' +

        '<div id="ah-st-status" style="text-align:center;color:#9a8cc0;margin:24px 0;font-size:0.9rem;"></div>' +
      '</div>';

    // wire controls
    area.querySelectorAll('.ah-st-range').forEach(function (b) {
      b.addEventListener('click', function () {
        rangeDays = parseInt(b.getAttribute('data-range'), 10) || 0;
        drawShell(); loadAndRender();
      });
    });
    var allCb = document.getElementById('ah-st-allsem');
    if (allCb) allCb.addEventListener('change', function () {
      allSemesters = !!allCb.checked; drawShell(); loadAndRender();
    });
    var rf = document.getElementById('ah-st-refresh');
    if (rf) rf.addEventListener('click', loadAndRender);
  }

  function card(title, inner) {
    return '<div style="background:#1d0f33;border:1px solid #2f1d4a;border-radius:12px;padding:16px;">' +
      '<div style="font-size:0.82rem;font-weight:700;color:#cbb3ff;letter-spacing:0.4px;margin-bottom:12px;text-transform:uppercase;">' +
      title + '</div>' + inner + '</div>';
  }

  // A canvas MUST live in a relatively-positioned, fixed-HEIGHT box, otherwise
  // Chart.js (maintainAspectRatio:false) grows it forever in a resize loop.
  function chartBox(id, h) {
    return '<div style="position:relative;height:' + h + 'px;width:100%;">' +
      '<canvas id="' + id + '"></canvas></div>';
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

  // ───────────────────────── Chart.js lazy loader ───────────────────────────
  function ensureChart(cb) {
    if (window.Chart) return cb();
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload = function () { cb(); };
    s.onerror = function () { status('Could not load the charting library (offline?). KPI numbers above are still accurate.', true); };
    document.head.appendChild(s);
  }

  function destroyCharts() {
    Object.keys(charts).forEach(function (k) {
      try { charts[k].destroy(); } catch (e) {}
      delete charts[k];
    });
  }

  // ───────────────────────────── data + render ──────────────────────────────
  function loadAndRender() {
    if (!SB) { status('Not connected to the database.', true); return; }
    status('Loading…');
    var q = SB.from('click_events')
      .select('created_at, event_type, label, detail, session_id, semester')
      .order('created_at', { ascending: true })
      .limit(20000);

    if (rangeDays > 0) {
      var since = new Date(Date.now() - rangeDays * 86400000).toISOString();
      q = q.gte('created_at', since);
    }
    if (!allSemesters && window.__ahSemester) {
      q = q.eq('semester', window.__ahSemester);
    }

    q.then(function (res) {
      if (res.error) {
        status('Could not load stats: ' + res.error.message +
               '  (Did you run the academic_hub_stats.sql migration?)', true);
        return;
      }
      var rows = res.data || [];
      renderKpis(rows);
      if (!rows.length) {
        status('No events recorded yet for this selection. Once students browse the live site, data shows up here.');
        return;
      }
      status('');
      ensureChart(function () { renderCharts(rows); });
    }, function (e) {
      status('Could not load stats: ' + (e && e.message ? e.message : e), true);
    });
  }

  function renderKpis(rows) {
    var sessions = {}, subjOpens = 0, resOpens = 0, pageViews = 0;
    rows.forEach(function (r) {
      if (r.session_id) sessions[r.session_id] = 1;
      if (r.event_type === 'subject_open')  subjOpens++;
      else if (r.event_type === 'resource_open') resOpens++;
      else if (r.event_type === 'page_view') pageViews++;
    });
    var box = document.getElementById('ah-st-kpis');
    if (!box) return;
    box.innerHTML =
      kpi(Object.keys(sessions).length, 'Unique visitors', C.pink) +
      kpi(pageViews,  'Page loads',     C.purple) +
      kpi(subjOpens,  'Subject opens',  C.blue) +
      kpi(resOpens,   'Material opens', C.green);
  }

  // count helper → sorted [ [label,count], … ] top N
  function topCounts(rows, type, n) {
    var m = {};
    rows.forEach(function (r) {
      if (r.event_type !== type) return;
      var k = r.label || '(unknown)';
      m[k] = (m[k] || 0) + 1;
    });
    var arr = Object.keys(m).map(function (k) { return [k, m[k]]; });
    arr.sort(function (a, b) { return b[1] - a[1]; });
    return arr.slice(0, n || 8);
  }

  // bucket events per day across the visible range → {labels:[], data:[]}
  function perDay(rows) {
    var counts = {};
    rows.forEach(function (r) {
      var d = (r.created_at || '').slice(0, 10);
      if (d) counts[d] = (counts[d] || 0) + 1;
    });
    var days = [];
    var span = rangeDays > 0 ? rangeDays : 30;
    if (rangeDays === 0) {
      // all-time: span from the earliest event to today
      var keys = Object.keys(counts).sort();
      if (keys.length) {
        var first = new Date(keys[0] + 'T00:00:00');
        span = Math.max(1, Math.round((Date.now() - first.getTime()) / 86400000) + 1);
        span = Math.min(span, 180); // cap the x-axis so it stays readable
      }
    }
    var today = new Date();
    for (var i = span - 1; i >= 0; i--) {
      var dt = new Date(today.getTime() - i * 86400000);
      var iso = dt.toISOString().slice(0, 10);
      days.push(iso);
    }
    return {
      labels: days.map(function (d) { return d.slice(5); }),   // MM-DD
      data:   days.map(function (d) { return counts[d] || 0; })
    };
  }

  function baseOpts(extra) {
    var o = {
      responsive: true, maintainAspectRatio: false, resizeDelay: 120,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: C.grid }, ticks: { color: C.tick, font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: C.grid }, ticks: { color: C.tick, precision: 0 } }
      }
    };
    return Object.assign(o, extra || {});
  }

  function renderCharts(rows) {
    destroyCharts();
    if (!window.Chart) return;

    // 1) activity line
    var pd = perDay(rows);
    var lc = document.getElementById('ah-st-line');
    if (lc) charts.line = new Chart(lc.getContext('2d'), {
      type: 'line',
      data: { labels: pd.labels, datasets: [{
        data: pd.data, label: 'events',
        borderColor: C.pink, backgroundColor: 'rgba(233,30,140,0.15)',
        fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2
      }] },
      options: baseOpts()
    });

    // 2) subjects bar
    barChart('ah-st-subjects', topCounts(rows, 'subject_open', 8), C.blue, 'subjects');

    // 3) tabs/pages bar
    barChart('ah-st-tabs', topCounts(rows, 'tab_view', 8), C.purple, 'tabs');

    // 4) materials bar (label = subject; detail = week — combine for readability)
    var resMap = {};
    rows.forEach(function (r) {
      if (r.event_type !== 'resource_open') return;
      var k = ((r.label || '?') + (r.detail ? ' · ' + r.detail : ''));
      resMap[k] = (resMap[k] || 0) + 1;
    });
    var resArr = Object.keys(resMap).map(function (k) { return [k, resMap[k]]; })
      .sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
    barChart('ah-st-res', resArr, C.green, 'materials');

    // 5) event-mix doughnut
    var mix = { page_view: 0, tab_view: 0, subject_open: 0, resource_open: 0 };
    rows.forEach(function (r) { if (mix[r.event_type] != null) mix[r.event_type]++; });
    var mc = document.getElementById('ah-st-mix');
    if (mc) charts.mix = new Chart(mc.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: ['Page loads', 'Tab views', 'Subject opens', 'Material opens'],
        datasets: [{
          data: [mix.page_view, mix.tab_view, mix.subject_open, mix.resource_open],
          backgroundColor: [C.purple, C.cyan, C.blue, C.green],
          borderColor: '#1d0f33', borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, resizeDelay: 120,
        plugins: { legend: { position: 'bottom', labels: { color: C.tick, font: { size: 11 }, padding: 10 } } }
      }
    });
  }

  function barChart(canvasId, pairs, color, emptyWord) {
    var c = document.getElementById(canvasId);
    if (!c) return;
    if (!pairs.length) {
      var ctx0 = c.getContext('2d');
      ctx0.clearRect(0, 0, c.width, c.height);
      ctx0.fillStyle = C.tick; ctx0.font = '12px Segoe UI'; ctx0.textAlign = 'center';
      ctx0.fillText('No ' + emptyWord + ' opened yet', c.width / 2, 40);
      return;
    }
    charts[canvasId] = new Chart(c.getContext('2d'), {
      type: 'bar',
      data: {
        labels: pairs.map(function (p) { return p[0]; }),
        datasets: [{ data: pairs.map(function (p) { return p[1]; }), backgroundColor: color, borderRadius: 5 }]
      },
      options: baseOpts({ indexAxis: 'y' })
    });
  }
})();
