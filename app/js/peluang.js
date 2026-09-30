/* Peluang rute: urutan TEMPAT per blok jam untuk sisa hari (atau untuk
   rencana), disusun dan dinilai oleh perhitungan yang sama dengan perkiraan.

   Cara kerja: potongan blok dari potongBlok(o). Untuk tiap potongan kerja
   dipilih satu tempat dari sembilan tempat inti. Pencarian berkas (beam):
   tiap tahap menyimpan LEBAR urutan terbaik menurut taksiran cepat
   (pendapatan blok x pengali wilayah x bobot permintaan tempat x jam yang
   tersisa setelah pindah, dikurangi listrik). Aturan Rute 700K yang dipakai
   sebagai batas: setelah 20:00 hanya pindah ke tempat yang lebih dekat
   rumah (kompas) dan Jakarta tidak lagi dimasuki, bandara butuh
   potongan >= 1 jam (antre), paling banyak 4 kali pindah. Urutan terbaik
   lalu dihitung PENUH oleh simulate() (sesi ngecas, jatah filter, jam
   pindah, km pindah, cadangan pulang), diurutkan menurut bersih, dan
   dibandingkan dengan "tetap di tempat sekarang".

   Batas yang harus dikatakan: bobot permintaan per tempat (BOBOT_TEMPAT)
   diturunkan dari narasi Rute 700K, bukan dari pengukuran. Belajar
   (belajar.js) mengoreksinya dari catatan Ibu -- tapi hanya dari blok jam
   yang isian order per jam DAN zona GPS-nya ada; sampai data itu cukup,
   angka antar tempat di wilayah tarif yang sama hanya seteliti bobot itu. */
"use strict";

