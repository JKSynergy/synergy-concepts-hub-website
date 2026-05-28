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
    initCustomSelects();
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
        form.querySelectorAll('select.form-select-native').forEach((select) => {
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
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
