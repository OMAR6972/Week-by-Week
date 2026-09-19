/* VERSION: 2026-09-19b — v14: also covers deadline / Semester Map items, a per-row "send no matter what" tick, and added-vs-edited wording. Earlier: v13: after Save, offers to notify students about new announcements, exam schedule posts/changes and new material. */
/* Nothing is ever sent without the admin pressing the send button in the pop-up. */

(function () {
  var SB = window.__ahSupabase;
  var ready = false, wrapped = false, pending = null;
  var seen = new WeakSet();       // things that already existed at the last save/load
  var examSig = new WeakMap();    // what each exam looked like then
  var weekReal = new WeakMap();   // which resource types each week already had

  /* ------------------------------------------------------------ helpers */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }
  function strip(s) {
    return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim().slice(0, 700);
  }
  function isObj(o) { return o && typeof o === 'object'; }
  function isReal(r) { return !!(r && r.vis && r.link && r.link !== '#'); }
  function realKeys(wk) {
    var res = (wk && wk.resources) || {}, out = [];
    Object.keys(res).forEach(function (k) { if (isReal(res[k])) out.push(k); });
    return out;
  }
  function eachWeek(fn) {
    (window.COURSE_DATA || []).forEach(function (sub) {
      ['weeks', 'events'].forEach(function (sec) {
        (sub[sec] || []).forEach(function (wk) { if (isObj(wk)) fn(sub, wk); });
      });
    });
  }
  function examLists() { return [['Midterm', window.MIDTERM_DATA || []], ['Final', window.FINAL_DATA || []]]; }
  function sigOf(e) {
    return [e.sub, e.dateLabel, e.time, e.where].map(function (x) { return String(x == null ? '' : x).trim(); }).join('|');
  }
  function subjectOrNull(code) {
    code = String(code || '').trim();
    if (!code) return null;
    return (window.COURSE_DATA || []).some(function (s) { return s.code === code; }) ? code : null;
  }

  /* deadline / Semester Map items: same category words the sender uses */
  var CATS = [
    { key: 'assignment',   words: ['assignment', 'sheet', 'homework', 'hw'] },
    { key: 'quiz',         words: ['quiz'] },
    { key: 'project',      words: ['project', 'submission', 'deliverable'] },
    { key: 'lab',          words: ['lab', 'practical'] },
    { key: 'exam',         words: ['exam', 'midterm', 'final'] },
    { key: 'presentation', words: ['presentation', 'discussion', 'seminar', 'oral', 'conference'] }
  ];
  function categoryOf(t) {
    var hay = ((t.type || '') + ' ' + (t.name || '')).toLowerCase();
    for (var i = 0; i < CATS.length; i++) {
      for (var j = 0; j < CATS[i].words.length; j++) if (hay.indexOf(CATS[i].words[j]) > -1) return CATS[i].key;
    }
    return 'other';
  }
  var TASK_FIELDS = [
    ['name', 'Name'], ['sub', 'Subject'], ['when', 'When'], ['where', 'Where'],
    ['coverage', 'Coverage'], ['deadlineDate', 'Deadline'], ['deadlineEndDate', 'Ends'], ['submitText', 'Submit']
  ];
  function taskSnapOf(t) {
    var o = {};
    TASK_FIELDS.forEach(function (f) { o[f[0]] = String(t[f[0]] == null ? '' : t[f[0]]).trim(); });
    return o;
  }
  var taskSnap = new WeakMap();

  /* ---------------------------------------- remember how things looked */
  function baseline() {
    seen = new WeakSet(); examSig = new WeakMap(); weekReal = new WeakMap(); taskSnap = new WeakMap();
    (window.SCHEDULE_DATA || []).forEach(function (wk) {
      ((wk && wk.tasks) || []).forEach(function (t) {
        if (isObj(t)) { seen.add(t); taskSnap.set(t, taskSnapOf(t)); }
      });
    });
    (window.NEWS_DATA || []).forEach(function (a) { if (isObj(a)) seen.add(a); });
    examLists().forEach(function (l) {
      l[1].forEach(function (e) { if (isObj(e)) { seen.add(e); examSig.set(e, sigOf(e)); } });
    });
    eachWeek(function (sub, wk) { weekReal.set(wk, realKeys(wk)); });
    ready = true;
  }

  /* -------------------------------------------- what is new since then */
  function detect() {
    if (!ready) return [];
    if (typeof window.__ahCanEdit === 'function' && !window.__ahCanEdit('notify')) return [];
    var out = [], now = Date.now();

    /* announcements */
    (window.NEWS_DATA || []).forEach(function (a) {
      if (!isObj(a) || seen.has(a) || a._auto) return;
      var title = String(a.title || '').trim();
      var body = strip(a.body);
      if (!title || (title === 'New Announcement' && !body)) return;
      if (a.publishedAt) {
        var t = new Date(a.publishedAt).getTime();
        if (!isNaN(t) && t > now + 60000) return;      // scheduled for later, not live yet
      }
      if (a.link) body += (body ? '\n' : '') + a.link;
      out.push({
        kind: 'announcement', mode: 'added', label: 'Announcement',
        subject: subjectOrNull(a.sub),
        title: 'New announcement: ' + title, body: body
      });
    });

    /* exam schedule: newly posted, or date / time / place changed */
    examLists().forEach(function (pair) {
      var word = pair[0];
      pair[1].forEach(function (e) {
        if (!isObj(e)) return;
        var isNew = !seen.has(e);
        var changed = !isNew && examSig.get(e) !== sigOf(e);
        if (!isNew && !changed) return;
        if (!String(e.sub || '').trim() && !String(e.dateLabel || '').trim()) return;
        var lines = [];
        lines.push((e.sub || 'Exam') + (e.examCode ? ' (' + e.examCode + ')' : '') + (e.dateLabel ? ' \u2014 ' + e.dateLabel : ''));
        if (e.time) lines.push('Time: ' + e.time);
        if (e.where) lines.push('Where: ' + e.where);
        lines.push('The full schedule is in the Exams tab on the site.');
        out.push({
          kind: 'exam', mode: changed ? 'edited' : 'added', label: word + (changed ? ' changed' : ' posted'),
          subject: subjectOrNull(e.sub),
          title: word + ' exam ' + (changed ? 'changed' : 'posted') + (e.sub ? ': ' + e.sub : ''),
          body: (changed ? 'This exam was updated. Now:\n' : '') + lines.join('\n')
        });
      });
    });

    /* deadlines and Semester Map items (they are the same thing) */
    (window.SCHEDULE_DATA || []).forEach(function (wk) {
      if (!isObj(wk)) return;
      var special = wk.isFinals ? 'Finals' : (wk.isMidterm ? 'Midterms' : '');
      ((wk.tasks) || []).forEach(function (t) {
        if (!isObj(t)) return;
        var snap = taskSnapOf(t), isNew = !seen.has(t), diffs = [];
        if (isNew) {
          if ((!snap.name || snap.name === 'New Task') && !snap.when && !snap.deadlineDate) return;
        } else {
          var before = taskSnap.get(t) || {};
          TASK_FIELDS.forEach(function (f) { if ((before[f[0]] || '') !== snap[f[0]]) diffs.push(f); });
          if (!diffs.length) return;
        }
        var head = (snap.name || 'Item') + (snap.sub ? ' \u2014 ' + snap.sub : '');
        var lines = [];
        if (isNew) {
          if (snap.when) lines.push('When: ' + snap.when);
          if (snap.where) lines.push('Where: ' + snap.where);
          if (snap.deadlineDate) lines.push('Deadline: ' + snap.deadlineDate);
          if (snap.coverage) lines.push('Coverage: ' + snap.coverage);
          if (snap.submitText) lines.push('Submit: ' + snap.submitText);
        } else {
          lines.push(head + ' was updated.');
          var before2 = taskSnap.get(t) || {};
          diffs.forEach(function (f) {
            lines.push(f[1] + ': ' + (before2[f[0]] || '(empty)') + ' \u2192 ' + (snap[f[0]] || '(empty)'));
          });
        }
        lines.push('The details are in the Semester Map on the site.');
        out.push({
          kind: 'deadline', mode: isNew ? 'added' : 'edited', resource_type: categoryOf(t),
          label: (special ? special + ' \u00b7 ' : '') + (isNew ? 'Added' : 'Edited'),
          hint: special ? special + ' week \u2014 decide whether this change is worth an email.' : '',
          subject: subjectOrNull(snap.sub),
          title: (isNew ? 'Added: ' : 'Updated: ') + head,
          body: lines.join('\n')
        });
      });
    });

    /* new material: a week getting its first material = "week"; more later = "resource" */
    eachWeek(function (sub, wk) {
      var before = weekReal.get(wk) || [];
      var nowKeys = realKeys(wk);
      var added = nowKeys.filter(function (k) { return before.indexOf(k) < 0; });
      if (!added.length) return;
      var where = (sub.code || sub.name || '') + ' \u2014 ' + (wk.title || (wk.week ? 'Week ' + wk.week : 'new week'));
      if (!before.length) {
        out.push({
          kind: 'material', mode: 'added', level: 'week', label: 'New week',
          subject: subjectOrNull(sub.code),
          title: 'New material: ' + where,
          body: 'Now available: ' + nowKeys.join(', ') + '.'
        });
      } else {
        added.forEach(function (k) {
          out.push({
            kind: 'material', mode: 'added', level: 'resource', resource_type: k, label: 'New ' + k,
            subject: subjectOrNull(sub.code),
            title: 'New ' + k + ': ' + where,
            body: 'A new ' + k + ' was added to ' + where + '.'
          });
        });
      }
    });

    return out;
  }

  /* ---------------------------------------------------------- the pop-up */
  var BADGE = { announcement: '#4a90e2', exam: '#ff9f43', material: '#00c853', deadline: '#e91e8c' };

  function offer(items) {
    if (document.getElementById('ah-autonotify')) return;
    var ov = document.createElement('div');
    ov.id = 'ah-autonotify';
    ov.style.cssText = 'position:fixed; inset:0; z-index:5200; background:rgba(0,0,0,.72); display:flex; align-items:center; justify-content:center; padding:20px;';

    var rows = items.map(function (it, i) {
      var who = it.subject ? 'Students taking ' + esc(it.subject) : 'Everyone with an account';
      return '' +
        '<div class="an-row" data-i="' + i + '" style="background:#120823; border:1px solid #2a1a3e; border-radius:10px; padding:12px; margin-bottom:10px;">' +
          '<label style="display:flex; align-items:center; gap:9px; cursor:pointer; margin-bottom:8px;">' +
            '<input type="checkbox" class="an-on" checked style="cursor:pointer;">' +
            '<span style="font-size:.66rem; letter-spacing:.8px; text-transform:uppercase; font-weight:700; color:#fff; background:' + (BADGE[it.kind] || '#777') + '; padding:2px 8px; border-radius:20px;">' + esc(it.label) + '</span>' +
            '<span style="font-size:.66rem; color:#b9a9d6; border:1px solid #3a2a4e; padding:1px 7px; border-radius:20px;">' + (it.mode === 'edited' ? 'edited' : 'just added') + '</span>' +
            '<span style="font-size:.74rem; color:#8b8397;">' + who + '</span>' +
          '</label>' +
          (it.hint ? '<div style="font-size:.72rem; color:#e0b070; margin:-2px 0 7px 26px;">' + esc(it.hint) + '</div>' : '') +
          '<input class="an-title" type="text" value="' + esc(it.title) + '" style="width:100%; padding:8px 10px; margin-bottom:6px; font-size:.85rem;">' +
          '<textarea class="an-body" rows="' + Math.min(6, Math.max(2, String(it.body || '').split('\n').length)) + '" style="width:100%; padding:8px 10px; font-size:.8rem; resize:vertical;">' + esc(it.body) + '</textarea>' +
          '<label style="display:flex; align-items:center; gap:8px; margin-top:7px; font-size:.74rem; color:#a89070; cursor:pointer;">' +
            '<input type="checkbox" class="an-force" style="cursor:pointer;"> Send no matter what \u2014 even to students who switched notifications off' +
          '</label>' +
        '</div>';
    }).join('');

    ov.innerHTML =
      '<div style="background:#1a0d2e; border:1px solid #3a2a4e; border-radius:14px; width:560px; max-width:95vw; max-height:88vh; overflow-y:auto; padding:22px;">' +
        '<div style="font-size:1.05rem; font-weight:700; color:#fff; margin-bottom:4px;"><i class="fa-solid fa-bell"></i> Saved. Tell students?</div>' +
        '<div style="font-size:.8rem; color:#8b8397; line-height:1.55; margin-bottom:14px;">' +
          'These things are new since your last save. Untick anything students shouldn\u2019t be emailed about, and change the wording if you like. ' +
          'Each student only gets what their own notification settings allow.' +
        '</div>' +
        '<div style="font-size:.74rem; margin-bottom:10px;"><a href="#" id="an-all" style="color:#4a90e2;">Tick all</a> &nbsp;\u00b7&nbsp; <a href="#" id="an-none" style="color:#4a90e2;">Untick all</a></div>' +
        rows +
        '<div style="display:flex; gap:8px; margin-top:6px;">' +
          '<button class="btn" id="an-skip" style="flex:1; background:rgba(255,255,255,.14); color:#fff; padding:10px;">Don\u2019t notify anyone</button>' +
          '<button class="btn btn-add" id="an-send" style="flex:1; padding:10px;">Send selected</button>' +
        '</div>' +
        '<div id="an-msg" style="font-size:.8rem; margin-top:11px; min-height:18px;"></div>' +
      '</div>';
    document.body.appendChild(ov);

    function close() { ov.remove(); }
    ov.querySelector('#an-skip').addEventListener('click', close);
    function setAll(v) { [].slice.call(ov.querySelectorAll('.an-on')).forEach(function (c) { c.checked = v; }); }
    ov.querySelector('#an-all').addEventListener('click', function (e) { e.preventDefault(); setAll(true); });
    ov.querySelector('#an-none').addEventListener('click', function (e) { e.preventDefault(); setAll(false); });

    ov.querySelector('#an-send').addEventListener('click', async function () {
      var msgEl = ov.querySelector('#an-msg');
      var btn = ov.querySelector('#an-send');
      var rowsOut = [];
      [].slice.call(ov.querySelectorAll('.an-row')).forEach(function (r) {
        if (!r.querySelector('.an-on').checked) return;
        var it = items[parseInt(r.getAttribute('data-i'), 10)];
        var title = r.querySelector('.an-title').value.trim() || it.title;
        rowsOut.push({
          title: title,
          body: r.querySelector('.an-body').value.trim(),
          kind: it.kind,
          level: it.level || null,
          resource_type: it.resource_type || null,
          audience_subject: it.subject || null,
          force: !!r.querySelector('.an-force').checked,
          semester: window.__ahSemester || null
        });
      });
      if (!rowsOut.length) { close(); return; }
      var nForce = rowsOut.filter(function (x) { return x.force; }).length;
      if (nForce && !confirm(nForce + ' of these will be sent no matter what, even to students who switched notifications off.\n\nSend anyway?')) return;
      if (!SB) { msgEl.style.color = '#ff8a80'; msgEl.textContent = 'No connection to the database.'; return; }

      btn.disabled = true;
      msgEl.style.color = '#999';
      msgEl.textContent = 'Sending\u2026';
      try {
        var ins = await SB.from('push_messages').insert(rowsOut);
        if (ins.error) throw new Error(ins.error.message);
        try { await fetch((window.SUPABASE_URL || '') + '/functions/v1/clever-task?messages=1'); } catch (e) { /* the hourly run picks it up */ }
        msgEl.style.color = '#00c853';
        msgEl.textContent = 'Done. Emails go out within a minute.';
        setTimeout(close, 1600);
      } catch (e) {
        btn.disabled = false;
        msgEl.style.color = '#ff8a80';
        msgEl.textContent = 'Could not send: ' + String(e.message || e).slice(0, 160);
      }
    });
  }

  /* ------------------------------------------------ hook into the Save */
  function hook() {
    if (wrapped) return;
    var origSave = window.saveData, origDb = window.__ahSaveToDatabase;
    if (typeof origSave !== 'function' || typeof origDb !== 'function') return;
    wrapped = true;

    window.saveData = async function () {
      try { pending = detect(); } catch (e) { pending = null; }   // look BEFORE the save stamps anything
      return origSave.apply(this, arguments);
    };

    window.__ahSaveToDatabase = async function () {
      var ok = await origDb.apply(this, arguments);
      if (ok) {
        var items = pending; pending = null;
        try { baseline(); } catch (e) {}
        if (items && items.length) setTimeout(function () { offer(items); }, 600);
      }
      return ok;
    };
  }

  var _origBoot = window.__ahAdminBoot;
  window.__ahAdminBoot = function () {
    if (typeof _origBoot === 'function') _origBoot();
    /* wait a moment so the admin panel has finished setting itself up */
    setTimeout(function () {
      try { baseline(); hook(); } catch (e) {}
    }, 1200);
  };
})();
