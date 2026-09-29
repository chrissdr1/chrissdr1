/* Ukur macet otomatis: waktu tempuh "biasanya" untuk rute-rute Ibu sendiri,
   dari pola lalu lintas historis TomTom (Routing API + departAt di masa
   depan). Menggantikan asumsi Tangerang (TomTom Traffic Index tidak
   mengukur Tangerang) dan rata-rata Jakarta, per rute, per jam, hari kerja
   vs akhir pekan.

   Rute: rumah (Kota) <-> 8 tempat inti dua arah (16) + antar tempat inti
   (56) = 72 rute x 10 jam x 2 jenis hari = 1.440 ukuran per putaran,
   dicicil (maks 300 per hari, 60 per sesi, jeda 1,2 detik) dan diulang
   tiap 28 hari. Semua lewat Lalulintas.minta (jatah bersama 1.100/hari per
   HP, berhenti total bila TomTom membalas 429).

   PERLU VERIFIKASI saat kunci sungguhan dipakai: format departAt
   (yyyy-MM-ddTHH:mm:ss+07:00) dan nama field ringkasan. Kalau TomTom menolak
   3 kali berturut-turut (400/403) atau jawabannya tanpa angka, pengukuran
   BERHENTI sendiri dan statusnya menyebut galatnya; mesin kembali ke asumsi.

   Tanggal ukur: Selasa/Rabu berikutnya (hari kerja) dan Sabtu berikutnya
   (akhir pekan, lebih ramai dari Minggu -- sengaja yang lebih hati-hati),
   dilewati kalau tanggal merah, libur sekolah, atau Ramadan. */
"use strict";

