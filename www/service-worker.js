/* Billfold — service worker for the web/PWA preview.
   Everything Billfold needs lives in this one HTML file, so there's no real "asset list" to
   optimize — this exists purely so the app can still open with no signal, once it's been
   loaded here at least once while online.

   Strategy:
   - Navigations (opening/reloading the app): network-first, so you always get the latest
     version when you have a connection, falling back to the cached shell the instant a
     request fails. That's what makes "no signal" still open the app.
   - Everything else (the Google Fonts stylesheet, the font files themselves): cache-first,
     since none of that ever changes and there's no reason to wait on the network for it once
     it's cached.

   CACHE_NAME is versioned on purpose — bump it (v1 -> v2) on a future deploy if this file's
   own caching logic ever changes, so old installs don't get stuck on stale caching behavior.
   The app shell itself doesn't need a version bump here; network-first already keeps it fresh
   whenever there's a connection. */
const CACHE_NAME = "billfold-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html"
];

self.addEventListener("install", function(event){
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache){ return cache.addAll(APP_SHELL); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function(event){
  event.waitUntil(
    caches.keys()
      .then(function(names){
        return Promise.all(names.filter(function(n){ return n !== CACHE_NAME; }).map(function(n){ return caches.delete(n); }));
      })
      .then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function(event){
  var req = event.request;
  if(req.method !== "GET") return; // never intercept anything that isn't a plain read

  // Page loads / reloads: try the network first, cache the fresh copy for next time, and fall
  // back to whatever's cached the moment the network fails (offline, or a flaky connection).
  if(req.mode === "navigate"){
    event.respondWith(
      fetch(req)
        .then(function(res){
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put("./index.html", copy); });
          return res;
        })
        .catch(function(){ return caches.match("./index.html"); })
    );
    return;
  }

  // Everything else (fonts, and any other static request the page makes): cache-first, then
  // fill the cache in the background for next time. Cross-origin "opaque" responses (like the
  // Google Fonts CDN, fetched without CORS) can still be cached and replayed offline even
  // though their contents aren't readable here.
  event.respondWith(
    caches.match(req).then(function(cached){
      if(cached) return cached;
      return fetch(req).then(function(res){
        if(res && (res.ok || res.type === "opaque")){
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); });
        }
        return res;
      }).catch(function(){ return cached; }); // nothing cached and offline: request just fails
    })
  );
});
