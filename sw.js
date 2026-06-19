var CACHE_NAME = 'canvas-v3';
var STATIC_RESOURCES = [
  '/',
  '/about.html',
  '/result.html',
  '/404.html',
  '/login.html',
  '/admin/index.html',
  '/admin/login.html',
  '/admin/users.html',
  '/admin/team.html',
  '/admin/slider.html',
  '/admin/sheet.html',
  '/admin/settings.html',
  '/admin/roles.html',
  '/admin/results.html',
  '/admin/view-result.html',
  '/admin/file-manager.html',
  '/assets/js/admin/file-manager.js',
  '/teacher/index.html',
  '/teacher/profile.html',
  '/assets/css/style.css',
  '/assets/css/admin.css',
  '/assets/css/teacher.css',
  '/assets/js/main.js',
  '/assets/js/auth.js',
  '/assets/js/api.js',
  '/assets/js/firebase-config.js',
  '/assets/js/subject-utils.js',
  '/assets/js/sheets-service.js',
  '/assets/js/admin/admin.js',
  '/assets/js/admin/dashboard.js',
  '/assets/js/admin/users.js',
  '/assets/js/admin/team.js',
  '/assets/js/admin/slider.js',
  '/assets/js/admin/sheet.js',
  '/assets/js/admin/settings.js',
  '/assets/js/admin/roles.js',
  '/assets/js/admin/results.js',
  '/assets/js/teacher/dashboard.js',
  '/assets/images/logo.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(STATIC_RESOURCES);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (n) { return n !== CACHE_NAME; })
          .map(function (n) { return caches.delete(n); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  var method = e.request.method;

  // Only cache/intercept GET requests — POST/PUT etc pass through untouched
  if (method !== 'GET') {
    e.respondWith(fetch(e.request));
    return;
  }

  // Firebase Auth/Firestore API calls - network only
  if (url.hostname === 'identitytoolkit.googleapis.com' ||
      url.hostname === 'securetoken.googleapis.com' ||
      url.hostname === 'firestore.googleapis.com' ||
      url.hostname.indexOf('firebaseio.com') >= 0) {
    e.respondWith(fetch(e.request).catch(function () {
      return new Response(JSON.stringify({ error: 'offline' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }

  // Google Apps Script web app - network only, never cache
  if (url.hostname.indexOf('google.com') >= 0 && url.hostname.indexOf('script.google.com') >= 0) {
    e.respondWith(fetch(e.request).catch(function () {
      return new Response(JSON.stringify({ error: 'offline' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      });
    }));
    return;
  }

  // CDN resources - cache first, network fallback
  if (url.hostname === 'cdnjs.cloudflare.com' || url.hostname === 'www.gstatic.com') {
    e.respondWith(
      caches.match(e.request).then(function (cached) {
        return cached || fetch(e.request).then(function (res) {
          var clone = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, clone); });
          return res;
        });
      })
    );
    return;
  }

  // Local assets - network first, cache fallback (GET only)
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res.status === 200) {
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(e.request, clone); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (cached) {
        return cached || new Response('Offline', { status: 503 });
      });
    })
  );
});
