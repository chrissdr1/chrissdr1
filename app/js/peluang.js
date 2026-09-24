/* Peluang rute: urutan TEMPAT per blok jam untuk sisa hari (atau untuk
   rencana), disusun dan dinilai oleh mesin yang sama dengan proyeksi.

   Cara kerja: potongan blok dari potongBlok(o). Untuk tiap potongan kerja
   dipilih satu tempat dari sembilan tempat inti. Pencarian berkas (beam):
   tiap tahap menyimpan LEBAR urutan terbaik menurut taksiran cepat
   (pendapatan blok x pengali wilayah x bobot permintaan tempat x jam yang
   tersisa setelah pindah, dikurangi listrik). Aturan Rute 700K yang dipakai
   sebagai batas: setelah 20:00 hanya pindah ke tempat yang lebih dekat
   rumah (kompas), Jakarta tidak lagi dimasuki setelah 21:00, bandara butuh
   potongan >= 1 jam (antre), paling banyak 4 kali pindah. Urutan terbaik
   lalu dihitung PENUH oleh simulate() (sesi ngecas, jatah filter, jam
   pindah, km pindah, cadangan pulang), diurutkan menurut bersih, dan
   dibandingkan dengan "tetap di tempat sekarang".

   Batas yang harus dikatakan: bobot permintaan per tempat (BOBOT_TEMPAT)
   diturunkan dari narasi Rute 700K, bukan dari pengukuran; ia terkalibrasi
   perlahan dari catatan harian Ibu (CALIB.bobotTempat). Angka antar
   tempat di wilayah tarif yang sama karena itu hanya seteliti bobot itu. */
"use strict";

var Peluang = (function(){
  var KANDIDAT = ["kota", "stasiun", "karawaci", "alsut", "serpong", "bsd", "bandara", "jakbar", "cbd"];

  function salin(o){ var p = {}; Object.keys(o).forEach(function(k){ p[k] = o[k]; }); return p; }
  function grup(b){ return b.n === "Peak sore" ? "sore" : "pagi"; }

  /* Tempat awal: LOK inti bila ada; posisi lain dipetakan ke inti terdekat
     (jarak pindah pertama dihitung dari koordinatnya bila ada). */
  function tempatAwal(L){
    if (L && LOKMAP[L.id] && LOKMAP[L.id].lat != null) return LOKMAP[L.id];
    if (L && L.lat != null){
      var best = null, bd = Infinity;
      KANDIDAT.forEach(function(id){ var K = LOKMAP[id]; var d = jarakLurus(L.lat, L.lon, K.lat, K.lon); if (d < bd){ bd = d; best = K; } });
      return best;
    }
    return LOKMAP.kota;
  }

  function bolehKe(S, T, p){
    if (p.s >= 20 && T.home > S.home + 1) return false;            /* kompas: malam hanya mendekat ke rumah */
    if (p.s >= 21 && T.z === "jkt" && S.id !== T.id) return false; /* Jakarta tidak dimasuki lagi setelah 21:00 */
    if (T.id === "bandara" && S.id !== T.id && p.w < 1) return false; /* antre bandara butuh waktu */
    return true;
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
      var m = (peak ? ((pakaiJatah || !zp.need) ? zp.peak : (1 + (zp.peak - 1) * 0.35)) : zp.off) * ctx.mult * extra * bobotTempat(T.id, p.b.n);
      var pindahJam = S.id === T.id ? 0 : jamTempuhAntar(S, T, p.s), pindahKm = S.id === T.id ? 0 : jarakAntar(S, T);
      var jam = Math.max(0, p.w - pindahJam);
      var gross = blockGross(p.b, hari) * m * jam;
      var listrik = (p.b.km * zp.kmx * jam + pindahKm) / kmkwh * TARIF_KWH;
      return { skor:gross - listrik, pakaiJatah:pakaiJatah, pindah:S.id !== T.id };
    }

    /* beam search */
    var beam = [{ urutan:[], skor:0, akhir:awal, jatah:o.filter, pindah:0, jatahGrup:{} }];
    kerja.forEach(function(p){
      var berikut = [];
      beam.forEach(function(st){
        KANDIDAT.forEach(function(id){
          var T = LOKMAP[id];
          if (!bolehKe(st.akhir, T, p)) return;
          var pindah = st.pindah + (st.akhir.id === T.id ? 0 : 1);
          if (pindah > maksPindah) return;
          /* satu jatah per grup peak (pagi/sore), bukan per potongan */
          var g = grup(p.b), jatahSisa = st.jatah;
          var sudah = st.jatahGrup[g];
          var t = taksir(st.akhir, T, p, sudah ? 1 : jatahSisa);
          var jg = salin(st.jatahGrup);
          if (t.pakaiJatah && !sudah){ jatahSisa--; jg[g] = true; }
          berikut.push({ urutan:st.urutan.concat([id]), skor:st.skor + t.skor, akhir:T, jatah:jatahSisa, pindah:pindah, jatahGrup:jg });
        });
      });
      /* hukum jarak pulang pada tahap terakhir supaya urutan yang berakhir jauh tidak menang semu */
      var terakhir = p === kerja[kerja.length - 1];
      berikut.forEach(function(st){ if (terakhir && !o.stay) st.skor -= st.akhir.home / kmkwh * TARIF_KWH + jamTempuhRumah(st.akhir, o.pulang - 0.5) * 20000; });
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
    var diam = kerja.map(function(){ return awal.id; });
    kandidat.push(diam);
    var seen = {};
    kandidat = kandidat.filter(function(u){ var k = u.join(">"); if (seen[k]) return false; seen[k] = true; return true; });

    function nilai(u){
      var q = salin(o);
      q.urutan = u; q.tempatAwal = awal; q.zona = LOKMAP[u[0]].z === "apt" ? "apt" : LOKMAP[u[0]].z;
      q.deadKm = 0;
      var r = simulate(q);
      /* segmen: potongan berurutan di tempat yang sama digabung untuk dibaca */
      var seg = [];
      r.pieces.forEach(function(p){
        if (p.jeda){ seg.push({ jeda:true, s:p.s, e:p.e, sesi:p.sesi || null }); return; }
        var last = seg[seg.length - 1];
        if (last && !last.jeda && last.tempat.id === p.tempat.id){ last.e = p.e; last.gross += p.grossH * p.jamJalan; last.order += p.paidKmH * p.jamJalan / p.tripKm; last.km += p.kmH * p.jamJalan; if (p.sesi) last.sesi = p.sesi; }
        else seg.push({ tempat:p.tempat, s:p.s, e:p.e, gross:p.grossH * p.jamJalan, order:p.paidKmH * p.jamJalan / p.tripKm, km:p.kmH * p.jamJalan, pindahKm:p.pindahKm || 0, pindahJam:p.pindahJam || 0, blok:p.b.n, sesi:p.sesi || null });
      });
      var pindahN = 0; r.pieces.forEach(function(p){ if (p.pindahKm > 0.5) pindahN++; });
      return { urutan:u, segmen:seg, r:r, net:r.net, kmPindah:r.kmPindah, pindahN:pindahN, akhir:LOKMAP[u[u.length - 1]], diam:u.every(function(x){ return x === awal.id; }) };
    }
    var hasil = kandidat.map(nilai);
    var basis = hasil.filter(function(h){ return h.diam; })[0] || null;
    hasil.sort(function(a, b){ return b.net - a.net; });
    hasil.forEach(function(h){ h.selisih = basis ? h.net - basis.net : 0; });
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

  return { hitung:hitung, teksUrutan:teksUrutan, KANDIDAT:KANDIDAT, tempatAwal:tempatAwal };
})();
