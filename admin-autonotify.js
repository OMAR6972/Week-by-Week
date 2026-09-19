/* VERSION: 2026-09-19 — v13: after Save, offers to notify students about new announcements, exam schedule posts/changes and new material. */
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

  /* ---------------------------------------- remember how things looked */
  function baseline() {
    seen = new WeakSet(); examSig = new WeakMap(); weekReal = new WeakMap();
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
        kind: 'announcement', label: 'Announcement',
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
          kind: 'exam', label: word + (changed ? ' changed' : ' posted'),
          subject: subjectOrNull(e.sub),
          title: word + ' exam ' + (changed ? 'changed' : 'posted') + (e.sub ? ': ' + e.sub : ''),
          body: (changed ? 'This exam was updated. Now:\n' : '') + lines.join('\n')
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
          kind: 'material', level: 'week', label: 'New week',
          subject: subjectOrNull(sub.code),
          title: 'New material: ' + where,
          body: 'Now available: ' + nowKeys.join(', ') + '.'
        });
      } else {
        added.forEach(function (k) {
          out.push({
            kind: 'material', level: 'resource', resource_type: k, label: 'New ' + k,
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
  var BADGE = { announcement: '#4a90e2', exam: '#ff9f43', material: '#00c853' };

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
            '<span style="font-size:.74rem; color:#8b8397;">' + who + '</span>' +
          '</label>' +
          '<input class="an-title" type="text" value="' + esc(it.title) + '" style="width:100%; padding:8px 10px; margin-bottom:6px; font-size:.85rem;">' +
          '<textarea class="an-body" rows="2" style="width:100%; padding:8px 10px; font-size:.8rem; resize:vertical;">' + esc(it.body) + '</textarea>' +
        '</div>';
    }).join('');

    ov.innerHTML =
      '<div style="background:#1a0d2e; border:1px solid #3a2a4e; border-radius:14px; width:560px; max-width:95vw; max-height:88vh; overflow-y:auto; padding:22px;">' +
        '<div style="font-size:1.05rem; font-weight:700; color:#fff; margin-bottom:4px;"><i class="fa-solid fa-bell"></i> Saved. Tell students?</div>' +
        '<div style="font-size:.8rem; color:#8b8397; line-height:1.55; margin-bottom:14px;">' +
          'These things are new since your last save. Untick anything students shouldn\u2019t be emailed about, and change the wording if you like. ' +
          'Each student only gets what their own notification settings allow.' +
        '</div>' +
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
          force: false,
          semester: window.__ahSemester || null
        });
      });
      if (!rowsOut.length) { close(); return; }
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
