// Service Worker for Synergy Concepts Hub
// Implements caching strategies for optimal performance

const CACHE_NAME = 'sch-v1.6.2';
const STATIC_CACHE = 'sch-static-v1.6.2';
const DYNAMIC_CACHE = 'sch-dynamic-v1.6.2';
const IMAGE_CACHE = 'sch-images-v1.6.2';

// Resources to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/tailwind.css',
  '/images/Website%20Logo%202.png',
  '/images/sch-logo-32.png',
  '/images/sch-logo-192.png',
  '/js/pwa.js',
  '/js/site-config.js',
  '/js/analytics.js',
  '/js/academy-portfolio.js',
  '/js/main-portfolio.js',
];

// Cache strategies
const CACHE_STRATEGIES = {
  // Cache first for static assets
  CACHE_FIRST: 'cache-first',
  // Network first for dynamic content
  NETWORK_FIRST: 'network-first',
  // Stale while revalidate for images
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate'
};

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(function (cache) {
        return Promise.allSettled(
          STATIC_ASSETS.map(function (url) {
            return cache.add(url);
          })
        );
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (
              cacheName !== STATIC_CACHE &&
              cacheName !== DYNAMIC_CACHE &&
              cacheName !== IMAGE_CACHE &&
              cacheName.startsWith('sch-')
            ) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('Service Worker activated');
        return self.clients.claim();
      })
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip Chrome extension requests
  if (url.protocol === 'chrome-extension:') return;
  
  // Handle different resource types
  if (isImageRequest(request)) {
    event.respondWith(handleImageRequest(request));
  } else if (isStaticAsset(request)) {
    event.respondWith(handleStaticAsset(request));
  } else {
    event.respondWith(handleDynamicRequest(request));
  }
});

// Check if request is for an image
function isImageRequest(request) {
  return request.destination === 'image' || 
         /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i.test(new URL(request.url).pathname);
}

// Check if request is for a static asset
function isStaticAsset(request) {
  const url = new URL(request.url);
  return url.pathname.endsWith('.css') ||
         url.pathname.endsWith('.js') ||
         url.pathname.endsWith('.json') ||
         url.pathname === '/manifest.json' ||
         STATIC_ASSETS.some(function (asset) { return url.href.includes(asset); });
}

function isClientLogoRequest(request) {
  return /\/images\/clients\//i.test(new URL(request.url).pathname);
}

// Handle image requests — client logos always network-first (fresh assets)
async function handleImageRequest(request) {
  if (isClientLogoRequest(request)) {
    return handleClientLogoRequest(request);
  }

  const cache = await caches.open(IMAGE_CACHE);
  const cachedResponse = await cache.match(request);
  
  // Return cached version immediately if available
  if (cachedResponse) {
    // Fetch fresh version in background
    fetch(request)
      .then(response => {
        if (response.ok) {
          cache.put(request, response.clone());
        }
      })
      .catch(() => {
        // Silent fail for background updates
      });
    
    return cachedResponse;
  }
  
  // Fetch and cache if not in cache
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Return offline placeholder for images
    return new Response(
      '<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3f4f6"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="#9ca3af">Image Offline</text></svg>',
      { headers: { 'Content-Type': 'image/svg+xml' } }
    );
  }
}

async function handleClientLogoRequest(request) {
  const cache = await caches.open(IMAGE_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw error;
  }
}

// Handle static assets with cache-first strategy
async function handleStaticAsset(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    console.log('Failed to fetch static asset:', request.url);
    throw error;
  }
}

// Handle dynamic requests with network-first strategy
async function handleDynamicRequest(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      return caches.match('/index.html') || 
             new Response('Offline - Please check your connection', {
               status: 503,
               headers: { 'Content-Type': 'text/html' }
             });
    }
    
    throw error;
  }
}

// Background sync for form submissions (when supported)
self.addEventListener('sync', (event) => {
  if (event.tag === 'contact-form') {
    event.waitUntil(syncContactForm());
  }
});

async function syncContactForm() {
  // Handle offline form submissions
  const forms = await getStoredForms();
  for (const form of forms) {
    try {
      await submitForm(form);
      await removeStoredForm(form.id);
    } catch (error) {
      console.log('Form sync failed, will retry:', error);
    }
  }
}

// Helper functions for form storage (implement as needed)
async function getStoredForms() {
  // Implementation would depend on IndexedDB or similar storage
  return [];
}

async function submitForm(formData) {
  // Implementation for actual form submission
  return fetch('/submit-contact', {
    method: 'POST',
    body: JSON.stringify(formData),
    headers: { 'Content-Type': 'application/json' }
  });
}

async function removeStoredForm(formId) {
  // Implementation to remove successfully submitted forms
}