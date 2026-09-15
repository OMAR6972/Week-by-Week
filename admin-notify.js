/* VERSION: 2026-09-15j — v12: admin notification composer.
   Adds a "Notify" button to the admin dashboard so Omar can write a message and
   send it to students by email, separately from announcements. */

(function () {
  var SB = window.__ahSupabase;

  function el(tag, css, html) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c];
    });
  }

  /* ------------------------------------------------------- nav button */
  function injectNav() {
    if (document.getElementById('nav-notify')) return;
    var nav = document.querySelector('.sidebar') || document.querySelector('#sidebar');
    var anchor = document.getElementById('nav-announcements');
    if (!anchor || !anchor.parentNode) return;

    var btn = document.createElement('div');
    btn.className = 'nav-btn';
    btn.id = 'nav-notify';
    btn.innerHTML = '<i class="fa-solid fa-bell"></i> Notify Students';
    btn.onclick = openComposer;
    anchor.parentNode.insertBefore(btn, anchor.nextSibling);
  }

  /* ---------------------------------------------------------- composer */
  function openComposer() {
    if (typeof window.__ahCanEdit === 'function' && !window.__ahCanEdit('announcements')) {
      if (typeof window.ahShowLockedNotice === 'function') window.ahShowLockedNotice('announcements');
      return;
    }
    if (document.getElementById('ah-notify-composer')) return;

    var ov = el('div', 'position:fixed; inset:0; z-index:5000; background:rgba(0,0,0,.7); display:flex; align-items:center; justify-content:center; padding:20px;');
    ov.id = 'ah-notify-composer';

    ov.innerHTML =
      '<div style="background:#1a0d2e; border:1px solid #3a2a4e; border-radius:14px; width:520px; max-width:95vw; max-height:88vh; overflow-y:auto; padding:24px;">' +
        '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">' +
          '<div style="font-size:1.1rem; font-weight:700; color:#fff;"><i class="fa-solid fa-bell"></i> Notify students</div>' +
          '<button id="ah-nc-x" style="background:none;border:none;color:#8b8397;font-size:1.5rem;line-height:1;cursor:pointer;padding:0 6px;">&times;</button>' +
        '</div>' +
        '<div style="font-size:.8rem; color:#8b8397; line-height:1.55; margin-bottom:18px;">' +
          'Sends an email to every student who has an account and has notifications switched on. ' +
          'This is separate from announcements \u2014 it does not appear on the site.' +
        '</div>' +

        '<label style="display:block; font-size:.68rem; letter-spacing:1px; text-transform:uppercase; color:#8b8397; margin-bottom:5px;">Title</label>' +
        '<input id="ah-nc-title" type="text" placeholder="e.g. Room change for tomorrow\u2019s lecture" style="width:100%; padding:9px 11px; margin-bottom:14px; font-size:.88rem;">' +

        '<label style="display:block; font-size:.68rem; letter-spacing:1px; text-transform:uppercase; color:#8b8397; margin-bottom:5px;">Message</label>' +
        '<textarea id="ah-nc-body" rows="5" placeholder="Write what you want them to know." style="width:100%; padding:9px 11px; margin-bottom:14px; font-size:.88rem; resize:vertical;"></textarea>' +

        '<div style="background:#120823; border:1px solid #2a1a3e; border-radius:10px; padding:13px; margin-bottom:16px;">' +
          '<div style="font-size:.68rem; letter-spacing:1px; text-transform:uppercase; color:#8b8397; margin-bottom:8px;">Who gets it</div>' +
          '<label style="display:flex; align-items:center; gap:9px; font-size:.82rem; color:#ddd; cursor:pointer; margin-bottom:7px;">' +
            '<input type="radio" name="ah-nc-who" value="all" checked> Everyone with an account' +
          '</label>' +
          '<label style="display:flex; align-items:center; gap:9px; font-size:.82rem; color:#ddd; cursor:pointer;">' +
            '<input type="radio" name="ah-nc-who" value="subject"> Only students taking a subject' +
          '</label>' +
          '<select id="ah-nc-subject" style="width:100%; margin-top:9px; padding:8px 10px; font-size:.82rem; display:none;"></select>' +
        '</div>' +

        '<div id="ah-nc-preview" style="background:#0f0720; border:1px solid #2a1a3e; border-radius:10px; padding:14px; margin-bottom:16px;">' +
          '<div style="font-size:.66rem; letter-spacing:1px; text-transform:uppercase; color:#8b8397; margin-bottom:8px;">Preview</div>' +
          '<div id="ah-nc-pv-title" style="font-size:.95rem; font-weight:700; color:#fff; margin-bottom:5px;">\u2014</div>' +
          '<div id="ah-nc-pv-body" style="font-size:.82rem; color:#d6c9ea; line-height:1.6; white-space:pre-wrap;"></div>' +
        '</div>' +

        '<div style="display:flex; gap:8px;">' +
          '<button class="btn" id="ah-nc-cancel" style="flex:1; background:rgba(255,255,255,.14); color:#fff; padding:10px;">Cancel</button>' +
          '<button class="btn btn-add" id="ah-nc-send" style="flex:1; padding:10px;">Send now</button>' +
        '</div>' +
        '<div id="ah-nc-msg" style="font-size:.8rem; margin-top:11px; min-height:18px;"></div>' +
      '</div>';

    document.body.appendChild(ov);

    /* subject list */
    var sel = ov.querySelector('#ah-nc-subject');
    (window.COURSE_DATA || []).forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.code;
      o.textContent = s.code + ' \u2014 ' + (s.name || s.code);
      sel.appendChild(o);
    });

    ov.querySelectorAll('input[name="ah-nc-who"]').forEach(function (r) {
      r.addEventListener('change', function () {
        sel.style.display = (r.value === 'subject' && r.checked) ? 'block' : 'none';
      });
    });

    /* live preview */
    function paint() {
      var t = ov.querySelector('#ah-nc-title').value.trim();
      var b = ov.querySelector('#ah-nc-body').value.trim();
      ov.querySelector('#ah-nc-pv-title').textContent = t || '\u2014';
      ov.querySelector('#ah-nc-pv-body').textContent = b;
    }
    ov.querySelector('#ah-nc-title').addEventListener('input', paint);
    ov.querySelector('#ah-nc-body').addEventListener('input', paint);

    function close() { ov.remove(); }
    ov.querySelector('#ah-nc-x').addEventListener('click', close);
    ov.querySelector('#ah-nc-cancel').addEventListener('click', close);
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });

    ov.querySelector('#ah-nc-send').addEventListener('click', async function () {
      var msgEl = ov.querySelector('#ah-nc-msg');
      var sendBtn = ov.querySelector('#ah-nc-send');
      var title = ov.querySelector('#ah-nc-title').value.trim();
      var body = ov.querySelector('#ah-nc-body').value.trim();
      var who = ov.querySelector('input[name="ah-nc-who"]:checked').value;
      var subject = who === 'subject' ? sel.value : null;

      if (!title) { msgEl.style.color = '#ff8a80'; msgEl.textContent = 'Give it a title first.'; return; }
      if (!SB) { msgEl.style.color = '#ff8a80'; msgEl.textContent = 'No connection to the database.'; return; }

      var whoTxt = who === 'all' ? 'every student with an account' : 'students taking ' + subject;
      if (!confirm('Send "' + title + '" to ' + whoTxt + '?\n\nThis sends real emails and cannot be undone.')) return;

      sendBtn.disabled = true;
      msgEl.style.color = '#999';
      msgEl.textContent = 'Sending\u2026';

      try {
        var ins = await SB.from('push_messages').insert({
          title: title,
          body: body,
          semester: window.__ahSemester || null,
          audience_subject: subject
        }).select().single();

        if (ins.error) throw new Error(ins.error.message);

        /* ask the sender to run straight away rather than waiting for the hour */
        var fnUrl = (window.SUPABASE_URL || '') + '/functions/v1/clever-task?messages=1';
        try { await fetch(fnUrl); } catch (e) { /* the hourly run will pick it up */ }

        msgEl.style.color = '#00c853';
        msgEl.textContent = 'Sent. Students will have it within a minute.';
        setTimeout(close, 1600);
      } catch (e) {
        sendBtn.disabled = false;
        msgEl.style.color = '#ff8a80';
        msgEl.textContent = 'Could not send: ' + String(e.message || e).slice(0, 160);
      }
    });

    paint();
    setTimeout(function () { ov.querySelector('#ah-nc-title').focus(); }, 60);
  }

  window.ahOpenNotifyComposer = openComposer;

  var _origBoot = window.__ahAdminBoot;
  window.__ahAdminBoot = function () {
    if (typeof _origBoot === 'function') _origBoot();
    try { injectNav(); } catch (e) {}
    try { if (typeof window.ahApplyNavPermissions === 'function') window.ahApplyNavPermissions(); } catch (e) {}
  };
})();
