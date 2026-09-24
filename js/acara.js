/* Kalender acara besar dari internet.

   Tidak ada layanan gratis yang bisa ditanya "konser apa di Jakarta bulan
   depan". Yang ada: pencarian web. Jadi Claude (lewat kunci API yang sama
   dengan tab Tanya) mencari lewat web_search dan mengembalikan daftar JSON,
   yang disimpan di HP dan dimasukkan ke EVENTS. Kalender bawaan di data.js
   tetap menang untuk tanggal yang sudah ada isinya, karena itu disusun
   dengan tangan; hasil web mengisi tanggal yang kosong.

   Hasil pencarian web bisa keliru tanggal atau melewatkan acara. Karena itu
   sumbernya ditulis di daftar, dan centang "Acara besar" tetap bisa diubah. */
"use strict";

var Acara = (function(){
  var LS = "acara-web", UMUR_MAKS = 7 * 24 * 3600 * 1000, HARI_KE_DEPAN = 90;

  function baca(){ try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { return null; } }
  function simpan(a){ try { localStorage.setItem(LS, JSON.stringify(a)); } catch (e) {} }
  function perluSegar(){ var a = baca(); return !a || !a.diambil || (Date.now() - Date.parse(a.diambil)) > UMUR_MAKS; }

  /* Masukkan ke EVENTS global. Kembalikan berapa yang benar-benar masuk. */
  function terapkan(daftar){
    var n = 0, terjauh = EVENTS_SAMPAI;
    (daftar || []).forEach(function(x){
      if (!x || !/^\d{4}-\d{2}-\d{2}$/.test(x.tanggal) || !x.nama) return;
      if (EVENTS[x.tanggal] && !EVENTS[x.tanggal][3]) return;      /* bawaan menang */
      EVENTS[x.tanggal] = [String(x.nama), String(x.tempat || ""), x.zona === "lokal" ? "lokal" : "jkt", "web"];
      if (x.tanggal > terjauh) terjauh = x.tanggal;
      n++;
    });
    if (terjauh > EVENTS_SAMPAI) EVENTS_SAMPAI = terjauh;
    return n;
  }

  function validasi(res){
    var arr = res && (res.acara || res.events);
    if (!Array.isArray(arr)) throw { code:"bad_json" };
    var hariIni = iso(new Date());
    return arr.filter(function(x){
      return x && /^\d{4}-\d{2}-\d{2}$/.test(x.tanggal) && x.tanggal >= hariIni && x.nama;
    }).map(function(x){
      return { tanggal:x.tanggal, nama:String(x.nama).slice(0, 80), tempat:String(x.tempat || "").slice(0, 80),
               zona:(x.zona === "lokal" ? "lokal" : "jkt") };
    }).sort(function(a, b){ return a.tanggal < b.tanggal ? -1 : 1; });
  }

  /* Promise<{jumlah, diambil}>. Butuh sampler dari sambungan API (web_search
     hanya ada di sana, bukan di jalur artifact). */
  function segarkan(sampler){
    if (!sampler || sampler.sumber !== "api") return Promise.reject({ code:"no_key" });
    var hariIni = iso(new Date());
    var prompt =
      "Hari ini " + hariIni + ". Cari lewat web acara BESAR (ribuan pengunjung) dalam " + HARI_KE_DEPAN + " hari ke depan di " +
      "Jakarta, Kota Tangerang, Tangerang Selatan, dan BSD: konser, festival musik, pameran/expo besar (ICE BSD, " +
      "JIExpo Kemayoran, JCC Senayan, Indonesia Arena, GBK, JIS), pertandingan besar, dan acara massal lain.\n\n" +
      "Jawab HANYA JSON tanpa teks lain, bentuknya:\n" +
      "{\"acara\":[{\"tanggal\":\"YYYY-MM-DD\",\"nama\":\"nama acara\",\"tempat\":\"venue, kota\",\"zona\":\"lokal\"}]}\n" +
      "zona = \"lokal\" untuk venue di Tangerang/Tangsel/BSD/ICE, \"jkt\" untuk Jakarta. " +
      "Acara beberapa hari ditulis satu entri per hari. Hanya masukkan acara yang tanggalnya kamu temukan " +
      "dari sumber web; kalau tidak yakin, jangan masukkan. Maksimal 40 entri.";
    return sampler.json(prompt, { modelTier:"default",
                                  tools:[{ type:"web_search_20260209", name:"web_search", max_uses:6 }] })
      .then(function(res){
        var daftar = validasi(res);
        var rec = { diambil:new Date().toISOString(), daftar:daftar };
        simpan(rec);
        return { jumlah:terapkan(daftar), total:daftar.length, diambil:rec.diambil };
      });
  }

  /* Daftar gabungan yang akan datang, untuk ditampilkan. */
  function mendatang(batas){
    var hariIni = iso(new Date()), out = [];
    Object.keys(EVENTS).sort().forEach(function(t){
      if (t >= hariIni) out.push({ tanggal:t, nama:EVENTS[t][0], tempat:EVENTS[t][1], zona:EVENTS[t][2], sumber:EVENTS[t][3] || "bawaan" });
    });
    return out.slice(0, batas || 12);
  }

  return { baca:baca, perluSegar:perluSegar, terapkan:terapkan, segarkan:segarkan, mendatang:mendatang, validasi:validasi };
})();
