// Isolated connector to the real subcurrent-backend API. Deliberately kept
// separate from index.html (which is generated — see CLAUDE.md) so it
// survives regeneration: its own DOM, its own styles, no dependency on the
// app's internal state or minified identifiers. Safe to delete if a future
// regen wires this in natively.
(function () {
  'use strict';
  var API_BASE = 'https://subcurrent-backend.vercel.app';
  var fanToken = null;

  function api(path, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (fanToken) headers.Authorization = 'Bearer ' + fanToken;
    return fetch(API_BASE + path, Object.assign({}, opts, { headers: headers }))
      .then(function (res) {
        if (!res.ok) throw new Error('API ' + path + ' -> ' + res.status);
        return res.json();
      });
  }

  function urlBase64ToUint8Array(base64) {
    var pad = '='.repeat((4 - (base64.length % 4)) % 4);
    var raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(Array.prototype.map.call(raw, function (c) { return c.charCodeAt(0); }));
  }

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent =
      '#sc-connect{position:fixed;left:14px;bottom:14px;z-index:9999;font:600 12px/1 -apple-system,system-ui,sans-serif;' +
      'background:#140e2e;color:#f4eefc;border:1px solid rgba(244,238,252,.25);border-radius:999px;' +
      'padding:9px 14px;display:flex;align-items:center;gap:7px;box-shadow:0 8px 24px rgba(0,0,0,.35);cursor:pointer}' +
      '#sc-connect .dot{width:7px;height:7px;border-radius:50%;background:#4cc48d}' +
      '#sc-connect:disabled,#sc-connect.on{opacity:.75;cursor:default}';
    document.head.appendChild(s);
  }

  function mount() {
    injectStyles();
    var btn = document.createElement('button');
    btn.id = 'sc-connect';
    btn.innerHTML = '<span class="dot"></span><span>Enable real push</span>';
    btn.onclick = enablePush;
    document.body.appendChild(btn);
    return btn;
  }

  function enablePush() {
    var btn = document.getElementById('sc-connect');
    btn.disabled = true;
    (fanToken ? Promise.resolve() : api('/auth/fan/demo', { method: 'POST' }).then(function (d) { fanToken = d.token; }))
      .then(function () { return Notification.requestPermission(); })
      .then(function (perm) {
        if (perm !== 'granted') throw new Error('Permission not granted');
        return api('/push/vapid-public-key');
      })
      .then(function (k) { return navigator.serviceWorker.ready.then(function (reg) { return [reg, k.key]; }); })
      .then(function (pair) {
        return pair[0].pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(pair[1]) });
      })
      .then(function (sub) {
        var j = sub.toJSON();
        return api('/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }) });
      })
      .then(function () {
        btn.classList.add('on');
        btn.innerHTML = '<span class="dot"></span><span>Push enabled</span>';
      })
      .catch(function (e) {
        btn.disabled = false;
        btn.innerHTML = '<span class="dot"></span><span>Enable real push</span>';
        console.warn('subcurrent-backend connect failed:', e.message);
      });
  }

  var ctrl = new AbortController();
  var t = setTimeout(function () { ctrl.abort(); }, 1500);
  fetch(API_BASE + '/health', { signal: ctrl.signal })
    .then(function (r) { clearTimeout(t); if (r.ok) mount(); })
    .catch(function () { /* backend unreachable — stay invisible, no change to the app */ });
})();
