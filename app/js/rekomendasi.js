/* Rekomendasi rute otomatis: begitu halaman dibuka (dan tiap masukan berubah),
   sembilan tempat kerja dibandingkan memakai perhitungan yang sama dengan perkiraan:
   untuk tiap tempat, sisa hari disimulasikan dari jam tiba di sana, dengan
   wilayah tarifnya (Tangerang / Jakarta / bandara), baterai setelah perjalanan
   pindah, hujan, acara, hari, dan jarak pulangnya. Hasilnya diurutkan.

   Tiap tempat dihitung seperti rencana "tinggal di sana" di Peluang
   (Peluang.urutanTinggal): bobot ramai tempat per jam (BOBOT_TEMPAT) ikut,
   aturan jam 20:00 berlaku, dan angkanya bersih termasuk insentif -- sama
   dengan kartu "Urutan tempat", supaya dua kartu tidak saling membantah.

   BATAS YANG HARUS DIKATAKAN: bobot ramai per tempat diturunkan dari narasi
   Rute 700K, bukan pengukuran (lihat peluang.js); beda antar tempat di wilayah
   tarif yang sama hanya seteliti bobot itu. Tempat yang tidak terjangkau
   baterai (tiba < 8%) tidak ditawarkan; namanya dikembalikan di `terlewat`. */
"use strict";

var Rekomendasi = (function(){
  var KANDIDAT = ["kota", "stasiun", "karawaci", "alsut", "serpong", "bsd", "bandara", "jakbar", "cbd"];
  var LIKU = 1.35;   /* faktor kelokan jalan, sama dengan hampiranPulang */

  function koordinat(L){
    if (!L) return null;
    if (L.lat != null && L.lon != null) return { lat:L.lat, lon:L.lon };
    var v = String(L.id || "");
    if (v.indexOf("custom:gps:") === 0){
      var p = v.slice(11).split(","), la = parseFloat(p[0]), lo = parseFloat(p[1]);
      if (isFinite(la) && isFinite(lo)) return { lat:la, lon:lo };
    }
    return null;
  }
  function salin(o){ var p = {}; Object.keys(o).forEach(function(k){ p[k] = o[k]; }); return p; }

  /* o = masukan runNow (ctx, keluar, pulang, rehat, filter, bat, rumah, hujan, acara, soc)
     L = posisi sekarang (currentLok()), soc = sisa baterai %, stay = tidak pulang
     -> { daftar:[...urut dari terbaik], basis:(entri posisi sekarang | null) } */
  function hitung(o, L, soc, stay){
    var asal = koordinat(L), out = [], terlewat = [];
    KANDIDAT.forEach(function(id){
      var K = LOKMAP[id]; if (!K) return;
      var diSini = !!(L && L.id === K.id);
      var kmPindah = 0;
      var jamPindah = 0;
      var sumberMacet = "statis";
      if (!diSini){
        if (L && L.id && LOKMAP[L.id] && L.lat != null){
          kmPindah = jarakAntar(L, K); jamPindah = jamTempuhAntar(L, K, o.keluar, iso(o.ctx.d));
          if (typeof Lalulintas !== "undefined" && liveBerlaku(o.keluar, iso(o.ctx.d)) && Lalulintas.pengaliCache(L, K) != null) sumberMacet = "tomtom";
        }
        else if (asal){ kmPindah = jarakDatar(asal.lat, asal.lon, K.lat, K.lon) * LIKU; jamPindah = kmPindah / CALIB.kecepatan * faktorMacet(o.keluar, K.z); }
        else { kmPindah = Math.abs(((L && L.home) || 0) - K.home) + 3; jamPindah = kmPindah / CALIB.kecepatan * faktorMacet(o.keluar, K.z); }   /* tanpa koordinat: tebakan kasar */
      }
      /* macet > 1 hanya label "jam macet" di kartu; waktunya sudah dari koridor terukur. */
      var macet = jamSibuk(o.keluar) ? ((K.z === "jkt" || K.z === "mix") ? 1.9 : 1.6) : 1;
      var socPindah = (kmPindah / CALIB.kmkwh) / o.bat * 100;
      /* Tidak terjangkau: tiba di bawah 8% (lantai mutlak 5% + ragam taksiran).
         Dulu tetap ditawarkan dengan "baterai 1%" padahal perjalanannya butuh
         lebih dari sisa baterai. */
      if (!diSini && soc - socPindah < 8){ terlewat.push(K.n); return; }
      var keluar = o.keluar + jamPindah;
      if (o.pulang - keluar < 0.5) return;   /* tidak sempat kerja di sana */
      var o2 = salin(o);
      o2.keluar = keluar; o2.zona = K.z; o2.soc = soc - socPindah;
      o2.deadKm = 0;   /* km kosong sudah dihitung di sini, jangan dihitung lagi oleh wilayah */
      o2.kmHome = stay ? 0 : K.home; o2.stay = !!stay;
      /* Dihitung seperti "Urutan tempat": tinggal di K (bobot ramai tempat per
         jam ikut), tunduk aturan jam 20:00, pindahnya sudah dihitung di atas. */
      o2.urutan = Peluang.urutanTinggal(K, o2); o2.tempatAwal = K;
      var r = simulate(o2);
      var biayaPindah = kmPindah * (TARIF_KWH / CALIB.kmkwh);
      /* Metrik yang sama dengan kartu "Urutan tempat": bersih termasuk
         insentif (jam yang habis di jalan ikut mengurangi insentif). */
      var sisa = r.net - biayaPindah;
      var blkTiba = blockAt(Math.min(keluar, 22.9), o.ctx.shapeDay);
      out.push({ id:id, n:K.n, z:K.z, lat:K.lat, lon:K.lon, diSini:diSini,
                 kmPindah:kmPindah, jamPindah:jamPindah, macet:macet, sumberMacet:sumberMacet, tiba:keluar, socTiba:Math.round(o2.soc),
                 sisa:sisa, sesi:r.sessions, kmHome:stay ? 0 : K.home, res:K.res, pulangMalam:!!o2.urutan.pindahMalam,
                 saran:advise(blkTiba, K, o2), r:r });
    });
    out.sort(function(a, b){ return b.sisa - a.sisa; });
    var basis = null;
    out.forEach(function(x){ if (x.diSini) basis = x; });
    out.forEach(function(x){ x.selisih = basis ? x.sisa - basis.sisa : 0; });
    return { daftar:out, basis:basis, terlewat:terlewat };
  }

  /* Faktor yang ikut menentukan, untuk ditampilkan apa adanya. */
  function faktor(o, soc){
    var ctx = o.ctx, f = [];
    f.push(ctx.name);
    if (ctx.holi) f.push("tanggal merah");
    if (ctx.eve) f.push("malam sebelum libur");
    var b = blockAt(o.keluar, ctx.shapeDay).n;
    f.push("jam " + (typeof labelBlok === "function" ? labelBlok(b) : b).toLowerCase());
    if (o.hujan) f.push("hujan");
    if (ctx.ev) f.push("acara " + ctx.ev[0]); else if (o.acara) f.push("acara besar");
    f.push("baterai " + soc + "%");
    if (o.filter === 0) f.push("filter habis");
    f.push("pulang " + hhmm(o.pulang));
    return f;
  }

  function tautanArah(lat, lon){
    return "https://www.google.com/maps/dir/?api=1&destination=" + lat.toFixed(5) + "," + lon.toFixed(5) + "&travelmode=driving";
  }

  return { hitung:hitung, faktor:faktor, tautanArah:tautanArah, KANDIDAT:KANDIDAT };
})();
