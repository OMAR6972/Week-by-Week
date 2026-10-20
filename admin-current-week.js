/* VERSION: 2026-10-20 — adds "Current week colour" to the admin Config page.
   Saved as CONFIG.currentWeekColor (so it is stored per semester, like the Semester Start Date).
   Empty = the site's default red. A week's own Custom Card Accent Color still overrides it.
   Self-contained: wraps renderConfigEditor() from admin.js, so no other admin file changes. */
(function () {
  var DEFAULT = '#ff3b30';

  function valid(c) { return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c); }

  function paint(root, hex) {
    var sw = root.querySelector('#ah-cw-sample');
    if (!sw) return;
    var r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    sw.style.borderColor = hex;
    sw.style.background = 'linear-gradient(135deg,rgba(' + r + ',' + g + ',' + b + ',0.10),#1a0d2e)';
    sw.style.boxShadow = '0 0 20px rgba(' + r + ',' + g + ',' + b + ',0.18)';
    var t = sw.querySelector('.ah-cw-title'); if (t) t.style.color = hex;
    var bd = sw.querySelector('.ah-cw-badge');
    if (bd) { bd.style.color = hex; bd.style.background = 'rgba(' + r + ',' + g + ',' + b + ',0.15)'; bd.style.border = '1px solid rgba(' + r + ',' + g + ',' + b + ',0.35)'; }
  }

  function inject() {
    var area = document.getElementById('editor-area');
    if (!area || document.getElementById('ah-cw-section')) return;
    if (!window.CONFIG) return;

    var cur = valid(window.CONFIG.currentWeekColor) ? window.CONFIG.currentWeekColor : DEFAULT;

    var sec = document.createElement('div');
    sec.id = 'ah-cw-section';
    sec.className = 'form-section';
    sec.style.borderColor = '#ff3b30';
    sec.innerHTML =
      '<h3 style="color:#ff6b61;">📍 Current Week Colour</h3>' +
      '<p style="color:#888; font-size:0.8rem; margin-bottom:12px;">The colour students see on the Semester Map for the week we are in right now ' +
        '(card outline, week title and the “CURRENT WEEK” badge). It moves to the next week by itself. ' +
        'A week’s own Custom Card Accent Color, and Midterm / Finals colours, still win over it.</p>' +
      '<div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">' +
        '<input type="color" id="ah-cw-input" value="' + cur + '" style="width:54px;height:36px;border-radius:6px;border:1px solid #555;cursor:pointer;">' +
        '<button id="ah-cw-reset" type="button" style="padding:6px 14px;background:rgba(255,255,255,0.05);border:1px solid #555;color:#aaa;border-radius:6px;cursor:pointer;font-size:0.8rem;">↺ Back to red</button>' +
        '<div id="ah-cw-sample" style="flex:1; min-width:200px; max-width:300px; border:1px solid ' + cur + '; border-radius:14px; padding:12px 14px;">' +
          '<div class="ah-cw-title" style="font-family:Orbitron,sans-serif; font-size:1.05rem; font-weight:700;">WEEK 5</div>' +
          '<div class="ah-cw-badge" style="font-size:0.62rem; font-weight:800; letter-spacing:1.5px; padding:3px 10px; border-radius:8px; margin-top:6px; display:inline-block;">CURRENT WEEK</div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:0.72rem; color:#777; margin-top:10px;">Click <b>Save to site</b> afterwards to apply it.</div>';

    // sit right under the Semester Start Date box
    var first = area.querySelector('.form-section');
    if (first && first.nextSibling) area.insertBefore(sec, first.nextSibling);
    else area.insertBefore(sec, area.firstChild);

    var input = sec.querySelector('#ah-cw-input');
    paint(sec, cur);

    input.addEventListener('input', function () {
      window.CONFIG.currentWeekColor = input.value;
      paint(sec, input.value);
      if (typeof window.markDirty === 'function') window.markDirty();
    });
    sec.querySelector('#ah-cw-reset').addEventListener('click', function () {
      delete window.CONFIG.currentWeekColor;
      input.value = DEFAULT;
      paint(sec, DEFAULT);
      if (typeof window.markDirty === 'function') window.markDirty();
    });
  }

  var orig = window.renderConfigEditor;
  if (typeof orig === 'function') {
    window.renderConfigEditor = function () {
      var out = orig.apply(this, arguments);
      try { inject(); } catch (e) {}
      return out;
    };
  }
})();
