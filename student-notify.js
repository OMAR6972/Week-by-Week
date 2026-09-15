/* VERSION: 2026-09-15e — v9: notification settings (choosing half; sending comes next). */

(function () {
  var SB = window.__ahSupabase;

  /* ------------------------------------------------------------ categories */
  /* Deadline categories are fixed and keyword-matched, deliberately: a student sets
     these ONCE and must never have to come back because a new kind of task appeared.
     Categories that have nothing in them yet still show, so the choice is already
     made by the time the content exists. */
  var DEADLINE_CATS = [
    { key: 'assignment',   label: 'Assignments & sheets', words: ['assignment', 'sheet', 'homework', 'hw'] },
    { key: 'quiz',         label: 'Quizzes',              words: ['quiz'] },
    { key: 'project',      label: 'Projects',             words: ['project', 'submission', 'deliverable'] },
    { key: 'lab',          label: 'Labs',                 words: ['lab', 'practical'] },
    { key: 'exam',         label: 'Exams',                words: ['exam', 'midterm', 'final'] },
    { key: 'presentation', label: 'Presentations & discussions', words: ['presentation', 'discussion', 'seminar', 'oral', 'conference'] },
    { key: 'other',        label: 'Anything else',        words: [] }
  ];

  var REMINDER_OPTIONS = [
    { key: '1mo', label: '1 month before', ms: 30 * 24 * 3600e3 },
    { key: '2w',  label: '2 weeks before', ms: 14 * 24 * 3600e3 },
    { key: '1w',  label: '1 week before',  ms: 7 * 24 * 3600e3 },
    { key: '3d',  label: '3 days before',  ms: 3 * 24 * 3600e3 },
    { key: '2d',  label: '2 days before',  ms: 2 * 24 * 3600e3 },
    { key: '1d',  label: '1 day before',   ms: 24 * 3600e3 },
    { key: '6h',  label: '6 hours before', ms: 6 * 3600e3 },
    { key: '3h',  label: '3 hours before', ms: 3 * 3600e3 },
    { key: '1h',  label: '1 hour before',  ms: 3600e3 }
  ];

  var DEFAULTS = {
    channels:      { email: true, push: false },
    announcements: true,
    exams:         true,
    deadlines:     true,
    /* 'week' = tell me when a whole week goes up, 'all' = every single resource,
       'off' = never. Whole-week is the default because per-resource is noisy. */
    resources:     'week',
    reminders:     ['1w', '1d', '1h'],
    deadlineCats:  null,   // null = all categories on
    subjects:      null    // null = follow "My subjects"
  };

  /* ------------------------------------------------------------- storage */
  function semKey() { return window.__ahSemesterKey || 'default'; }
  function lsKey()  { return 'ah_notify::' + semKey(); }

  function load() {
    var out = JSON.parse(JSON.stringify(DEFAULTS));
    try {
      var raw = localStorage.getItem(lsKey());
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(saved).forEach(function (k) { out[k] = saved[k]; });
      }
    } catch (e) {}
    return out;
  }

  function save(prefs) {
    try { localStorage.setItem(lsKey(), JSON.stringify(prefs)); } catch (e) {}
    if (window.__ahSaveStudentPref) window.__ahSaveStudentPref('notify::' + semKey(), prefs);
  }

  window.__ahGetNotifyPrefs = load;
  window.__ahNotifyDeadlineCats = DEADLINE_CATS;
  window.__ahNotifyReminderOptions = REMINDER_OPTIONS;

  /* which category does a task fall into */
  window.__ahDeadlineCategory = function (task) {
    var hay = ((task && task.type) || '') + ' ' + ((task && task.name) || '');
    hay = hay.toLowerCase();
    for (var i = 0; i < DEADLINE_CATS.length; i++) {
      var c = DEADLINE_CATS[i];
      if (c.words.length && c.words.some(function (w) { return hay.indexOf(w) > -1; })) return c.key;
    }
    return 'other';
  };

  /* pull down on sign-in; push up if the account has nothing yet */
  async function syncWithAccount() {
    var st = window.__ahStudent;
    if (!st || !SB) return;
    var k = 'notify::' + semKey();
    try {
      var r = await SB.from('student_prefs').select('value').eq('user_id', st.id).eq('key', k).maybeSingle();
      if (!r.error && r.data && r.data.value && typeof r.data.value === 'object') {
        try { localStorage.setItem(lsKey(), JSON.stringify(r.data.value)); } catch (e) {}
      } else {
        var local = load();
        if (window.__ahSaveStudentPref) window.__ahSaveStudentPref(k, local);
      }
    } catch (e) {}
  }
  document.addEventListener('ah-student-changed', function (e) { if (e.detail) syncWithAccount(); });

  /* ------------------------------------------------------------- helpers */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function resourceTypes() {
    var list = (window.CONFIG && window.CONFIG.resources) || [];
    return list.map(function (r) { return r.name; }).filter(Boolean);
  }
  function mySubjectCodes() {
    var cfg = window.__ahGetMySubjects && window.__ahGetMySubjects();
    if (cfg && cfg.configured && cfg.codes && cfg.codes.length) return cfg.codes;
    return (window.COURSE_DATA || []).map(function (s) { return s.code; });
  }
  function subjectName(code) {
    var s = (window.COURSE_DATA || []).find(function (x) { return x.code === code; });
    return s ? (s.name || code) : code;
  }

  /* --------------------------------------------------------------- panel */
  function open() {
    if (document.getElementById('ah-notify-modal')) return;
    var p = load();
    var signedIn = !!window.__ahStudent;

    var back = document.createElement('div');
    back.id = 'ah-notify-modal';
    back.className = 'ah-auth-back';

    var subs = mySubjectCodes();

    back.innerHTML =
      '<div class="ah-auth-card ah-notify-card">' +
        '<button class="ah-auth-x" id="ah-nt-x" aria-label="Close">&times;</button>' +
        '<div class="ah-auth-title">Notifications</div>' +
        '<div class="ah-auth-sub">Set this once. It keeps working as new material and new deadlines appear.</div>' +

        (signedIn ? '' :
          '<div class="ah-nt-guest-warn">' +
            '<i class="fa-solid fa-circle-info"></i> ' +
            'You can set this up now, but emails need an account. Without one it\'s saved on this device only.' +
          '</div>') +

        '<div class="ah-nt-tabs">' +
          '<button class="ah-nt-tab active" data-tab="what">What</button>' +
          '<button class="ah-nt-tab" data-tab="when">When</button>' +
          '<button class="ah-nt-tab" data-tab="how">How</button>' +
        '</div>' +

        /* ---- WHAT ---- */
        '<div class="ah-nt-pane active" data-pane="what">' +
          '<label class="ah-nt-row">' +
            '<input type="checkbox" id="nt-announcements"' + (p.announcements ? ' checked' : '') + '>' +
            '<span><b>Announcements</b><small>When something is posted to the whole cohort</small></span>' +
          '</label>' +
          '<label class="ah-nt-row">' +
            '<input type="checkbox" id="nt-exams"' + (p.exams ? ' checked' : '') + '>' +
            '<span><b>Exam schedule</b><small>When midterms or finals are posted or changed</small></span>' +
          '</label>' +
          '<label class="ah-nt-row">' +
            '<input type="checkbox" id="nt-deadlines"' + (p.deadlines ? ' checked' : '') + '>' +
            '<span><b>Deadline reminders</b><small>Reminders before something is due. Stops once you tick it done.</small></span>' +
          '</label>' +

          '<div class="ah-nt-sub-block" id="nt-cats-block">' +
            '<div class="ah-nt-block-title">Which deadlines?</div>' +
            DEADLINE_CATS.map(function (c) {
              var on = !p.deadlineCats || p.deadlineCats.indexOf(c.key) > -1;
              return '<label class="ah-nt-chip' + (on ? ' on' : '') + '">' +
                       '<input type="checkbox" class="nt-cat" value="' + c.key + '"' + (on ? ' checked' : '') + '>' +
                       esc(c.label) +
                     '</label>';
            }).join('') +
            '<div class="ah-nt-hint">Categories you have nothing in yet are still listed, so you never need to come back when new work appears.</div>' +
          '</div>' +

          '<div class="ah-nt-block-title" style="margin-top:18px;">New material</div>' +
          '<div class="ah-nt-seg" id="nt-resources">' +
            ['week', 'all', 'off'].map(function (v) {
              var lbl = v === 'week' ? 'Whole weeks' : (v === 'all' ? 'Every resource' : 'Never');
              return '<button class="ah-nt-seg-btn' + (p.resources === v ? ' active' : '') + '" data-v="' + v + '">' + lbl + '</button>';
            }).join('') +
          '</div>' +
          '<div class="ah-nt-hint" id="nt-res-hint"></div>' +

          '<div class="ah-nt-sub-block" id="nt-restypes-block" style="display:none;">' +
            '<div class="ah-nt-block-title">Which resources?</div>' +
            resourceTypes().map(function (t) {
              var on = !p.resourceTypes || p.resourceTypes.indexOf(t) > -1;
              return '<label class="ah-nt-chip' + (on ? ' on' : '') + '">' +
                       '<input type="checkbox" class="nt-restype" value="' + esc(t) + '"' + (on ? ' checked' : '') + '>' +
                       esc(t) +
                     '</label>';
            }).join('') +
          '</div>' +

          '<div class="ah-nt-block-title" style="margin-top:18px;">Subjects</div>' +
          '<div class="ah-nt-hint" style="margin-top:0;">Following your chosen subjects. Untick any you don\'t want notifications for.</div>' +
          '<div class="ah-nt-subjects">' +
            subs.map(function (code) {
              var on = !p.subjects || p.subjects.indexOf(code) > -1;
              return '<label class="ah-nt-chip' + (on ? ' on' : '') + '">' +
                       '<input type="checkbox" class="nt-subject" value="' + esc(code) + '"' + (on ? ' checked' : '') + '>' +
                       esc(code) + ' <small>' + esc(subjectName(code)) + '</small>' +
                     '</label>';
            }).join('') +
          '</div>' +
        '</div>' +

        /* ---- WHEN ---- */
        '<div class="ah-nt-pane" data-pane="when">' +
          '<div class="ah-nt-block-title">Remind me before a deadline</div>' +
          '<div class="ah-nt-hint" style="margin-top:0;">Pick as many as you want, like setting several alarms. Reminders stop as soon as you tick the task done.</div>' +
          '<div class="ah-nt-reminders">' +
            REMINDER_OPTIONS.map(function (r) {
              var on = p.reminders.indexOf(r.key) > -1;
              return '<label class="ah-nt-chip' + (on ? ' on' : '') + '">' +
                       '<input type="checkbox" class="nt-rem" value="' + r.key + '"' + (on ? ' checked' : '') + '>' +
                       esc(r.label) +
                     '</label>';
            }).join('') +
          '</div>' +
          '<div class="ah-nt-hint" id="nt-rem-count"></div>' +
        '</div>' +

        /* ---- HOW ---- */
        '<div class="ah-nt-pane" data-pane="how">' +
          '<label class="ah-nt-row">' +
            '<input type="checkbox" id="nt-email"' + (p.channels.email ? ' checked' : '') + '>' +
            '<span><b>Email</b><small>' +
              (signedIn ? 'Sent to ' + esc(window.__ahStudent.email) : 'Needs an account') +
            '</small></span>' +
          '</label>' +
          '<label class="ah-nt-row">' +
            '<input type="checkbox" id="nt-push"' + (p.channels.push ? ' checked' : '') + '>' +
            '<span><b>Push notification</b><small>Pops up on your phone or laptop</small></span>' +
          '</label>' +
          '<div class="ah-nt-iphone" id="nt-iphone">' +
            '<div class="ah-nt-block-title"><i class="fa-brands fa-apple"></i> On iPhone or iPad?</div>' +
            '<div class="ah-nt-hint" style="margin-top:0;">Apple only allows push once the site is added to your home screen. It takes about 20 seconds:</div>' +
            '<ol class="ah-nt-steps">' +
              '<li>Open this site in <b>Safari</b> (not Chrome).</li>' +
              '<li>Tap the <b>Share</b> button at the bottom \u2014 the square with an arrow pointing up.</li>' +
              '<li>Scroll down and tap <b>Add to Home Screen</b>.</li>' +
              '<li>Tap <b>Add</b> in the top right.</li>' +
              '<li>Open the site from the new icon on your home screen, then turn push on again here.</li>' +
            '</ol>' +
            '<div class="ah-nt-hint">On Android or a laptop none of this applies \u2014 push just works.</div>' +
          '</div>' +
        '</div>' +

        '<button class="ah-auth-go" id="ah-nt-save">Save</button>' +
        '<div class="ah-auth-msg" id="ah-nt-msg"></div>' +
      '</div>';

    document.body.appendChild(back);

    /* tabs */
    back.querySelectorAll('.ah-nt-tab').forEach(function (t) {
      t.addEventListener('click', function () {
        back.querySelectorAll('.ah-nt-tab').forEach(function (x) { x.classList.remove('active'); });
        back.querySelectorAll('.ah-nt-pane').forEach(function (x) { x.classList.remove('active'); });
        t.classList.add('active');
        back.querySelector('[data-pane="' + t.dataset.tab + '"]').classList.add('active');
      });
    });

    /* chips light up as you tick them */
    back.addEventListener('change', function (e) {
      if (e.target.type === 'checkbox' && e.target.closest('.ah-nt-chip')) {
        e.target.closest('.ah-nt-chip').classList.toggle('on', e.target.checked);
      }
      if (e.target.id === 'nt-deadlines') syncDeadlineBlock();
      if (e.target.classList.contains('nt-rem')) updateRemCount();
    });

    /* resources segmented control */
    var resChoice = p.resources;
    function paintRes() {
      back.querySelectorAll('#nt-resources .ah-nt-seg-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.v === resChoice);
      });
      back.querySelector('#nt-restypes-block').style.display = (resChoice === 'all') ? 'block' : 'none';
      var hint = back.querySelector('#nt-res-hint');
      hint.textContent = resChoice === 'week'
        ? 'One message when a week\u2019s material goes up \u2014 the quiet option.'
        : (resChoice === 'all'
            ? 'A message for every single resource added. Can get busy.'
            : 'Nothing about new material.');
    }
    back.querySelectorAll('#nt-resources .ah-nt-seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { resChoice = b.dataset.v; paintRes(); });
    });
    paintRes();

    function syncDeadlineBlock() {
      var on = back.querySelector('#nt-deadlines').checked;
      back.querySelector('#nt-cats-block').style.opacity = on ? '1' : '0.4';
      back.querySelector('#nt-cats-block').style.pointerEvents = on ? 'auto' : 'none';
    }
    syncDeadlineBlock();

    function updateRemCount() {
      var n = back.querySelectorAll('.nt-rem:checked').length;
      back.querySelector('#nt-rem-count').textContent = n === 0
        ? 'No reminders selected \u2014 you won\u2019t be reminded before anything is due.'
        : n + ' reminder' + (n === 1 ? '' : 's') + ' per deadline.';
    }
    updateRemCount();

    /* iPhone guide only matters if push is wanted */
    function syncPush() {
      back.querySelector('#nt-iphone').style.display = back.querySelector('#nt-push').checked ? 'block' : 'none';
    }
    back.querySelector('#nt-push').addEventListener('change', syncPush);
    syncPush();

    function close() { back.remove(); }
    back.querySelector('#ah-nt-x').addEventListener('click', close);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });

    back.querySelector('#ah-nt-save').addEventListener('click', function () {
      function vals(sel) {
        return [].slice.call(back.querySelectorAll(sel + ':checked')).map(function (c) { return c.value; });
      }
      var next = {
        channels: {
          email: back.querySelector('#nt-email').checked,
          push:  back.querySelector('#nt-push').checked
        },
        announcements: back.querySelector('#nt-announcements').checked,
        exams:         back.querySelector('#nt-exams').checked,
        deadlines:     back.querySelector('#nt-deadlines').checked,
        resources:     resChoice,
        resourceTypes: vals('.nt-restype'),
        deadlineCats:  vals('.nt-cat'),
        reminders:     vals('.nt-rem'),
        subjects:      vals('.nt-subject')
      };
      save(next);
      close();
      if (window.__ahToast) window.__ahToast('Notification settings saved.');
    });
  }

  window.__ahOpenNotifySettings = open;
})();
