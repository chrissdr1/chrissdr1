/* Kejadian di jalan dari TomTom Traffic Incident Details v5: kecelakaan,
   jalan ditutup, banjir, kendaraan mogok, lajur ditutup, perbaikan jalan,
   kondisi berbahaya -- dengan keterangan bahasa Indonesia (language=id-ID;
   yang belum diterjemahkan TomTom tampil dalam bahasa Inggris).

   Bentuk permintaan dari dokumentasi resmi (dicek 29-09-2026): bbox
   minLon,minLat,maxLon,maxLat maks 10.000 km2, fields berisi objek yang
   diminta, categoryFilter angka, timeValidityFilter=present. Kotaknya
   +-0,25 derajat di sekitar posisi Ibu (~55 x 55 km, ~3.000 km2): dari
   Balaraja sampai Jakarta Pusat bila Ibu di Tangerang.

   Jatah: layanan "insiden" di Lalulintas.minta (1.200/bulan per HP; gratis
   TomTom 2.500/bulan per akun). Disegarkan paling cepat tiap 20 menit
   menjelang pulang (60 menit di luar itu, diatur pemanggil) dan hanya saat
   aplikasi sedang dilihat. Pindah posisi tidak memicu permintaan baru
   selama radius 15 km Ibu masih di dalam kotak yang sudah diambil. Macet biasa (kategori Jam) tidak
   diminta: itu sudah tampak di lapisan macet dan waktu tempuh. */
"use strict";

