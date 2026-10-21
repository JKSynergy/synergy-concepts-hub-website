/* Synergy Capture Films quotation builder (/capture-films/quote/).
   Progressive enhancement: the simple enquiry form on the page keeps working
   if the price list cannot be loaded or JavaScript is off.
   Prices come from the portal (/api/quote/catalog). The browser sends only
   selections; the portal recalculates every amount and refuses a total the
   customer was not shown. UGX is the master price list; USD is an indicative
   conversion at the rate set by Synergy Capture Films. */
(function () {
  'use strict';

  var root = document.getElementById('qb');
  var section = document.getElementById('builder');
  if (!root || !section || !window.fetch) return;
  var API = (section.getAttribute('data-api') || '').replace(/\/+$/, '');
  if (!API) return;

  var STEPS = ['Event', 'Services', 'Extras', 'Event details', 'Your details', 'Review'];
  var DEEP_LINK = { weddings: 'wedding', introduction: 'kwanjula', kukyala: 'kukyala', events: 'other' };
  var startedAt = Date.now();

  var S = {
    step: 0, cat: null, version: 0, rate: null, usd: false,
    event: null, services: [], extras: {}, currency: 'UGX',
    d: { date_fixed: true, date: '', approx: '', venue: '', district: '', duration: '', notes: '' },
    where: '', upcountry: 'upcountry_client',
    c: { name: '', email: '', phone: '' },
    requestId: newId(), sending: false, done: null, errors: [], notice: ''
  };

  function newId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ugx(n) { return 'UGX ' + Math.round(n).toLocaleString('en-US'); }
  function toUsd(n) { return Math.round((n * 100) / S.rate) / 100; }
  function usd(n) { return 'USD ' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function money(n) { return S.currency === 'USD' && S.usd ? usd(toUsd(n)) : ugx(n); }
  function todayKampala() {
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kampala', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    } catch (e) { return new Date().toISOString().slice(0, 10); }
  }
  function eventObj() { return S.cat.events.filter(function (e) { return e.id === S.event; })[0]; }
  function availableExtras() {
    return S.cat.extras.filter(function (x) { return x.pricing[S.event] !== undefined; });
  }
  function requiresMet(x) {
    return !x.requires || x.requires.every(function (r) { return S.services.indexOf(r) > -1; });
  }
  function serviceLabel(id) {
    var s = S.cat.services.filter(function (x) { return x.id === id; })[0];
    return s ? s.label : id;
  }

  // Drop selections that are not valid for the current event/services (after a change or a reload).
  function prune() {
    if (!S.cat) return;
    if (S.event && !eventObj()) S.event = null;
    S.services = S.services.filter(function (id) {
      var s = S.cat.services.filter(function (x) { return x.id === id; })[0];
      return s && S.event && typeof s.prices[S.event] === 'number';
    });
    Object.keys(S.extras).forEach(function (id) {
      var x = S.cat.extras.filter(function (e) { return e.id === id; })[0];
      var st = x && S.event ? x.pricing[S.event] : null;
      if (!st || !requiresMet(x)) { delete S.extras[id]; return; }
      if (st.type === 'per_unit') {
        var q = S.extras[id];
        if (!(q >= st.min && q <= st.max)) S.extras[id] = st.min;
      } else { S.extras[id] = 1; }
    });
    if (!S.usd) S.currency = 'UGX';
  }

  // Same calculation as the portal (lib/quote/pricing.ts); the portal re-checks it.
  function quote() {
    var lines = [], special = [], total = 0;
    if (!S.cat || !S.event) return { lines: lines, special: special, total: 0 };
    S.services.forEach(function (id) {
      var s = S.cat.services.filter(function (x) { return x.id === id; })[0];
      var amt = s.prices[S.event];
      lines.push({ label: s.label, qty: '', unit: amt, total: amt });
      total += amt;
    });
    availableExtras().forEach(function (x) {
      if (S.extras[x.id] === undefined) return;
      var st = x.pricing[S.event];
      if (st.type === 'fixed') { lines.push({ label: x.label, qty: '', unit: st.amount, total: st.amount }); total += st.amount; }
      else if (st.type === 'per_unit') {
        var q = S.extras[x.id], t = st.amount * q;
        lines.push({ label: x.label, qty: q + ' ' + (x.unit || '') + (q === 1 ? '' : 's'), unit: st.amount, total: t }); total += t;
      } else special.push({ label: x.label, type: st.type });
    });
    return { lines: lines, special: special, total: total };
  }

  // ---------- validation per step ----------
  function validate(step) {
    var e = [];
    if (step === 0 && !S.event) e.push(['qb-event', 'Choose the type of event.']);
    if (step === 1 && !S.services.length) e.push(['qb-services', 'Choose photography, videography or both.']);
    if (step === 1 && S.currency === 'USD' && !S.usd) e.push(['qb-currency', 'USD is not available at the moment. Please choose UGX.']);
    if (step === 2) {
      availableExtras().forEach(function (x) {
        var st = x.pricing[S.event];
        if (S.extras[x.id] !== undefined && st.type === 'per_unit') {
          var q = S.extras[x.id];
          if (!(q >= st.min && q <= st.max && Math.floor(q) === q)) e.push(['qb-qty-' + x.id, 'Choose between ' + st.min + ' and ' + st.max + ' for ' + x.label + '.']);
        }
      });
    }
    if (step === 3) {
      if (S.d.date_fixed) {
        if (!S.d.date) e.push(['qb-date', 'Enter the event date, or choose "Not fixed yet".']);
        else if (S.d.date < todayKampala()) e.push(['qb-date', 'The event date cannot be in the past.']);
      }
      if (!S.d.venue.trim()) e.push(['qb-venue', 'Enter the venue.']);
      if (!S.d.district.trim()) e.push(['qb-district', 'Enter the district or town.']);
      if (!S.where) e.push(['qb-where-kampala', 'Tell us whether the event is in the Kampala service area.']);
    }
    if (step === 4) {
      if (!S.c.name.trim()) e.push(['qb-name', 'Enter your name.']);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(S.c.email.trim())) e.push(['qb-email', 'Enter a valid email address.']);
      var digits = S.c.phone.replace(/\D/g, '').length;
      if (!/^\+?[0-9 ()\-.]{7,40}$/.test(S.c.phone.trim()) || digits < 7 || digits > 15) e.push(['qb-phone', 'Enter a phone or WhatsApp number we can reach you on.']);
    }
    return e;
  }

  // ---------- rendering ----------
  function progress() {
    return '<ol class="qb-steps" aria-label="Quotation steps">' + STEPS.map(function (name, i) {
      var cur = i === S.step ? ' aria-current="step"' : '';
      var cls = i < S.step ? ' class="done"' : (i === S.step ? ' class="current"' : '');
      return '<li' + cls + cur + '><span class="n">' + (i + 1) + '</span> ' + esc(name) + '</li>';
    }).join('') + '</ol>';
  }

  function errorBox() {
    if (!S.errors.length) return '';
    return '<div class="qb-errors" role="alert" tabindex="-1" id="qb-errors"><p>Please check the following:</p><ul>' +
      S.errors.map(function (e) { return '<li><a href="#' + e[0] + '">' + esc(e[1]) + '</a></li>'; }).join('') + '</ul></div>';
  }

  function totalPanel() {
    var q = quote();
    var rows = q.lines.map(function (l) {
      return '<li><span>' + esc(l.label) + (l.qty ? ' <small>× ' + esc(l.qty) + '</small>' : '') + '</span><b>' + esc(money(l.total)) + '</b></li>';
    }).join('');
    var sp = q.special.map(function (s) {
      return '<li class="sq"><span>' + esc(s.label) + '</span><b>' + (s.type === 'special_quote' ? 'Special quotation' : 'Price on request') + '</b></li>';
    }).join('');
    return '<aside class="qb-total" aria-live="polite" aria-label="Running estimate"><p class="lbl">Your estimate</p>' +
      (rows || sp ? '<ul>' + rows + sp + '</ul>' : '<p class="small">Choose services to see an estimate.</p>') +
      '<p class="sum"><span>Estimate</span><b>' + esc(money(q.total)) + '</b></p>' +
      (S.currency === 'USD' && S.usd ? '<p class="small">' + esc(ugx(q.total)) + ' at ' + S.rate.toLocaleString('en-US') + ' UGX per USD. ' + esc(S.cat.notes.usd) + '</p>' : '') +
      (q.special.length ? '<p class="small">Items marked special quotation or on request are quoted separately and are not in the estimate.</p>' : '') +
      '<p class="small">Logistics, if any, are quoted separately.</p></aside>';
  }

  function radio(name, value, checked, label, hint, id, disabled) {
    return '<label class="qb-opt' + (disabled ? ' is-off' : '') + '"><input type="radio" name="' + name + '" value="' + esc(value) + '"' +
      (id ? ' id="' + id + '"' : '') + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span class="t">' + esc(label) + '</span>' +
      (hint ? '<span class="h">' + hint + '</span>' : '') + '</label>';
  }

  function stepEvent() {
    return '<fieldset class="qb-fs"><legend><h2 class="h3" tabindex="-1" id="qb-h">What are you planning?</h2></legend>' +
      S.cat.events.map(function (e, i) {
        return radio('event', e.id, S.event === e.id, e.label, '', i === 0 ? 'qb-event' : null);
      }).join('') + '</fieldset>';
  }

  function stepServices() {
    var ev = eventObj();
    var cur = '<fieldset class="qb-fs qb-cur"><legend class="lbl">Show prices in</legend>' +
      radio('currency', 'UGX', S.currency === 'UGX', 'UGX', '', 'qb-currency') +
      radio('currency', 'USD', S.currency === 'USD', 'USD', S.usd ? 'Indicative conversion' : 'Not available at the moment', null, !S.usd) +
      '</fieldset>';
    var svc = S.cat.services.filter(function (s) { return typeof s.prices[S.event] === 'number'; }).map(function (s, i) {
      var del = (s.deliverables[S.event] || []).map(function (d) { return '<li>' + esc(d) + '</li>'; }).join('');
      return '<label class="qb-opt qb-svc"><input type="checkbox" name="service" value="' + s.id + '"' + (i === 0 ? ' id="qb-services"' : '') +
        (S.services.indexOf(s.id) > -1 ? ' checked' : '') + '><span class="t">' + esc(s.label) + '</span><span class="p">' + esc(money(s.prices[S.event])) + '</span>' +
        (del ? '<ul class="h">' + del + '</ul>' : '') + '</label>';
    }).join('');
    return '<h2 class="h3" tabindex="-1" id="qb-h">' + esc(ev.label) + ': choose your services</h2>' + cur +
      '<fieldset class="qb-fs"><legend class="lbl">Standard services</legend>' + svc + '</fieldset>' +
      '<p class="small">Choose photography, videography or both.</p>';
  }

  function stepExtras() {
    var list = availableExtras().map(function (x) {
      var st = x.pricing[S.event], on = S.extras[x.id] !== undefined, ok = requiresMet(x);
      var price = st.type === 'fixed' ? money(st.amount) : st.type === 'per_unit' ? money(st.amount) + ' per ' + (x.unit || 'item') :
        st.type === 'special_quote' ? 'Special quotation' : 'Price on request';
      var hint = !ok ? esc('Needs ' + x.requires.map(serviceLabel).join(' and ').toLowerCase()) : (x.note ? esc(x.note) : '');
      var qty = st.type === 'per_unit' && on ? '<span class="qb-qty"><label for="qb-qty-' + x.id + '">Number of ' + esc(x.unit || 'items') + 's</label>' +
        '<input id="qb-qty-' + x.id + '" data-qty="' + x.id + '" type="number" inputmode="numeric" min="' + st.min + '" max="' + st.max + '" step="1" value="' + S.extras[x.id] + '"></span>' : '';
      return '<div class="qb-opt qb-extra' + (ok ? '' : ' is-off') + '"><label><input type="checkbox" name="extra" value="' + x.id + '"' +
        (on ? ' checked' : '') + (ok ? '' : ' disabled') + '><span class="t">' + esc(x.label) + '</span><span class="p' +
        (st.type === 'special_quote' || st.type === 'on_request' ? ' sq' : '') + '">' + esc(price) + '</span>' +
        (hint ? '<span class="h">' + hint + '</span>' : '') + '</label>' + qty + '</div>';
    }).join('');
    return '<h2 class="h3" tabindex="-1" id="qb-h">Would you like to add any extras?</h2>' +
      '<fieldset class="qb-fs"><legend class="lbl">Optional extras for ' + esc(eventObj().label) + '</legend>' + (list || '<p class="small">No extras for this event.</p>') + '</fieldset>';
  }

  function field(id, label, value, attrs, hint) {
    return '<div class="field"><label for="' + id + '">' + esc(label) + '</label><input id="' + id + '" value="' + esc(value) + '" ' + (attrs || '') + '>' +
      (hint ? '<span class="small">' + esc(hint) + '</span>' : '') + '</div>';
  }

  function stepDetails() {
    var lg = S.cat.logistics;
    var date = S.d.date_fixed
      ? field('qb-date', 'Event date', S.d.date, 'type="date" data-d="date" min="' + todayKampala() + '"')
      : field('qb-approx', 'Approximate month or timeframe (optional)', S.d.approx, 'type="text" data-d="approx" maxlength="100" placeholder="For example: March 2027"');
    var up = S.where === 'upcountry'
      ? '<fieldset class="qb-fs"><legend class="lbl">Transport and accommodation for our team</legend>' +
        radio('upcountry', 'upcountry_client', S.upcountry === 'upcountry_client', 'I will provide transport and accommodation', '') +
        radio('upcountry', 'upcountry_quote', S.upcountry === 'upcountry_quote', 'Please quote logistics separately', '') + '</fieldset>' : '';
    return '<h2 class="h3" tabindex="-1" id="qb-h">When and where is the event?</h2>' +
      '<fieldset class="qb-fs qb-cur"><legend class="lbl">Is the date fixed?</legend>' +
      radio('date_fixed', 'yes', S.d.date_fixed, 'Yes', '', 'qb-fixed-yes') + radio('date_fixed', 'no', !S.d.date_fixed, 'Not fixed yet', '') + '</fieldset>' +
      '<div class="two">' + date + field('qb-duration', 'Expected duration (optional)', S.d.duration, 'type="text" data-d="duration" maxlength="60" placeholder="For example: full day"') + '</div>' +
      '<div class="two">' + field('qb-venue', 'Venue', S.d.venue, 'type="text" data-d="venue" maxlength="200" autocomplete="off"') +
      field('qb-district', 'District or town', S.d.district, 'type="text" data-d="district" maxlength="100"') + '</div>' +
      '<fieldset class="qb-fs"><legend class="lbl">Location</legend>' +
      radio('where', 'kampala', S.where === 'kampala', 'Within the Kampala service area', esc(lg.kampala), 'qb-where-kampala') +
      radio('where', 'upcountry', S.where === 'upcountry', 'Outside Kampala (upcountry)', esc(lg.upcountry)) + '</fieldset>' + up +
      '<p class="small">' + esc(lg.area) + '</p>' +
      '<div class="field"><label for="qb-notes">Anything else we should know? (optional)</label><textarea id="qb-notes" data-d="notes" maxlength="2000">' + esc(S.d.notes) + '</textarea></div>';
  }

  function stepContact() {
    return '<h2 class="h3" tabindex="-1" id="qb-h">How can we reach you?</h2>' +
      '<div class="two">' + field('qb-name', 'Full name', S.c.name, 'type="text" data-c="name" autocomplete="name" maxlength="120"') +
      field('qb-email', 'Email', S.c.email, 'type="email" data-c="email" autocomplete="email" maxlength="254"') + '</div>' +
      '<div class="two">' + field('qb-phone', 'Phone or WhatsApp', S.c.phone, 'type="tel" data-c="phone" autocomplete="tel" maxlength="40"') + '<div></div></div>' +
      '<div class="hp" aria-hidden="true"><label for="qb-website">Website</label><input id="qb-website" type="text" tabindex="-1" autocomplete="off"></div>';
  }

  function stepReview() {
    var q = quote(), ev = eventObj();
    var lines = q.lines.map(function (l) {
      return '<tr><th scope="row">' + esc(l.label) + (l.qty ? ' <small>× ' + esc(l.qty) + '</small>' : '') + '</th><td>' + esc(money(l.total)) + '</td></tr>';
    }).join('') + q.special.map(function (s) {
      return '<tr><th scope="row">' + esc(s.label) + '</th><td class="sq">' + (s.type === 'special_quote' ? 'Special quotation' : 'Price on request') + '</td></tr>';
    }).join('');
    var where = S.where === 'kampala' ? 'Within the Kampala service area: transport for our team is included' :
      S.upcountry === 'upcountry_quote' ? 'Outside Kampala: logistics to be quoted separately' : 'Outside Kampala: you provide transport and accommodation for our team';
    function edit(i, label) { return '<button type="button" class="link qb-edit" data-goto="' + i + '">Edit ' + label + '</button>'; }
    return '<h2 class="h3" tabindex="-1" id="qb-h">Review your quotation request</h2>' +
      '<table class="table qb-review"><caption class="vh">Itemised estimate</caption><tbody>' + lines +
      '<tr class="sum"><th scope="row">Estimate' + (S.currency === 'USD' && S.usd ? ' <small>(' + esc(ugx(q.total)) + ')</small>' : '') + '</th><td>' + esc(money(q.total)) + '</td></tr></tbody></table>' +
      '<p class="qb-edits">' + edit(1, 'services') + edit(2, 'extras') + '</p>' +
      (S.currency === 'USD' && S.usd ? '<p class="small">' + esc(S.cat.notes.usd) + ' Rate: ' + S.rate.toLocaleString('en-US') + ' UGX per USD.</p>' : '') +
      '<dl class="qb-dl"><div><dt>Event</dt><dd>' + esc(ev.label) + '</dd></div>' +
      '<div><dt>Date</dt><dd>' + esc(S.d.date_fixed ? S.d.date : 'Not fixed yet' + (S.d.approx ? ' (' + S.d.approx + ')' : '')) + '</dd></div>' +
      '<div><dt>Venue</dt><dd>' + esc(S.d.venue + ', ' + S.d.district) + '</dd></div>' +
      (S.d.duration ? '<div><dt>Duration</dt><dd>' + esc(S.d.duration) + '</dd></div>' : '') +
      '<div><dt>Logistics</dt><dd>' + esc(where) + '</dd></div>' +
      '<div><dt>Contact</dt><dd>' + esc(S.c.name) + '<br>' + esc(S.c.email) + '<br>' + esc(S.c.phone) + '</dd></div></dl>' +
      '<p class="qb-edits">' + edit(3, 'event details') + edit(4, 'contact details') + '</p>' +
      '<p class="qb-note">' + esc(S.cat.notes.request) + ' Special-quotation items and any logistics charge are confirmed by our team.</p>';
  }

  function stepDone() {
    var r = S.done;
    return '<div class="qb-done" role="status"><h2 class="h3" tabindex="-1" id="qb-h">Thank you. Your quotation request has been sent.</h2>' +
      (r.reference ? '<p>Your reference is <b>' + esc(r.reference) + '</b>.</p>' : '') +
      '<p>We will review it and reply within 24 hours to confirm the quotation. Nothing has been booked or charged.</p>' +
      '<p><a class="link" href="/capture-films/">Back to Synergy Capture Films &rarr;</a></p></div>';
  }

  function nav() {
    if (S.done) return '';
    var back = S.step > 0 ? '<button type="button" class="link qb-back">&larr; Back</button>' : '<span></span>';
    var next = S.step < STEPS.length - 1
      ? '<button type="button" class="btn qb-next">Continue</button>'
      : '<button type="button" class="btn qb-send"' + (S.sending ? ' disabled' : '') + '>' + (S.sending ? 'Sending…' : 'Send quotation request') + '</button>';
    return '<div class="qb-nav">' + back + next + '</div>';
  }

  var focusTarget = null;
  function render() {
    var body = S.done ? stepDone() : [stepEvent, stepServices, stepExtras, stepDetails, stepContact, stepReview][S.step]();
    var showTotal = !S.done && S.step >= 1 && S.step !== 5;
    root.innerHTML = (S.done ? '' : progress()) + (S.notice ? '<p class="qb-notice" role="status">' + esc(S.notice) + '</p>' : '') + errorBox() +
      '<div class="qb-grid' + (showTotal ? '' : ' qb-grid--one') + '"><div class="qb-main">' + body + nav() + '</div>' + (showTotal ? totalPanel() : '') + '</div>';
    if (focusTarget) {
      var el = document.getElementById(focusTarget);
      if (el) el.focus();
      focusTarget = null;
    }
  }
  function refreshTotal() {
    var p = root.querySelector('.qb-total');
    if (p) p.outerHTML = totalPanel();
  }

  function go(step) {
    S.step = step; S.errors = []; S.notice = '';
    render();
    focusTarget = null;
    var h = document.getElementById('qb-h');
    if (h) h.focus();
    section.scrollIntoView({ block: 'start' });
  }

  function next() {
    var e = validate(S.step);
    if (e.length) { S.errors = e; focusTarget = 'qb-errors'; render(); return; }
    go(S.step + 1);
  }

  // ---------- events ----------
  root.addEventListener('change', function (ev) {
    var t = ev.target;
    if (t.name === 'event') { S.event = t.value; prune(); }
    else if (t.name === 'currency') { S.currency = t.value === 'USD' && S.usd ? 'USD' : 'UGX'; render(); return; }
    else if (t.name === 'service') {
      if (t.checked) { if (S.services.indexOf(t.value) < 0) S.services.push(t.value); }
      else S.services = S.services.filter(function (s) { return s !== t.value; });
      prune(); refreshTotal(); return;
    } else if (t.name === 'extra') {
      var x = S.cat.extras.filter(function (e) { return e.id === t.value; })[0];
      var st = x.pricing[S.event];
      if (t.checked) S.extras[x.id] = st.type === 'per_unit' ? st.min : 1; else delete S.extras[x.id];
      render(); var cb = root.querySelector('input[name="extra"][value="' + x.id + '"]'); if (cb) cb.focus(); return;
    } else if (t.name === 'date_fixed') { S.d.date_fixed = t.value === 'yes'; render(); var r = root.querySelector('input[name="date_fixed"]:checked'); if (r) r.focus(); return; }
    else if (t.name === 'where') { S.where = t.value; render(); var w = root.querySelector('input[name="where"]:checked'); if (w) w.focus(); return; }
    else if (t.name === 'upcountry') { S.upcountry = t.value; return; }
  });
  root.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.hasAttribute('data-d')) S.d[t.getAttribute('data-d')] = t.value;
    else if (t.hasAttribute('data-c')) S.c[t.getAttribute('data-c')] = t.value;
    else if (t.hasAttribute('data-qty')) {
      var n = parseInt(t.value, 10);
      S.extras[t.getAttribute('data-qty')] = isNaN(n) ? 0 : n;
      refreshTotal();
    }
  });
  root.addEventListener('click', function (ev) {
    var t = ev.target.closest('button');
    if (!t) return;
    if (t.classList.contains('qb-next')) next();
    else if (t.classList.contains('qb-back')) go(S.step - 1);
    else if (t.classList.contains('qb-edit')) go(parseInt(t.getAttribute('data-goto'), 10));
    else if (t.classList.contains('qb-send')) send();
  });

  // ---------- submit ----------
  function payload() {
    var extras = availableExtras().filter(function (x) { return S.extras[x.id] !== undefined; }).map(function (x) {
      return x.pricing[S.event].type === 'per_unit' ? { id: x.id, quantity: S.extras[x.id] } : { id: x.id };
    });
    var hp = document.getElementById('qb-website');
    return {
      name: S.c.name.trim(), email: S.c.email.trim(), phone: S.c.phone.trim(),
      website: hp ? hp.value : '', elapsed_ms: Date.now() - startedAt, request_id: S.requestId,
      quote: {
        catalog_version: S.version, expected_estimate_ugx: quote().total,
        event: S.event, services: S.services.slice(), extras: extras, currency: S.currency,
        event_details: {
          date_fixed: S.d.date_fixed, date: S.d.date_fixed ? S.d.date : null,
          approx_timeframe: S.d.date_fixed ? null : S.d.approx, venue: S.d.venue, district: S.d.district,
          duration: S.d.duration, notes: S.d.notes
        },
        logistics: S.where === 'kampala' ? 'kampala' : S.upcountry
      }
    };
  }

  var STEP_OF = { event: 0, services: 1, currency: 1, extras: 2, date: 3, venue: 3, district: 3, approx_timeframe: 3, duration: 3, notes: 3, logistics: 3, name: 4, email: 4, phone: 4 };

  function send() {
    if (S.sending) return;
    for (var i = 0; i < 5; i++) {
      var e = validate(i);
      if (e.length) { S.step = i; S.errors = e; focusTarget = 'qb-errors'; render(); return; }
    }
    S.sending = true; S.errors = []; S.notice = ''; render();
    fetch(API + '/api/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload()) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        S.sending = false;
        if (res.status === 201) { S.done = res.body || {}; render(); var h = document.getElementById('qb-h'); if (h) h.focus(); return; }
        if (res.status === 409) {
          S.notice = (res.body && res.body.error) || 'Our prices were updated. Please review your quotation and send it again.';
          load(true).then(function () {
            S.step = 5; render();
            var n = root.querySelector('.qb-notice'); if (n) { n.setAttribute('tabindex', '-1'); n.focus(); }
          }).catch(function () {
            S.notice = '';
            S.errors = [['qb-h', 'Our prices were updated, but the new price list could not be loaded. Please reload the page, or email info@synergyconceptshub.com.']];
            focusTarget = 'qb-errors'; render();
          });
          return;
        }
        if (res.status === 400 && res.body && res.body.fields && res.body.fields.length) {
          var f = res.body.fields[0], step = STEP_OF[f.field];
          S.step = step === undefined ? S.step : step;
          S.errors = res.body.fields.map(function (x) { return ['qb-h', x.message]; });
          focusTarget = 'qb-errors'; render(); return;
        }
        S.errors = [['qb-h', (res.body && res.body.error) || 'We could not send your request. Please try again.']];
        focusTarget = 'qb-errors'; render();
      })
      .catch(function () {
        // Same request id on retry: the portal stores it only once.
        S.sending = false;
        S.errors = [['qb-h', 'We could not reach our server. Check your connection and press "Send quotation request" again, or email info@synergyconceptshub.com.']];
        focusTarget = 'qb-errors'; render();
      });
  }

  // ---------- start ----------
  function load(isReload) {
    // After a "prices changed" answer, bypass the 60-second cache so the new version is fetched.
    var url = API + '/api/quote/catalog' + (isReload ? '?fresh=' + Date.now() : '');
    return fetch(url, { headers: { Accept: 'application/json' }, cache: isReload ? 'no-store' : 'default' })
      .then(function (r) { if (!r.ok) throw new Error('catalogue'); return r.json(); })
      .then(function (data) {
        if (!data || !data.catalog || !data.catalog.events) throw new Error('catalogue');
        S.cat = data.catalog; S.version = data.version;
        S.rate = data.usd_available ? data.ugx_per_usd : null; S.usd = !!data.usd_available;
        prune();
        if (!isReload) {
          var pre = new URLSearchParams(location.search).get('service');
          if (pre && DEEP_LINK[pre] && S.cat.events.some(function (e) { return e.id === DEEP_LINK[pre]; })) { S.event = DEEP_LINK[pre]; }
        }
      });
  }

  load(false).then(function () {
    section.hidden = false;
    var simple = document.getElementById('enquiry-form');
    var pre = new URLSearchParams(location.search).get('service');
    var builderFirst = !pre || DEEP_LINK[pre];
    if (simple && builderFirst) {
      simple.setAttribute('data-collapsed', '');
      var toggle = document.getElementById('simple-toggle');
      if (toggle) {
        toggle.hidden = false;
        toggle.addEventListener('click', function () {
          var open = simple.hasAttribute('data-collapsed');
          if (open) simple.removeAttribute('data-collapsed'); else simple.setAttribute('data-collapsed', '');
          toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      }
    }
    render();
  }).catch(function () { /* price list unavailable: the simple form stays as it is */ });
})();
