/* Academic Hub - admin-semester.js  (feature 7.1)
   Adds three things to the admin topbar:
     1. A dropdown showing which semester you are EDITING. Switching reloads the
        dashboard into that semester (the browser warns first if you have
        unsaved changes - that guard already lives in admin.js).
     2. A "+ Sem" button to create a new EMPTY semester and jump into it.
     3. A "gear" button opening a manage panel: make-current / rename / delete.

   Saving always writes to the semester shown here (admin-auth.js handles that).
   Only the OWNER can delete a semester. */

(function () {
  var SB = window.__ahSupabase;

  function el(tag, css, html) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function go(slug) {
    var u = new URL(location.href);
    u.searchParams.set('sem', slug);
    location.href = u.toString();   // reload into that semester; beforeunload guards unsaved edits
  }

  function slugify(name) {
    return (name || '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || ('sem-' + Date.now());
  }

  function friendly(m) {
    m = m || '';
    if (m.indexOf('SLUG_EXISTS') > -1)       return 'A semester with that name already exists.';
    if (m.indexOf('NOT_ALLOWED_SUPER') > -1) return 'Only the owner can delete a semester.';
    if (m.indexOf('NOT_ALLOWED') > -1)       return 'Only admins can do this.';
    if (m.indexOf('LAST_SEMESTER') > -1)     return 'You cannot delete the only semester.';
    if (m.indexOf('IS_CURRENT') > -1)        return 'Make another semester current first, then delete this one.';
    if (m.indexOf('NO_SEMESTER') > -1)       return 'That semester no longer exists.';
    if (m.indexOf('BAD_SLUG') > -1 || m.indexOf('BAD_NAME') > -1) return 'Please enter a valid name.';
    return m;
  }

  function fillSelect(sel) {
    var list = window.__ahSemesterList || [];
    sel.innerHTML = '';
    if (!list.length) {
      var o = document.createElement('option');
      o.value = ''; o.textContent = 'Spring 2026';
      sel.appendChild(o); sel.disabled = true; return;
    }
    sel.disabled = false;
    list.forEach(function (s) {
      var op = document.createElement('option');
      op.value = s.slug;
      op.textContent = (s.name || s.slug) + (s.is_current ? ' \u2022 current' : '');
      op.style.cssText = 'background:#0a0012;color:#fff;';
      if (s.slug === window.__ahSemester) op.selected = true;
      sel.appendChild(op);
    });
  }

  // Called by admin-auth.js after a successful login + boot.
  window.__ahInitSemesterUI = function () {
    if (!SB) return;
    var bar = document.querySelector('.admin-topbar');
    if (!bar || document.getElementById('ah-sem-wrap')) return;

    var wrap = el('div', 'display:flex;align-items:center;gap:6px;flex-shrink:0;');
    wrap.id = 'ah-sem-wrap';

    wrap.appendChild(el('span', 'font-size:0.6rem;color:#777;letter-spacing:0.5px;text-transform:uppercase;', 'Editing'));

    var sel = el('select', 'background:#0a0012;color:#fff;border:1px solid #7b3fe4;border-radius:7px;' +
                 'padding:4px 6px;font-size:0.72rem;font-weight:700;max-width:140px;cursor:pointer;outline:none;');
    sel.id = 'ah-sem-select';
    sel.title = 'The semester you are editing';
    wrap.appendChild(sel);

    var addBtn = el('button', 'background:#7b3fe4;', '\uFF0B Sem');
    addBtn.className = 'btn'; addBtn.title = 'Add a new (empty) semester';
    wrap.appendChild(addBtn);

    var mgBtn = el('button', 'background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.3);', '\u2699');
    mgBtn.className = 'btn'; mgBtn.title = 'Manage semesters';
    wrap.appendChild(mgBtn);

    bar.insertBefore(wrap, bar.firstChild);
    fillSelect(sel);

    sel.addEventListener('change', function () {
      if (sel.value && sel.value !== window.__ahSemester) go(sel.value);
    });
    addBtn.addEventListener('click', addSemester);
    mgBtn.addEventListener('click', openManage);
  };

  async function addSemester() {
    var name = prompt('Name the new semester (for example: "Spring 2027").\n\n' +
                      'It starts EMPTY \u2014 your resource types carry over, but no subjects, ' +
                      'schedule, staff, etc. You fill it in, then "Make current" when it is ready.');
    if (name == null) return;
    name = name.trim();
    if (!name) return;
    var slug = slugify(name);
    var r = await SB.rpc('create_semester', { p_slug: slug, p_name: name });
    if (r.error) { alert('Could not create semester: ' + friendly(r.error.message)); return; }
    go(slug);  // jump straight into editing the new empty semester
  }

  function openManage() {
    var back = el('div', 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;' +
                 'align-items:center;justify-content:center;padding:16px;font-family:\'Segoe UI\',sans-serif;');
    var box = el('div', 'width:480px;max-width:94vw;max-height:88vh;overflow:auto;background:#1a0d2e;' +
                 'border:1px solid #2a1a3e;border-radius:14px;padding:22px;');
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
        '<div style="font-size:1.2rem;font-weight:700;color:#fff;">Manage Semesters</div>' +
        '<button id="ah-sm-x" style="background:none;border:none;color:#aaa;font-size:1.4rem;cursor:pointer;line-height:1;">&times;</button>' +
      '</div>' +
      '<div style="font-size:.8rem;color:#999;margin-bottom:16px;">' +
        '\u201CCurrent\u201D is the semester students land on by default. Every semester also has its own ' +
        'shareable link: add <code style="color:#cbb;">?sem=slug</code> to the site URL.</div>' +
      '<div id="ah-sm-list" style="color:#ccc;font-size:.9rem;">Loading\u2026</div>';
    back.appendChild(box);
    document.body.appendChild(back);

    function close() { back.remove(); }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    box.querySelector('#ah-sm-x').addEventListener('click', close);

    var isSuper = !!window.__ahIsSuper;

    async function refresh() {
      var listEl = box.querySelector('#ah-sm-list');
      var r = await SB.from('semesters').select('slug, name, sort_order, is_current').order('sort_order', { ascending: true });
      if (r.error) { listEl.textContent = 'Could not load: ' + r.error.message; return; }
      var rows = r.data || [];
      window.__ahSemesterList = rows;

      listEl.innerHTML = '';
      rows.forEach(function (s) {
        var row = el('div', 'display:flex;align-items:center;gap:7px;padding:11px 0;border-bottom:1px solid #221634;flex-wrap:wrap;');
        var tag = s.is_current
          ? '<span style="font-size:.6rem;background:#00c853;color:#031;padding:2px 7px;border-radius:10px;margin-left:6px;font-weight:800;letter-spacing:.5px;">CURRENT</span>'
          : '';
        row.appendChild(el('span', 'color:#fff;flex:1;min-width:130px;word-break:break-word;',
          (s.name || s.slug) + tag +
          '<div style="font-size:.64rem;color:#888;margin-top:2px;">?sem=' + s.slug + '</div>'));

        if (!s.is_current) {
          var cur = el('button', 'background:rgba(0,200,83,.15);border:1px solid #00c853;color:#00c853;padding:5px 10px;border-radius:7px;font-size:.74rem;cursor:pointer;', 'Make current');
          cur.addEventListener('click', async function () {
            cur.disabled = true; cur.textContent = '\u2026';
            var res = await SB.rpc('set_current_semester', { p_slug: s.slug });
            if (res.error) { alert(friendly(res.error.message)); cur.disabled = false; cur.textContent = 'Make current'; return; }
            refresh();
          });
          row.appendChild(cur);
        }

        var ren = el('button', 'background:#333;border:1px solid #555;color:#ddd;padding:5px 10px;border-radius:7px;font-size:.74rem;cursor:pointer;', 'Rename');
        ren.addEventListener('click', async function () {
          var nn = prompt('Rename this semester to:', s.name || s.slug);
          if (nn == null) return; nn = nn.trim(); if (!nn) return;
          var res = await SB.rpc('rename_semester', { p_slug: s.slug, p_name: nn });
          if (res.error) { alert(friendly(res.error.message)); return; }
          refresh();
        });
        row.appendChild(ren);

        if (isSuper && !s.is_current && rows.length > 1) {
          var del = el('button', 'background:rgba(255,59,48,.15);border:1px solid rgba(255,59,48,.4);color:#ff6b6b;padding:5px 10px;border-radius:7px;font-size:.74rem;cursor:pointer;', 'Delete');
          del.addEventListener('click', async function () {
            if (!confirm('Delete "' + (s.name || s.slug) + '" and ALL of its data?\nThis cannot be undone.')) return;
            if (!confirm('Last chance \u2014 really delete "' + (s.name || s.slug) + '"?')) return;
            var res = await SB.rpc('delete_semester', { p_slug: s.slug });
            if (res.error) { alert(friendly(res.error.message)); return; }
            if (window.__ahSemester === s.slug) {
              var cur = (window.__ahSemesterList || []).find(function (x) { return x.is_current; });
              if (cur) { go(cur.slug); return; }
            }
            refresh();
          });
          row.appendChild(del);
        }

        listEl.appendChild(row);
      });

      if (!rows.length) listEl.textContent = 'No semesters yet.';

      // keep the topbar dropdown labels in sync (current marker may have moved)
      var ts = document.getElementById('ah-sem-select');
      if (ts) fillSelect(ts);
    }

    refresh();
  }
})();
