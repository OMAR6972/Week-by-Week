/* VERSION: 2026-09-19 — v17: push notifications on the student side (registers this phone / browser). */
/* Push needs an account (like email): the server has to know who the device belongs to.            */
/* Nothing is asked of the student until they tick "Push notification" in Notification settings.    */

(function () {
  'use strict';

  var SB = window.__ahSupabase;
  /* The PUBLIC key only. It is meant to be public; the private half lives in Supabase and nowhere else. */
  var PUBLIC_KEY = 'BDZ-AAFo0aEJrlYQXC3Xdq2Ci1ZMzN4nxCtAsoIxdWgPn8ZKE0c8fsiBlJa87O2pQC3_hPOqyqHuKp_JjTO7H8I';

  /* ------------------------------------------------------------------ helpers */
  function supported() {
    return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window);
  }
  function isIos() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  function isStandalone() {
    try {
      return window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    } catch (e) { return false; }
  }
  function b64ToU8(b64) {
    var pad = '='.repeat((4 - (b64.length % 4)) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  async function getRegistration() {
    var reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    return reg;
  }

  async function saveToAccount(sub) {
    var j = sub.toJSON();
    if (!j || !j.endpoint || !j.keys) throw new Error('This device gave an incomplete push address.');
    var r = await SB.rpc('save_push_subscription', {
      p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth,
      p_user_agent: navigator.userAgent
    });
    if (r.error) throw new Error(r.error.message);
  }

  /* ------------------------------------------------------- turning it on / off */
  /* returns { ok:true } or { ok:false, why:'signin'|'ios-install'|'unsupported'|'denied'|'server', msg } */
  async function enable() {
    if (!window.__ahStudent || !SB) return { ok: false, why: 'signin' };
    if (!supported()) return { ok: false, why: (isIos() && !isStandalone()) ? 'ios-install' : 'unsupported' };
    if (isIos() && !isStandalone()) return { ok: false, why: 'ios-install' };

    var perm = Notification.permission;
    if (perm === 'denied') return { ok: false, why: 'denied' };
    if (perm !== 'granted') perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, why: 'denied' };

    try {
      var reg = await getRegistration();
      var sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(PUBLIC_KEY) });
      }
      try { await saveToAccount(sub); }
      catch (e) {
        /* an old address made with a different key can't be reused: start fresh once */
        try { await sub.unsubscribe(); } catch (x) {}
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(PUBLIC_KEY) });
        await saveToAccount(sub);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, why: 'server', msg: String((e && e.message) || e).slice(0, 140) };
    }
  }

  async function disable() {
    try {
      if (!supported()) return;
      var reg = await navigator.serviceWorker.getRegistration();
      var sub = reg && await reg.pushManager.getSubscription();
      if (sub) {
        var ep = sub.endpoint;
        try { await sub.unsubscribe(); } catch (e) {}
        if (window.__ahStudent && SB) { try { await SB.rpc('delete_push_subscription', { p_endpoint: ep }); } catch (e) {} }
      }
    } catch (e) {}
  }

  async function thisDeviceOn() {
    try {
      if (!supported() || Notification.permission !== 'granted') return false;
      var reg = await navigator.serviceWorker.getRegistration();
      return !!(reg && await reg.pushManager.getSubscription());
    } catch (e) { return false; }
  }

  window.__ahPush = { supported: supported, enable: enable, disable: disable, thisDeviceOn: thisDeviceOn };

  /* --------------------------------------------- the line under the tick box */
  var MSG = {
    signin:      'Push needs an account, so the site knows which phone is yours. Sign in first (person icon at the top), then tick this again.',
    'ios-install': 'On iPhone, push only works from the home-screen icon. Follow the steps below, open the site from that icon, then tick this again.',
    unsupported: 'This browser can\u2019t receive push notifications. Try Chrome on a computer or an Android phone.',
    denied:      'Notifications are blocked for this site. Allow them in your browser\u2019s site settings, then tick this again.',
    server:      'Couldn\u2019t finish setting up push. Try again in a moment.'
  };

  function statusEl() {
    var box = document.getElementById('nt-push');
    if (!box) return null;
    var el = document.getElementById('nt-push-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'nt-push-status';
      el.className = 'ah-nt-hint';
      el.style.cssText = 'margin:2px 0 8px 30px; display:none;';
      var row = box.closest('label') || box.parentNode;
      row.parentNode.insertBefore(el, row.nextSibling);
    }
    return el;
  }
  function say(text, good) {
    var el = statusEl();
    if (!el) return;
    if (!text) { el.style.display = 'none'; el.textContent = ''; return; }
    el.style.display = 'block';
    el.style.color = good ? '#00c853' : '#ffb347';
    el.textContent = text;
  }
  function untick(box) {
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));   // lets the settings screen hide its iPhone guide again
  }

  document.addEventListener('change', async function (e) {
    var box = e.target;
    if (!box || box.id !== 'nt-push' || !e.isTrusted) return;    // only real clicks, not the screen re-drawing itself
    if (!box.checked) { say(''); return; }

    say('Setting up\u2026', true);
    var r = await enable();
    if (r.ok) { say('Push is ready on this device. Press Save to finish.', true); return; }
    say(MSG[r.why] + (r.why === 'server' && r.msg ? ' (' + r.msg + ')' : ''), false);
    if (r.why !== 'ios-install') untick(box);                    // on iPhone the guide must stay visible
  });

  /* when the settings screen opens with Push already ticked, say whether THIS device is set up */
  var watching = false;
  function watchScreen() {
    if (watching) return;
    watching = true;
    new MutationObserver(async function () {
      var box = document.getElementById('nt-push');
      if (!box || document.getElementById('nt-push-status')) return;
      statusEl();
      if (box.checked) {
        var on = await thisDeviceOn();
        say(on ? 'Push is on for this device.'
               : 'Push is ticked, but this device isn\u2019t set up yet. Untick and tick it again to set it up.',
            on);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* signed in, permission already given, device already subscribed: make sure it belongs to THIS account
     (covers signing in as someone else on the same browser) */
  async function rebind() {
    try {
      if (!window.__ahStudent || !SB || !supported() || Notification.permission !== 'granted') return;
      var reg = await navigator.serviceWorker.getRegistration();
      var sub = reg && await reg.pushManager.getSubscription();
      if (sub) await saveToAccount(sub);
    } catch (e) {}
  }
  document.addEventListener('ah-student-changed', function (e) { if (e.detail) rebind(); });

  watchScreen();
})();
