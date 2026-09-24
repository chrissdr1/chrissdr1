/* Jejak baterai sepanjang hari.

   Ibu mengisi baterai sekali di halaman "Mulai hari" (atau di tab Sekarang).
   Sejak itu mesin MENGIRA sisa baterai dari dua sumber, mana yang ada:
     1. odometer GPS: jarak antar titik GPS selama halaman terbuka (x1,15
        untuk kelokan jalan), hanya dipakai bila jumlahnya masuk akal
        dibanding model (halaman yang tertutup berjam-jam tidak mencatat);
     2. model blok jam: km per jam tiap blok (BASE) x pengali wilayah,
        dikurangi jeda -- sama dengan yang dipakai simulate().
   Tiap "Selesai ngecas ke X%" atau isian ulang menjadi JANGKAR baru; jarak
   dihitung ulang dari jangkar terakhir. Perkiraan ini selalu ditandai
   "perkiraan", dan angka yang Ibu ketik sendiri menang. */
"use strict";

var Baterai = (function(){
  var LS = "baterai-hari", LIKU = 1.15;
  var D = null;   /* {date, jangkar:[{jam, soc, sumber}], gpsKm, fix:{lat,lon,t}|null} */

  function hariIni(){ return iso(new Date()); }
  function muat(){
    if (D && D.date === hariIni()) return D;
    try { D = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { D = null; }
    if (!D || D.date !== hariIni() || !D.jangkar || !D.jangkar.length) D = null;
    return D;
  }
  function simpan(){ try { if (D) localStorage.setItem(LS, JSON.stringify(D)); } catch (e) {} }

  /* Jangkar pertama hari ini (menghapus jejak sebelumnya). */
  function mulai(jam, soc, sumber){
    D = { date:hariIni(), jangkar:[{ jam:jam, soc:soc, sumber:sumber || "isi" }], gpsKm:0, fix:null };
    simpan(); return D;
  }
  /* Jangkar baru: selesai ngecas, atau Ibu mengetik angka baru. */
  function jangkar(jam, soc, sumber){
    if (!muat()) return mulai(jam, soc, sumber);
    D.jangkar.push({ jam:jam, soc:soc, sumber:sumber || "isi" });
    D.gpsKm = 0; D.fix = null; simpan(); return D;
  }
  function terakhir(){ var d = muat(); return d ? d.jangkar[d.jangkar.length - 1] : null; }

  /* Titik GPS baru. Lompatan < 50 m diabaikan (gemetar GPS), > 30 km
     diabaikan (galat), sisanya dijumlahkan sebagai km tempuh. */
  /* akurasi (meter) dari GPS: perpindahan yang lebih kecil dari 1,5x akurasi
     dianggap goyangan, bukan gerak; laju > 150 km/jam dianggap galat. Fix
     yang ditolak TIDAK menggantikan fix terakhir, supaya jalan balik dari
     fix kasar tidak ikut dijumlahkan. */
  function catatFix(lat, lon, t, akurasi){
    if (!muat()) return 0;
    t = t || Date.now();
    var f = D.fix, tambah = 0, ambang = Math.max(0.05, 1.5 * (akurasi || 0) / 1000);
    if (f){
      var d = jarakLurus(f.lat, f.lon, lat, lon), dt = Math.max(1, t - (f.t || t)) / 3600000;
      if (d < ambang) return 0;
      if (d >= 30 || d / dt > 150) return 0;
      tambah = d * LIKU; D.gpsKm += tambah;
    }
    D.fix = { lat:lat, lon:lon, t:t }; simpan();
    return tambah;
  }

  /* Km menurut model blok jam antara dua jam, dikurangi jeda. */
  function kmModel(dari, sampai, zona, rehat){
    var z = ZONA[zona] || ZONA.tng, r = rehatRange(rehat), km = 0;
    if (sampai <= dari) return 0;
    BASE.forEach(function(b){
      var s = Math.max(b.s, dari), e = Math.min(b.e, sampai);
      if (e <= s) return;
      var w = e - s;
      if (r){ var js = Math.max(s, r[0]), je = Math.min(e, r[1]); if (je > js) w -= (je - js); }
      km += b.km * z.kmx * w;
    });
    return km;
  }

  /* Perkiraan sisa baterai pada jam tertentu. o = {bat, zona, rehat}. */
  /* o = {bat, zona, rehat, keluar, pulang}: mobil dianggap diam sebelum jam
     keluar dan sesudah jam pulang (check-in pukul 04:00 untuk keluar 05:15
     tidak boleh "menurunkan" baterai). */
  function perkiraan(jam, o){
    var j = terakhir(); if (!j) return null;
    var kmPerFrac = o.bat * CALIB.kmkwh;
    var dari = Math.max(j.jam, o.keluar || 0), sampai = Math.min(jam, o.pulang || 24);
    var kmM = kmModel(dari, sampai, o.zona, o.rehat);
    /* GPS dipakai bila menutupi sebagian besar waktu sejak jangkar; kalau
       halaman lama tertutup, angkanya terlalu kecil dan model yang dipakai. */
    var pakaiGps = D.gpsKm > 0 && (kmM === 0 || D.gpsKm >= 0.6 * kmM);
    var km = pakaiGps ? D.gpsKm : kmM;
    var turun = Math.min(j.soc, km / kmPerFrac * 100);
    var soc = Math.max(0, Math.min(100, j.soc - turun));
    return { soc:Math.round(soc), km:km, kmModel:kmM, kmGps:D.gpsKm, gps:pakaiGps,
             dariJam:j.jam, dariSoc:j.soc, sumber:j.sumber,
             ragu:Math.max(2, Math.round(turun * 0.25)) };   /* +-25% dari penurunan */
  }
  function teks(p){
    if (!p) return "";
    return "±" + p.soc + "% (dari " + p.dariSoc + "% pukul " + hhmm(p.dariJam) + ", " + Math.round(p.km) + " km " +
           (p.gps ? "menurut GPS" : "menurut model blok jam") + ", ragu ±" + p.ragu + "%)";
  }
  function hapus(){ D = null; try { localStorage.removeItem(LS); } catch (e) {} }

  return { muat:muat, mulai:mulai, jangkar:jangkar, terakhir:terakhir, catatFix:catatFix,
           kmModel:kmModel, perkiraan:perkiraan, teks:teks, hapus:hapus, LS:LS };
})();
