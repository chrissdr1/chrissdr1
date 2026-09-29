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
   TomTom 2.500/bulan per akun). Disegarkan paling cepat tiap 20 menit dan
   hanya saat aplikasi sedang dilihat. Macet biasa (kategori Jam) tidak
   diminta: itu sudah tampak di lapisan macet dan waktu tempuh. */
"use strict";

var Kejadian = (function(){
  var UMUR = 20 * 60e3, SETENGAH = 0.25;
  var KATEGORI = "1,3,7,8,9,11,14";
  var LABEL = { 1:"Kecelakaan", 3:"Kondisi berbahaya", 7:"Lajur ditutup", 8:"Jalan ditutup", 9:"Perbaikan jalan",
                11:"Banjir", 14:"Kendaraan mogok" };
  /* seberapa perlu Ibu tahu: jalan ditutup/banjir paling atas */
  var BOBOT = { 8:5, 11:5, 1:4, 14:3, 7:3, 3:3, 9:2 };
  var FIELDS = "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay," +
               "events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers}}}";
  var data = null, kunciData = null, jalan = null;

  function kotak(pos){
    var lat = Math.round(pos.lat * 20) / 20, lon = Math.round(pos.lon * 20) / 20;   /* grid 0,05 derajat: pindah sedikit tidak memicu permintaan baru */
    return [lon - SETENGAH, lat - SETENGAH, lon + SETENGAH, lat + SETENGAH].map(function(x){ return x.toFixed(2); }).join(",");
  }
  function url(bbox, key){
    return "https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=" + bbox +
      "&fields=" + encodeURIComponent(FIELDS) + "&language=id-ID&categoryFilter=" + KATEGORI +
      "&timeValidityFilter=present&key=" + encodeURIComponent(key);
  }
  function jarakKm(a, b){
    var dLat = (b[0] - a[0]) * 111.2, dLon = (b[1] - a[1]) * 111.2 * Math.cos(a[0] * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon);
  }
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

  function cache(pos){
    if (!pos || pos.lat == null || !data) return null;
    return (kunciData === kotak(pos) && Date.now() - data.at <= UMUR) ? data : null;
  }
  /* Promise<{daftar, at}|null>. Tidak pernah melempar. */
  function segarkan(pos){
    if (!pos || pos.lat == null || pos.lon == null) return Promise.resolve(null);
    var c = cache(pos); if (c) return Promise.resolve(c);
    if (typeof Lalulintas === "undefined" || !Lalulintas.aktif()) return Promise.resolve(null);
    if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve(null);
    if (jalan) return jalan;
    var bb = kotak(pos);
    jalan = Lalulintas.minta(url(bb, Peta.kunciTomTom()), "insiden").then(function(r){
      if (!r.ok) return null;
      return r.json().then(function(j){ data = { daftar:olah(j), at:Date.now() }; kunciData = bb; return data; }, function(){ return null; });
    })["catch"](function(){ return null; }).then(function(h){ jalan = null; return h; });
    return jalan;
  }

  /* Yang relevan untuk Ibu sekarang: dalam radius km dari posisi, ditandai
     "diRute" bila menyentuh garis rute pulang (<= 150 m dari salah satu
     titik rute). Urut: di rute pulang dulu, lalu bobot, lalu jarak. */
  function relevan(pos, garisPulang, radius){
    var c = cache(pos); if (!c) return [];
    radius = radius || 15;
    var p0 = [pos.lat, pos.lon];
    return c.daftar.map(function(k){
      var jarak = Math.min.apply(null, k.garis.map(function(t){ return jarakKm(p0, t); }));
      var diRute = false;
      if (garisPulang && garisPulang.length){
        for (var i = 0; i < k.garis.length && !diRute; i++)
          for (var g = 0; g < garisPulang.length; g++)
            if (jarakKm(k.garis[i], garisPulang[g]) <= 0.15){ diRute = true; break; }
      }
      return Object.assign({}, k, { jarak:Math.round(jarak * 10) / 10, diRute:diRute });
    }).filter(function(k){ return k.diRute || k.jarak <= radius; })
      .sort(function(a, b){ return (b.diRute - a.diRute) || (b.bobot - a.bobot) || (a.jarak - b.jarak); });
  }

  /* Kejadian yang menyentuh sebuah potongan jalan (mis. potongan macet di
     rute pulang, bisa beberapa km): dalam 300 m dari titik mana pun di
     potongan itu. Untuk memberi nama jalan pada potongan macet. */
  function dekatGaris(pos, garis){
    var c = cache(pos); if (!c || !garis || !garis.length) return null;
    var terbaik = null, dMin = 0.3;
    c.daftar.forEach(function(k){ k.garis.forEach(function(t){ garis.forEach(function(g){ var d = jarakKm(t, g); if (d <= dMin){ dMin = d; terbaik = k; } }); }); });
    return terbaik;
  }

  function hapus(){ data = null; kunciData = null; }

  return { segarkan:segarkan, cache:cache, relevan:relevan, dekatGaris:dekatGaris, hapus:hapus,
           url:url, kotak:kotak, olah:olah, LABEL:LABEL, UMUR:UMUR };
})();
