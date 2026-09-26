/* Faktor macet langsung dari TomTom Routing API (traffic=true), sebagai
   TAMBAHAN OPSIONAL pada heuristik jam-sibuk statis di engine.js. Tanpa
   kunci TomTom (Peta.kunciTomTom()), offline, atau gagal: pengaliCache()
   selalu mengembalikan null, dan pemanggilnya (jamTempuhAntar di
   engine.js) jatuh balik ke heuristik statis 1,6x/1,9x -- tidak ada satu
   angka pun yang berubah tanpa kunci ini.

   Bentuk response ditulis dari dokumentasi TomTom Routing API
   (traffic=true mengembalikan summary.travelTimeInSeconds dan
   summary.noTrafficTravelTimeInSeconds) -- PERLU VERIFIKASI saat kunci
   pertama kali dipakai, sama seperti catatan jujur untuk ubin traffic
   flow di peta.js. Kalau bentuknya beda, sesuaikan olah() di bawah. */
"use strict";

var Lalulintas = (function(){
  var UMUR_MAKS = 10 * 60 * 1000;   /* 10 menit; jauh di bawah kuota 2.500/hari TomTom */
  var cache = {};   /* kunci "lat,lon|lat,lon" -> { pengali, at } */

  function bulat(n){ return Math.round(n * 200) / 200; }   /* ~0,5 km grid, cukup untuk kunci cache */
  function kunci(A, B){
    if (!A || !B || A.lat == null || B.lat == null || A.lon == null || B.lon == null) return null;
    return bulat(A.lat) + "," + bulat(A.lon) + "|" + bulat(B.lat) + "," + bulat(B.lon);
  }

  /* Baca cache saja -- SINKRON, tidak pernah menyentuh jaringan. Dipakai
     langsung di dalam mesin hitung (engine.js) yang sinkron seluruhnya. */
  function pengaliCache(A, B){
    var k = kunci(A, B); if (!k) return null;
    var c = cache[k];
    if (!c || (Date.now() - c.at) > UMUR_MAKS) return null;
    return c.pengali;
  }

  function urlRute(A, B, key){
    return "https://api.tomtom.com/routing/1/calculateRoute/" +
      A.lat.toFixed(5) + "," + A.lon.toFixed(5) + ":" + B.lat.toFixed(5) + "," + B.lon.toFixed(5) +
      "/json?traffic=true&key=" + encodeURIComponent(key);
  }

  function olah(j){
    var s = j && j.routes && j.routes[0] && j.routes[0].summary;
    var t = s && s.travelTimeInSeconds, t0 = s && s.noTrafficTravelTimeInSeconds;
    if (typeof t !== "number" || typeof t0 !== "number" || !(t0 > 0)) return null;
    return Math.max(0.5, Math.min(4, t / t0));   /* dijepit: ubin/response aneh tidak boleh membalik urutan rute */
  }

  /* Promise<void>. Ambil satu pasangan dari TomTom kalau kuncinya ada dan
     cache-nya sudah basi. Tidak pernah melempar -- gagal berarti pemanggil
     tetap jatuh balik ke heuristik statis. */
  function segarkanSatu(A, B){
    var k = kunci(A, B); if (!k) return Promise.resolve();
    var c = cache[k];
    if (c && (Date.now() - c.at) <= UMUR_MAKS) return Promise.resolve();
    var key = (typeof Peta !== "undefined") ? Peta.kunciTomTom() : "";
    if (!key) return Promise.resolve();
    if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve();
    return fetchTimeout(urlRute(A, B, key), {}, 10000).then(function(r){
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function(j){
      var p = olah(j);
      if (p != null) cache[k] = { pengali:p, at:Date.now() };
    })["catch"](function(){ /* diam-diam gagal */ });
  }

  /* Promise<void>. Segarkan beberapa pasangan [[A,B],...] secara berurutan
     (bukan serentak) supaya tidak membanjiri kuota harian sekali panggil. */
  function segarkan(pasangan){
    return (pasangan || []).reduce(function(p, pr){
      return p.then(function(){ return segarkanSatu(pr[0], pr[1]); });
    }, Promise.resolve());
  }

  function aktif(){ return !!(typeof Peta !== "undefined" && Peta.kunciTomTom()); }

  return { pengaliCache:pengaliCache, segarkan:segarkan, aktif:aktif };
})();
