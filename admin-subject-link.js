/* VERSION: 2026-10-23a — "Use content from another semester" for a subject.
   Adds a box on the Subject Details page of admin: pick a semester + a subject there, press Link.
   Saved as COURSE_DATA[subject].linkedFrom = { semester, code } (stored in THIS semester only).
   Students then see that subject's weeks, exam materials, useful links and details tab from the other
   semester, while its Semester Map tasks, midterms, finals and staff stay this semester's own.
   Self-contained: wraps renderEditor() from admin.js. Nothing is copied or deleted - Unlink brings back the
   subject's own content. */
(function () {
  var SB = window.__ahSupabase;
  var semCache = null;          // [{slug,name}]
  var courseCache = {};         // slug -> [{code,name,subCode}]

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function dirty() { if (typeof window.markDirty === 'function') window.markDirty(); }

  function loadSemesters() {
    if (semCache) return Promise.resolve(semCache);
    if (!SB) return Promise.resolve([]);
    return SB.from('semesters').select('slug, name, sort_order').order('sort_order', { ascending: true })
      .then(function (r) { semCache = (r && r.data) || []; return semCache; }, function () { return []; });
  }

  function loadCourses(slug) {
    if (courseCache[slug]) return Promise.resolve(courseCache[slug]);
    if (!SB) return Promise.resolve([]);
    return SB.from('site_data').select('value').eq('key', 'COURSE_DATA').eq('semester', slug).maybeSingle()
      .then(function (r) {
        var v = r && r.data && Array.isArray(r.data.value) ? r.data.value : [];
        courseCache[slug] = v.map(function (c) { return { code: c.code, name: c.name, subCode: c.subCode || '' }; });
        return courseCache[slug];
      }, function () { return []; });
  }

  function semName(slug) {
    var s = (semCache || []).filter(function (x) { return x.slug === slug; })[0];
    return s ? s.name : slug;
  }

  function inject() {
    var area = document.getElementById('editor-area');
    if (!area) return;
    var old = document.getElementById('ah-sl-section'); if (old) old.remove();
    var sub = window.COURSE_DATA && window.COURSE_DATA[cIdx];
    if (!sub) return;
    var mode = (typeof subViewMode !== 'undefined') ? subViewMode : '';

    var sec = document.createElement('div');
    sec.id = 'ah-sl-section';
    sec.className = 'form-section';
    sec.style.borderColor = '#00e5ff';

    // On the other tabs just show a reminder banner when the subject is linked
    if (mode !== 'subject') {
      if (!sub.linkedFrom || !['weeks', 'events', 'playlists', 'details'].includes(mode)) return;
      sec.innerHTML = '<div style="color:#00e5ff;font-size:0.8rem;">🔗 This subject is <b>linked</b> to <b>' + esc(sub.linkedFrom.code) +
        '</b> of <b>' + esc(semName(sub.linkedFrom.semester)) + '</b>. Students see that subject\'s weeks, exam materials, useful links and details instead of what is below. ' +
        'Edit them in that semester, or Unlink on the Subject Details page.</div>';
      area.insertBefore(sec, area.firstChild);
      loadSemesters().then(function () { var b = document.getElementById('ah-sl-section'); if (b && sub.linkedFrom) b.querySelector('b:nth-of-type(2)').textContent = semName(sub.linkedFrom.semester); });
      return;
    }

    sec.innerHTML =
      '<h3 style="color:#00e5ff;">🔗 Use content from another semester</h3>' +
      '<p style="color:#888;font-size:0.8rem;margin-bottom:12px;">For a subject that continues from an earlier semester. Students see the <b>weeks, exam materials, useful links and details</b> of the subject you pick. ' +
      'The Semester Map tasks, midterms, finals and staff stay separate for this semester.</p>' +
      '<div id="ah-sl-status" style="margin-bottom:10px;font-size:0.85rem;"></div>' +
      '<div id="ah-sl-form" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">' +
        '<div><label>Semester</label><select id="ah-sl-sem"><option>Loading…</option></select></div>' +
        '<div><label>Subject</label><select id="ah-sl-sub"><option>—</option></select></div>' +
        '<button type="button" id="ah-sl-link" class="btn" style="background:#00a8c0;">🔗 Link</button>' +
        '<button type="button" id="ah-sl-unlink" class="btn" style="background:rgba(255,255,255,0.1);border:1px solid #666;">Unlink</button>' +
      '</div>' +
      '<div style="font-size:0.72rem;color:#777;margin-top:10px;">Click <b>Save to site</b> afterwards to apply it.</div>';
    area.appendChild(sec);

    var semSel = sec.querySelector('#ah-sl-sem'), subSel = sec.querySelector('#ah-sl-sub'), status = sec.querySelector('#ah-sl-status');

    function paintStatus() {
      var l = sub.linkedFrom;
      if (l && l.semester && l.code) {
        status.innerHTML = '✅ Linked to <b style="color:#00e5ff;">' + esc(l.code) + '</b> from <b style="color:#00e5ff;">' + esc(semName(l.semester)) + '</b>.';
      } else {
        status.innerHTML = '<span style="color:#aaa;">Not linked — this subject uses its own content.</span>';
      }
      sec.querySelector('#ah-sl-unlink').style.display = l ? '' : 'none';
    }

    function fillSubjects() {
      var slug = semSel.value;
      subSel.innerHTML = '<option>Loading…</option>';
      loadCourses(slug).then(function (list) {
        subSel.innerHTML = '';
        if (!list.length) { subSel.innerHTML = '<option value="">(no subjects)</option>'; return; }
        list.forEach(function (c) {
          var o = document.createElement('option');
          o.value = c.code; o.textContent = c.code + ' — ' + c.name + (c.subCode ? ' (' + c.subCode + ')' : '');
          // preselect the same code as this subject
          if (sub.linkedFrom && sub.linkedFrom.semester === slug ? sub.linkedFrom.code === c.code : c.code === sub.code) o.selected = true;
          subSel.appendChild(o);
        });
      });
    }

    loadSemesters().then(function (sems) {
      var cur = window.__ahSemester;
      var others = sems.filter(function (s) { return s.slug !== cur; });
      semSel.innerHTML = '';
      if (!others.length) { semSel.innerHTML = '<option value="">(no other semesters)</option>'; }
      others.forEach(function (s) {
        var o = document.createElement('option'); o.value = s.slug; o.textContent = s.name;
        if (sub.linkedFrom && sub.linkedFrom.semester === s.slug) o.selected = true;
        semSel.appendChild(o);
      });
      paintStatus();
      if (others.length) fillSubjects();
    });

    semSel.addEventListener('change', fillSubjects);

    sec.querySelector('#ah-sl-link').addEventListener('click', function () {
      if (!semSel.value || !subSel.value) { alert('Pick a semester and a subject first.'); return; }
      sub.linkedFrom = { semester: semSel.value, code: subSel.value };
      paintStatus(); dirty();
    });
    sec.querySelector('#ah-sl-unlink').addEventListener('click', function () {
      delete sub.linkedFrom;
      paintStatus(); dirty();
    });
  }

  var orig = window.renderEditor;
  if (typeof orig === 'function') {
    window.renderEditor = function () {
      var out = orig.apply(this, arguments);
      try { inject(); } catch (e) { console.warn('[subject-link]', e); }
      return out;
    };
  }
})();
