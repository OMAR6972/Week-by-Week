/* Academic Hub - admin-manage.js
   Visual "Admins" panel. Only the OWNER (super admin) sees the button.
   Lets the owner add / remove admins by email - no SQL needed. */

(function () {
  var SB = window.__ahSupabase;

  // called by admin-auth.js after a successful login + boot
  window.__ahInitAdminPanel = function () {
    if (!window.__ahIsSuper || !SB) return;          // owner only
    if (document.getElementById('ah-admins-btn')) return;
    var bar = document.querySelector('.admin-topbar');
    if (!bar) return;
    var btn = document.createElement('button');
    btn.id = 'ah-admins-btn';
    btn.className = 'btn';
    btn.textContent = '👥 Admins';
    btn.title = 'Manage who can edit the site';
    btn.style.cssText = 'margin-left:6px;background:#7b3fe4;';
    btn.addEventListener('click', openModal);
    bar.appendChild(btn);
  };

  function el(tag, css, html) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function openModal() {
    var back = el('div', 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;font-family:\'Segoe UI\',sans-serif;');
    var box = el('div', 'width:460px;max-width:94vw;max-height:88vh;overflow:auto;background:#1a0d2e;border:1px solid #2a1a3e;border-radius:14px;padding:22px;');
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">' +
        '<div style="font-size:1.2rem;font-weight:700;color:#fff;">Manage Admins</div>' +
        '<button id="ah-x" style="background:none;border:none;color:#aaa;font-size:1.4rem;cursor:pointer;line-height:1;">&times;</button>' +
      '</div>' +
      '<div style="font-size:.8rem;color:#999;margin-bottom:16px;">Admins can edit the site. Only you (the owner) can change this list.</div>' +
      '<div id="ah-list" style="margin-bottom:18px;color:#ccc;font-size:.9rem;">Loading…</div>' +
      '<div style="border-top:1px solid #2a1a3e;padding-top:16px;">' +
        '<div style="font-size:.85rem;color:#fff;font-weight:600;margin-bottom:8px;">Add an admin</div>' +
        '<div style="font-size:.78rem;color:#999;margin-bottom:8px;">They must first create an account on the login screen. Then add their email here.</div>' +
        '<div style="display:flex;gap:8px;">' +
          '<input id="ah-add-email" type="email" placeholder="their@email.com" style="flex:1;padding:9px 11px;background:#0a0012;border:1px solid #2a1a3e;border-radius:8px;color:#fff;font-size:.88rem;">' +
          '<button id="ah-add-btn" style="padding:9px 16px;background:#e91e8c;border:none;border-radius:8px;color:#fff;font-weight:600;cursor:pointer;">Add</button>' +
        '</div>' +
        '<div id="ah-add-msg" style="font-size:.8rem;margin-top:10px;min-height:16px;"></div>' +
      '</div>';
    back.appendChild(box);
    document.body.appendChild(back);

    function close() { back.remove(); }
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    box.querySelector('#ah-x').addEventListener('click', close);

    var addMsg = box.querySelector('#ah-add-msg');
    function setAddMsg(m, ok) { addMsg.textContent = m || ''; addMsg.style.color = ok ? '#00c853' : '#ff6b6b'; }

    async function refresh() {
      var listEl = box.querySelector('#ah-list');
      var r = await SB.rpc('list_admins');
      if (r.error) { listEl.textContent = 'Could not load admins: ' + r.error.message; return; }
      var rows = r.data || [];
      listEl.innerHTML = '';
      rows.forEach(function (a) {
        var row = el('div', 'display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 0;border-bottom:1px solid #221634;');
        var badge = a.is_super
          ? '<span style="font-size:.68rem;background:#7b3fe4;color:#fff;padding:2px 7px;border-radius:10px;margin-left:8px;">OWNER</span>'
          : '<span style="font-size:.68rem;background:#333;color:#ccc;padding:2px 7px;border-radius:10px;margin-left:8px;">ADMIN</span>';
        row.innerHTML = '<span style="color:#fff;word-break:break-all;">' + a.email + badge + '</span>';
        if (!a.is_super) {
          var rm = el('button', 'background:rgba(255,59,48,.15);border:1px solid rgba(255,59,48,.4);color:#ff6b6b;padding:5px 12px;border-radius:7px;font-size:.8rem;cursor:pointer;flex-shrink:0;', 'Remove');
          rm.addEventListener('click', async function () {
            if (!confirm('Remove admin access for ' + a.email + '?')) return;
            rm.disabled = true; rm.textContent = '…';
            var res = await SB.rpc('remove_admin', { p_email: a.email });
            if (res.error) { alert('Could not remove: ' + friendly(res.error.message)); rm.disabled = false; rm.textContent = 'Remove'; return; }
            refresh();
          });
          row.appendChild(rm);
        }
        listEl.appendChild(row);
      });
      if (!rows.length) listEl.textContent = 'No admins found.';
    }

    async function addAdmin() {
      var email = (box.querySelector('#ah-add-email').value || '').trim();
      if (!email) { setAddMsg('Enter an email.'); return; }
      var btn = box.querySelector('#ah-add-btn');
      btn.disabled = true; setAddMsg('Adding…', true);
      var res = await SB.rpc('add_admin', { p_email: email });
      btn.disabled = false;
      if (res.error) { setAddMsg(friendly(res.error.message)); return; }
      box.querySelector('#ah-add-email').value = '';
      setAddMsg('Added ' + email + ' as an admin.', true);
      refresh();
    }

    function friendly(m) {
      m = m || '';
      if (m.indexOf('NO_USER') > -1) return 'No account with that email yet. They need to create an account on the login screen first.';
      if (m.indexOf('CANNOT_REMOVE_SUPER') > -1) return 'The owner cannot be removed.';
      if (m.indexOf('NOT_ALLOWED') > -1) return 'Only the owner can do this.';
      return m;
    }

    box.querySelector('#ah-add-btn').addEventListener('click', addAdmin);
    box.querySelector('#ah-add-email').addEventListener('keydown', function (e) { if (e.key === 'Enter') addAdmin(); });
    refresh();
  }
})();