var UkurMacet = (function(){
  var LS = "ukur-macet";
  var MAKS_HARIAN = 300, PER_SESI = 60, JEDA_MS = 1200, UMUR_SEGAR = 28 * 864e5, UMUR_PAKAI = 90 * 864e5;
  var JAM = [5.5, 7, 8.5, 10.5, 12.5, 15, 16.5, 18, 19.5, 21.5];
  var INTI = ["stasiun", "karawaci", "alsut", "serpong", "bsd", "bandara", "jakbar", "cbd"];
  var JKT = { jakbar:1, cbd:1 };
  var sedangJalan = false, indeks = null, memoWil = {};

  function kosong(){ return { v:1, hasil:{}, hari:{ tgl:"", n:0 }, ok:0, gagal:0, galat:null, berturut:0, berhenti:false, terakhir:null }; }
  function muat(){
    var d = null; try { d = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) {}
    if (!d || d.v !== 1) d = kosong();
    var hari = iso(new Date());
    if (d.hari.tgl !== hari) d.hari = { tgl:hari, n:0 };
    return d;
  }
  function simpan(d){ try { localStorage.setItem(LS, JSON.stringify(d)); } catch (e) {} indeks = null; memoWil = {}; }

  function tipeCtx(ctx){ return (ctx && (ctx.shapeDay === 0 || ctx.shapeDay === 6)) ? "lb" : "hk"; }
  var memoTipe = {};
  function tipeTgl(tgl){
    tgl = tgl || iso(new Date());
    return memoTipe[tgl] || (memoTipe[tgl] = tipeCtx(dayCtx(tgl)));
  }

  function daftarRute(){
    var r = [];
    INTI.forEach(function(id){ r.push(["kota", id]); r.push([id, "kota"]); });
    INTI.forEach(function(a){ INTI.forEach(function(b){ if (a !== b) r.push([a, b]); }); });
    return r;
  }
  function kunci(a, b, tipe, jam){ return a + ">" + b + "|" + tipe + "|" + jam; }

  /* Antrean yang belum terukur atau sudah lewat 28 hari, urut prioritas:
     rute rumah hari kerja, rute rumah akhir pekan, antar tempat hari kerja,
     antar tempat akhir pekan. */
  function antrean(d){
    var kini = Date.now(), out = [], rute = daftarRute(), rumah = rute.slice(0, 16), antar = rute.slice(16);
    [[rumah, "hk"], [rumah, "lb"], [antar, "hk"], [antar, "lb"]].forEach(function(g){
      g[0].forEach(function(rt){
        JAM.forEach(function(jam){
          var k = kunci(rt[0], rt[1], g[1], jam), h = d.hasil[k];
          if (!h || kini - h.at > UMUR_SEGAR) out.push({ a:rt[0], b:rt[1], tipe:g[1], jam:jam, k:k });
        });
      });
    });
    return out;
  }

  function tanggalUntuk(tipe){
    var d = new Date(); d.setHours(0, 0, 0, 0);
    for (var i = 1; i < 60; i++){
      var x = new Date(d.getTime() + i * 864e5), t = iso(x), dow = x.getDay(), c = dayCtx(t);
      var cocok = tipe === "hk" ? (dow === 2 || dow === 3) : dow === 6;
      if (cocok && !c.holi && !c.sekolahLibur && !c.ramadan) return t;
    }
    return iso(new Date(d.getTime() + 7 * 864e5));
  }
  function titik(id){ var L = LOKMAP[id]; return L ? { lat:L.lat, lon:L.lon } : null; }

  /* Satu ukuran. Promise<"ok"|"galat"|"henti"> */
  function ukurSatu(d, it, key){
    var A = titik(it.a), B = titik(it.b);
    if (!A || !B) return Promise.resolve("galat");
    var tgl = tanggalUntuk(it.tipe);
    var url = Lalulintas.urlRute(A, B, key, { departAt:tgl + "T" + hhmm(it.jam) + ":00+07:00", tanpaGaris:true });
    return Lalulintas.minta(url).then(function(r){
      if (r.status === 429) return "henti";
      if (!r.ok){ d.galat = "TomTom menolak (HTTP " + r.status + ")"; return "galat"; }
      return r.json().then(function(j){
        var s = j && j.routes && j.routes[0] && j.routes[0].summary;
        var t = s && (typeof s.historicTrafficTravelTimeInSeconds === "number" ? s.historicTrafficTravelTimeInSeconds : s.travelTimeInSeconds);
        if (typeof t !== "number" || !(t > 0)){ d.galat = "Jawaban TomTom tanpa waktu tempuh"; return "galat"; }
        var t0 = s.noTrafficTravelTimeInSeconds;
        d.hasil[it.k] = { m:Math.round(t / 6) / 10, f:(typeof t0 === "number" && t0 > 0) ? Math.round(t / t0 * 100) / 100 : null, at:Date.now() };
        return "ok";
      });
    })["catch"](function(e){
      if (e && e.message === "jatah") return "henti";
      d.galat = "Tidak tersambung ke TomTom"; return "galat";
    });
  }

  /* Jalankan satu sesi pengukuran di latar belakang. opsi: {paksa, jeda, perSesi}.
     Promise<{diukur, alasan}>. Tidak pernah melempar. */
  function jalankan(opsi){
    opsi = opsi || {};
    if (sedangJalan) return Promise.resolve({ diukur:0, alasan:"sedang berjalan" });
    if (typeof Lalulintas === "undefined" || !Lalulintas.aktif()) return Promise.resolve({ diukur:0, alasan:"tanpa kunci" });
    if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve({ diukur:0, alasan:"offline" });
    var d = muat();
    if (d.berhenti && !opsi.paksa) return Promise.resolve({ diukur:0, alasan:"berhenti" });
    if (opsi.paksa){ d.berhenti = false; d.berturut = 0; }
    var q = antrean(d), key = Peta.kunciTomTom(), jeda = opsi.jeda == null ? JEDA_MS : opsi.jeda;
    var batas = Math.min(q.length, opsi.perSesi || PER_SESI), i = 0, diukur = 0;
    sedangJalan = true;
    function langkah(){
      if (i >= batas) return Promise.resolve("selesai");
      if (d.hari.n >= MAKS_HARIAN) return Promise.resolve("jatah harian pengukuran");
      if (!Lalulintas.bolehMinta()) return Promise.resolve("jatah TomTom hari ini");
      var it = q[i++];
      d.hari.n++;
      return ukurSatu(d, it, key).then(function(hasil){
        if (hasil === "henti") return "jatah TomTom hari ini";
        if (hasil === "ok"){ diukur++; d.ok++; d.berturut = 0; d.galat = null; }
        else { d.gagal++; d.berturut++; if (d.berturut >= 3){ d.berhenti = true; return "berhenti: " + d.galat; } }
        simpan(d);
        return new Promise(function(res){ setTimeout(res, jeda); }).then(langkah);
      });
    }
    return langkah().then(function(alasan){
      d.terakhir = Date.now(); simpan(d); sedangJalan = false;
      return { diukur:diukur, alasan:alasan };
    }, function(){ sedangJalan = false; simpan(d); return { diukur:diukur, alasan:"galat" }; });
  }

  /* ---- dipakai mesin (sinkron, dari indeks) ---- */
  function bangunIndeks(){
    var d = muat(), kini = Date.now(); indeks = {};
    Object.keys(d.hasil).forEach(function(k){
      var h = d.hasil[k]; if (!h || kini - h.at > UMUR_PAKAI) return;
      var p = k.split("|"), rt = p[0] + "|" + p[1], j = parseFloat(p[2]);
      (indeks[rt] || (indeks[rt] = {}))[j] = h;
    });
    return indeks;
  }
  /* Nilai (m menit atau f faktor) rute a->b jam itu: interpolasi lurus antar
     dua jam ukur terdekat; di luar rentang pakai ujungnya; kalau hanya satu
     tetangga terukur, dipakai bila dalam 1,5 jam. null bila tidak ada. */
  function nilai(a, b, jam, tipe, kolom){
    var ix = indeks || bangunIndeks(), e = ix[a + ">" + b + "|" + tipe]; if (!e) return null;
    function v(j){ var h = e[j]; return (h && typeof h[kolom] === "number") ? h[kolom] : null; }
    if (jam <= JAM[0]) return v(JAM[0]);
    if (jam >= JAM[JAM.length - 1]) return v(JAM[JAM.length - 1]);
    for (var i = 0; i < JAM.length - 1; i++){
      var j0 = JAM[i], j1 = JAM[i + 1];
      if (jam >= j0 && jam <= j1){
        var v0 = v(j0), v1 = v(j1);
        if (v0 != null && v1 != null) return v0 + (v1 - v0) * (jam - j0) / (j1 - j0);
        if (v0 != null && jam - j0 <= 1.5) return v0;
        if (v1 != null && j1 - jam <= 1.5) return v1;
        return null;
      }
    }
    return null;
  }
  function menitRute(a, b, jam, tipe){ return (a && b && a !== b) ? nilai(a, b, jam, tipe || tipeTgl(), "m") : null; }

  /* Pengali lalu lintas wilayah (median rute terukur) untuk perjalanan yang
     tidak punya rute terukur sendiri. jkt: rute yang menyentuh Jakarta Barat/
     CBD; selain itu Tangerang (termasuk bandara). null bila < 3 rute. */
  function faktorWilayah(jam, jkt, tipe){
    tipe = tipe || tipeTgl();
    var mk = (jkt ? "j" : "t") + tipe + Math.round(jam * 4);
    if (mk in memoWil) return memoWil[mk];
    var ix = indeks || bangunIndeks(), fs = [];
    Object.keys(ix).forEach(function(rt){
      var p = rt.split("|"); if (p[1] !== tipe) return;
      var ab = p[0].split(">"), kenaJkt = !!(JKT[ab[0]] || JKT[ab[1]]);
      if (kenaJkt !== !!jkt) return;
      var f = nilai(ab[0], ab[1], jam, tipe, "f"); if (f != null) fs.push(f);
    });
    var hasil = null;
    if (fs.length >= 3){ fs.sort(function(x, y){ return x - y; }); hasil = Math.max(0.8, Math.min(4, fs[Math.floor(fs.length / 2)])); }
    memoWil[mk] = hasil;
    return hasil;
  }

  function status(){
    var d = muat(), total = daftarRute().length * JAM.length * 2, kini = Date.now(), terukur = 0, segar = 0;
    Object.keys(d.hasil).forEach(function(k){ var h = d.hasil[k]; if (kini - h.at <= UMUR_PAKAI) terukur++; if (kini - h.at <= UMUR_SEGAR) segar++; });
    return { total:total, terukur:terukur, segar:segar, hariIni:d.hari.n, maksHarian:MAKS_HARIAN, galat:d.galat, berhenti:d.berhenti,
             terakhir:d.terakhir, sedangJalan:sedangJalan };
  }
  function hapus(){ try { localStorage.removeItem(LS); } catch (e) {} indeks = null; memoWil = {}; }
  /* baca ulang dari penyimpanan (mis. setelah dipulihkan / diubah di luar modul) */
  function muatUlang(){ indeks = null; memoWil = {}; }

  return { jalankan:jalankan, menitRute:menitRute, faktorWilayah:faktorWilayah, status:status, hapus:hapus, muatUlang:muatUlang,
           tipeCtx:tipeCtx, tipeTgl:tipeTgl, tanggalUntuk:tanggalUntuk, JAM:JAM, INTI:INTI, MAKS_HARIAN:MAKS_HARIAN,
           _antrean:function(){ return antrean(muat()); } };
})();
