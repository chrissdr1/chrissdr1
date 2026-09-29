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
  /* Nilai pergi ke K sekarang lalu tinggal di sana sampai pulang.
     kaliMacet (bawaan 1): semua perjalanan (ke K, pindah malam, pulang)
     dikali angka ini -- 1,5 = uji "kalau macet parah". Mengembalikan entri,
     { terlewat:true } bila baterai tidak cukup untuk sampai, atau null bila
     tidak sempat kerja di sana. */
  function nilaiSatu(o, L, soc, stay, K, kaliMacet){
    kaliMacet = kaliMacet || 1;
    var asal = koordinat(L);
    var diSini = !!(L && L.id === K.id);
    var kmPindah = 0, jamPindah = 0, sumberMacet = "statis";
    if (!diSini){
      if (L && L.id && LOKMAP[L.id] && L.lat != null){
        kmPindah = jarakAntar(L, K); jamPindah = jamTempuhAntar(L, K, o.keluar, iso(o.ctx.d));
        if (typeof Lalulintas !== "undefined" && liveBerlaku(o.keluar, iso(o.ctx.d)) && Lalulintas.pengaliCache(L, K) != null) sumberMacet = "tomtom";
        else if (typeof UkurMacet !== "undefined" && UkurMacet.menitRute(L.id, K.id, o.keluar, UkurMacet.tipeTgl(iso(o.ctx.d))) != null) sumberMacet = "terukur";
      }
      else if (asal){ kmPindah = jarakDatar(asal.lat, asal.lon, K.lat, K.lon) * LIKU; jamPindah = kmPindah / CALIB.kecepatan * faktorMacet(o.keluar, K.z, tipeDari(o.ctx)); }
      else { kmPindah = Math.abs(((L && L.home) || 0) - K.home) + 3; jamPindah = kmPindah / CALIB.kecepatan * faktorMacet(o.keluar, K.z, tipeDari(o.ctx)); }   /* tanpa koordinat: tebakan kasar */
    }
    jamPindah *= kaliMacet;
    /* macet = pengali lalu lintas jam itu (label kartu); waktunya sudah dihitung di atas. */
    var macet = faktorLalin(o.keluar, K.z === "jkt" || (L && L.z === "jkt"), tipeDari(o.ctx));
    var socPindah = (kmPindah / CALIB.kmkwh) / o.bat * 100;
    /* Tidak terjangkau: tiba di bawah 8% (lantai mutlak 5% + ragam taksiran).
       Dulu tetap ditawarkan dengan "baterai 1%" padahal perjalanannya butuh
       lebih dari sisa baterai. */
    if (!diSini && soc - socPindah < 8 && !(K.id === "kota" && o.rumah)) return { terlewat:true, n:K.n, socPindah:socPindah };
    var keluar = o.keluar + jamPindah;
    if (o.pulang - keluar < 0.5) return null;   /* tidak sempat kerja di sana */
    var o2 = salin(o);
    o2.keluar = keluar; o2.zona = K.z; o2.soc = soc - socPindah;
    o2.deadKm = 0;   /* km kosong sudah dihitung di sini, jangan dihitung lagi oleh wilayah */
    o2.kmHome = stay ? 0 : K.home; o2.stay = !!stay; o2.kaliMacet = kaliMacet;
    /* Dihitung seperti "Urutan tempat": tinggal di K (bobot ramai tempat per
       jam ikut), tunduk aturan jam 20:00, pindahnya sudah dihitung di atas. */
    o2.urutan = Peluang.urutanTinggal(K, o2); o2.tempatAwal = K;
    var r = simulate(o2);
    var biayaPindah = kmPindah * (TARIF_KWH / CALIB.kmkwh);
    /* Metrik yang sama dengan kartu "Urutan tempat": bersih termasuk
       insentif (jam yang habis di jalan ikut mengurangi insentif). */
    /* "sampai pulang": insentif untuk jam yang SUDAH lewat bukan pendapatan
       sisa hari, jadi dikurangkan (selisih antar tempat tidak berubah). */
    var sisa = r.net - biayaPindah - insentifSebelum(o);
    var blkTiba = blockAt(Math.min(keluar, 22.9), o.ctx.shapeDay);
    var jamPulang = stay ? 0 : jamMulaiPulang(o2, o2.tempatAkhir || K);
    /* Aturan 20:00 (Jakarta): jam keluar Jakarta dan lama perjalanannya ke arah rumah */
    var pm = o2.urutan.pindahMalam ? r.pieces.filter(function(p){ return !p.jeda && p.s >= 20 && p.pindahJam > 0; })[0] : null;
    return { id:K.id, n:K.n, z:K.z, lat:K.lat, lon:K.lon, diSini:diSini, tempat:K,
             kmPindah:kmPindah, jamPindah:jamPindah, macet:macet, sumberMacet:sumberMacet, tiba:keluar, socTiba:Math.round(o2.soc),
             sisa:sisa, sesi:r.sessions, kmHome:stay ? 0 : K.home, res:K.res, pulangMalam:!!o2.urutan.pindahMalam,
             mulaiPulang:o.pulang - jamPulang, jamPulang:jamPulang,
             keluarJkt:pm ? pm.s : null, keluarJktJam:pm ? pm.pindahJam : null,
             saran:advise(blkTiba, K, o2), r:r };
  }

  /* Uji macet parah untuk entri yang pindah: kalau perjalanan 1,5x lebih lama
     (dan tetap-di-sini juga menanggung pulang yang 1,5x), apakah pindah masih
     lebih untung? 1,5x itu SKENARIO uji, bukan ramalan -- tidak ada data
     peluang macet; yang diuji adalah seberapa rapuh keputusannya. */
  var KALI_PARAH = 1.5;
  /* Macet tidak pernah membuat Ibu lebih kaya. Mesin memaksa narik di semua
     jam yang tersisa, jadi tiba lebih lambat kadang memotong jam yang "rugi"
     (mis. yang butuh satu sesi ngecas Rp25 ribu) dan hasilnya tampak naik --
     itu artefak model. Hasil uji parah dijepit ke hasil jalan biasa. */
  function sisaParahDari(biasa, p){ return (p && !p.terlewat) ? Math.min(biasa.sisa, p.sisa) : null; }
  function ujiMacet(o, L, soc, stay, x, basisParahSisa){
    if (x.diSini || basisParahSisa == null) return;
    x.sisaParah = sisaParahDari(x, nilaiSatu(o, L, soc, stay, x.tempat, KALI_PARAH));
    x.selisihParah = x.sisaParah == null ? null : x.sisaParah - basisParahSisa;
    x.rapuh = x.selisih > 0 && (x.selisihParah == null || x.selisihParah <= 0);
  }

  function hitung(o, L, soc, stay){
    var out = [], terlewat = [];
    /* Posisi GPS / kecamatan di luar sembilan inti: "tetap di sini" dihitung
       dari titik itu sendiri, supaya selisih tiap kartu punya pembanding. */
    var tp = tempatPosisi(L), daftarK = KANDIDAT.map(function(id){ return LOKMAP[id]; });
    if (tp && tp.posisi) daftarK.unshift(tp);
    daftarK.forEach(function(K){
      if (!K) return;
      var x = nilaiSatu(o, L, soc, stay, K, 1);
      if (!x) return;
      if (x.terlewat){ terlewat.push(x.n); return; }
      out.push(x);
    });
    out.sort(function(a, b){ return b.sisa - a.sisa; });
    var basis = null;
    out.forEach(function(x){ if (x.diSini) basis = x; });
    out.forEach(function(x){ x.selisih = basis ? x.sisa - basis.sisa : 0; });
    /* uji macet parah untuk 3 teratas yang pindah (yang benar-benar tampil) */
    if (basis){
      var bpSisa = sisaParahDari(basis, nilaiSatu(o, L, soc, stay, basis.tempat, KALI_PARAH));
      if (bpSisa == null) bpSisa = basis.sisa;
      out.filter(function(x){ return !x.diSini; }).slice(0, 3).forEach(function(x){ ujiMacet(o, L, soc, stay, x, bpSisa); });
    }
    return { daftar:out, basis:basis, terlewat:terlewat, kiraKira:!tp };
  }

  /* Tujuan pilihan Ibu sendiri (tempat mana pun di LOK), dibandingkan dengan
     tetap di tempat sekarang -- dengan uji macet parah yang sama. */
  function tujuan(o, L, soc, stay, id){
    var K = LOKMAP[id]; if (!K) return null;
    var tinggal = tempatPosisi(L) || Peluang.tempatAwal(L);
    var x = nilaiSatu(o, L, soc, stay, K, 1);
    if (!x || x.terlewat) return { K:K, x:x, tinggal:tinggal };
    var b = nilaiSatu(o, L, soc, stay, tinggal, 1);
    b = (b && !b.terlewat) ? b : null;
    x.selisih = b ? x.sisa - b.sisa : null;
    if (b){
      var bpSisa = sisaParahDari(b, nilaiSatu(o, L, soc, stay, tinggal, KALI_PARAH));
      ujiMacet(o, L, soc, stay, x, bpSisa == null ? b.sisa : bpSisa);
    }
    return { K:K, x:x, basis:b, tinggal:tinggal };
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
    var st = typeof UkurMacet !== "undefined" ? UkurMacet.status() : null;
    f.push(st && st.terukur > 0 ? "pola macet TomTom terukur (" + st.terukur + " dari " + st.total + " rute-jam)" : "macet: perkiraan umum (belum ada pengukuran TomTom)");
    return f;
  }

  function tautanArah(lat, lon){
    return "https://www.google.com/maps/dir/?api=1&destination=" + lat.toFixed(5) + "," + lon.toFixed(5) + "&travelmode=driving";
  }

  return { hitung:hitung, tujuan:tujuan, faktor:faktor, tautanArah:tautanArah, KANDIDAT:KANDIDAT, KALI_PARAH:KALI_PARAH };
})();
