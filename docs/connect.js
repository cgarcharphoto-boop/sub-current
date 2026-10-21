// Live connector to the real subcurrent-backend API.
//
// index.html is generated (see CLAUDE.md), so this file never reaches into its
// minified internals. It works from the outside only:
//   1. Listens (capture phase) for the app's own buttons, such as checkout "Pay"
//      and owner "Publish", reads the selection from the DOM, and makes the
//      matching real API call alongside the prototype's simulated flow.
//   2. Adds a "Live" panel with real accounts, real tickets with rotating
//      door codes, real door check-in, the owner dashboard, publishing, and
//      AI flyer reading.
// It survives regeneration of index.html and stays invisible if the API is down.
(function () {
  'use strict';

  var API_BASE = 'https://subcurrent-backend.vercel.app';
  try { API_BASE = localStorage.getItem('sc_api') || API_BASE; } catch (e) {}

  // App event id -> backend slug, and app tier id -> backend tier name.
  var EVENT_SLUG = { frost: 'ReturnalNights-Oct23', thin: 'ReturnalNights-Oct24', white: 'HallowCurrentAfters', alt: 'UndertowAfters' };
  var TIER_NAME = { early: 'Early bird', ga: 'General admission', vip: 'VIP' };

  // ---------- storage ----------
  function load(k) { try { return JSON.parse(localStorage.getItem('sc_' + k) || 'null'); } catch (e) { return null; } }
  function save(k, v) { try { v == null ? localStorage.removeItem('sc_' + k) : localStorage.setItem('sc_' + k, JSON.stringify(v)); } catch (e) {} }
  var fan = load('fan');     // { token, name, email, demo }
  var owner = load('owner'); // { token, name, role }

  // ---------- api ----------
  function api(path, opts, token) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(API_BASE + path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            var err = new Error(data.error || ('Request failed (' + res.status + ')'));
            err.status = res.status;
            throw err;
          }
          return data;
        });
      });
  }

  function demoFan() {
    return api('/auth/fan/demo', { method: 'POST' }).then(function (d) {
      fan = { token: d.token, name: d.fan.name, email: d.fan.email, demo: true };
      save('fan', fan);
      return fan;
    });
  }
  function ensureFan() { return fan ? Promise.resolve(fan) : demoFan(); }

  // Fan call with one recovery: the demo backend's database resets on cold
  // start, which invalidates stored demo identities. Re-issue and retry once.
  function fanApi(path, opts) {
    return ensureFan().then(function (f) {
      return api(path, opts, f.token).catch(function (e) {
        if (f.demo && (e.status === 401 || e.status === 500)) {
          return demoFan().then(function (f2) { return api(path, opts, f2.token); });
        }
        if (!f.demo && e.status === 500) {
          throw new Error('The demo server restarted and cleared accounts. Sign up again.');
        }
        throw e;
      });
    });
  }
  function ownerApi(path, opts) {
    if (!owner) return Promise.reject(new Error('Sign in as owner first.'));
    return api(path, opts, owner.token).catch(function (e) {
      if (e.status === 401 || e.status === 403) { owner = null; save('owner', null); render(); }
      throw e;
    });
  }

  var eventCache = {};
  function getEvent(slug) {
    if (eventCache[slug]) return Promise.resolve(eventCache[slug]);
    return api('/events/' + encodeURIComponent(slug)).then(function (ev) { eventCache[slug] = ev; return ev; });
  }

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function money(c) { return '$' + (c / 100).toFixed(c % 100 ? 2 : 0); }
  function when(d) { try { return new Date(d).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
  function $(sel, root) { return (root || document).querySelector(sel); }

  var toastTimer;
  function toast(msg, bad) {
    var t = $('#sc-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'on' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, 4200);
  }

  // ---------- styles ----------
  function injectStyles() {
    var s = document.createElement('style');
    s.textContent = [
      '#sc-pill{position:fixed;left:14px;bottom:14px;z-index:9998;font:600 12px/1 -apple-system,system-ui,sans-serif;background:#15101F;color:#EEE8FF;border:1px solid rgba(238,232,255,.26);border-radius:999px;padding:9px 14px;display:flex;align-items:center;gap:7px;box-shadow:0 8px 24px rgba(0,0,0,.45);cursor:pointer}',
      '#sc-pill .dot{width:7px;height:7px;border-radius:50%;background:#4CC48D;box-shadow:0 0 8px #4CC48D}',
      '#sc-panel{position:fixed;left:14px;bottom:58px;z-index:9999;width:min(380px,calc(100vw - 28px));max-height:min(620px,calc(100vh - 90px));overflow:auto;background:#0D0A14;color:#EEE8FF;border:1px solid rgba(238,232,255,.26);border-radius:16px;box-shadow:0 18px 48px rgba(0,0,0,.6);font:14px/1.45 -apple-system,system-ui,sans-serif;display:none}',
      '#sc-panel.on{display:block}',
      '#sc-panel header{position:sticky;top:0;background:#0D0A14;padding:14px 16px 0;border-bottom:1px solid rgba(238,232,255,.12)}',
      '#sc-panel h2{font-size:15px;margin:0 0 10px;display:flex;align-items:center;gap:8px}',
      '#sc-panel h2 .x{margin-left:auto;background:none;border:0;color:#C4B5E6;font-size:20px;cursor:pointer;line-height:1}',
      '#sc-tabs{display:flex;gap:4px}',
      '#sc-tabs button{flex:1;background:none;border:0;border-bottom:2px solid transparent;color:#8C7FB3;padding:8px 0 10px;font:600 13px -apple-system,system-ui,sans-serif;cursor:pointer}',
      '#sc-tabs button[aria-selected=true]{color:#EEE8FF;border-bottom-color:#C99BFF}',
      '#sc-body{padding:14px 16px 18px}',
      '#sc-body h3{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#8C7FB3;margin:16px 0 8px}',
      '#sc-body h3:first-child{margin-top:0}',
      '#sc-body p{margin:0 0 8px;color:#C4B5E6}',
      '#sc-body .muted{color:#8C7FB3;font-size:12px}',
      '#sc-body input,#sc-body select{width:100%;box-sizing:border-box;background:#15101F;color:#EEE8FF;border:1px solid rgba(238,232,255,.26);border-radius:10px;padding:9px 10px;font:14px -apple-system,system-ui,sans-serif;margin:0 0 8px}',
      '#sc-body .row{display:flex;gap:8px}',
      '#sc-body .row>*{flex:1}',
      '#sc-body button.b{background:#C99BFF;color:#040307;border:0;border-radius:10px;padding:9px 12px;font:700 13px -apple-system,system-ui,sans-serif;cursor:pointer;width:100%;margin:0 0 8px}',
      '#sc-body button.g{background:none;color:#EEE8FF;border:1px solid rgba(238,232,255,.26)}',
      '#sc-body button:disabled{opacity:.5;cursor:default}',
      '#sc-body .card{background:#15101F;border:1px solid rgba(238,232,255,.12);border-radius:12px;padding:12px;margin:0 0 8px}',
      '#sc-body .code{font:700 26px/1.1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.12em;color:#C99BFF;margin:6px 0}',
      '#sc-body .bar{height:3px;background:rgba(238,232,255,.12);border-radius:2px;overflow:hidden}',
      '#sc-body .bar i{display:block;height:100%;background:#C99BFF;transition:width 1s linear}',
      '#sc-body .kv{display:flex;justify-content:space-between;gap:8px;padding:5px 0;border-bottom:1px solid rgba(238,232,255,.08)}',
      '#sc-body .ok{color:#4CC48D}#sc-body .bad{color:#FF6B85}#sc-body .warn{color:#F2C94B}',
      '#sc-body .result{font-weight:700;font-size:16px;padding:10px;border-radius:10px;text-align:center;margin:0 0 8px}',
      '#sc-body .result.ok{background:rgba(76,196,141,.14)}#sc-body .result.bad{background:rgba(255,107,133,.14)}#sc-body .result.warn{background:rgba(242,201,75,.14)}',
      '#sc-body .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 0 8px}',
      '#sc-body .stats div{background:#15101F;border-radius:10px;padding:10px;text-align:center}',
      '#sc-body .stats b{display:block;font-size:20px}',
      '#sc-body pre{white-space:pre-wrap;background:#15101F;border-radius:10px;padding:10px;font:12px ui-monospace,monospace;color:#C4B5E6}',
      '#sc-toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);z-index:10000;background:#15101F;color:#EEE8FF;border:1px solid #4CC48D;border-radius:12px;padding:10px 14px;font:600 13px -apple-system,system-ui,sans-serif;opacity:0;pointer-events:none;transition:.25s;max-width:calc(100vw - 40px)}',
      '#sc-toast.on{opacity:1;transform:translate(-50%,0)}#sc-toast.bad{border-color:#FF6B85}'
    ].join('');
    document.head.appendChild(s);
  }

  // ---------- panel ----------
  var tab = load('tab') || 'tickets';
  var health = null;
  var codeTimer = null;
  var lastScan = null;
  var flyerResult = null;

  function mount() {
    injectStyles();
    var pill = document.createElement('button');
    pill.id = 'sc-pill';
    pill.innerHTML = '<span class="dot"></span><span>Live</span>';
    pill.setAttribute('aria-expanded', 'false');
    pill.onclick = function () { togglePanel(); };
    var panel = document.createElement('div');
    panel.id = 'sc-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Live backend');
    var t = document.createElement('div');
    t.id = 'sc-toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(panel);
    document.body.appendChild(pill);
    document.body.appendChild(t);
    panel.addEventListener('click', onPanelClick);
  }

  function togglePanel(force) {
    var p = $('#sc-panel');
    var on = force != null ? force : !p.classList.contains('on');
    p.classList.toggle('on', on);
    $('#sc-pill').setAttribute('aria-expanded', String(on));
    if (on) render(); else stopCodes();
  }

  function render() {
    var p = $('#sc-panel');
    if (!p || !p.classList.contains('on')) return;
    stopCodes();
    var tabs = [['tickets', 'Tickets'], ['door', 'Door'], ['owner', 'Owner'], ['status', 'Status']];
    p.innerHTML = '<header><h2><span style="width:8px;height:8px;border-radius:50%;background:#4CC48D;display:inline-block"></span>Live backend<button class="x" data-sc="close" aria-label="Close">×</button></h2>' +
      '<div id="sc-tabs" role="tablist">' + tabs.map(function (t) {
        return '<button role="tab" data-sc="tab" data-v="' + t[0] + '" aria-selected="' + (tab === t[0]) + '">' + t[1] + '</button>';
      }).join('') + '</div></header><div id="sc-body">Loading…</div>';
    ({ tickets: renderTickets, door: renderDoor, owner: renderOwner, status: renderStatus })[tab]();
  }
  function body(html) { var b = $('#sc-body'); if (b) b.innerHTML = html; }

  // ----- Tickets tab -----
  function accountBlock() {
    if (fan && !fan.demo) {
      return '<h3>Account</h3><div class="card"><div class="kv"><span>' + esc(fan.name) + '</span><span class="muted">' + esc(fan.email) + '</span></div></div>' +
        '<button class="b g" data-sc="fan-logout">Sign out</button>';
    }
    return '<h3>Account</h3><p class="muted">' + (fan ? 'Using the demo fan, Alex R. ' : '') + 'Sign in or create a real account. Purchases are saved to it.</p>' +
      '<input id="sc-f-name" placeholder="Name (sign up only)" autocomplete="name">' +
      '<input id="sc-f-email" type="email" placeholder="Email" autocomplete="email">' +
      '<input id="sc-f-pass" type="password" placeholder="Password, 8+ characters" autocomplete="current-password">' +
      '<div class="row"><button class="b" data-sc="fan-login">Sign in</button><button class="b g" data-sc="fan-signup">Sign up</button></div>';
  }

  function renderTickets() {
    body('<h3>Buy a real ticket</h3><div id="sc-buy">Loading shows…</div><h3>My tickets</h3><div id="sc-mine">Loading…</div>' +
      '<h3>Notifications</h3><button class="b g" data-sc="push">Enable real push on this device</button>' + accountBlock());
    api('/events').then(function (events) {
      var el = $('#sc-buy');
      if (!el) return;
      var opts = events.filter(function (e) { return e.slug !== 'ReTurnalNights'; });
      if (!opts.length) opts = events;
      el.innerHTML = '<select id="sc-ev">' + opts.map(function (e) { return '<option value="' + esc(e.slug) + '">' + esc(e.title) + '</option>'; }).join('') + '</select>' +
        '<div class="row"><select id="sc-tier"></select><select id="sc-qty" style="flex:.4">' + [1, 2, 3, 4].map(function (n) { return '<option>' + n + '</option>'; }).join('') + '</select></div>' +
        '<button class="b" data-sc="buy">Buy</button><p class="muted">' + (health && health.integrations.payments ? 'Charges a real card through Stripe.' : 'Payments are in test mode. No card is charged.') + '</p>';
      opts.forEach(function (e) { eventCache[e.slug] = e; });
      fillTiers();
      $('#sc-ev').onchange = fillTiers;
    }).catch(function (e) { var el = $('#sc-buy'); if (el) el.innerHTML = '<p class="bad">' + esc(e.message) + '</p>'; });
    loadMine();
  }
  function fillTiers() {
    var ev = eventCache[$('#sc-ev').value];
    $('#sc-tier').innerHTML = ev.tiers.map(function (t) {
      var open = t.salesOpen && t.remaining > 0;
      return '<option value="' + esc(t.id) + '"' + (open ? '' : ' disabled') + '>' + esc(t.name) + ' ' + money(t.priceCents) + (open ? ' · ' + t.remaining + ' left' : ' · sold out') + '</option>';
    }).join('');
    var firstOpen = ev.tiers.filter(function (t) { return t.salesOpen && t.remaining > 0; })[0];
    if (firstOpen) $('#sc-tier').value = firstOpen.id;
  }

  var myTickets = [];
  function loadMine() {
    fanApi('/tickets/mine').then(function (list) {
      myTickets = list;
      var el = $('#sc-mine');
      if (!el) return;
      if (!list.length) { el.innerHTML = '<p class="muted">No real tickets yet. Buy one here or check out in the app.</p>'; return; }
      el.innerHTML = list.map(function (t) {
        return '<div class="card"><div class="kv"><b>' + esc(t.event.title) + '</b><span class="muted">' + esc(when(t.event.startAt)) + '</span></div>' +
          '<div class="kv"><span>' + esc(t.tierName) + ' · ' + esc(t.holderName) + '</span>' + (t.checkedInAt ? '<span class="ok">Checked in</span>' : '<span class="muted">Not scanned</span>') + '</div>' +
          '<div class="code" data-code="' + esc(t.id) + '">' + esc(t.liveCode) + '</div><div class="bar"><i data-bar="' + esc(t.id) + '" style="width:100%"></i></div>' +
          '<p class="muted" style="margin-top:6px">Door code changes every 10 seconds.</p>' +
          '<button class="b g" data-sc="copypass" data-v="' + esc(t.id) + '">Copy door pass</button></div>';
      }).join('');
      startCodes();
    }).catch(function (e) { var el = $('#sc-mine'); if (el) el.innerHTML = '<p class="bad">' + esc(e.message) + '</p>'; });
  }
  function startCodes() {
    stopCodes();
    var left = 10;
    codeTimer = setInterval(function () {
      left--;
      document.querySelectorAll('[data-bar]').forEach(function (b) { b.style.width = (left * 10) + '%'; });
      if (left > 0) return;
      left = 10;
      myTickets.forEach(function (t) {
        fanApi('/tickets/' + encodeURIComponent(t.id) + '/code').then(function (d) {
          t.liveCode = d.code;
          var el = document.querySelector('[data-code="' + t.id + '"]');
          if (el) el.textContent = d.code;
        }).catch(function () {});
      });
    }, 1000);
  }
  function stopCodes() { if (codeTimer) clearInterval(codeTimer); codeTimer = null; }

  function buy(slug, tierId, qty, source) {
    return ensureFan().then(function (f) {
      return getEvent(slug).then(function (ev) {
        return fanApi('/tickets/purchase', { method: 'POST', body: { eventId: ev.id, tierId: tierId, qty: qty, holderName: fan.name || f.name } })
          .then(function (r) {
            delete eventCache[slug];
            toast('Real ' + (qty > 1 ? qty + ' tickets' : 'ticket') + ' issued' + (r.mockPayment ? ' (test payment)' : '') + '. Open Live to see the door code.');
            if (source !== 'app') render();
            return r;
          });
      });
    }).catch(function (e) { toast('Real purchase failed: ' + e.message, true); });
  }

  // ----- Door tab -----
  function renderDoor() {
    if (!owner) { body('<p>Door check-in needs a staff or owner sign-in.</p>' + ownerLoginForm()); return; }
    body('<h3>Check in a ticket</h3><select id="sc-d-ev"><option>Loading…</option></select>' +
      '<input id="sc-d-pass" placeholder="Paste door pass, or ticket ID:code" autocomplete="off">' +
      '<button class="b" data-sc="scan">Check in</button><button class="b g" data-sc="scanmine">Use my newest ticket</button>' +
      '<div id="sc-d-res">' + (lastScan ? scanHtml(lastScan) : '') + '</div>');
    ownerApi('/owner/events').then(function (events) {
      var sel = $('#sc-d-ev');
      if (!sel) return;
      sel.innerHTML = events.filter(function (e) { return e.status !== 'draft'; }).map(function (e) {
        return '<option value="' + esc(e.id) + '" data-slug="' + esc(e.slug) + '">' + esc(e.title) + '</option>';
      }).join('');
    }).catch(function (e) { toast(e.message, true); });
  }
  function scanHtml(r) {
    var map = {
      valid: ['ok', 'Valid. Let them in.'],
      already_used: ['warn', 'Already checked in'],
      wrong_event: ['bad', 'Ticket is for a different show'],
      invalid_code: ['bad', 'Invalid or expired code']
    };
    var m = map[r.result] || ['bad', r.result];
    return '<div class="result ' + m[0] + '">' + m[1] + '</div>' +
      (r.holderName ? '<div class="kv"><span>' + esc(r.holderName) + '</span><span>' + esc(r.tierName) + '</span></div>' : '') +
      (r.checkedInAt ? '<p class="muted">First scanned ' + esc(when(r.checkedInAt)) + '</p>' : '');
  }
  function doScan(pass) {
    var parts = String(pass || '').trim().split(':');
    if (parts.length !== 2 || parts[1].length !== 8) { toast('Door pass should look like ticketId:12345678', true); return; }
    var evId = $('#sc-d-ev').value;
    ownerApi('/owner/scan', { method: 'POST', body: { ticketId: parts[0], code: parts[1], eventId: evId } })
      .then(function (r) { lastScan = r; })
      .catch(function (e) { lastScan = e.status === 404 ? { result: 'invalid_code' } : null; if (!lastScan) toast(e.message, true); })
      .then(function () {
        var el = $('#sc-d-res'); if (el && lastScan) el.innerHTML = scanHtml(lastScan);
        try { navigator.vibrate && navigator.vibrate(lastScan && lastScan.result === 'valid' ? 40 : [60, 40, 60]); } catch (e) {}
      });
  }

  // ----- Owner tab -----
  function ownerLoginForm() {
    return '<h3>Owner sign-in</h3><input id="sc-o-email" type="email" placeholder="Owner email" autocomplete="username">' +
      '<input id="sc-o-pass" type="password" placeholder="Password" autocomplete="current-password">' +
      '<button class="b" data-sc="owner-login">Sign in</button>';
  }
  function renderOwner() {
    if (!owner) { body('<p>Sign in to see real sales, publish shows, and read flyers.</p>' + ownerLoginForm()); return; }
    body('<div class="kv"><span>Signed in as <b>' + esc(owner.name) + '</b></span><span class="muted">' + esc(owner.role) + '</span></div>' +
      '<h3>Dashboard</h3><div class="stats" id="sc-o-stats"><div><b>–</b>Fans</div><div><b>–</b>Shows live</div><div><b>–</b>Check-ins</div></div>' +
      '<h3>Shows</h3><div id="sc-o-events">Loading…</div>' +
      '<h3>Read a flyer</h3><p class="muted">' + (health && health.integrations.flyerAi ? 'Claude reads the flyer and fills in the show details.' : 'AI flyer reading is in sample mode until an Anthropic key is added.') + '</p>' +
      '<input id="sc-o-flyer" type="file" accept="image/*"><div id="sc-o-flyerres">' + (flyerResult ? '<pre>' + esc(JSON.stringify(flyerResult, null, 2)) + '</pre>' : '') + '</div>' +
      '<button class="b g" data-sc="owner-logout" style="margin-top:8px">Sign out</button>');
    ownerApi('/owner/dashboard').then(function (d) {
      var el = $('#sc-o-stats');
      if (el) el.innerHTML = '<div><b>' + d.fanCount + '</b>Fans</div><div><b>' + d.upcomingEvents + '</b>Shows live</div><div><b>' + d.totalCheckIns + '</b>Check-ins</div>';
    }).catch(function () {});
    loadOwnerEvents();
    var f = $('#sc-o-flyer');
    if (f) f.onchange = function () { readFlyer(f.files[0]); };
  }
  function loadOwnerEvents() {
    ownerApi('/owner/events').then(function (events) {
      var el = $('#sc-o-events');
      if (!el) return;
      el.innerHTML = events.map(function (e) {
        var sold = e.tiers.reduce(function (n, t) { return n + t.sold; }, 0);
        var cap = e.tiers.reduce(function (n, t) { return n + t.capacity; }, 0);
        var gross = e.tiers.reduce(function (n, t) { return n + t.sold * t.priceCents; }, 0);
        return '<div class="card"><div class="kv"><b>' + esc(e.title) + '</b><span class="' + (e.status === 'draft' ? 'warn' : 'ok') + '">' + esc(e.status.replace('_', ' ')) + '</span></div>' +
          '<div class="kv"><span>' + sold + ' / ' + cap + ' sold</span><span>' + money(gross) + ' gross</span></div>' +
          (e.status === 'draft' ? '<button class="b" style="margin-top:8px" data-sc="publish" data-v="' + esc(e.id) + '">Publish and notify all fans</button>' : '') + '</div>';
      }).join('');
    }).catch(function (e) { var el = $('#sc-o-events'); if (el) el.innerHTML = '<p class="bad">' + esc(e.message) + '</p>'; });
  }
  function publish(id) {
    return ownerApi('/owner/events/' + encodeURIComponent(id) + '/publish', { method: 'POST' }).then(function (r) {
      var sent = r.push && (r.push.sent != null ? r.push.sent : r.push.delivered);
      toast('Published ' + r.event.title + (sent != null ? '. Real push sent to ' + sent + ' device' + (sent === 1 ? '' : 's') + '.' : '.'));
      render();
    }).catch(function (e) { toast('Publish failed: ' + e.message, true); });
  }
  function readFlyer(file) {
    if (!file) return;
    var res = $('#sc-o-flyerres');
    if (res) res.innerHTML = '<p class="muted">Reading…</p>';
    var r = new FileReader();
    r.onload = function () {
      var data = String(r.result);
      var m = data.match(/^data:([^;]+);base64,(.*)$/);
      if (!m) { toast('Could not read that file', true); return; }
      ownerApi('/owner/flyer-read', { method: 'POST', body: { imageBase64: m[2], mediaType: m[1] } })
        .then(function (d) { flyerResult = d; var el = $('#sc-o-flyerres'); if (el) el.innerHTML = '<pre>' + esc(JSON.stringify(d, null, 2)) + '</pre>'; })
        .catch(function (e) { toast('Flyer read failed: ' + e.message, true); var el = $('#sc-o-flyerres'); if (el) el.innerHTML = ''; });
    };
    r.readAsDataURL(file);
  }

  // ----- Status tab -----
  function renderStatus() {
    var rows = [['Accounts and sign-in', true], ['Tickets and inventory', true], ['Rotating door codes', true], ['Door check-in', true],
      ['Push notifications', health && health.integrations.push], ['Card payments (Stripe)', health && health.integrations.payments],
      ['Text messages (Twilio)', health && health.integrations.sms], ['AI flyer reading', health && health.integrations.flyerAi]];
    body('<h3>What is real right now</h3>' + rows.map(function (r) {
      return '<div class="kv"><span>' + r[0] + '</span><span class="' + (r[1] ? 'ok' : 'warn') + '">' + (r[1] ? 'Live' : 'Test mode') + '</span></div>';
    }).join('') +
      '<h3>Demo data</h3><p class="muted">This demo server keeps its data in temporary storage. Tickets and accounts reset when it restarts after sitting idle.</p>' +
      '<p class="muted">API: ' + esc(API_BASE) + '</p>');
  }

  // ---------- push ----------
  function urlBase64ToUint8Array(base64) {
    var pad = '='.repeat((4 - (base64.length % 4)) % 4);
    var raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(Array.prototype.map.call(raw, function (c) { return c.charCodeAt(0); }));
  }
  function enablePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { toast('This browser does not support push. On iPhone, add the app to your Home Screen first.', true); return; }
    Notification.requestPermission()
      .then(function (perm) { if (perm !== 'granted') throw new Error('Notifications permission was not granted'); return api('/push/vapid-public-key'); })
      .then(function (k) { return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(k.key) }); }); })
      .then(function (sub) { var j = sub.toJSON(); return fanApi('/push/subscribe', { method: 'POST', body: { endpoint: j.endpoint, keys: j.keys } }); })
      .then(function () { return fanApi('/push/demo-notify', { method: 'POST', body: { title: 'Subcurrent', body: 'Real push is on for this device.', url: './' } }); })
      .then(function () { toast('Real push enabled. A test notification is on its way.'); })
      .catch(function (e) { toast('Could not enable push: ' + e.message, true); });
  }

  // ---------- panel clicks ----------
  function val(id) { var el = $('#' + id); return el ? el.value.trim() : ''; }
  function onPanelClick(e) {
    var b = e.target.closest('[data-sc]');
    if (!b) return;
    var act = b.getAttribute('data-sc'), v = b.getAttribute('data-v');
    if (act === 'close') return togglePanel(false);
    if (act === 'tab') { tab = v; save('tab', tab); return render(); }
    if (act === 'push') return enablePush();
    if (act === 'buy') {
      b.disabled = true;
      return buy($('#sc-ev').value, $('#sc-tier').value, Number($('#sc-qty').value), 'panel').then(function () { b.disabled = false; });
    }
    if (act === 'copypass') {
      var t = myTickets.filter(function (x) { return x.id === v; })[0];
      if (!t) return;
      var pass = t.id + ':' + t.liveCode;
      try { navigator.clipboard.writeText(pass); toast('Door pass copied. It works for about 10 seconds.'); } catch (err) { toast(pass); }
      return;
    }
    if (act === 'fan-login' || act === 'fan-signup') {
      var signup = act === 'fan-signup';
      var payload = { email: val('sc-f-email'), password: $('#sc-f-pass').value };
      if (signup) payload.name = val('sc-f-name');
      if (signup && !payload.name) return toast('Add your name to sign up.', true);
      b.disabled = true;
      return api(signup ? '/auth/fan/signup' : '/auth/fan/login', { method: 'POST', body: payload })
        .then(function (d) { fan = { token: d.token, name: d.fan.name, email: d.fan.email, demo: false }; save('fan', fan); toast((signup ? 'Account created. ' : '') + 'Signed in as ' + d.fan.name + '.'); render(); })
        .catch(function (err) { b.disabled = false; toast(err.status === 400 ? 'Check the email, and use a password of 8 or more characters.' : err.message, true); });
    }
    if (act === 'fan-logout') { fan = null; save('fan', null); toast('Signed out. Back to the demo fan.'); return render(); }
    if (act === 'owner-login') {
      b.disabled = true;
      return api('/auth/owner/login', { method: 'POST', body: { email: val('sc-o-email'), password: $('#sc-o-pass').value } })
        .then(function (d) { owner = { token: d.token, name: d.owner.name, role: d.owner.role }; save('owner', owner); toast('Signed in as ' + d.owner.name + '.'); render(); })
        .catch(function (err) { b.disabled = false; toast(err.status === 400 ? 'Enter an email and password.' : err.message, true); });
    }
    if (act === 'owner-logout') { owner = null; save('owner', null); return render(); }
    if (act === 'scan') return doScan(val('sc-d-pass'));
    if (act === 'scanmine') {
      return fanApi('/tickets/mine').then(function (list) {
        if (!list.length) { toast('Your fan account has no real tickets yet.', true); return; }
        var t = list[0];
        var sel = $('#sc-d-ev');
        var slug = t.event.slug;
        Array.prototype.forEach.call(sel.options, function (o) { if (o.getAttribute('data-slug') === slug) sel.value = o.value; });
        $('#sc-d-pass').value = t.id + ':' + t.liveCode;
        doScan(t.id + ':' + t.liveCode);
      }).catch(function (err) { toast(err.message, true); });
    }
    if (act === 'publish') { b.disabled = true; return publish(v); }
  }

  // ---------- hooks into the app's own buttons ----------
  // Capture phase, so we read the selection before the app re-renders.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-act]');
    if (!b || !health) return;
    var act = b.getAttribute('data-act');

    if (act === 'pay') {
      var slug = EVENT_SLUG[b.getAttribute('data-v')];
      // The checkout sheet's first line reads "2 \u00d7 General admission".
      var sheet = b.closest('#sheet') || document;
      var line = sheet.querySelector('.rows > div > span');
      var m = line && line.textContent.match(/^\s*(\d+)\s*\u00d7\s*(.+?)\s*$/);
      var qty = m ? Math.max(1, Math.min(8, parseInt(m[1], 10))) : 1;
      var tierName = m && m[2];
      if (!slug || !tierName) return;
      getEvent(slug).then(function (ev) {
        var tier = ev.tiers.filter(function (t) { return t.name === tierName; })[0];
        if (!tier) throw new Error('That ticket type is not on the server');
        return buy(slug, tier.id, qty, 'app');
      }).catch(function (err) { toast('Real purchase failed: ' + err.message, true); });
    }

    // Owner portal "Publish": if an owner is signed in, publish the real draft
    // too, which sends a real push to every subscribed fan.
    if (act === 'publish' && owner) {
      ownerApi('/owner/events').then(function (events) {
        var draft = events.filter(function (x) { return x.slug === EVENT_SLUG.alt && x.status === 'draft'; })[0];
        if (draft) return publish(draft.id);
      }).catch(function () {});
    }

    // "My tickets" in the app: nudge toward the real ones.
    if (act === 'viewtickets' || (act === 'tab' && b.getAttribute('data-v') === 'tickets')) {
      fanApi('/tickets/mine').then(function (list) {
        if (list.length) toast('You have ' + list.length + ' real ticket' + (list.length === 1 ? '' : 's') + ' with live door codes. Tap Live to see them.');
      }).catch(function () {});
    }
  }, true);

  // Replace the app's simulated "N left" with real remaining counts whenever
  // the checkout sheet renders.
  function syncSheetInventory() {
    if (!health) return;
    var cta = document.querySelector('[data-act="checkout"][data-v]');
    var tiers = document.querySelectorAll('[data-act="tier"]');
    if (!cta || !tiers.length) return;
    var slug = EVENT_SLUG[cta.getAttribute('data-v')];
    if (!slug) return;
    getEvent(slug).then(function (ev) {
      tiers.forEach(function (btn) {
        var tier = ev.tiers.filter(function (t) { return t.name === TIER_NAME[btn.getAttribute('data-v')]; })[0];
        var sub = btn.querySelector('.t-sub');
        if (!tier || !sub || sub.getAttribute('data-sc-live') === String(tier.remaining)) return;
        var soldOut = !tier.salesOpen || tier.remaining <= 0;
        if (soldOut && sub.textContent === 'Sold out') return;
        sub.textContent = soldOut ? 'Sold out' : tier.remaining + ' left';
        sub.setAttribute('data-sc-live', String(tier.remaining));
      });
    }).catch(function () {});
  }

  // ---------- boot ----------
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, 6000);
  fetch(API_BASE + '/health', { signal: ctrl.signal })
    .then(function (r) { clearTimeout(timer); return r.ok ? r.json() : null; })
    .then(function (h) {
      if (!h) return;
      health = h;
      mount();
      new MutationObserver(function () { syncSheetInventory(); }).observe(document.body, { childList: true, subtree: true });
    })
    .catch(function () { /* backend unreachable: stay invisible, app runs as a pure prototype */ });
})();
