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
    initScrollReveal();
    initCounters();
    initMagneticButtons();
    initParallax();
    initHeroPanels();
    initSmoothScroll();
    initQuoteForm();
    initProgressBars();
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
      const onScroll = () => {
        nav.classList.toggle('scrolled', window.scrollY > 40);
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
    }

    function closeMenu() {
      if (!mobileMenu) return;
      mobileMenu.classList.remove('open');
      mobileMenu.setAttribute('aria-hidden', 'true');
      menuToggle?.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
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

  /* ─── Scroll Reveal ─── */
  function initScrollReveal() {
    const elements = document.querySelectorAll(
      '.reveal, .reveal-left, .reveal-right, .reveal-scale'
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

  /* ─── Hero Panel Mouse Tracking ─── */
  function initHeroPanels() {
    const visual = document.getElementById('heroVisual');
    if (!visual || window.matchMedia('(pointer: coarse)').matches) return;

    visual.addEventListener('mousemove', (e) => {
      const rect = visual.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      visual.style.transform = `perspective(1200px) rotateY(${x * 4}deg) rotateX(${-y * 4}deg)`;
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

  /* ─── Quote Form ─── */
  function initQuoteForm() {
    const form = document.getElementById('quoteForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const status = document.getElementById('quoteStatus');
      const btn = form.querySelector('[type="submit"]');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Sending...';
      }
      setTimeout(() => {
        if (status) {
          status.textContent =
            "Thank you! We'll respond within 24 hours.";
          status.classList.add('text-green-400');
        }
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Send Brief';
        }
        form.reset();
      }, 1200);
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
