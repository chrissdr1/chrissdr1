/* Service worker: membuat aplikasi bisa dipasang di HP dan tetap terbuka
   tanpa sinyal. Cache diberi nama menurut VERSION; naikkan VERSION setiap
   kali ada file yang berubah (samakan dengan TERBIT di js/data.js -- tes
   memeriksanya). Strategi: sajikan dari cache dulu supaya cepat, lalu ambil
   versi baru di latar belakang untuk pembukaan berikutnya. */
var VERSION = "2026-10-04.1";
var CACHE = "shanti-" + VERSION;
var ASSETS = [
  "./", "index.html", "style.css", "manifest.webmanifest", "rute-700k.html",
  "js/data.js", "js/engine.js", "js/ai.js", "js/cuaca.js", "js/peta.js", "js/lalulintas.js", "js/ukurmacet.js", "js/kejadian.js", "js/spklu.js", "js/acara.js", "js/sinkron.js", "js/rekomendasi.js", "js/baterai.js", "js/peluang.js", "js/jejak.js", "js/belajar.js", "js/app.js",
  "vendor/anthropic-sdk.min.js", "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "vendor/leaflet/images/marker-icon.png", "vendor/leaflet/images/marker-icon-2x.png",
  "vendor/leaflet/images/marker-shadow.png", "vendor/leaflet/images/layers.png", "vendor/leaflet/images/layers-2x.png",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"
];

self.addEventListener("install", function(e){
  /* Satu-satu, bukan addAll(): sinyal HP yang goyah saat pemasangan pertama
     bisa membuat SATU aset gagal diambil -- addAll membatalkan SEMUANYA
     kalau begitu, dan mode offline yang dijanjikan tidak pernah siap tanpa
     pesan apa pun. allSettled menyimpan yang berhasil dan mencatat yang gagal
     di console; aset yang gagal akan diambil ulang lewat strategi cache-first
     yang sudah ada di "fetch" begitu ada sinyal lagi. */
  e.waitUntil(caches.open(CACHE).then(function(c){
    return Promise.all(ASSETS.map(function(a){
      return c.add(a)["catch"](function(err){ console.warn("sw: gagal precache " + a, err); });
    }));
  }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener("activate", function(e){
  e.waitUntil(caches.keys().then(function(keys){
    var lamaAda = keys.some(function(k){ return k !== CACHE; });   /* bukan pemasangan pertama */
    return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }))
      .then(function(){ return lamaAda; });
  }).then(function(lamaAda){
    return self.clients.claim().then(function(){
      if (!lamaAda) return;
      return self.clients.matchAll().then(function(cs){
        cs.forEach(function(c){ c.postMessage({ type:"sw-updated", version:VERSION }); });
      });
    });
  }));
});

/* Pesan dari server peringatan (worker/): tampil walau aplikasi tertutup. */
self.addEventListener("push", function(e){
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { isi:e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.judul || "Hallo Shanti", { body:d.isi || "", tag:d.tag || "peringatan", renotify:true,
    icon:"icons/icon-192.png", badge:"icons/icon-192.png", vibrate:[300, 150, 300] }));
});
/* Notifikasi peringatan (baterai, waktunya pulang, jalan ditutup): disentuh =
   buka / tampilkan aplikasi. */
self.addEventListener("notificationclick", function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type:"window", includeUncontrolled:true }).then(function(list){
    for (var i = 0; i < list.length; i++) if ("focus" in list[i]) return list[i].focus();
    if (self.clients.openWindow) return self.clients.openWindow("./");
  }));
});
self.addEventListener("fetch", function(e){
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  /* Font Google dan api.anthropic.com tidak disentuh: langsung ke jaringan. */
  if (url.origin !== self.location.origin) return;
  e.respondWith(caches.open(CACHE).then(function(c){
    return c.match(req, { ignoreSearch:true }).then(function(hit){
      var segar = fetch(req).then(function(res){
        if (res && res.ok) c.put(req, res.clone());
        return res;
      })["catch"](function(){ return hit; });
      return hit || segar;
    });
  }));
});
