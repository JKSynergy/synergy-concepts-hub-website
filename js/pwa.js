(function () {
  var INSTALL_DISMISS_KEY = 'sch-pwa-install-dismissed';
  var IOS_HINT_DISMISS_KEY = 'sch-pwa-ios-hint-dismissed';
  var deferredPrompt = null;
  var bannerEl = null;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function (err) {
        console.warn('Service worker registration failed:', err);
      });
    });
  }

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function removeBanner() {
    if (bannerEl && bannerEl.parentNode) {
      bannerEl.parentNode.removeChild(bannerEl);
    }
    bannerEl = null;
  }

  function createBanner(contentHtml) {
    removeBanner();
    bannerEl = document.createElement('div');
    bannerEl.id = 'pwaInstallBanner';
    bannerEl.className = 'fixed bottom-0 left-0 right-0 z-[300] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]';
    bannerEl.innerHTML =
      '<div class="max-w-lg mx-auto bg-sch-black text-white rounded-2xl shadow-2xl border border-white/10 p-4 flex items-center gap-4">' +
        contentHtml +
      '</div>';
    document.body.appendChild(bannerEl);
  }

  function showAndroidInstallBanner() {
    createBanner(
      '<div class="flex-1 min-w-0">' +
        '<p class="font-semibold text-sm">Install Synergy Concepts Hub</p>' +
        '<p class="text-white/70 text-xs mt-1">Add to your home screen for quick access.</p>' +
      '</div>' +
      '<div class="flex items-center gap-2 shrink-0">' +
        '<button type="button" id="pwaInstallDismiss" class="px-3 py-2 text-xs text-white/70 hover:text-white">Not now</button>' +
        '<button type="button" id="pwaInstallBtn" class="px-4 py-2 bg-brand-orange hover:bg-brand-blue text-white text-sm font-semibold rounded-lg min-h-[44px]">Install</button>' +
      '</div>'
    );

    document.getElementById('pwaInstallBtn').addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function (choice) {
        if (choice.outcome === 'accepted') {
          localStorage.removeItem(INSTALL_DISMISS_KEY);
        }
        deferredPrompt = null;
        removeBanner();
      });
    });

    document.getElementById('pwaInstallDismiss').addEventListener('click', function () {
      localStorage.setItem(INSTALL_DISMISS_KEY, '1');
      removeBanner();
    });
  }

  function showIosInstallHint() {
    createBanner(
      '<div class="flex-1 min-w-0">' +
        '<p class="font-semibold text-sm">Install on iPhone</p>' +
        '<p class="text-white/70 text-xs mt-1">Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>.</p>' +
      '</div>' +
      '<button type="button" id="pwaInstallDismiss" class="px-3 py-2 text-xs text-white/70 hover:text-white shrink-0">Got it</button>'
    );

    document.getElementById('pwaInstallDismiss').addEventListener('click', function () {
      localStorage.setItem(IOS_HINT_DISMISS_KEY, '1');
      removeBanner();
    });
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (localStorage.getItem(INSTALL_DISMISS_KEY)) return;
    showAndroidInstallBanner();
  });

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    removeBanner();
  });

  window.addEventListener('load', function () {
    if (isStandalone()) return;

    if (isIos() && !localStorage.getItem(IOS_HINT_DISMISS_KEY)) {
      setTimeout(showIosInstallHint, 3000);
    }
  });
})();
