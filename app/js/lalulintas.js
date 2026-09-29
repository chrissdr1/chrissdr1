/* Faktor macet langsung dari TomTom Routing API (traffic=true), sebagai
   TAMBAHAN OPSIONAL pada heuristik jam-sibuk statis di engine.js. Tanpa
   kunci TomTom (Peta.kunciTomTom()), offline, atau gagal: pengaliCache()
   selalu mengembalikan null, dan pemanggilnya (jamTempuhAntar di
   engine.js) jatuh balik ke heuristik statis 1,6x/1,9x -- tidak ada satu
   angka pun yang berubah tanpa kunci ini.

   Respons yang sama juga dipakai untuk garis rute di peta (routes[0].
   legs[].points, lat/lon per titik) lewat poinCache() -- tidak ada
   panggilan TomTom tambahan untuk itu, cuma membaca ulang bagian lain
   dari respons yang sudah diambil untuk pengali macet.

   Bentuk response ditulis dari dokumentasi TomTom Routing API
   (traffic=true mengembalikan summary.travelTimeInSeconds dan
   summary.noTrafficTravelTimeInSeconds; routeRepresentation=polyline
   mengembalikan legs[].points sebagai {latitude,longitude}) -- PERLU
   VERIFIKASI saat kunci pertama kali dipakai, sama seperti catatan
   jujur untuk ubin traffic flow di peta.js. Kalau bentuknya beda,
   sesuaikan olah() di bawah; poin yang tidak dikenali diam-diam jadi
   null dan garis rute tidak digambar, tidak memengaruhi pengali macet. */
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

  /* Titik-titik rute (buat digambar di peta) dari respons yang sama dengan
     pengaliCache -- null kalau belum ada, sudah basi, atau responsnya tidak
     menyertakan geometri (mis. fixture uji tanpa legs/points). */
  function poinCache(A, B){
    var k = kunci(A, B); if (!k) return null;
    var c = cache[k];
    if (!c || (Date.now() - c.at) > UMUR_MAKS) return null;
    return c.poin || null;
  }

  function urlRute(A, B, key, opsi){
    opsi = opsi || {};
    return "https://api.tomtom.com/routing/1/calculateRoute/" +
      A.lat.toFixed(5) + "," + A.lon.toFixed(5) + ":" + B.lat.toFixed(5) + "," + B.lon.toFixed(5) +
      "/json?traffic=true" + (opsi.tanpaGaris ? "" : "&routeRepresentation=polyline") +
      (opsi.departAt ? "&departAt=" + encodeURIComponent(opsi.departAt) + "&computeTravelTimeFor=all" : "") +
      "&key=" + encodeURIComponent(key);
  }

  /* ---- Jatah harian bersama (semua permintaan non-ubin TomTom lewat sini) ----
     Gratis TomTom: 2.500 permintaan non-ubin per hari PER KUNCI, dipakai
     bersama Routing / macet langsung / pengukuran. Kunci yang sama bisa
     dipakai di dua HP (Ibu dan anak), jadi tiap HP dibatasi 1.100 per hari.
     Balasan 429 (jatah habis) menghentikan SEMUA permintaan sampai besok. */
  var LS_JATAH = "tomtom-jatah", MAKS_HARIAN = 1100;
  function jatah(){
    var j = null; try { j = JSON.parse(localStorage.getItem(LS_JATAH) || "null"); } catch (e) {}
    var hari = iso(new Date());
    if (!j || j.tgl !== hari) j = { tgl:hari, n:0, stop:false };
    return j;
  }
  function simpanJatah(j){ try { localStorage.setItem(LS_JATAH, JSON.stringify(j)); } catch (e) {} }
  function bolehMinta(){ var j = jatah(); return !j.stop && j.n < MAKS_HARIAN; }
  function sisaJatah(){ var j = jatah(); return j.stop ? 0 : Math.max(0, MAKS_HARIAN - j.n); }
  /* Promise<Response>; menolak (tanpa menghubungi TomTom) kalau jatah habis. */
  function minta(url){
    var j = jatah();
    if (j.stop || j.n >= MAKS_HARIAN) return Promise.reject(new Error("jatah"));
    j.n++; simpanJatah(j);
    return fetchTimeout(url, {}, 10000).then(function(r){
      if (r.status === 429){ var jj = jatah(); jj.stop = true; simpanJatah(jj); }
      return r;
    });
  }

  function poinDari(route){
    var legs = route && route.legs; if (!legs || !legs.length) return null;
    var poin = [];
    for (var i = 0; i < legs.length; i++){
      var titik = legs[i] && legs[i].points; if (!titik) continue;
      for (var j = 0; j < titik.length; j++){
        var p = titik[j];
        if (p && typeof p.latitude === "number" && typeof p.longitude === "number") poin.push([p.latitude, p.longitude]);
      }
    }
    return poin.length >= 2 ? poin : null;
  }

  function olah(j){
    var route = j && j.routes && j.routes[0];
    var s = route && route.summary;
    var t = s && s.travelTimeInSeconds, t0 = s && s.noTrafficTravelTimeInSeconds;
    if (typeof t !== "number" || typeof t0 !== "number" || !(t0 > 0)) return null;
    return { pengali: Math.max(0.5, Math.min(4, t / t0)),   /* dijepit: ubin/response aneh tidak boleh membalik urutan rute */
             poin: poinDari(route) };
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
    return minta(urlRute(A, B, key)).then(function(r){
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function(j){
      var hasil = olah(j);
      if (hasil != null) cache[k] = { pengali:hasil.pengali, poin:hasil.poin, at:Date.now() };
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

  /* Pola macet BIASA untuk perjalanan pulang yang berangkat nanti: TomTom
     Routing dengan departAt (waktu berangkat di masa depan -> TomTom memakai
     pola lalu lintas historis jam itu). Hanya untuk ditampilkan; mesin tetap
     memakai menit terukur Rute 700K. Format departAt ditulis dari dokumentasi
     (yyyy-MM-ddTHH:mm:ss dengan zona waktu, di sini +07:00 WIB) -- PERLU
     VERIFIKASI saat kunci dipakai; gagal/format ditolak = diam, tanpa angka. */
  var cachePulang = {};   /* "lat,lon|tgl|HH:MM" -> { menit, at } */
  var RUMAH_TITIK = (typeof RUMAH !== "undefined") ? { lat:RUMAH.lat, lon:RUMAH.lon } : null;
  function jamIso(tgl, jam){ return tgl + "T" + hhmm(jam) + ":00+07:00"; }
  function kunciPulang(A, jam, tgl){
    if (!A || A.lat == null) return null;
    return bulat(A.lat) + "," + bulat(A.lon) + "|" + tgl + "|" + hhmm(Math.round(jam * 4) / 4);
  }
  function pulangBiasaCache(A, jam, tgl){
    var k = kunciPulang(A, jam, tgl), c = k && cachePulang[k];
    return c ? c.menit : null;
  }
  function pulangBiasa(A, jam, tgl){
    var k = kunciPulang(A, jam, tgl), key = aktif() ? Peta.kunciTomTom() : "";
    if (!k || !key || !RUMAH_TITIK || cachePulang[k]) return Promise.resolve();
    /* departAt harus di masa depan; yang sudah lewat tidak diminta */
    var kini = new Date();
    if (tgl < iso(kini) || (tgl === iso(kini) && jam < kini.getHours() + kini.getMinutes() / 60)) return Promise.resolve();
    if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve();
    var jamB = Math.round(jam * 4) / 4;
    var url = urlRute(A, RUMAH_TITIK, key, { departAt:jamIso(tgl, jamB), tanpaGaris:true });
    return minta(url).then(function(r){
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function(j){
      var s = j && j.routes && j.routes[0] && j.routes[0].summary;
      if (s && typeof s.travelTimeInSeconds === "number") cachePulang[k] = { menit:Math.round(s.travelTimeInSeconds / 60), at:Date.now() };
    })["catch"](function(){ /* diam-diam gagal */ });
  }

  return { pengaliCache:pengaliCache, poinCache:poinCache, segarkan:segarkan, aktif:aktif,
           pulangBiasa:pulangBiasa, pulangBiasaCache:pulangBiasaCache,
           urlRute:urlRute, minta:minta, bolehMinta:bolehMinta, sisaJatah:sisaJatah, MAKS_HARIAN:MAKS_HARIAN };
})();