var Kejadian = (function(){
  var UMUR = 20 * 60e3, SETENGAH = 0.25, TEPI = 0.11;   /* 0,25 - 15 km (~0,135 derajat), dibulatkan ke bawah */
  var KATEGORI = "1,3,7,8,9,11,14";
  var LABEL = { 1:"Kecelakaan", 3:"Kondisi berbahaya", 7:"Lajur ditutup", 8:"Jalan ditutup", 9:"Perbaikan jalan",
                11:"Banjir", 14:"Kendaraan mogok" };
  /* seberapa perlu Ibu tahu: jalan ditutup/banjir paling atas */
  var BOBOT = { 8:5, 11:5, 1:4, 14:3, 7:3, 3:3, 9:2 };
  var FIELDS = "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay," +
               "events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers}}}";
  var data = null, kunciData = null, pusatData = null, jalan = null, jalanSejak = 0;

  function pusat(pos){ return { lat:Math.round(pos.lat * 20) / 20, lon:Math.round(pos.lon * 20) / 20 }; }
  function kotak(pos){
    var c = pusat(pos);
    return [c.lon - SETENGAH, c.lat - SETENGAH, c.lon + SETENGAH, c.lat + SETENGAH].map(function(x){ return x.toFixed(2); }).join(",");
  }
  function url(bbox, key){
    return "https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=" + bbox +
      "&fields=" + encodeURIComponent(FIELDS) + "&language=id-ID&categoryFilter=" + KATEGORI +
      "&timeValidityFilter=present&key=" + encodeURIComponent(key);
  }
  /* Semua titik di sekitar Jabodetabek (lintang ~6 derajat): cos lintang
     cukup dihitung sekali per pasangan panggilan, bukan per titik. */
  var KM_LON = 111.2 * Math.cos(6.2 * Math.PI / 180);
  function jarakKm(a, b){
    var dLat = (b[0] - a[0]) * 111.2, dLon = (b[1] - a[1]) * KM_LON;
    return Math.sqrt(dLat * dLat + dLon * dLon);
  }
  function kotakGaris(g, lebih){
    var k = [Infinity, Infinity, -Infinity, -Infinity];
    g.forEach(function(t){ k[0] = Math.min(k[0], t[0]); k[1] = Math.min(k[1], t[1]); k[2] = Math.max(k[2], t[0]); k[3] = Math.max(k[3], t[1]); });
    return [k[0] - lebih, k[1] - lebih, k[2] + lebih, k[3] + lebih];
  }
  function dalamKotak(t, k){ return t[0] >= k[0] && t[0] <= k[2] && t[1] >= k[1] && t[1] <= k[3]; }
  function sentuh(garisA, garisB, kotakB, batasKm){
    for (var i = 0; i < garisA.length; i++){
      if (!dalamKotak(garisA[i], kotakB)) continue;
      for (var g = 0; g < garisB.length; g++) if (jarakKm(garisA[i], garisB[g]) <= batasKm) return true;
    }
    return false;
  }
  var memo = {};
  /* GeoJSON [lon,lat] -> [[lat,lon],...] */
  function titikDari(g){
    if (!g || !g.coordinates) return [];
    if (g.type === "Point") return [[g.coordinates[1], g.coordinates[0]]];
    if (g.type === "LineString") return g.coordinates.map(function(c){ return [c[1], c[0]]; });
    return [];
  }
  function olah(j){
    var out = [];
    ((j && j.incidents) || []).forEach(function(f){
      var p = f && f.properties; if (!p) return;
      var kat = p.iconCategory, t = titikDari(f.geometry); if (!LABEL[kat] || !t.length) return;
      var ev = (p.events || [])[0] || {};
      var tunda = typeof p.delay === "number" ? Math.round(p.delay / 60) : 0;
      var mag = typeof p.magnitudeOfDelay === "number" ? p.magnitudeOfDelay : 0;
      /* perbaikan jalan kecil tanpa tundaan: tidak perlu dilaporkan */
      if (kat === 9 && tunda < 2 && mag < 2) return;
      out.push({ id:p.id || (t[0][0].toFixed(4) + "," + t[0][1].toFixed(4)), kat:kat, jenis:LABEL[kat], tingkat:mag,
                 ket:ev.description || "", dari:p.from || "", ke:p.to || "",
                 jalan:(p.roadNumbers || []).join(", "), tunda:tunda,
                 panjang:typeof p.length === "number" ? Math.round(p.length / 100) / 10 : null,
                 titik:t[0], garis:t, bobot:(BOBOT[kat] || 1) + mag / 2 + Math.min(3, tunda / 10) });
    });
    return out;
  }

  /* umur: batas segar (ms), bawaan 20 menit. Posisi dianggap tercakup
     selama masih TEPI derajat dari pusat kotak yang diambil. */
  function cache(pos, umur){
    if (!pos || pos.lat == null || !data || !pusatData) return null;
    if (Math.abs(pos.lat - pusatData.lat) > TEPI || Math.abs(pos.lon - pusatData.lon) > TEPI) return null;
    return (Date.now() - data.at <= (umur || UMUR)) ? data : null;
  }
  /* Promise<{daftar, at}|null>. Tidak pernah melempar. prioritas: boleh
     memakai cadangan harian (tombol yang ditekan Ibu). */
  function segarkan(pos, umur, prioritas){
    if (!pos || pos.lat == null || pos.lon == null) return Promise.resolve(null);
    var c = cache(pos, umur); if (c) return Promise.resolve(c);
    if (typeof Lalulintas === "undefined" || !Lalulintas.aktif()) return Promise.resolve(null);
    if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve(null);
    if (jalan && Date.now() - jalanSejak < 30000) return jalan;
    var bb = kotak(pos), pc = pusat(pos);
    var p = Lalulintas.minta(url(bb, Peta.kunciTomTom()), "insiden", !!prioritas).then(function(r){
      if (!r.ok) return null;
      return r.json().then(function(j){ data = { daftar:olah(j), at:Date.now() }; kunciData = bb; pusatData = pc; memo = {}; return data; }, function(){ return null; });
    })["catch"](function(){ return null; });
    jalanSejak = Date.now();
    /* jawaban yang macet di tengah (sinyal HP) tidak boleh menahan selamanya */
    jalan = Lalulintas.batasWaktu(p, 25000).then(function(h){ jalan = null; return h; });
    return jalan;
  }

  /* Yang relevan untuk Ibu sekarang: dalam radius km dari posisi, ditandai
     "diRute" bila menyentuh garis rute pulang (<= 150 m dari salah satu
     titik rute). Urut: di rute pulang dulu, lalu bobot, lalu jarak. */
  /* Hasil disimpan per (data, garis rute, posisi ~100 m, radius): runNow
     berjalan tiap 30 detik, perhitungannya tidak perlu diulang. */
  function relevan(pos, garisPulang, radius, umur){
    var c = cache(pos, umur); if (!c) return [];
    radius = radius || 15;
    var mk = c.at + "|" + (garisPulang ? garisPulang.length + ":" + garisPulang[0] + ":" + garisPulang[garisPulang.length - 1] : "-") +
             "|" + pos.lat.toFixed(3) + "," + pos.lon.toFixed(3) + "|" + radius;
    if (memo.relevan && memo.relevan.k === mk) return memo.relevan.v;
    var p0 = [pos.lat, pos.lon], kg = garisPulang && garisPulang.length ? kotakGaris(garisPulang, 0.002) : null;
    var v = c.daftar.map(function(k){
      var jarak = Infinity;
      for (var i = 0; i < k.garis.length; i++) jarak = Math.min(jarak, jarakKm(p0, k.garis[i]));
      var diRute = !!(kg && sentuh(k.garis, garisPulang, kg, 0.15));
      return Object.assign({}, k, { jarak:Math.round(jarak * 10) / 10, diRute:diRute });
    }).filter(function(k){ return k.diRute || k.jarak <= radius; })
      .sort(function(a, b){ return (b.diRute - a.diRute) || (b.bobot - a.bobot) || (a.jarak - b.jarak); });
    memo.relevan = { k:mk, v:v };
    return v;
  }

  /* Kejadian yang menyentuh sebuah potongan jalan (mis. potongan macet di
     rute pulang, bisa beberapa km): dalam 300 m dari titik mana pun di
     potongan itu. Untuk memberi nama jalan pada potongan macet. */
  function dekatGaris(pos, garis, umur){
    var c = cache(pos, umur); if (!c || !garis || !garis.length) return null;
    var mk = "g" + c.at + "|" + garis.length + ":" + garis[0] + ":" + garis[garis.length - 1];
    if (memo[mk] !== undefined) return memo[mk];
    var kg = kotakGaris(garis, 0.003), terbaik = null, dMin = 0.3;
    c.daftar.forEach(function(k){ k.garis.forEach(function(t){ if (!dalamKotak(t, kg)) return;
      garis.forEach(function(g){ var d = jarakKm(t, g); if (d <= dMin){ dMin = d; terbaik = k; } }); }); });
    memo[mk] = terbaik;
    return terbaik;
  }

  function hapus(){ data = null; kunciData = null; pusatData = null; memo = {}; }

  return { segarkan:segarkan, cache:cache, relevan:relevan, dekatGaris:dekatGaris, hapus:hapus,
           url:url, kotak:kotak, olah:olah, LABEL:LABEL, UMUR:UMUR };
})();
