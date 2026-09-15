/* VERSION: 2026-09-15 — v7: "My subjects". The student says once which subjects they're
   registered in and the whole site narrows to those. Unregistered subjects are tucked
   away behind a toggle, never deleted. Works for guests (saved on the device) and for
   signed-in students (saved to their account too). */

(function () {
  var SB = window.__ahSupabase;

  /* ---------------------------------------------------------------- helpers */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function subjects() {
    return (window.COURSE_DATA || []).map(function (s) {
      return { code: s.code, name: s.name || s.code, credits: s.credits || '' };
    });
  }
  function colorFor(code) {
    try { return getSubjectColor(code); } catch (e) { return '#b519d6'; }
  }

  /* ----------------------------------------------- save prefs to an account */
  window.__ahSaveStudentPref = function (key, value) {
    var st = window.__ahStudent;
    if (!st || !SB) return;
    try {
      SB.from('student_prefs')
        .upsert({ user_id: st.id, key: key, value: value, updated_at: new Date().toISOString() },
                { onConflict: 'user_id,key' })
        .then(function () {}, function () {});
    } catch (e) {}
  };

  /* pull saved subjects down when someone signs in on a new device */
  async function pullFromAccount() {
    var st = window.__ahStudent;
    if (!st || !SB) return;
    try {
      var r = await SB.from('student_prefs').select('key, value')
        .eq('user_id', st.id).in('key', ['my_subjects', 'my_subjects_showall']);
      if (r.error || !r.data || !r.data.length) return;

      var codes = null, showAll = null;
      r.data.forEach(function (row) {
        if (row.key === 'my_subjects' && Array.isArray(row.value)) codes = row.value;
        if (row.key === 'my_subjects_showall') showAll = !!row.value;
      });

      if (codes && codes.length && window.__ahSetMySubjects) {
        window.__ahSetMySubjects(codes, showAll === null ? undefined : showAll);
      }
    } catch (e) {}
  }
  document.addEventListener('ah-student-changed', function (e) { if (e.detail) pullFromAccount(); });

  /* ----------------------------------------------------------- picker modal */
  function openPicker(opts) {
    opts = opts || {};
    if (document.getElementById('ah-mysub-modal')) return;

    var all = subjects();
    if (!all.length) { alert('No subjects have been added to this semester yet.'); return; }

    var current = (window.__ahGetMySubjects && window.__ahGetMySubjects()) || { codes: null, showOthers: false, configured: false };
    var chosen = new Set(current.codes || all.map(function (s) { return s.code; }));

    var back = document.createElement('div');
    back.id = 'ah-mysub-modal';
    back.className = 'ah-auth-back';

    var rows = all.map(function (s) {
      var on = chosen.has(s.code);
      return '<label class="ah-mysub-row' + (on ? ' on' : '') + '" data-code="' + esc(s.code) + '">' +
               '<input type="checkbox" class="ah-mysub-cb" value="' + esc(s.code) + '"' + (on ? ' checked' : '') + '>' +
               '<span class="ah-mysub-dot" style="background:' + colorFor(s.code) + ';"></span>' +
               '<span class="ah-mysub-text">' +
                 '<span class="ah-mysub-code">' + esc(s.code) + '</span>' +
                 '<span class="ah-mysub-name">' + esc(s.name) + '</span>' +
               '</span>' +
             '</label>';
    }).join('');

    back.innerHTML =
      '<div class="ah-auth-card ah-mysub-card">' +
        (opts.firstRun ? '' : '<button class="ah-auth-x" id="ah-mysub-x" aria-label="Close">&times;</button>') +
        '<div class="ah-auth-title">' + (opts.firstRun ? 'Which subjects are you taking?' : 'My subjects') + '</div>' +
        '<div class="ah-auth-sub">' +
          'Tick the ones you\'re registered in. The site then only shows you those \u2014 ' +
          'your deadlines, the semester map, and GPA suggestions all stop mentioning other people\'s subjects.' +
        '</div>' +

        '<div class="ah-mysub-tools">' +
          '<button class="ah-mysub-mini" id="ah-mysub-all">Select all</button>' +
          '<button class="ah-mysub-mini" id="ah-mysub-none">Clear</button>' +
          '<span class="ah-mysub-count" id="ah-mysub-count"></span>' +
        '</div>' +

        '<div class="ah-mysub-list" id="ah-mysub-list">' + rows + '</div>' +

        '<label class="ah-mysub-showall">' +
          '<input type="checkbox" id="ah-mysub-showothers"' + (current.showOthers ? ' checked' : '') + '>' +
          '<span>Still show me the other subjects anyway</span>' +
        '</label>' +

        '<button class="ah-auth-go" id="ah-mysub-save">Save</button>' +
        (opts.firstRun ? '<button class="ah-auth-link ah-mysub-skip" id="ah-mysub-skip">Skip for now</button>' : '') +
        '<div class="ah-auth-msg" id="ah-mysub-msg"></div>' +
        '<div class="ah-auth-guest">' +
          'You can change this any time from the account menu. Nothing is deleted \u2014 ' +
          'unticked subjects are just tucked out of the way.' +
        '</div>' +
      '</div>';

    document.body.appendChild(back);

    var listEl  = back.querySelector('#ah-mysub-list');
    var countEl = back.querySelector('#ah-mysub-count');

    function refreshCount() {
      var n = listEl.querySelectorAll('.ah-mysub-cb:checked').length;
      countEl.textContent = n + ' of ' + all.length + ' selected';
    }
    refreshCount();

    listEl.addEventListener('change', function (e) {
      if (!e.target.classList.contains('ah-mysub-cb')) return;
      var row = e.target.closest('.ah-mysub-row');
      if (row) row.classList.toggle('on', e.target.checked);
      refreshCount();
    });

    back.querySelector('#ah-mysub-all').addEventListener('click', function () {
      listEl.querySelectorAll('.ah-mysub-cb').forEach(function (cb) {
        cb.checked = true; cb.closest('.ah-mysub-row').classList.add('on');
      });
      refreshCount();
    });
    back.querySelector('#ah-mysub-none').addEventListener('click', function () {
      listEl.querySelectorAll('.ah-mysub-cb').forEach(function (cb) {
        cb.checked = false; cb.closest('.ah-mysub-row').classList.remove('on');
      });
      refreshCount();
    });

    function close() { back.remove(); }
    if (!opts.firstRun) {
      back.querySelector('#ah-mysub-x').addEventListener('click', close);
      back.addEventListener('click', function (e) { if (e.target === back) close(); });
    }

    var skipBtn = back.querySelector('#ah-mysub-skip');
    if (skipBtn) skipBtn.addEventListener('click', function () {
      try { localStorage.setItem('ah_my_subjects_prompted', '1'); } catch (e) {}
      close();
    });

    back.querySelector('#ah-mysub-save').addEventListener('click', function () {
      var picked = [].slice.call(listEl.querySelectorAll('.ah-mysub-cb:checked')).map(function (cb) { return cb.value; });
      if (!picked.length) {
        var m = back.querySelector('#ah-mysub-msg');
        m.textContent = 'Pick at least one subject, or close this to keep seeing everything.';
        m.className = 'ah-auth-msg bad';
        return;
      }
      var showOthers = back.querySelector('#ah-mysub-showothers').checked;
      try { localStorage.setItem('ah_my_subjects_prompted', '1'); } catch (e) {}
      if (window.__ahSetMySubjects) window.__ahSetMySubjects(picked, showOthers);
      close();
      if (window.__ahToast) window.__ahToast('Saved \u2014 showing your ' + picked.length + ' subject' + (picked.length === 1 ? '' : 's') + '.');
    });
  }
  window.__ahOpenMySubjects = openPicker;

  /* ------------------------------------------------- first-run invitation */
  function maybePrompt() {
    var prompted;
    try { prompted = localStorage.getItem('ah_my_subjects_prompted') === '1'; } catch (e) { prompted = false; }
    if (prompted) return;

    var cfg = window.__ahGetMySubjects && window.__ahGetMySubjects();
    if (cfg && cfg.configured) return;
    if (!subjects().length) return;

    var bar = document.createElement('div');
    bar.className = 'ah-mysub-invite';
    bar.innerHTML =
      '<div class="ah-mysub-invite-in">' +
        '<i class="fa-solid fa-list-check"></i>' +
        '<span>Seeing subjects you don\'t take? Tell the site which ones are yours.</span>' +
        '<button class="ah-mysub-invite-go" id="ah-mysub-invite-go">Choose mine</button>' +
        '<button class="ah-mysub-invite-x" id="ah-mysub-invite-x" aria-label="Dismiss">&times;</button>' +
      '</div>';
    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add('in'); });

    bar.querySelector('#ah-mysub-invite-go').addEventListener('click', function () {
      bar.remove();
      openPicker({ firstRun: false });
    });
    bar.querySelector('#ah-mysub-invite-x').addEventListener('click', function () {
      try { localStorage.setItem('ah_my_subjects_prompted', '1'); } catch (e) {}
      bar.classList.remove('in');
      setTimeout(function () { bar.remove(); }, 300);
    });
  }

  /* ------------------------------------------------------------------ boot */
  function boot() {
    setTimeout(maybePrompt, 2200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
