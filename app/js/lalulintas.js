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
      (opsi.departAt ? "&departAt=" + encodeURIComponent(opsi.departAt) : "") +
      (opsi.departAt || opsi.semuaWaktu ? "&computeTravelTimeFor=all" : "") +
      (opsi.seksiMacet ? "&sectionType=traffic" : "") +
      "&key=" + encodeURIComponent(key);
  }

  /* ---- Jatah TomTom (semua permintaan non-ubin lewat minta()) ----
     Paket gratis TomTom sekarang dihitung PER BULAN, PER LAYANAN (halaman
     harga resmi, dicek 29-09-2026): Routing 20.000/bulan, Traffic Incident
     Details 2.500/bulan. Lewat batas dijawab 429 (FAQ resmi), tanpa tagihan
     kalau tidak ada kartu kredit. Kunci yang sama bisa dipakai di dua HP
     (Ibu dan anak), jadi tiap HP memakai paling banyak SEPARUH: Routing
     10.000, kejadian jalan 1.200 per bulan kalender.
     Jatah harian = sisa bulan ini dibagi sisa hari (termasuk hari ini),
     paling banyak 2x rata-rata -- yang tidak terpakai kemarin boleh dipakai
     hari ini, tapi tidak dihabiskan sekaligus.
     Hitungan dikunci lintas tab (navigator.locks): aplikasi terpasang + tab
     browser yang terbuka bersamaan tidak menghitung dobel.
     429 per layanan: jeda 5 menit dulu (bisa jadi cuma terlalu cepat per
     detik); 3 kali 429 tanpa jawaban sukses di antaranya = layanan itu
     berhenti sampai besok. */
  var LS_JATAH = "tomtom-jatah", JEDA_429 = 5 * 60e3, BATAS_429 = 3;
  var PRODUK = { rute:{ bulan:10000, nama:"rute" }, insiden:{ bulan:1200, nama:"kejadian jalan" } };
  function blnDari(t){ return t.slice(0, 7); }
  function hariDalamBulan(t){ var y = +t.slice(0, 4), m = +t.slice(5, 7); return new Date(y, m, 0).getDate(); }
  function jatah(){
    var j = null; try { j = JSON.parse(localStorage.getItem(LS_JATAH) || "null"); } catch (e) {}
    var hari = iso(new Date()), bln = blnDari(hari);
    if (!j || j.v !== 2 || j.bln !== bln) j = { v:2, bln:bln, p:{} };
    Object.keys(PRODUK).forEach(function(k){
      var x = j.p[k] || (j.p[k] = { bulan:0, tgl:hari, hari:0, stop:false, n429:0, jedaSampai:0 });
      if (x.tgl !== hari){ x.tgl = hari; x.hari = 0; x.stop = false; x.n429 = 0; x.jedaSampai = 0; }
    });
    return j;
  }
  function simpanJatah(j){ try { localStorage.setItem(LS_JATAH, JSON.stringify(j)); } catch (e) {} }
  function produkDari(p){ return PRODUK[p] ? p : "rute"; }
  /* Jatah hari ini untuk layanan p (angka tetap sepanjang hari). */
  function jatahHari(p, j){
    p = produkDari(p); j = j || jatah();
    var x = j.p[p], hari = iso(new Date()), n = hariDalamBulan(hari), sisaHari = n - (+hari.slice(8, 10)) + 1;
    var sisaBulan = Math.max(0, PRODUK[p].bulan - (x.bulan - x.hari));
    return Math.max(0, Math.min(Math.floor(2 * PRODUK[p].bulan / n), Math.floor(sisaBulan / sisaHari)));
  }
  /* null = boleh; selain itu: "stop" (3x 429, sampai besok), "penuh" (jatah
     hari ini habis), "jeda" (menunggu setelah 429). */
  function tertahan(p, j){
    p = produkDari(p); j = j || jatah();
    var x = j.p[p];
    if (x.stop) return "stop";
    if (x.hari >= jatahHari(p, j) || x.bulan >= PRODUK[p].bulan) return "penuh";
    if (x.jedaSampai && Date.now() < x.jedaSampai) return "jeda";
    return null;
  }
  function bolehMinta(p){ return tertahan(p) === null; }
  function sisaJatah(p){ p = produkDari(p); var j = jatah(); return j.p[p].stop ? 0 : Math.max(0, jatahHari(p, j) - j.p[p].hari); }
  function statusJatah(p){
    p = produkDari(p); var j = jatah(), x = j.p[p];
    return { hari:x.hari, hariMaks:jatahHari(p, j), bulan:x.bulan, bulanMaks:PRODUK[p].bulan, tahan:tertahan(p, j) };
  }
  /* fn dijalankan eksklusif lintas tab bila browser mendukung Web Locks. */
  function eksklusif(nama, fn){
    if (typeof navigator !== "undefined" && navigator.locks && navigator.locks.request)
      return navigator.locks.request(nama, function(){ return fn(); });
    return Promise.resolve().then(fn);
  }
  /* Promise<Response>; menolak (tanpa menghubungi TomTom) kalau jatah
     layanan itu habis atau sedang jeda. p: "rute" (bawaan) | "insiden". */
  function minta(url, p){
    p = produkDari(p);
    return eksklusif("tomtom-jatah", function(){
      var j = jatah();
      if (tertahan(p, j)) return false;
      j.p[p].hari++; j.p[p].bulan++; simpanJatah(j); return true;
    }).then(function(boleh){
      if (!boleh) throw new Error("jatah");
      return fetchTimeout(url, {}, 10000);
    }).then(function(r){
      if (r.status === 429 || (r.ok && jatah().p[p].n429)){
        return eksklusif("tomtom-jatah", function(){
          var jj = jatah(), x = jj.p[p];
          if (r.status === 429){
            x.n429 = (x.n429 || 0) + 1;
            if (x.n429 >= BATAS_429) x.stop = true; else x.jedaSampai = Date.now() + JEDA_429;
          } else x.n429 = 0;
          simpanJatah(jj);
        }).then(function(){ return r; });
      }
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

  /* ---- Jalan pulang SEKARANG dari posisi Ibu (macet langsung) ----
     Satu permintaan Routing: traffic=true (sekarang), computeTravelTimeFor=
     all (juga waktu "biasanya jam ini" dan "lancar"), sectionType=traffic
     (potongan jalan yang macet: tundaan, tingkat, kecepatan), dan garis rute.
     Disimpan 10 menit per titik (~0,5 km). Hanya tampilan + saran jam
     mulai pulang; mesin hitung tidak diubah olehnya. */
  var cacheRumah = {};
  function olahPulang(j){
    var route = j && j.routes && j.routes[0], s = route && route.summary;
    if (!s || typeof s.travelTimeInSeconds !== "number" || !(s.travelTimeInSeconds > 0)) return null;
    var poin = poinDari(route) || null, macet = [];
    (route.sections || []).forEach(function(x){
      if (!x || x.sectionType !== "TRAFFIC" || !(x.delayInSeconds > 0)) return;
      var a = poin && poin[x.startPointIndex], b = poin && poin[x.endPointIndex];
      macet.push({ tunda:Math.round(x.delayInSeconds / 60 * 10) / 10, tingkat:typeof x.magnitudeOfDelay === "number" ? x.magnitudeOfDelay : 0,
                   jenis:x.simpleCategory || "", kmj:typeof x.effectiveSpeedInKmh === "number" ? x.effectiveSpeedInKmh : null,
                   dari:x.startPointIndex, sampai:x.endPointIndex, titik:a || null, ujung:b || null,
                   garis:(poin && x.endPointIndex > x.startPointIndex) ? poin.slice(x.startPointIndex, x.endPointIndex + 1) : null });
    });
    macet.sort(function(p, q){ return q.tunda - p.tunda; });
    function m(v){ return typeof v === "number" && v > 0 ? Math.round(v / 60) : null; }
    return { menit:m(s.travelTimeInSeconds), biasa:m(s.historicTrafficTravelTimeInSeconds), lancar:m(s.noTrafficTravelTimeInSeconds),
             tunda:typeof s.trafficDelayInSeconds === "number" ? Math.round(s.trafficDelayInSeconds / 60) : null,
             km:typeof s.lengthInMeters === "number" ? Math.round(s.lengthInMeters / 100) / 10 : null,
             macet:macet, poin:poin, at:Date.now() };
  }
  function kunciRumah(A){ return (A && A.lat != null && A.lon != null) ? bulat(A.lat) + "," + bulat(A.lon) : null; }
  function pulangSekarangCache(A){
    var k = kunciRumah(A), c = k && cacheRumah[k];
    return (c && Date.now() - c.at <= UMUR_MAKS) ? c : null;
  }
  /* Promise<hasil|null>. Tidak pernah melempar. */
  function pulangSekarang(A){
    var k = kunciRumah(A); if (!k || !RUMAH_TITIK) return Promise.resolve(null);
    var c = pulangSekarangCache(A); if (c) return Promise.resolve(c);
    if (!aktif()) return Promise.resolve(null);
    if (jarakLurusKm(A, RUMAH_TITIK) < 1) return Promise.resolve(null);   /* sudah di rumah */
    if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve(null);
    var url = urlRute(A, RUMAH_TITIK, Peta.kunciTomTom(), { semuaWaktu:true, seksiMacet:true });
    return minta(url, "rute").then(function(r){
      if (!r.ok) return null;
      return r.json().then(function(j){ var h = olahPulang(j); if (h) cacheRumah[k] = h; return h; }, function(){ return null; });
    })["catch"](function(){ return null; });
  }
  function jarakLurusKm(A, B){
    var dLat = (B.lat - A.lat) * 111.2, dLon = (B.lon - A.lon) * 111.2 * Math.cos(A.lat * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon);
  }

  return { pulangSekarang:pulangSekarang, pulangSekarangCache:pulangSekarangCache,
           pengaliCache:pengaliCache, poinCache:poinCache, segarkan:segarkan, aktif:aktif,
           pulangBiasa:pulangBiasa, pulangBiasaCache:pulangBiasaCache,
           urlRute:urlRute, minta:minta, bolehMinta:bolehMinta, tertahan:tertahan, sisaJatah:sisaJatah, jatahHari:jatahHari, statusJatah:statusJatah, PRODUK:PRODUK };
})();
