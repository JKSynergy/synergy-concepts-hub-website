/**
 * Synergy Concepts Hub — Creative Technology Ecosystem
 * Motion design system & interactions
 */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    initPageLoader();
    initNavigation();
    initMenuExperience();
    initScrollReveal();
    initStaggerGroups();
    initCounters();
    initMagneticButtons();
    initMagneticSurfaces();
    initParallax();
    initHeroPanels();
    initHeroParticles();
    initLiveMetrics();
    initNavHighlight();
    initShowcaseFilters();
    initSmoothScroll();
    initCustomSelects();
    initQuoteForm();
    initProgressBars();
    initMediaPillars();
    initPortalLinks();
  }

  /* ─── Portal Links ─── */
  // Keep every [data-portal-link] href in sync with SCH_CONFIG.portalUrl
  // so the portal address only needs updating in site-config.js.
  function initPortalLinks() {
    const portalUrl = window.SCH_CONFIG?.portalUrl;
    if (!portalUrl) return;
    document.querySelectorAll('[data-portal-link]').forEach((link) => {
      link.setAttribute('href', portalUrl);
    });
  }

  /* ─── Page Loader ─── */
  function initPageLoader() {
    const loader = document.getElementById('pageLoader');
    if (!loader) return;

    window.addEventListener('load', () => {
      setTimeout(() => loader.classList.add('loaded'), 400);
    });

    setTimeout(() => loader.classList.add('loaded'), 2500);
  }

  /* ─── Navigation ─── */
  function initNavigation() {
    const nav = document.getElementById('siteNav');
    const menuToggle = document.getElementById('menuToggle');
    const menuClose = document.getElementById('menuClose');
    const mobileMenu = document.getElementById('mobileMenu');

    if (nav) {
      const scrollProgress = document.getElementById('scrollProgress');
      const onScroll = () => {
        nav.classList.toggle('scrolled', window.scrollY > 40);
        if (scrollProgress) {
          const docHeight = document.documentElement.scrollHeight - window.innerHeight;
          const progress = docHeight > 0 ? window.scrollY / docHeight : 0;
          scrollProgress.style.transform = `scaleX(${progress})`;
        }
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    function openMenu() {
      if (!mobileMenu) return;
      mobileMenu.classList.add('open');
      mobileMenu.setAttribute('aria-hidden', 'false');
      menuToggle?.setAttribute('aria-expanded', 'true');
      document.body.classList.add('menu-open');
      setTimeout(() => menuClose?.focus(), 350);
      document.dispatchEvent(new CustomEvent('menu:open'));
    }

    function closeMenu() {
      if (!mobileMenu) return;
      mobileMenu.classList.remove('open');
      mobileMenu.setAttribute('aria-hidden', 'true');
      menuToggle?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
      menuToggle?.focus();
      document.dispatchEvent(new CustomEvent('menu:close'));
    }

    menuToggle?.addEventListener('click', openMenu);
    menuClose?.addEventListener('click', closeMenu);

    mobileMenu?.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });

    mobileMenu?.addEventListener('click', (e) => {
      if (e.target === mobileMenu) closeMenu();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  /* ─── Cinematic Menu Experience ─── */
  function initMenuExperience() {
    const mobileMenu = document.getElementById('mobileMenu');
    if (!mobileMenu) return;

    const navItems = mobileMenu.querySelectorAll('.menu-nav-item');
    const scenes = mobileMenu.querySelectorAll('.menu-scene');
    const ghostA = document.getElementById('menuGhostA');
    const ghostB = document.getElementById('menuGhostB');
    const ghostLayer = document.querySelector('.menu-ghost-layer');
    const experienceCol = document.getElementById('menuExperience');
    const sceneStage = document.getElementById('menuSceneStage');
    const clockEl = document.getElementById('menuClock');
    let activeScene = 'systems';
    let clockTimer;
    let ghostFront = ghostA;
    let ghostBack = ghostB;
    let ghostTransitionTimer;

    function crossfadeGhost(label) {
      if (!ghostFront || !ghostBack || !label) return;
      if (ghostFront.textContent === label && ghostFront.classList.contains('is-active')) return;

      clearTimeout(ghostTransitionTimer);
      ghostFront.classList.remove('is-active');
      ghostFront.classList.add('is-exiting');

      ghostBack.textContent = label;
      ghostBack.classList.remove('is-exiting');
      ghostBack.classList.add('is-entering');

      requestAnimationFrame(() => {
        ghostBack.classList.add('is-active');
      });

      ghostTransitionTimer = setTimeout(() => {
        ghostFront.classList.remove('is-exiting', 'is-entering');
        ghostBack.classList.remove('is-entering');
        const prev = ghostFront;
        ghostFront = ghostBack;
        ghostBack = prev;
      }, 900);
    }

    function setScene(sceneId, label) {
      const sceneChanged = sceneId && sceneId !== activeScene;

      if (sceneId) {
        activeScene = sceneId;
        mobileMenu.dataset.activeScene = sceneId;
      }

      navItems.forEach((item) => {
        item.classList.toggle('is-active', item.dataset.scene === activeScene);
      });

      if (sceneChanged) {
        scenes.forEach((scene) => {
          scene.classList.toggle('is-active', scene.dataset.scene === activeScene);
        });
      }

      if (label) crossfadeGhost(label);
    }

    function activateFromItem(item) {
      const link = item.querySelector('.mobile-nav-link');
      if (!link) return;
      setScene(item.dataset.scene, link.dataset.label || link.textContent.trim().toUpperCase());
    }

    navItems.forEach((item) => {
      item.addEventListener('mouseenter', () => activateFromItem(item));
      item.addEventListener('focusin', () => activateFromItem(item));
      item.addEventListener('touchstart', () => activateFromItem(item), { passive: true });
    });

    const defaultItem = mobileMenu.querySelector('.menu-nav-item.is-active') || navItems[0];
    if (defaultItem) activateFromItem(defaultItem);

    function updateClock() {
      if (!clockEl) return;
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Africa/Kampala',
      });
    }

    document.addEventListener('menu:open', () => {
      updateClock();
      clearInterval(clockTimer);
      clockTimer = setInterval(updateClock, 30000);
      if (ghostFront) ghostFront.classList.add('is-active');
    });

    document.addEventListener('menu:close', () => {
      clearInterval(clockTimer);
      clearTimeout(ghostTransitionTimer);
    });

    if (
      experienceCol &&
      sceneStage &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      !window.matchMedia('(pointer: coarse)').matches
    ) {
      experienceCol.addEventListener('mousemove', (e) => {
        const rect = experienceCol.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        experienceCol.style.setProperty('--menu-parallax-x', x.toFixed(3));
        experienceCol.style.setProperty('--menu-parallax-y', y.toFixed(3));

        if (ghostLayer) {
          ghostLayer.style.transform = `translate(${x * 18}px, ${y * 12}px)`;
        }
      });

      experienceCol.addEventListener('mouseleave', () => {
        experienceCol.style.setProperty('--menu-parallax-x', '0');
        experienceCol.style.setProperty('--menu-parallax-y', '0');
        if (ghostLayer) ghostLayer.style.transform = '';
      });
    }

    initMenuParticles();
  }

  function initMenuParticles() {
    const canvas = document.getElementById('menuParticles');
    const menu = document.getElementById('mobileMenu');
    if (
      !canvas ||
      !menu ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const ctx = canvas.getContext('2d');
    let particles = [];
    let animId;
    let w;
    let h;
    let running = false;

    function resize() {
      w = canvas.width = menu.offsetWidth;
      h = canvas.height = menu.offsetHeight;
    }

    function createParticles() {
      const count = Math.min(48, Math.floor((w * h) / 28000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.4 + 0.4,
        vx: (Math.random() - 0.5) * 0.14,
        vy: (Math.random() - 0.5) * 0.14,
        alpha: Math.random() * 0.4 + 0.1,
      }));
    }

    function draw() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(14, 165, 233, ${p.alpha})`;
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 90) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(14, 165, 233, ${0.04 * (1 - dist / 90)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      });

      animId = requestAnimationFrame(draw);
    }

    function start() {
      if (running) return;
      running = true;
      resize();
      createParticles();
      draw();
    }

    function stop() {
      running = false;
      cancelAnimationFrame(animId);
      ctx.clearRect(0, 0, w || 0, h || 0);
    }

    document.addEventListener('menu:open', start);
    document.addEventListener('menu:close', stop);

    window.addEventListener('resize', () => {
      if (!running) return;
      resize();
      createParticles();
    });
  }

  /* ─── Scroll Reveal ─── */
  function initScrollReveal() {
    const elements = document.querySelectorAll(
      '.reveal, .reveal-left, .reveal-right, .reveal-scale, .reveal-blur'
    );

    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    elements.forEach((el) => observer.observe(el));
  }

  /* ─── Stagger Group Reveals ─── */
  function initStaggerGroups() {
    const groups = document.querySelectorAll('.stagger-group');
    if (!groups.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -30px 0px' }
    );

    groups.forEach((group) => observer.observe(group));
  }

  /* ─── Magnetic Surfaces (cards, panels) ─── */
  function initMagneticSurfaces() {
    if (
      window.matchMedia('(pointer: coarse)').matches ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    document.querySelectorAll('.magnetic-surface').forEach((surface) => {
      surface.addEventListener('mousemove', (e) => {
        const rect = surface.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        const intensity = surface.classList.contains('hero-visual') ? 3 : 5;
        surface.style.transform = `perspective(1200px) rotateY(${x * intensity}deg) rotateX(${-y * intensity}deg) translateZ(0)`;
      });

      surface.addEventListener('mouseleave', () => {
        surface.style.transform = '';
      });
    });
  }

  /* ─── Hero Particle Field ─── */
  function initHeroParticles() {
    const canvas = document.getElementById('heroParticles');
    if (
      !canvas ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      window.matchMedia('(max-width: 1023px)').matches
    ) {
      return;
    }

    const ctx = canvas.getContext('2d');
    let particles = [];
    let animId;
    let w;
    let h;

    function resize() {
      const section = canvas.closest('.hero-section');
      w = canvas.width = section ? section.offsetWidth : window.innerWidth;
      h = canvas.height = section ? section.offsetHeight : window.innerHeight;
    }

    function createParticles() {
      const count = Math.min(48, Math.floor((w * h) / 22000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.5 + 0.5,
        vx: (Math.random() - 0.5) * 0.15,
        vy: (Math.random() - 0.5) * 0.15,
        alpha: Math.random() * 0.4 + 0.1,
      }));
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);

      particles.forEach((p, i) => {
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(14, 165, 233, ${p.alpha})`;
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(14, 165, 233, ${0.06 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      });

      animId = requestAnimationFrame(draw);
    }

    resize();
    createParticles();
    draw();

    window.addEventListener('resize', () => {
      resize();
      createParticles();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(animId);
      } else {
        draw();
      }
    });
  }

  /* ─── Live Metric Ticker ─── */
  function initLiveMetrics() {
    const metrics = document.querySelectorAll('[data-live]');
    if (!metrics.length) return;

    metrics.forEach((el) => {
      const base = parseInt(el.dataset.live, 10);
      if (!base) return;

      setInterval(() => {
        const variance = Math.floor(base * 0.002 * (Math.random() - 0.4));
        const value = base + variance;
        el.textContent = 'UGX ' + (value >= 1000000
          ? (value / 1000000).toFixed(1) + 'M'
          : value.toLocaleString());
      }, 4000);
    });
  }

  /* ─── Animated Counters ─── */
  function initCounters() {
    const counters = document.querySelectorAll('[data-count]');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach((el) => observer.observe(el));
  }

  function animateCounter(el) {
    const target = parseFloat(el.dataset.count);
    const suffix = el.dataset.suffix || '';
    const prefix = el.dataset.prefix || '';
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const duration = 2000;
    const start = performance.now();

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = target * eased;
      el.textContent =
        prefix +
        (decimals > 0 ? current.toFixed(decimals) : Math.floor(current)) +
        suffix;
      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  /* ─── Magnetic Buttons ─── */
  function initMagneticButtons() {
    if (window.matchMedia('(pointer: coarse)').matches) return;

    document.querySelectorAll('.btn-magnetic').forEach((btn) => {
      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = `translate(${x * 0.15}px, ${y * 0.15}px)`;
      });

      btn.addEventListener('mouseleave', () => {
        btn.style.transform = '';
      });
    });
  }

  /* ─── Subtle Parallax ─── */
  function initParallax() {
    const layers = document.querySelectorAll('[data-parallax]');
    if (
      !layers.length ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      window.matchMedia('(max-width: 1023px)').matches ||
      window.matchMedia('(pointer: coarse)').matches
    ) {
      return;
    }

    let ticking = false;

    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          requestAnimationFrame(() => {
            const scrollY = window.scrollY;
            layers.forEach((layer) => {
              const speed = parseFloat(layer.dataset.parallax) || 0.1;
              layer.style.transform = `translateY(${scrollY * speed}px)`;
            });
            ticking = false;
          });
          ticking = true;
        }
      },
      { passive: true }
    );
  }

  /* ─── Active nav on scroll ─── */
  function initNavHighlight() {
    const sections = ['systems', 'media', 'clients', 'academy', 'case-studies', 'contact'];
    const links = document.querySelectorAll('.nav-link[href^="#"]');
    if (!links.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          links.forEach((link) => {
            link.classList.toggle('is-active', link.getAttribute('href') === `#${id}`);
          });
        });
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    );

    sections.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }

  /* ─── Showcase category filters ─── */
  function initShowcaseFilters() {
    const filters = document.getElementById('showcaseFilters');
    const grid = document.getElementById('showcaseGrid');
    if (!filters || !grid) return;

    const buttons = filters.querySelectorAll('.showcase-filter');
    const cards = grid.querySelectorAll('.showcase-card');

    function applyFilter(category) {
      buttons.forEach((btn) => {
        const active = btn.dataset.filter === category;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      cards.forEach((card) => {
        const cats = (card.dataset.categories || '').split(/\s+/);
        const show = category === 'all' || cats.includes(category);
        card.classList.toggle('is-hidden', !show);
      });
    }

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => applyFilter(btn.dataset.filter || 'all'));
    });
  }

  /* ─── Hero Panel Mouse Tracking ─── */
  function initHeroPanels() {
    const visual = document.getElementById('heroVisual');
    if (!visual || window.matchMedia('(pointer: coarse)').matches) return;

    visual.addEventListener('mousemove', (e) => {
      const rect = visual.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      visual.style.transform = `perspective(1200px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg)`;
    });

    visual.addEventListener('mouseleave', () => {
      visual.style.transform = '';
    });
  }

  /* ─── Smooth Scroll ─── */
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener('click', (e) => {
        const href = anchor.getAttribute('href');
        if (href === '#') return;
        const target = document.querySelector(href);
        if (!target) return;
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ─── Custom Selects ─── */
  function initCustomSelects() {
    document.querySelectorAll('select.form-input').forEach((select) => {
      if (select.dataset.customSelect === 'true') return;
      select.dataset.customSelect = 'true';

      const wrapper = document.createElement('div');
      wrapper.className = 'form-select';
      select.parentNode.insertBefore(wrapper, select);
      wrapper.appendChild(select);

      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'form-input form-select-trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');

      const label = select.id
        ? document.querySelector(`label[for="${select.id}"]`)
        : null;
      if (label) {
        if (!label.id) label.id = `${select.id}-label`;
        trigger.setAttribute('aria-labelledby', label.id);
      }

      const valueSpan = document.createElement('span');
      valueSpan.className = 'form-select-value';

      const chevron = document.createElement('span');
      chevron.className = 'form-select-chevron';
      chevron.innerHTML =
        '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';

      trigger.appendChild(valueSpan);
      trigger.appendChild(chevron);

      const menu = document.createElement('ul');
      menu.className = 'form-select-menu';
      menu.setAttribute('role', 'listbox');
      if (label && label.id) menu.setAttribute('aria-labelledby', label.id);

      Array.from(select.options).forEach((option) => {
        if (!option.value) return;

        const item = document.createElement('li');
        item.className = 'form-select-option';
        item.setAttribute('role', 'option');
        item.dataset.value = option.value;
        item.textContent = option.textContent;
        menu.appendChild(item);
      });

      wrapper.appendChild(trigger);
      wrapper.appendChild(menu);

      select.classList.add('form-select-native');
      select.tabIndex = -1;

      function syncTrigger() {
        const selected = select.options[select.selectedIndex];
        const isPlaceholder = !select.value;

        valueSpan.textContent = selected ? selected.textContent : '';
        valueSpan.classList.toggle('is-placeholder', isPlaceholder);

        menu.querySelectorAll('.form-select-option').forEach((option) => {
          option.setAttribute(
            'aria-selected',
            option.dataset.value === select.value ? 'true' : 'false'
          );
        });
      }

      function openMenu() {
        wrapper.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      }

      function closeMenu() {
        wrapper.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      }

      function toggleMenu() {
        if (wrapper.classList.contains('is-open')) closeMenu();
        else openMenu();
      }

      trigger.addEventListener('click', toggleMenu);

      menu.addEventListener('click', (event) => {
        const option = event.target.closest('.form-select-option');
        if (!option) return;

        select.value = option.dataset.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        syncTrigger();
        closeMenu();
        trigger.focus();
      });

      trigger.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          closeMenu();
          return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggleMenu();
        }

        if (
          (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
          wrapper.classList.contains('is-open')
        ) {
          event.preventDefault();
          const options = Array.from(menu.querySelectorAll('.form-select-option'));
          const currentIndex = options.findIndex(
            (option) => option.dataset.value === select.value
          );
          const nextIndex =
            event.key === 'ArrowDown'
              ? Math.min(currentIndex + 1, options.length - 1)
              : Math.max(currentIndex - 1, 0);

          if (options[nextIndex]) {
            select.value = options[nextIndex].dataset.value;
            syncTrigger();
            options[nextIndex].scrollIntoView({ block: 'nearest' });
          }
        }
      });

      document.addEventListener('click', (event) => {
        if (!wrapper.contains(event.target)) closeMenu();
      });

      select.addEventListener('change', syncTrigger);
      syncTrigger();
    });
  }

  /* ─── Quote Form ─── */
  // Portal API endpoint. Override by setting data-quote-endpoint on the form.
  // This pulls from window.SCH_CONFIG.portalUrl (site-config.js) so only one file needs updating.
  const QUOTE_ENDPOINT =
    (window.SCH_CONFIG?.portalUrl || 'https://sch-portal-delta.vercel.app') + '/api/quote';

  function initQuoteForm() {
    const form = document.getElementById('quoteForm');
    if (!form) return;

    const endpoint = form.dataset.quoteEndpoint || QUOTE_ENDPOINT;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = document.getElementById('quoteStatus');
      const btn = form.querySelector('[type="submit"]');

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending...';
      }
      if (status) {
        status.textContent = '';
        status.classList.remove('text-green-400', 'text-red-400');
      }

      const payload = {
        name: form.elements['name']?.value?.trim(),
        email: form.elements['email']?.value?.trim(),
        service: form.elements['service']?.value || '',
        brief: form.elements['brief']?.value?.trim(),
      };

      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error('Request failed');

        if (status) {
          status.textContent = "Thank you! We'll respond within 24 hours.";
          status.classList.add('text-green-400');
        }
        form.reset();
        form.querySelectorAll('select.form-select-native').forEach((select) => {
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
      } catch (err) {
        if (status) {
          status.textContent =
            'Something went wrong. Please email synergyconceptshub@gmail.com.';
          status.classList.add('text-red-400');
        }
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Send Brief';
        }
      }
    });
  }

  /* ─── Cinematic showcase pillar motion ─── */
  function initMediaPillars() {
    const pillars = document.querySelectorAll('.showcase-pillar');
    if (!pillars.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    pillars.forEach((pillar) => {
      const media = pillar.querySelector('.showcase-pillar__media img');
      if (!media) return;

      pillar.addEventListener('mousemove', (e) => {
        const rect = pillar.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        media.style.transform = `scale(1.06) translate(${x * 8}px, ${y * 8}px)`;
      });

      pillar.addEventListener('mouseleave', () => {
        media.style.transform = '';
      });
    });
  }

  /* ─── Progress Bars on Scroll ─── */
  function initProgressBars() {
    const bars = document.querySelectorAll('.course-progress-fill[data-progress]');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.style.width = entry.target.dataset.progress + '%';
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.3 }
    );

    bars.forEach((bar) => {
      bar.style.width = '0%';
      observer.observe(bar);
    });
  }
})();
