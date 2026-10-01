/* Jenis colokan dan daya SPKLU dari TomTom Search API (Nearby Search),
   dan apakah cocok untuk mobil Ibu.

   Mobil Ibu: BYD Atto 1 Dynamic (baterai 30,08 kWh = CAP di aplikasi).
   Brosur BYD Indonesia: DC CCS2 maks 30 kW, AC Type 2 maks 6,6 kW. Jadi
   SPKLU 50/100/200 kW tetap mengisi paling cepat 30 kW, dan SPKLU yang
   cuma punya Type 2 (AC) butuh berjam-jam -- bukan tempat ngecas saat narik.

   Permintaan (dokumentasi resmi Nearby Search, dicek 29-09-2026):
   /search/2/nearbySearch/.json?lat&lon&radius(m)&limit(maks 100)&ofs&
   connectorSet=... -- connectorSet membatasi hasil ke "Electric Vehicle
   Station" yang punya colokan itu (kode kategori 7309 tidak dipakai karena
   belum terverifikasi di dokumen resmi). Jawaban: results[].poi.name,
   position{lat,lon}, address.freeformAddress, chargingPark.connectors[]
   {connectorType, ratedPowerKW, currentType}.

   Status kosong/terisi TIDAK ada untuk Indonesia (cakupan EV TomTom:
   Indonesia hanya data statis), jadi yang disimpan hanya lokasi + colokan.
   Diambil sekali per 30 hari (12 titik x 9,5 km menutup Balaraja-Bekasi
   barat, Soetta-Serpong), jatah layanan "cari" di Lalulintas.minta. */
"use strict";