var Peluang = (function(){
  var KANDIDAT = ["kota", "stasiun", "karawaci", "alsut", "serpong", "bsd", "bandara", "jakbar", "cbd"];

  function salin(o){ var p = {}; Object.keys(o).forEach(function(k){ p[k] = o[k]; }); return p; }
  function grup(b){ return b.n === "Peak sore" ? "sore" : "pagi"; }

  /* Tempat awal: LOK inti bila ada; posisi lain dipetakan ke inti terdekat
     (jarak pindah pertama dihitung dari koordinatnya bila ada). */
  function tempatAwal(L){
    /* Posisi dengan koordinat = tempat sendiri (tempatPosisi), jadi pindah
       pertama dihitung dari titik Ibu yang sebenarnya, bukan dari tempat inti
       terdekat dengan 0 km. */
    var tp = tempatPosisi(L); if (tp) return tp;
    /* Lokasi ketik-manual tanpa koordinat (kecamatan di luar 9 inti): tanpa
       lintang/bujur tidak bisa dicari yang terdekat sungguhan, jadi dipilih
       inti dengan jarak-ke-rumah paling mirip -- tebakan kasar yang sama
       filosofinya dengan rekomendasi.js, supaya tidak diam-diam dianggap di
       Modernland (0 km) padahal bisa puluhan km jauhnya. */
    if (L && typeof L.home === "number"){
      var best2 = null, bd2 = Infinity;
      KANDIDAT.forEach(function(id){ var K = LOKMAP[id]; var d = Math.abs(L.home - K.home); if (d < bd2){ bd2 = d; best2 = K; } });
      if (best2) return best2;
    }
    return LOKMAP.kota;
  }

  function bolehKe(S, T, p){
    if (p.s >= 20 && T.home > S.home + 1) return false;            /* kompas: malam hanya mendekat ke rumah */
    if (p.s >= 20 && T.z === "jkt") return false;                  /* "jam 20:00 seharusnya sudah tidak di Jakarta" (Rute 700K) */
    if (T.id === "bandara" && S.id !== T.id && p.w < 1) return false; /* antre bandara butuh waktu */
    return true;
  }

  /* "Tinggal di T" untuk sisa hari, TAPI tunduk aturan yang sama dengan
     urutan lain: di Jakarta, potongan yang mulai >= 20:00 pindah ke arah
     rumah (Kota). Dulu rencana "tetap di sini" melewati bolehKe dan bisa
     menyuruh Ibu tetap di CBD sampai 21:30. Dipakai juga oleh Rekomendasi,
     supaya dua kartu menghitung dengan cara yang sama. */
  function urutanTinggal(T, o){
    var kini = T, pindahMalam = false;
    /* Kalau jam mulai pulang dari T sendiri sudah sebelum potongan itu, Ibu
       berangkat pulang dari T sebelum 20:00 -- tidak perlu (dan rugi) pindah
       dulu ke Kota. Tidak pulang malam ini (stay): aturan pulang tidak berlaku. */
    var berangkatDariT = o.stay ? 24 : o.pulang - jamMulaiPulang(o, T);
    /* Jakarta lewat 09:30 sampai 15:15 (Rute 700K, sama dengan teks langkah
       dan kartu "Pasang filter, pulang bawa penumpang" / "Jakarta sepi"):
       pulang bawa penumpang ke Kota. Dulu angkanya tetap di CBD seharian
       sementara langkahnya menyuruh keluar Jakarta tiga kali lalu kembali. */
    var SIANG_JKT = { "Pagi akhir":1, "Siang":1, "Jam mati":1 }, pindahJam = null;
    var u = potongBlok(o).filter(function(p){ return !p.jeda; }).map(function(p){
      if (!o.stay && kini.z === "jkt" && kini.home <= 38 && SIANG_JKT[p.b.n] && !(kini === T && berangkatDariT <= p.s + 0.01)){ kini = LOKMAP.kota; pindahMalam = true; if (pindahJam == null) pindahJam = p.s; }
      if (!o.stay && !bolehKe(kini, kini, p) && !(kini === T && berangkatDariT <= p.s + 0.01)){ kini = LOKMAP.kota; pindahMalam = true; if (pindahJam == null) pindahJam = p.s; }
      return kini.id;
    });
    u.pindahMalam = pindahMalam; u.pindahJam = pindahJam;
    return u;
  }

  /* o: masukan runNow/runPlan; L: posisi sekarang; opsi: {lebar, banyak, maksPindah} */
  function hitung(o, L, opsi){
    opsi = opsi || {};
    var lebar = opsi.lebar || 8, banyak = opsi.banyak || 3, maksPindah = opsi.maksPindah == null ? 4 : opsi.maksPindah;
    var ctx = o.ctx, hari = ctx.shapeDay;
    var extra = (o.hujan ? 1.20 : 1) * ((o.acara && !ctx.ev) ? 1.15 : 1) * (ctx.gajian ? 1.05 : 1);
    var pieces = potongBlok(o), kerja = pieces.filter(function(p){ return !p.jeda; });
    var awal = tempatAwal(L);
    if (!kerja.length) return { daftar:[], basis:null, awal:awal };
    var kmkwh = CALIB.kmkwh;

    /* taksiran cepat satu potongan di tempat T setelah dari S */
    function taksir(S, T, p, jatah){
      var zp = ZONA[T.z], peak = !!PEAKS[p.b.n];
      var pakaiJatah = peak && zp.need && jatah > 0;
      var m = (peak ? ((pakaiJatah || !zp.need) ? zp.peak : (1 + (zp.peak - 1) * 0.35)) : zp.off) * ctx.mult * extra * bobotTempat(T.id, p.b.n) * Belajar.pengali(hari, p.b.n);
      var pindahJam = S.id === T.id ? 0 : jamTempuhAntar(S, T, p.s, iso(ctx.d)), pindahKm = S.id === T.id ? 0 : jarakAntar(S, T);
      var jam = Math.max(0, p.w - pindahJam);
      var gross = blockGross(p.b, hari) * m * jam;
      var listrik = (p.b.km * zp.kmx * jam + pindahKm) / kmkwh * TARIF_KWH;
      return { skor:gross - listrik, pakaiJatah:pakaiJatah, pindah:S.id !== T.id };
    }

    /* beam search */
    var beam = [{ urutan:[], skor:0, akhir:awal, jatah:o.filter, pindah:0, jatahGrup:{} }];
    kerja.forEach(function(p){
      var berikut = [];
      /* istirahat panjang sebelum potongan ini: Ibu berangkat lagi dari rumah */
      /* (aturan yang sama dengan simulate: hanya kalau bolak-baliknya masuk jam istirahat) */
      var idx = pieces.indexOf(p), jedaP = idx > 0 && pieces[idx - 1].jeda ? pieces[idx - 1] : null;
      beam.forEach(function(st){
        var S = (jedaP && istirahatDiRumah(st.akhir, jedaP, o)) ? LOKMAP.kota : st.akhir;
        KANDIDAT.forEach(function(id){
          var T = LOKMAP[id];
          if (!bolehKe(S, T, p)) return;
          var pindah = st.pindah + (S.id === T.id ? 0 : 1);
          if (pindah > maksPindah) return;
          /* satu jatah per grup peak (pagi/sore), bukan per potongan */
          var g = grup(p.b), jatahSisa = st.jatah;
          var sudah = st.jatahGrup[g];
          var t = taksir(S, T, p, sudah ? 1 : jatahSisa);
          var jg = salin(st.jatahGrup);
          if (t.pakaiJatah && !sudah){ jatahSisa--; jg[g] = true; }
          berikut.push({ urutan:st.urutan.concat([id]), skor:st.skor + t.skor, akhir:T, jatah:jatahSisa, pindah:pindah, jatahGrup:jg });
        });
      });
      /* hukum jarak pulang pada tahap terakhir supaya urutan yang berakhir jauh tidak menang semu */
      var terakhir = p === kerja[kerja.length - 1];
      berikut.forEach(function(st){ if (terakhir && !o.stay) st.skor -= st.akhir.home / kmkwh * TARIF_KWH + jamTempuhRumah(st.akhir, o.pulang - 0.5, undefined, tipeDari(ctx)) * 20000; });
      berikut.sort(function(a, b){ return b.skor - a.skor; });
      /* jaga keberagaman: paling banyak 3 urutan dengan tempat akhir yang sama */
      var hitungAkhir = {}, pilih = [];
      for (var i = 0; i < berikut.length && pilih.length < lebar; i++){
        var k = berikut[i].akhir.id; hitungAkhir[k] = (hitungAkhir[k] || 0) + 1;
        if (hitungAkhir[k] <= 3) pilih.push(berikut[i]);
      }
      beam = pilih;
    });

    /* kandidat penuh: hasil beam + tetap di tempat awal + tetap di tiap tempat inti (pembanding) */
    var kandidat = beam.map(function(st){ return st.urutan; });
    var diam = urutanTinggal(awal, o), kunciDiam = diam.join(">");
    kandidat.push(diam);
    var seen = {};
    kandidat = kandidat.filter(function(u){ var k = u.join(">"); if (seen[k]) return false; seen[k] = true; return true; });

    function cari(id){ return LOKMAP[id] || (id === awal.id ? awal : LOKMAP.kota); }
    function nilai(u){
      var q = salin(o);
      q.urutan = u; q.tempatAwal = awal; q.zona = cari(u[0]).z;
      q.deadKm = 0;
      var r = simulate(q);
      /* segmen: potongan berurutan di tempat yang sama digabung untuk dibaca */
      var seg = [];
      r.pieces.forEach(function(p){
        if (p.jeda){ seg.push({ jeda:true, s:p.s, e:p.e, sesi:p.sesi || null }); return; }
        var last = seg[seg.length - 1];
        if (last && !last.jeda && last.tempat.id === p.tempat.id){ last.e = p.e; last.gross += p.grossH * p.jamJalan; last.order += p.paidKmH * p.jamJalan / p.tripKm; last.km += p.kmH * p.jamJalan; if (p.sesi){ last.sesiSemua = (last.sesiSemua || (last.sesi ? [last.sesi] : [])).concat([p.sesi]); last.sesi = last.sesi || p.sesi; } }
        else seg.push({ tempat:p.tempat, s:p.s, e:p.e, gross:p.grossH * p.jamJalan, order:p.paidKmH * p.jamJalan / p.tripKm, km:p.kmH * p.jamJalan, pindahKm:p.pindahKm || 0, pindahJam:p.pindahJam || 0, blok:p.b.n, sesi:p.sesi || null });
      });
      var pindahN = 0; r.pieces.forEach(function(p){ if (p.pindahKm > 0.5) pindahN++; });
      var diamIni = u.join(">") === kunciDiam;
      return { urutan:u, segmen:seg, r:r, net:r.net - insentifSebelum(o), kmPindah:r.kmPindah, pindahN:pindahN, akhir:cari(u[u.length - 1]),
               diam:diamIni, diamPulangMalam:diamIni && !!diam.pindahMalam, diamPindahJam:diamIni ? diam.pindahJam : null };
    }
    /* Sama dengan kartu "ke mana sekarang": rencana yang tiba di suatu tempat
       dengan baterai < 8% tidak ditawarkan -- kecuali pulang ke Kota dan ada
       charger di rumah. "Tetap di sini" selalu ada sebagai pembanding. */
    /* Juga dibuang: rencana tanpa jam narik sama sekali (hasil pangkas jadi
       "pulang sekarang" -- dulu "Pindah 0 kali (0 km)" di urutan #1) dan rencana
       yang tiba di rumah < 8% tanpa ngecas. */
    function terjangkau(h){
      if (h.diam) return true;
      if (!h.r.pieces.some(adaJamNarik)) return false;
      if (!o.stay && h.r.socTiba < 0.08 && !(o.rumah && h.r.socTiba >= 0.03)) return false;
      return !h.r.pieces.some(function(p){
        return p.pindahKm > 0.5 && p.socMulai < 0.08 && !(p.tempat && p.tempat.id === "kota" && o.rumah && p.socMulai >= 0.03);
      });
    }
    var hasil = kandidat.map(nilai).filter(terjangkau);
    var basis = hasil.filter(function(h){ return h.diam; })[0] || null;
    hasil.sort(function(a, b){ return b.net - a.net; });
    hasil.forEach(function(h){ h.selisih = basis ? h.net - basis.net : 0; });
    /* Jam mulai pulang sudah lewat: tidak ada urutan tempat untuk ditawarkan
       (dulu 3-4 kartu "Pindah 0 kali" yang sama persis). */
    var adaKerja = function(h){ return h.r.pieces.some(adaJamNarik); };
    if (!o.stay && !hasil.some(adaKerja)) return { daftar:[], basis:null, awal:awal, habis:true };
    /* urutan yang sama persis (mis. dua kandidat yang ujungnya sama setelah
       aturan 20:00) cukup tampil sekali */
    /* kunci tanpa angka Rp: dua urutan dengan potongan & tempat yang sama
       adalah rencana yang sama (selisih pembulatan tidak membuatnya beda);
       "tetap di sini" yang selalu dipertahankan, kembarannya dibuang */
    var kunciH = function(h){ return h.segmen.map(function(sg){ return (sg.tempat ? sg.tempat.id : "-") + "@" + sg.s.toFixed(2) + "-" + sg.e.toFixed(2); }).join("|"); };
    var lihat = {};
    if (basis) lihat[kunciH(basis)] = true;
    hasil = hasil.filter(function(h){
      if (h.diam) return true;
      var k = kunciH(h); if (lihat[k]) return false;
      lihat[k] = true; return true;
    });
    var daftar = hasil.slice(0, banyak);
    if (basis && daftar.indexOf(basis) < 0) daftar.push(basis);
    return { daftar:daftar, basis:basis, awal:awal, pieces:pieces };
  }

  function teksUrutan(h){
    return h.segmen.map(function(s){
      if (s.jeda) return hhmm(s.s) + "–" + hhmm(s.e) + " istirahat" + (s.sesi ? " + ngecas" : "");
      return hhmm(s.s) + "–" + hhmm(s.e) + " " + s.tempat.n + (s.sesi ? " (+ ngecas)" : "");
    }).join(" → ");
  }

  return { hitung:hitung, teksUrutan:teksUrutan, KANDIDAT:KANDIDAT, tempatAwal:tempatAwal, urutanTinggal:urutanTinggal };
})();
