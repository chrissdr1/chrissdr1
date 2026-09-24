/* Prakiraan cuaca hari ini dari Open-Meteo: gratis, tanpa kunci, boleh
   dipanggil langsung dari browser. Titiknya Modernland (rumah); hujan di
   wilayah kerja Ibu jarang beda jauh dalam radius 20 km, dan yang dipakai
   mesin cuma satu bit: hujan atau tidak, plus jamnya.

   Hasilnya berbentuk sama dengan CUACA di data.js, jadi terapkanCuaca() di
   app.js tidak perlu tahu dari mana datangnya. Disimpan 3 jam di HP supaya
   tidak memanggil ulang tiap pindah tab. Kalau internet tidak ada, kembali
   ke CUACA bawaan, dan kotak cuaca mengatakannya. */
"use strict";

var Cuaca = (function(){
  var LS = "cuaca-openmeteo", UMUR_MAKS = 3 * 3600 * 1000;
  var TITIK = { lat:-6.1973, lon:106.6362, nama:"Modernland" };
  var URL_ = "https://api.open-meteo.com/v1/forecast?latitude=" + TITIK.lat + "&longitude=" + TITIK.lon +
             "&hourly=precipitation_probability,precipitation&timezone=Asia%2FJakarta&forecast_days=1";
  /* Ambang: peluang >= 50% ATAU curah >= 0,5 mm/jam dianggap jam hujan. */
  var AMBANG_PELUANG = 50, AMBANG_MM = 0.5;

  function baca(){ try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { return null; } }
  function simpan(c){ try { localStorage.setItem(LS, JSON.stringify(c)); } catch (e) {} }
  function dua(n){ return String(n).padStart(2, "0"); }

  function olah(json, hariIni){
    var h = json && json.hourly;
    if (!h || !h.time) throw new Error("bentuk jawaban tidak dikenal");
    var jamHujan = [], maxP = 0, jamMaxP = null, totalMm = 0;
    for (var i = 0; i < h.time.length; i++){
      if (String(h.time[i]).slice(0, 10) !== hariIni) continue;
      var jam = parseInt(String(h.time[i]).slice(11, 13), 10);
      var p = h.precipitation_probability ? h.precipitation_probability[i] : null;
      var mm = h.precipitation ? h.precipitation[i] : null;
      if (p != null && p > maxP){ maxP = p; jamMaxP = jam; }
      if (mm != null) totalMm += mm;
      if ((p != null && p >= AMBANG_PELUANG) || (mm != null && mm >= AMBANG_MM)) jamHujan.push(jam);
    }
    var hujan = jamHujan.length > 0;
    var jamTeks = hujan ? dua(jamHujan[0]) + ":00-" + dua(jamHujan[jamHujan.length - 1] + 1) + ":00" : "";
    var ringkas = hujan
      ? "Peluang hujan tertinggi " + Math.round(maxP) + "% sekitar pukul " + dua(jamMaxP) + ":00, total sekitar " +
        (Math.round(totalMm * 10) / 10).toLocaleString("id-ID") + " mm di " + TITIK.nama + "."
      : "Peluang hujan di bawah " + AMBANG_PELUANG + "% sepanjang hari (tertinggi " + Math.round(maxP) + "%) di " + TITIK.nama + ".";
    return { tanggal:hariIni, hujan:hujan, jam:jamTeks, ringkas:ringkas, sumber:"Open-Meteo",
             diambil:new Date().toISOString(), jamHujan:jamHujan };
  }

  /* Promise<cuaca|null>. null = tidak ada prakiraan hari ini yang bisa dipercaya. */
  function ambil(paksa){
    var hariIni = iso(new Date()), c = baca();
    var segar = c && c.tanggal === hariIni && (Date.now() - Date.parse(c.diambil || 0)) < UMUR_MAKS;
    if (!paksa && segar) return Promise.resolve(c);
    if (typeof fetch !== "function") return Promise.resolve(c && c.tanggal === hariIni ? c : null);
    return fetch(URL_, { cache:"no-store" })
      .then(function(r){ if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function(j){ var o = olah(j, hariIni); simpan(o); return o; })
      ["catch"](function(){ return (c && c.tanggal === hariIni) ? c : null; });
  }

  return { ambil:ambil, baca:baca, olah:olah, URL:URL_, TITIK:TITIK };
})();
