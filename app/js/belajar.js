/* Belajar dari catatan Ibu: kapan (blok jam x hari) dan di mana (tempat)
   order-nya lebih banyak atau lebih sedikit daripada perkiraan mesin.

   Bahan: isian "Order per jam" (rec.blok, blok kosong = tidak narik), zona
   per blok dari jejak GPS (rec.blokZona), dan jendela kerja hari itu
   (rec.jendela dari rencana hari itu). Hari tanpa rincian per jam tapi punya
   total order + jendela ikut sebagai bukti TINGKAT (dibagi rata menurut
   bentuk perkiraan), bukan bukti bentuk jam.

   Cara: untuk tiap blok yang dikerjakan, perkiraan order = jam x km/jam x
   porsi berbayar x pengali (wilayah, hari, gajian, bobot tempat awal) /
   panjang trip -- rumus yang sama dengan simulate(), TANPA hasil belajar
   (tidak ada umpan balik). Lalu rasio sungguhan : perkiraan disusutkan ke
   angka awal dengan "order semu":
     blok         m[b]     = (A + 8 x 1)      / (P + 8)
     hari x blok  m[d][b]  = (A + 12 x m[b])  / (P + 12)
     tempat       f[t]     = (A + 10 x 1)     / (P' + 10)   (P' sudah memakai m[d][b])
   A = order sungguhan, P = order perkiraan. Dengan sedikit data hasilnya
   dekat 1 (angka awal); makin banyak catatan makin mengikuti Ibu. Dijepit
   0,5-1,8 supaya salah ketik tidak merusak semua.

   Batas yang harus dikatakan: jam ngecas di dalam blok ikut terbaca sebagai
   "sepi" (mesin juga mengurangi jam ngecas sendiri, jadi blok yang selalu
   dipakai ngecas bisa sedikit terhukum dua kali). Hujan hari lalu tidak
   tercatat, jadi ikut terserap ke rata-rata. */
"use strict";

