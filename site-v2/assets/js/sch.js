/* Synergy Concepts Hub — site behaviour. Four small jobs: menu, work filter, image viewer, enquiry form. */
(function () {
  'use strict';

  // Portal origin. Used for the enquiry form and the header/footer portal link.
  var PORTAL_URL = 'https://portal.synergyconceptshub.com';

  // Visitors see clean categories. The portal's lead records keep their original values
  // (systems / media / products / other); the chosen creative service is written into the brief.
  var SERVICE_MAP = {
    technology: 'systems', products: 'products', other: 'other', creative: 'media',
    photography: 'media', design: 'media', social: 'media', 'social-management': 'media', campaign: 'media'
  };
  var SUB_SERVICE = {
    photography: 'Photography & Video', design: 'Graphic Design & Branding', social: 'Social Media Content',
    'social-management': 'Social Media Management', campaign: 'Campaign & Content Production'
  };

  /* Mobile menu */
  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.textContent = open ? 'Close' : 'Menu';
    });
  }

  /* Header dropdown (Creative): the caret toggles it; Escape or a click elsewhere closes it.
     Hover and keyboard focus open it through CSS, so it also works without this script. */
  var drops = document.querySelectorAll('.nav-drop');
  var closeDrops = function (except) {
    drops.forEach(function (d) {
      if (d === except) return;
      d.classList.remove('open');
      var c = d.querySelector('.nav-caret');
      if (c) c.setAttribute('aria-expanded', 'false');
    });
  };
  drops.forEach(function (d) {
    var caret = d.querySelector('.nav-caret');
    if (!caret) return;
    caret.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = d.classList.toggle('open');
      caret.setAttribute('aria-expanded', open ? 'true' : 'false');
      closeDrops(d);
    });
  });
  if (drops.length) {
    document.addEventListener('click', function (e) { if (!e.target.closest('.nav-drop')) closeDrops(); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var openDrop = document.querySelector('.nav-drop.open');
      closeDrops();
      if (openDrop) openDrop.querySelector('.nav-caret').focus();
    });
  }

  /* Work filter */
  var filters = document.querySelector('.filters');
  if (filters) {
    var items = document.querySelectorAll('[data-cat]');
    var groups = document.querySelectorAll('[data-group]');
    var apply = function (cat) {
      items.forEach(function (el) {
        var match = cat === 'all' || el.getAttribute('data-cat').split(' ').indexOf(cat) > -1;
        el.hidden = !match;
      });
      groups.forEach(function (g) {
        g.hidden = !g.querySelector('[data-cat]:not([hidden])');
      });
      filters.querySelectorAll('button').forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-filter') === cat ? 'true' : 'false');
      });
    };
    filters.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-filter]');
      if (b) apply(b.getAttribute('data-filter'));
    });
    var start = (location.hash || '').replace('#', '');
    apply(filters.querySelector('[data-filter="' + start + '"]') ? start : 'all');
  }

  /* Image viewer: enhances gallery links (a[data-gallery]). Without JS the link opens the image. */
  var links = document.querySelectorAll('a[data-gallery]');
  if (links.length && window.HTMLDialogElement && HTMLDialogElement.prototype.showModal) {
    var dlg = document.createElement('dialog');
    dlg.className = 'viewer';
    dlg.setAttribute('aria-label', 'Image viewer');
    dlg.innerHTML = '<div class="v-stage"><img alt=""></div>' +
      '<div class="v-bar"><span class="v-cap"></span><span class="v-count" aria-live="polite"></span></div>' +
      '<button type="button" class="v-prev" aria-label="Previous image">&larr; Prev</button>' +
      '<button type="button" class="v-next" aria-label="Next image">Next &rarr;</button>' +
      '<button type="button" class="v-close" aria-label="Close viewer">Close &times;</button>';
    document.body.appendChild(dlg);
    var vImg = dlg.querySelector('img'), vCap = dlg.querySelector('.v-cap'), vCount = dlg.querySelector('.v-count');
    var vPrev = dlg.querySelector('.v-prev'), vNext = dlg.querySelector('.v-next'), vClose = dlg.querySelector('.v-close');
    var seq = [], idx = 0, opener = null;

    var altOf = function (a) {
      var im = a.querySelector('img');
      return a.getAttribute('data-alt') || (im ? im.getAttribute('alt') : '') || '';
    };
    var show = function (i) {
      idx = (i + seq.length) % seq.length;
      var a = seq[idx];
      vImg.src = a.getAttribute('data-webp') || a.getAttribute('href');
      vImg.alt = altOf(a);
      if (a.getAttribute('data-w')) { vImg.width = a.getAttribute('data-w'); vImg.height = a.getAttribute('data-h'); }
      vCap.textContent = a.getAttribute('data-caption') || '';
      vCount.textContent = seq.length > 1 ? (idx + 1) + ' / ' + seq.length : '';
      var multi = seq.length > 1;
      vPrev.hidden = !multi; vNext.hidden = !multi;
      if (multi) { var nx = seq[(idx + 1) % seq.length], pre = new Image(); pre.src = nx.getAttribute('data-webp') || nx.getAttribute('href'); }
    };
    var open = function (a) {
      var name = a.getAttribute('data-gallery');
      // Same gallery, excluding anything inside a block hidden by the Work filter.
      seq = Array.prototype.filter.call(document.querySelectorAll('a[data-gallery]'), function (x) {
        return x.getAttribute('data-gallery') === name && !(x.parentElement && x.parentElement.closest('[hidden]'));
      });
      opener = a;
      show(seq.indexOf(a));
      document.documentElement.style.overflow = 'hidden';
      dlg.showModal();
      vClose.focus();
    };
    dlg.addEventListener('close', function () {
      document.documentElement.style.overflow = '';
      vImg.removeAttribute('src');
      if (opener) opener.focus();
    });
    vPrev.addEventListener('click', function () { show(idx - 1); });
    vNext.addEventListener('click', function () { show(idx + 1); });
    vClose.addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) {
      if (e.target === dlg || e.target.classList.contains('v-stage')) dlg.close();
    });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft' && seq.length > 1) { e.preventDefault(); show(idx - 1); }
      if (e.key === 'ArrowRight' && seq.length > 1) { e.preventDefault(); show(idx + 1); }
    });
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-gallery]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      open(a);
    });
  }

  /* Enquiry form: posts to the portal's /api/quote (lands in the leads table) */
  var form = document.getElementById('enquiry');
  if (form) {
    var status = document.getElementById('formStatus');
    var submit = form.querySelector('[type="submit"]');
    var pre = new URLSearchParams(location.search).get('service');
    if (pre && form.elements.service && form.elements.service.querySelector('option[value="' + pre.replace(/[^a-z-]/g, '') + '"]')) {
      form.elements.service.value = pre;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      submit.disabled = true;
      submit.textContent = 'Sending…';
      status.textContent = '';

      var choice = form.elements.service.value;
      var brief = (SUB_SERVICE[choice] ? 'Service: ' + SUB_SERVICE[choice] + '\n\n' : '') +
        form.elements.brief.value.trim() + '\n\n[Sent from ' + location.pathname + ']';
      var payload = {
        name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(),
        phone: form.elements.phone.value.trim(),
        service: SERVICE_MAP[choice] || choice,
        brief: brief
      };

      fetch(PORTAL_URL + '/api/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) {
        if (!r.ok) throw new Error('failed');
        status.textContent = 'Thank you. We will reply within 24 hours.';
        form.reset();
      }).catch(function () {
        status.textContent = 'Something went wrong. Please email info@synergyconceptshub.com or message us on WhatsApp.';
      }).then(function () {
        submit.disabled = false;
        submit.textContent = 'Send enquiry';
      });
    });
  }
})();