var SpkluTT = (function(){
  var LS = "spklu-tomtom", UMUR = 30 * 864e5, JARI = 9500;
  var KONEKTOR = ["IEC62196Type2CCS", "IEC62196Type2Outlet", "IEC62196Type2CableAttached", "Chademo", "GBT20234Part2",
                  "GBT20234Part3", "IEC62196Type1", "IEC62196Type1CCS", "StandardHouseholdCountrySpecific", "Tesla"];
  var NAMA = { IEC62196Type2CCS:"CCS2", IEC62196Type2Outlet:"Type 2 (soket)", IEC62196Type2CableAttached:"Type 2 (kabel)",
               Chademo:"CHAdeMO", GBT20234Part2:"GB/T AC", GBT20234Part3:"GB/T DC", IEC62196Type1:"Type 1",
               IEC62196Type1CCS:"CCS1", StandardHouseholdCountrySpecific:"stopkontak rumah", Tesla:"Tesla" };
  var MOBIL = { nama:"Atto 1", dc:["IEC62196Type2CCS"], dcKW:30, ac:["IEC62196Type2CableAttached", "IEC62196Type2Outlet"], acKW:6.6 };
  var TITIK = [];
  [-6.14, -6.26, -6.38].forEach(function(la){ [106.51, 106.63, 106.75, 106.87].forEach(function(lo){ TITIK.push([la, lo]); }); });
  var jalan = null, data = null;

  function muat(){
    if (data) return data;
    try { data = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { data = null; }
    if (!data || data.v !== 1 || !Array.isArray(data.stasiun)) data = null;
    return data;
  }
  function simpan(d){ data = d; try { localStorage.setItem(LS, JSON.stringify(d)); } catch (e) {} }
  function perluSegar(){ var d = muat(); return !d || Date.now() - d.at > UMUR; }

  function url(la, lo, ofs, key){
    return "https://api.tomtom.com/search/2/nearbySearch/.json?lat=" + la + "&lon=" + lo + "&radius=" + JARI +
      "&limit=100" + (ofs ? "&ofs=" + ofs : "") + "&countrySet=ID&connectorSet=" + KONEKTOR.join(",") + "&key=" + encodeURIComponent(key);
  }
  function olah(j){
    return ((j && j.results) || []).map(function(r){
      var p = r && r.position, cs = r && r.chargingPark && r.chargingPark.connectors;
      if (!p || typeof p.lat !== "number" || typeof p.lon !== "number" || !Array.isArray(cs) || !cs.length) return null;
      return { id:String(r.id || (p.lat.toFixed(5) + "," + p.lon.toFixed(5))), n:String((r.poi && r.poi.name) || "SPKLU"),
               lat:p.lat, lon:p.lon, alamat:String((r.address && r.address.freeformAddress) || ""),
               col:cs.filter(function(c){ return c && typeof c.connectorType === "string"; })
                     .map(function(c){ return { t:c.connectorType, kw:(typeof c.ratedPowerKW === "number" && c.ratedPowerKW > 0) ? c.ratedPowerKW : null,
                                                 arus:typeof c.currentType === "string" ? c.currentType : "" }; }) };
    }).filter(function(s){ return s && s.col.length; });
  }

  /* Promise<{jumlah, alasan}>. Tidak pernah melempar. paksa: abaikan umur 30 hari. */
  function segarkan(paksa){
    if (jalan) return jalan;
    if (!paksa && !perluSegar()) return Promise.resolve({ jumlah:(muat() || { stasiun:[] }).stasiun.length, alasan:"masih segar" });
    if (typeof Lalulintas === "undefined" || !Lalulintas.aktif()) return Promise.resolve({ jumlah:0, alasan:"tanpa kunci" });
    if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve({ jumlah:0, alasan:"offline" });
    var key = Peta.kunciTomTom(), semua = {}, gagal = 0, diminta = 0, i = 0;
    var antre = TITIK.map(function(t){ return { la:t[0], lo:t[1], ofs:0 }; });
    function jeda(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }
    function langkah(){
      if (i >= antre.length) return Promise.resolve();
      var it = antre[i++];
      diminta++;
      return Lalulintas.minta(url(it.la, it.lo, it.ofs, key), "cari").then(function(r){
        if (!r.ok){ gagal++; return; }
        return r.json().then(function(j){
          olah(j).forEach(function(s){ semua[s.id] = s; });
          var n = (j && j.results && j.results.length) || 0, total = (j && j.summary && j.summary.totalResults) || 0;
          /* lebih dari 100 di satu lingkaran: satu halaman lagi (maks 200) */
          if (n >= 100 && total > it.ofs + 100 && it.ofs < 100) antre.push({ la:it.la, lo:it.lo, ofs:it.ofs + 100 });
        }, function(){ gagal++; });
      })["catch"](function(e){ gagal++; if (e && e.message === "jatah") i = antre.length; })
        .then(function(){ return jeda(250); }).then(langkah);   /* QPS Search: 5/detik */
    }
    jalan = langkah().then(function(){
      jalan = null;
      var daftar = Object.keys(semua).map(function(k){ return semua[k]; });
      /* semua gagal: data lama tetap dipakai, tidak ditimpa kosong */
      if (!daftar.length && gagal) return { jumlah:0, alasan:"gagal (" + gagal + " dari " + diminta + " permintaan)" };
      /* sebagian gagal (429/jatah): gabung dengan daftar lama dan jangan tandai
         segar 30 hari (dulu daftar lengkap diganti daftar separuh) */
      if (gagal){
        var lama = muat(), gab = {};
        ((lama && lama.stasiun) || []).forEach(function(s){ gab[s.id] = s; });
        daftar.forEach(function(s){ gab[s.id] = s; });
        daftar = Object.keys(gab).map(function(k){ return gab[k]; });
        simpan({ v:1, at:(lama && lama.at) || 0, stasiun:daftar });
      } else simpan({ v:1, at:Date.now(), stasiun:daftar });
      return { jumlah:daftar.length, alasan:gagal ? "sebagian gagal (" + gagal + " dari " + diminta + ")" : "selesai" };
    });
    return jalan;
  }

  /* Kecocokan untuk Atto 1: "cepat" (ada CCS2), "lambat" (hanya Type 2 AC),
     "tidak" (colokan lain saja). kwEfektif = min(daya SPKLU, daya mobil). */
  function cocok(s){
    if (!s || !s.col) return null;
    var dc = s.col.filter(function(c){ return MOBIL.dc.indexOf(c.t) >= 0; }),
        ac = s.col.filter(function(c){ return MOBIL.ac.indexOf(c.t) >= 0; });
    function maks(l){ var m = null; l.forEach(function(c){ if (c.kw != null && c.kw > 0 && (m == null || c.kw > m)) m = c.kw; }); return m; }
    if (dc.length){ var k = maks(dc); return { jenis:"cepat", kw:k, kwEfektif:k == null ? MOBIL.dcKW : Math.min(k, MOBIL.dcKW) }; }
    if (ac.length){ var a = maks(ac); return { jenis:"lambat", kw:a, kwEfektif:a == null ? MOBIL.acKW : Math.min(a, MOBIL.acKW),
                                               soketSaja:ac.every(function(c){ return c.t === "IEC62196Type2Outlet"; }) }; }
    return { jenis:"tidak" };
  }
  /* "CCS2 60 kW, Type 2 (kabel) 22 kW" -- tiap jenis sekali, daya tertinggi */
  function ringkasColokan(s){
    var per = {};
    s.col.forEach(function(c){ var k = NAMA[c.t] || c.t; if (!(k in per) || (c.kw != null && (per[k] == null || c.kw > per[k]))) per[k] = c.kw; });
    return Object.keys(per).map(function(k){ return k + (per[k] != null ? " " + Math.round(per[k]) + " kW" : ""); }).join(", ");
  }
  /* Teks pendek kecocokan untuk Ibu. */
  function teksCocok(s){
    var c = cocok(s); if (!c) return "";
    if (c.jenis === "cepat") return "cocok " + MOBIL.nama + ", cepat &plusmn;" + Math.round(c.kwEfektif) + " kW";
    if (c.jenis === "lambat") return "hanya AC (&plusmn;" + String(c.kwEfektif).replace(".", ",") + " kW, 15&rarr;90% &plusmn;" +
      String(Math.round(0.75 * 30.08 / c.kwEfektif * 10) / 10).replace(".", ",") + " jam)" + (c.soketSaja ? ", perlu kabel Type 2 sendiri" : "");
    return "tidak cocok untuk " + MOBIL.nama;
  }

  function jarakKm(la1, lo1, la2, lo2){
    var dLat = (la2 - la1) * 111.2, dLon = (lo2 - lo1) * 111.2 * Math.cos(la1 * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon);
  }
  /* Stasiun TomTom paling dekat dengan satu titik (<= maksKm), mis. untuk
     memberi colokan pada SPKLU di daftar aplikasi (dicocokkan <= 200 m). */
  function dekat(lat, lon, maksKm){
    var d = muat(); if (!d) return null;
    var best = null, dMin = maksKm == null ? 0.2 : maksKm;
    d.stasiun.forEach(function(s){ var q = jarakKm(lat, lon, s.lat, s.lon); if (q <= dMin){ dMin = q; best = s; } });
    return best;
  }
  /* SPKLU di daftar aplikasi (nama) -> stasiun TomTom di titik yang sama */
  var idxNama = null;
  function untukNama(nama){
    if (typeof SPKLU === "undefined") return null;
    if (!idxNama){ idxNama = {}; SPKLU.forEach(function(s){ idxNama[s[0]] = s; }); }
    var s = idxNama[nama]; return s ? dekat(s[2], s[1], 0.2) : null;
  }
  /* SPKLU cepat (CCS2) terdekat dari satu titik, jarak jalan KIRA-KIRA
     (garis lurus x 1,35 -- sama dengan faktor kelokan di rekomendasi). */
  function terdekatCocok(lat, lon, n){
    var d = muat(); if (!d || lat == null || lon == null) return [];
    return d.stasiun.filter(function(s){ var c = cocok(s); return c && c.jenis === "cepat"; })
      .map(function(s){ return { s:s, km:Math.round(jarakKm(lat, lon, s.lat, s.lon) * 1.35 * 10) / 10 }; })
      .sort(function(a, b){ return a.km - b.km; }).slice(0, n || 3);
  }
  function status(){
    var d = muat(); if (!d) return null;
    var n = { cepat:0, lambat:0, tidak:0 };
    d.stasiun.forEach(function(s){ var c = cocok(s); if (c) n[c.jenis]++; });
    return { jumlah:d.stasiun.length, at:d.at, cepat:n.cepat, lambat:n.lambat, tidak:n.tidak };
  }
  function semua(){ var d = muat(); return d ? d.stasiun : []; }
  /* penanda data (waktu ambil): mesin menyimpan pilihan SPKLU per tempat sampai data berganti */
  function versi(){ var d = muat(); return d && d.stasiun && d.stasiun.length ? String(d.at) : null; }
  function hapus(){ data = null; try { localStorage.removeItem(LS); } catch (e) {} }

  return { segarkan:segarkan, perluSegar:perluSegar, cocok:cocok, teksCocok:teksCocok, ringkasColokan:ringkasColokan,
           dekat:dekat, untukNama:untukNama, versi:versi, terdekatCocok:terdekatCocok, status:status, semua:semua, hapus:hapus,
           url:url, olah:olah, TITIK:TITIK, MOBIL:MOBIL, NAMA:NAMA };
})();