var Belajar = (function(){
  var K_BLOK = 8, K_HARI = 12, K_TEMPAT = 10, MIN = 0.5, MAKS = 1.8;
  var H = kosong();

  function kosong(){ return { blok:{}, hariBlok:{}, tempat:{}, A:{}, P:{}, At:{}, Pt:{}, nHari:0, nHariBlok:0, nOrder:0 }; }
  function jepit(x){ return Math.max(MIN, Math.min(MAKS, x)); }
  function bobotAwal(id, n){
    var t = (typeof BOBOT_TEMPAT !== "undefined" && BOBOT_TEMPAT[id]) ? BOBOT_TEMPAT[id] : null;
    return (t && typeof t[n] === "number") ? t[n] : 1;
  }
  /* Perkiraan order per jam blok b pada hari ctx, di tempat (bila diketahui)
     atau wilayah tarif zk -- tanpa hasil belajar. */
  function perJam(b, ctx, tempat, zk){
    var z = tempat ? tempat.z : zk, zp = ZONA[z] || ZONA.tng;
    var m = (PEAKS[b.n] ? zp.peak : zp.off) * ctx.mult * (ctx.gajian ? 1.05 : 1);
    if (tempat) m *= bobotAwal(tempat.id, b.n);
    return b.km * blockU(b, ctx.shapeDay) * m / tripLen(b.n, z);
  }
  function jendelaDari(r){
    if (r.jendela && r.jendela.pulang > r.jendela.keluar) return r.jendela;
    if (!r.blok) return null;
    var s = Infinity, e = -Infinity;
    BASE.forEach(function(b){ if (b.n in r.blok){ s = Math.min(s, b.s); e = Math.max(e, b.e); } });
    return isFinite(s) ? { keluar:s, pulang:e } : null;
  }

  function hitung(rows){
    H = kosong();
    var butir = [];   /* {d, b, act, pred, tempat} */
    (rows || []).forEach(function(r){
      if (!r || !r.id) return;
      var jd = jendelaDari(r); if (!jd) return;
      var ctx = dayCtx(r.id), zk = (jd.zona && ZONA[jd.zona]) ? jd.zona : "tng";
      var bagian = [];
      BASE.forEach(function(b){
        if (r.blok && !(b.n in r.blok)) return;   /* kosong = tidak narik di blok itu */
        var jam = Math.max(0, Math.min(b.e, jd.pulang) - Math.max(b.s, jd.keluar));
        if (jam < 0.25) return;
        var t = (r.blokZona && LOKMAP[r.blokZona[b.n]]) || null;
        bagian.push({ b:b, pred:perJam(b, ctx, t, zk) * jam, tempat:t, act:r.blok ? num(r.blok[b.n]) : null });
      });
      if (!bagian.length) return;
      if (r.blok){ H.nHariBlok++; }
      else {
        /* hanya total: bagi menurut bentuk perkiraan (bukti tingkat saja) */
        var trip = num(r.trip); if (!(trip > 0)) return;
        var tot = 0; bagian.forEach(function(x){ tot += x.pred; });
        if (!(tot > 0)) return;
        bagian.forEach(function(x){ x.act = trip * x.pred / tot; });
      }
      H.nHari++;
      bagian.forEach(function(x){ H.nOrder += x.act; butir.push({ d:ctx.shapeDay, b:x.b.n, act:x.act, pred:x.pred, tempat:x.tempat }); });
    });

    /* Jam dan tempat bergantian (6 putaran): pola jam dihitung dengan
       perkiraan yang sudah memakai faktor tempat, lalu faktor tempat dengan
       perkiraan yang sudah memakai pola jam. Tanpa ini, Ibu yang pagi di
       Karawaci dan malam di BSD membuat ramainya Karawaci terbaca sebagai
       "pagi ramai". Batas jujur: kalau Ibu selalu di tempat yang sama, jam
       dan tempat memang tidak bisa dipisahkan -- semuanya terbaca sebagai
       pola jam. */
    for (var putaran = 0; putaran < 6; putaran++){
      var Ab = {}, Pb = {}, Adb = {}, Pdb = {};
      butir.forEach(function(x){
        var pr = x.pred * (x.tempat ? tempat(x.tempat.id) : 1);
        Ab[x.b] = (Ab[x.b] || 0) + x.act; Pb[x.b] = (Pb[x.b] || 0) + pr;
        var k = x.d + "|" + x.b;
        Adb[k] = (Adb[k] || 0) + x.act; Pdb[k] = (Pdb[k] || 0) + pr;
      });
      H.blok = {}; H.hariBlok = {};
      Object.keys(Pb).forEach(function(b){ H.blok[b] = jepit((Ab[b] + K_BLOK) / (Pb[b] + K_BLOK)); });
      Object.keys(Pdb).forEach(function(k){
        var p = k.split("|"), d = p[0], b = p[1];
        (H.hariBlok[d] || (H.hariBlok[d] = {}))[b] = jepit((Adb[k] + K_HARI * H.blok[b]) / (Pdb[k] + K_HARI));
      });
      H.A = Ab; H.P = Pb;

      var At = {}, Pt = {};
      butir.forEach(function(x){
        if (!x.tempat) return;
        var id = x.tempat.id;
        At[id] = (At[id] || 0) + x.act; Pt[id] = (Pt[id] || 0) + x.pred * pengali(x.d, x.b);
      });
      var baru = {};
      Object.keys(Pt).forEach(function(id){ baru[id] = jepit((At[id] + K_TEMPAT) / (Pt[id] + K_TEMPAT)); });
      H.tempat = baru; H.At = At; H.Pt = Pt;
      if (!Object.keys(Pt).length) break;   /* tanpa zona GPS tidak ada yang perlu dipisahkan */
    }
    return H;
  }

  /* Pengali volume order yang dipelajari untuk blok jam di hari itu (1 bila belum ada data). */
  function pengali(shapeDay, namaBlok){
    var hb = H.hariBlok[shapeDay];
    if (hb && typeof hb[namaBlok] === "number") return hb[namaBlok];
    return (typeof H.blok[namaBlok] === "number") ? H.blok[namaBlok] : 1;
  }
  function tempat(id){ return (typeof H.tempat[id] === "number") ? H.tempat[id] : 1; }

  /* Ringkasan untuk ditampilkan: hanya yang datanya cukup (perkiraan >= 4 order)
     dan bedanya berarti (>= 10%). */
  function ringkas(){
    var blok = [], tempatL = [];
    Object.keys(H.blok).forEach(function(b){
      if ((H.P[b] || 0) >= 4 && Math.abs(H.blok[b] - 1) >= 0.10) blok.push({ n:b, m:H.blok[b] });
    });
    Object.keys(H.tempat).forEach(function(id){
      if ((H.Pt[id] || 0) >= 4 && Math.abs(H.tempat[id] - 1) >= 0.10 && LOKMAP[id]) tempatL.push({ id:id, n:LOKMAP[id].n, m:H.tempat[id] });
    });
    blok.sort(function(a, b){ return b.m - a.m; }); tempatL.sort(function(a, b){ return b.m - a.m; });
    return { nHari:H.nHari, nHariBlok:H.nHariBlok, nOrder:Math.round(H.nOrder), blok:blok, tempat:tempatL };
  }

  return { hitung:hitung, pengali:pengali, tempat:tempat, ringkas:ringkas, perJam:perJam };
})();
