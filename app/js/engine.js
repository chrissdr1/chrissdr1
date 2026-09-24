/* Mesin hitung: kalibrasi, simulasi sif, urutan langkah, nasihat, jarak pulang,
   dan uji mandiri. Tidak menggambar apa pun ke layar. */
"use strict";

var el = function(id){ return document.getElementById(id); };

function iso(d){ return d.toLocaleDateString("sv-SE"); }
function addDays(d, n){ var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function isOff(d){ return HOLI[iso(d)] || d.getDay() === 0 || d.getDay() === 6; }

/* ---------------- helpers ---------------- */
function num(v){ var n = parseFloat(v); return isFinite(n) && n >= 0 ? n : 0; }
function rp(v){ return "Rp " + Math.round(v).toLocaleString("id-ID"); }
function dec(v,d){ return v.toLocaleString("id-ID",{minimumFractionDigits:d,maximumFractionDigits:d}); }
function hhmm(h){ var m=Math.round(h*60),H=Math.floor(m/60),M=m%60;
  return String(H).padStart(2,"0")+":"+String(M).padStart(2,"0"); }
function fillTimes(sel, from, to, def){
  var h=""; for (var t=from;t<=to;t+=0.25) h+='<option value="'+t+'">'+hhmm(t)+"</option>";
  sel.innerHTML=h; sel.value=def;
}
/* Jeda: preset ("duapeak" = dua sif, "full", "short"), "none", "HH:MM-HH:MM",
   atau [dari, sampai] dalam jam desimal. Jeda bebas dipilih Ibu sendiri. */
function rehatRange(m){
  if (Array.isArray(m)){
    var x = Number(m[0]), y = Number(m[1]);
    return (isFinite(x) && isFinite(y) && y > x) ? [x, y] : null;
  }
  if (typeof m === "string"){
    var t = /^(\d{1,2}):(\d{2})\s*[-\u2013]\s*(\d{1,2}):(\d{2})$/.exec(m.trim());
    if (t){ var s1 = +t[1] + (+t[2])/60, e1 = +t[3] + (+t[4])/60; return e1 > s1 ? [s1, e1] : null; }
  }
  if (m === "duapeak") return [9.5, 16.75];       /* dua sif: pagi + sore */
  if (m === "full") return [10.5, 15];
  if (m === "short") return [13, 15];
  return null;
}
function rehatTeks(m){ var r = rehatRange(m); return r ? hhmm(r[0]) + "\u2013" + hhmm(r[1]) : "tanpa jeda"; }

/* ---------------- rows + auto calibration ---------------- */
var rows = [], sampler = null;
var LS = "buku-setoran-v1";
function lsRead(){ try{ return JSON.parse(localStorage.getItem(LS)||"[]"); }catch(e){ return []; } }
function lsWrite(l){ try{ localStorage.setItem(LS, JSON.stringify(l)); }catch(e){} }
function sortRows(){ rows.sort(function(a,b){ return a.id<b.id?1:a.id>b.id?-1:0; }); }

function derive(r){
  var kmt=num(r.kmt), kmp=num(r.kmp), jam=num(r.jam), kwh=num(r.kwh);
  var net = num(r.dpt)+num(r.ins)-num(r.biaya);
  return { net:net,
    perjam: jam>0?net/jam:null,
    kmjam: (kmp>0&&jam>0)?kmp/jam:null,
    util: (kmp>0&&kmt>0)?(kmp/kmt)*100:null,
    eff: (kwh>0&&kmt>0)?kmt/kwh:null,
    rpkm: kmp>0?num(r.dpt)/kmp:null,
    tripKm: (kmp>0 && num(r.trip)>0) ? kmp/num(r.trip) : null,
    ins: num(r.ins) };
}
function avgOf(list, pick){
  var s=0,n=0; list.forEach(function(r){ var v=pick(derive(r));
    if (v!=null && isFinite(v) && v>0){ s+=v; n++; } });
  return n?{v:s/n,n:n}:null;
}
/* Calibration used by the whole engine. Falls back to Rute 700K assumptions. */
/* 26 km/jam itu ANGKA TEBAKAN saya, dan ia menentukan tujuh hal yang paling
   menyangkut keselamatan: berapa lama perjalanan pulang, kapan mulai merapat,
   kapan disebut "waktu mepet". Belum pernah diuji sekali pun.

   Tidak bisa diturunkan dari catatan harian: km tempuh dibagi jam kerja
   mencampur waktu bergerak dengan waktu menunggu order, dan hasilnya
   MEREMEHKAN kecepatan menyetir (245 km / 11 jam = 22 km/jam, padahal kalau
   75% waktunya bergerak, menyetirnya 30 km/jam). Dipakai begitu saja, Ibu
   disuruh pulang terlalu pagi -- kehilangan jam kerja, bukan bertambah aman.

   Satu-satunya yang benar: berapa menit perjalanan pulangnya sungguhan.
   Itu satu angka, dan cuma Ibu yang punya. */
var KEC_BAWAAN = 26;
var CALIB = { rpkm:BASE_RPKM, ins:130000, kmkwh:6.7, kecepatan:KEC_BAWAAN, tripKm:BASE_TRIP_KM,
              kecUkur:false, kecN:0, live:false, n:0 };
function recalibrate(){
  var recent = rows.slice(0,14);
  var a = avgOf(recent,function(d){return d.rpkm;});
  var b = avgOf(recent,function(d){return d.eff;});
  var c = avgOf(recent,function(d){return d.ins;});
  var t = avgOf(recent,function(d){return d.tripKm;});
  var enough = recent.length >= 3;
  /* Kecepatan pulang dari hari-hari yang menit pulangnya dicatat. Median,
     bukan rata-rata: satu hari dengan banjir tidak boleh menggeser semuanya.
     Dijepit 12-45 km/jam supaya salah ketik tidak merusak seluruh rencana. */
  var laju = [];
  rows.slice(0, 20).forEach(function(r){
    var m = num(r.mnt), k = num(r.pkm);
    if (m >= 5 && k >= 3){ var v = k / (m/60); if (v >= 12 && v <= 45) laju.push(v); }
  });
  laju.sort(function(x,y){ return x-y; });
  /* Jumlah genap: ambil yang LEBIH LAMBAT, bukan rata-ratanya. Kecepatan yang
     terlalu tinggi membuat Ibu disuruh berangkat pulang terlambat, dan itu
     kesalahan yang mahal; kelebihan waktu cuma merepotkan. */
  var kec = laju.length ? laju[Math.floor((laju.length - 1) / 2)] : KEC_BAWAAN;
  CALIB = {
    rpkm: (enough && a) ? a.v : BASE_RPKM,
    ins:  (enough && c) ? c.v : 130000,
    kmkwh:(enough && b) ? b.v : 6.7,
    tripKm:(enough && t) ? t.v : BASE_TRIP_KM,
    kecepatan: kec, kecUkur: laju.length > 0, kecN: laju.length,
    live: enough && !!(a||b||c),
    n: recent.length
  };
  var cm = el("calmode");
  if (cm) cm.textContent = CALIB.live
    ? "Angka Anda · " + CALIB.n + " hari" : "Asumsi bawaan";
}
function blockRate(b, hari){
  var base = (SHAPE[hari] && SHAPE[hari][b.n]) ? SHAPE[hari][b.n] : b.r;
  var u = (base + b.km*BASE_E) / (b.km*BASE_RPKM);
  return Math.max(0, b.km*u*CALIB.rpkm - b.km*(TARIF_KWH/CALIB.kmkwh));
}

/* ---------------- day context (holiday aware) ---------------- */
function dayCtx(dateStr){
  var d = new Date(dateStr + "T00:00:00");
  var dow = d.getDay();
  var h = HOLI[dateStr] || null;
  var eve = !isOff(d) && !!HOLI[iso(addDays(d,1))];
  var runLen = 0;
  if (h || dow===0 || dow===6){ var x=d; while (isOff(x)){ runLen++; x=addDays(x,1); } }
  var evePlus = false;
  if (!h && dow!==0 && dow!==6){
    var x2 = addDays(d,1), c=0; while (isOff(x2) && c<6){ c++; x2=addDays(x2,1); }
    evePlus = c >= 3;
  }
  /* a holiday behaves like Sunday: no commute peak */
  var shapeDay = h ? 0 : dow;
  var mult = DAYMULT[dow];
  if (h) mult = 0.97 * (runLen >= 3 ? 1.05 : 1);
  if (eve) mult *= (evePlus ? 1.18 : 1.08);
  var ev = EVENTS[dateStr] || null;
  if (ev) mult *= (ev[2] === "lokal" ? 1.12 : 1.06);
  /* Musim gajian tanggal 25-5 (Rute 700K): permintaan naik di hampir semua blok. */
  var dm = d.getDate(), gajian = dm >= 25 || dm <= 5;
  return { d:d, dow:dow, holi:h, eve:eve, evePlus:evePlus, runLen:runLen, ev:ev, gajian:gajian,
           shapeDay:shapeDay, mult:mult, name:DAYNAME[dow] };
}

/* ---------------- simulation ----------------
   Satu mesin untuk tab Sekarang, Rencana, rekomendasi, dan uji mandiri.

   Alurnya: potongBlok() memotong sembilan blok jam menurut jam keluar, jam
   pulang, dan jeda (bebas: dari-sampai). Lalu baterai disimulasikan potongan
   demi potongan dari SoC awal; sesi ngecas ditempatkan oleh pilihSesi():
   semua kombinasi potongan dicoba dan yang termurah dipilih (jeda gratis,
   blok peak dihukum, lantai 20% / 25% di Jakarta boleh ditembus sedikit
   dengan biaya, pulang harus dengan cadangan (km pulang / km per persen)
   + 15%). Tiap sesi diisi SECUKUPNYA sampai sesi berikutnya atau sampai
   pulang (maks 90%), jadi sebelum jeda hanya "jembatan" kecil, isi penuhnya
   di jeda. Setiap sesi tahu berapa jam kerja yang hilang; jeda hanya
   menutupi sesi yang memang ada di dalamnya.

   Uang: pendapatan = jam jalan x pendapatan kotor blok; listrik dari SELURUH
   km (kerja + km kosong + km pulang); insentif proporsional jam hari itu
   (jam sebelum + jam efektif); biaya sesi per sesi; parkir hanya bila ada
   blok mal. Semua angka yang tampil di daftar langkah berasal dari potongan
   yang sama, jadi kumulatifnya bertemu angka bersih.

   Order: km berbayar per jam = km blok x porsi berbayar (u dari blockRate)
   x pengali; jumlah order = km berbayar / panjang trip khas blok (TRIP_KM,
   dikalikan faktor wilayah; terkalibrasi dari catatan kmp/trip bila ada). */

/* Porsi km berbayar per blok, dari tarif blok: revenue = km*u*rpkm. */
function blockU(b, hari){
  var base = (SHAPE[hari] && SHAPE[hari][b.n]) ? SHAPE[hari][b.n] : b.r;
  return (base + b.km*BASE_E) / (b.km*BASE_RPKM);
}
/* Pendapatan kotor (bagian pengemudi) per jam, sebelum listrik. */
function blockGross(b, hari){ return b.km * blockU(b, hari) * CALIB.rpkm; }
/* Panjang trip khas (km) untuk blok di wilayah tertentu, terkalibrasi. */
function tripLen(namaBlok, zona){
  var dasar = TRIP_KM[namaBlok] || 8, fz = TRIP_ZONA[zona] || 1;
  return Math.max(2, dasar * fz * (CALIB.tripKm / BASE_TRIP_KM));
}
/* Faktor waktu tempuh jam sibuk (Rute 700K: x1,6 Tangerang, x1,9 Jakarta)
   untuk perjalanan yang dimulai pada jam tertentu. */
/* CALIB.kecepatan (26 km/jam bawaan) SUDAH kecepatan jam sibuk Jabodetabek
   (Rute 700K: CBD 26 km / 46 menit sibuk = 34 km/jam; Alam Sutera 9 km / 19
   menit = 29 km/jam). Jadi di jam sibuk faktornya 1; di luar jam sibuk jalan
   lebih lancar 1,6x (Tangerang) / 1,9x (arah Jakarta), bukan sebaliknya.
   Dulu 26 km/jam dikalikan 1,6/1,9 LAGI sehingga CBD jadi 129 menit. */
function jamSibuk(jam){ return (jam >= 6 && jam < 9) || (jam >= 16.5 && jam < 20); }
/* Waktu tempuh (jam) ke/dari rumah untuk tempat L pada jam tertentu. Tempat
   inti punya menit terukur (Rute 700K, lancar & jam sibuk); tempat lain
   memakai km / kecepatan kalibrasi x faktor macet. Kalau kecepatan sudah
   terkalibrasi dari catatan Ibu, menit terukur ikut diskalakan. */
function jamTempuhRumah(L, jam, km){
  var kmPakai = (typeof km === "number") ? km : (L ? L.home : 0);
  if (L && L.mnt){
    var m = jamSibuk(jam) ? L.mnt.sibuk : L.mnt.lancar;
    var skala = KEC_BAWAAN / Math.max(10, CALIB.kecepatan);   /* kalibrasi lambat -> lebih lama */
    var dasar = m / 60 * skala;
    /* km yang diminta beda dari km tempat (mis. protokol dari wilayah inti): proporsional */
    return (typeof km === "number" && L.home > 0) ? dasar * km / L.home : dasar;
  }
  var zona = L ? L.z : "tng";
  return kmPakai / CALIB.kecepatan * faktorMacet(jam, zona);
}
/* Jarak jalan antar dua tempat (km): garis lurus x faktor kelokan. Faktor tiap
   tempat diturunkan dari jarak terukur ke rumah (km terukur / garis lurus),
   dibatasi 1,3-2,2; pasangan memakai rata-rata geometrisnya. Untuk pasangan
   yang salah satunya rumah, jarak terukurnya dipakai langsung. */
function jarakAntar(A, B){
  if (!A || !B || A.lat == null || B.lat == null) return 0;
  if (A.id === B.id) return 0;
  if (A.id === "kota") return B.pergi || B.home;
  if (B.id === "kota") return A.home;
  var lurus = jarakLurus(A.lat, A.lon, B.lat, B.lon);
  function liku(L){ var d = jarakLurus(RUMAH.lat, RUMAH.lon, L.lat, L.lon); return Math.max(1.3, Math.min(2.2, d > 0.5 ? L.home / d : 1.35)); }
  return lurus * Math.sqrt(liku(A) * liku(B));
}
/* Waktu tempuh antar tempat (jam): jarak jalan / kecepatan koridor. Kecepatan
   koridor tiap tempat = km terukur / menit terukur (lancar atau sibuk); pasangan
   memakai rata-ratanya, diskalakan kalibrasi. */
function jamTempuhAntar(A, B, jam){
  var km = jarakAntar(A, B); if (!km) return 0;
  function v(L){
    if (L && L.mnt){ var m = jamSibuk(jam) ? L.mnt.sibuk : L.mnt.lancar; return (L.pergi || L.home) / (m / 60); }
    return CALIB.kecepatan / faktorMacet(jam, L ? L.z : "tng");
  }
  /* dari/ke rumah: koridor tempat itu sendiri yang terukur, bukan rata-rata */
  var kec = (A.id === "kota" ? v(B) : B.id === "kota" ? v(A) : (v(A) + v(B)) / 2) * (CALIB.kecepatan / KEC_BAWAAN);
  return km / Math.max(8, kec);
}
function faktorMacet(jam, zona){
  if (jamSibuk(jam)) return 1;
  return 1 / ((zona === "jkt" || zona === "mix") ? 1.9 : 1.6);
}

/* Potong blok jam menurut jam keluar-pulang dan jeda -> urutan potongan
   berurutan tanpa lubang: kerja {b,s,e,w} dan jeda {jeda:true,s,e,w}.
   Potongan kerja < 0,4 jam digabung ke tetangga kerja (berikutnya; kalau
   tidak ada, sebelumnya) supaya tidak ada langkah 15 menit -- waktunya
   tidak dibuang, hanya dilekatkan. Jeda di tengah blok membelah blok itu. */
function potongBlok(o){
  var rehat = rehatRange(o.rehat);
  if (rehat){
    rehat = [Math.max(rehat[0], o.keluar), Math.min(rehat[1], o.pulang)];
    if (rehat[1] - rehat[0] < 0.25) rehat = null;
  }
  var out = [];
  BASE.forEach(function(b){
    var s = Math.max(b.s, o.keluar), e = Math.min(b.e, o.pulang);
    if (e <= s) return;
    var segs = [[s, e]];
    if (rehat){
      segs = [];
      if (s < rehat[0]) segs.push([s, Math.min(e, rehat[0])]);
      if (e > rehat[1]) segs.push([Math.max(s, rehat[1]), e]);
    }
    segs.forEach(function(x){ if (x[1] - x[0] > 0.001) out.push({ b:b, s:x[0], e:x[1], w:x[1]-x[0] }); });
  });
  if (rehat) out.push({ jeda:true, s:rehat[0], e:rehat[1], w:rehat[1]-rehat[0] });
  out.sort(function(a, c){ return a.s - c.s; });
  for (var i = 0; i < out.length; i++){
    var p = out[i];
    if (p.jeda || p.w >= 0.4) continue;
    var next = out[i+1], prev = out[i-1];
    if (next && !next.jeda){ next.s = p.s; next.w = next.e - next.s; next.gabung = true; out.splice(i, 1); i--; }
    else if (prev && !prev.jeda){ prev.e = p.e; prev.w = prev.e - prev.s; out.splice(i, 1); i--; }
  }
  return out;
}

/* Penempatan sesi ngecas: SEMUA kombinasi 0-3 potongan (4 bila 3 masih
   kurang) dicoba, tiap sesi diisi SECUKUPNYA sampai sesi berikutnya (atau
   sampai pulang dengan cadangan), maksimum 90%. Biaya satu kombinasi = jam
   kerja yang hilang x tarif blok + Rp25 ribu per sesi + hukuman: sesi di
   peak 1e6 (hanya bila tidak ada jalan lain), potongan pendek, dan baterai
   di bawah lantai (ringan sampai 5% di bawah lantai, berat setelahnya,
   mustahil di bawah 5%). Dengan begini "isi sedikit sebelum jeda lalu isi
   penuh di jeda" dipilih kalau memang lebih murah, dan tidak ada lagi
   sesi 90% di blok kerja disusul sesi kecil di jeda. */
function pilihSesi(pieces, socAwal, floor, ambang, fullSesi, kmPerFrac, deadJam, rumah, cap){
  deadJam = deadJam || 0;
  var n = pieces.length;
  var kum = [0]; for (var i = 0; i < n; i++) kum.push(kum[i] + pieces[i].pakai);
  function jalan(idxs, simpan){
    /* socMinKerja: terendah di AKHIR potongan kerja (bukan saat berangkat:
       berangkat tipis lalu langsung ngecas di langkah pertama itu sah). */
    /* lanjut = jam yang terbawa ke potongan berikutnya: km kosong menuju
       pangkalan di awal hari, luberan sesi jeda, atau luberan sesi di potongan
       kerja yang lebih pendek dari durasinya. */
    var soc = socAwal, socMin = soc, socMinKerja = 1, cost = 0, sesi = [], viol = 0, si = 0;
    var bawaMati = deadJam, bawaCas = 0, matiPakai = 0, casPakai = 0;
    for (var i = 0; i < n; i++){
      var p = pieces[i], s = null;
      if (simpan){ p.socMulai = soc; p.sesi = null; }
      /* pindah tempat di awal potongan: waktu ikut "mati", km ikut menguras baterai */
      if (p.pindahJam){ bawaMati += p.pindahJam; }
      if (p.pindahKm){ soc -= p.pindahKm / kmPerFrac; if (simpan) p.socMulai = soc; }
      var lanjutMasuk = bawaMati + bawaCas;
      if (!p.jeda) cost += Math.min(lanjutMasuk, p.w) * p.rateH;   /* jam terbawa memakan jam kerja potongan ini */
      if (si < idxs.length && idxs[si] === i){
        var next = (si + 1 < idxs.length) ? idxs[si+1] : n;
        var dasar = kum[next] - kum[i] + (next === n ? ambang : floor) + 0.02;
        /* DC cepat (SPKLU) berhenti di 90%. Sampai 100% hanya di jeda panjang
           (>= 2,5 jam) DAN ada charger di rumah: colok AC 7 kW, lambat tapi
           gratis waktu; durasinya kWh / 7 kW + 15 menit pulang. */
        var bolehAC = !!(p.jeda && p.w >= 2.5 && rumah);
        var maks = bolehAC ? 1.00 : 0.90;
        var dari = soc, ke = Math.min(maks, dasar), durasi = 0, hilang = 0, luber = 0, ac = false;
        var kmNext = (pieces[i+1] && !pieces[i+1].jeda) ? pieces[i+1].kmH : 0;
        for (var it = 0; it < 3; it++){   /* jam hilang mengurangi km yang dipakai */
          ac = bolehAC && ke > 0.90;
          durasi = ac ? (ke - dari) * cap / 7 + 0.25 : fullSesi * (ke - dari) / 0.75 + 0.12;
          if (p.jeda){ hilang = Math.max(0, durasi - p.w); luber = 0; }
          else { hilang = Math.min(durasi, p.w); luber = Math.max(0, durasi - p.w); }
          /* jam yang tidak dijalani di potongan ini: ngecas, luberan, dan jam terbawa (km kosong / luberan sebelumnya) */
          var pakaiHilang = p.jeda ? kmNext * hilang : (p.kmH * Math.min(p.w, hilang + lanjutMasuk) + kmNext * luber);
          ke = Math.min(maks, dasar - pakaiHilang / kmPerFrac);
        }
        if (ke < dari + 0.05) return null;   /* sesi tak berguna: kombinasi gugur */
        var tarif = p.jeda ? ((pieces[i+1] && !pieces[i+1].jeda) ? pieces[i+1].rateH : 0) : p.rateH;
        cost += hilang * tarif + SESSION_FEE;   /* luberan dibebankan saat potongan berikutnya diproses */
        if (!p.jeda && PEAKS[p.b.n]) cost += 1e6;
        if (!p.jeda && p.w < 0.5) cost += 3e5;
        s = { idx:i, jam:p.s, blok:(p.jeda ? "Istirahat" : p.b.n), dari:dari, ke:ke, durasi:durasi,
              jamHilang:hilang, luber:luber, ac:ac, diJeda:!!p.jeda, biaya:SESSION_FEE, tarifBlok:tarif,
              peak:!p.jeda && !!PEAKS[p.b.n], terpaksa:false };
        sesi.push(s); soc = ke; si++;
      }
      var jamJalan, matiIni = 0, casIni = 0;
      if (p.jeda){
        jamJalan = 0;
        /* jeda menyerap luberan ngecas (mobil dicolok sambil istirahat); km
           kosong menuju pangkalan tetap terbawa ke potongan kerja berikutnya */
        bawaCas = Math.max(0, bawaCas - p.w) + (s ? s.jamHilang : 0);
      } else {
        matiIni = Math.min(bawaMati, p.w); bawaMati -= matiIni;
        casIni = Math.min(bawaCas + (s ? s.jamHilang : 0), p.w - matiIni);
        bawaCas = Math.max(0, bawaCas + (s ? s.jamHilang : 0) - casIni) + (s ? s.luber : 0);
        jamJalan = Math.max(0, p.w - matiIni - casIni);
      }
      matiPakai += matiIni; casPakai += casIni;
      if (simpan){ p.matiPakai = matiIni; p.casPakai = casIni; }
      soc -= (p.kmH || 0) * jamJalan / kmPerFrac;
      if (soc < socMin) socMin = soc;
      if (i < n - 1 && soc < socMinKerja) socMinKerja = soc;
      var akhir = (i === n - 1), batas = akhir ? ambang : floor;
      if (soc < batas){
        var d = batas - soc; viol += d;
        /* Di tengah hari: Rp12 ribu per 1% sampai 5% di bawah lantai, lalu Rp1
           juta per 1% (lebih mahal dari sesi di peak). Di akhir hari ambangnya
           sudah memuat cadangan 15%, jadi hukumannya separuh sampai 5%. */
        cost += Math.min(d, 0.05) * (akhir ? 6e5 : 1.2e6);
        if (d > 0.05) cost += (d - 0.05) * 1e8;
        if (soc < 0.05) cost += 1e8;                        /* tidak pernah */
      }
      if (simpan){ p.sesi = s; p.jamJalan = jamJalan; p.socAkhir = soc; }
    }
    return { cost:cost, sesi:sesi, socMin:socMin, socMinKerja:socMinKerja, socAkhir:soc, viol:viol, idxs:idxs,
             matiPakai:matiPakai, casPakai:casPakai };
  }
  var calon = []; for (var c = 0; c < n; c++) if (pieces[c].jeda || pieces[c].w >= 0.25) calon.push(c);
  var best = jalan([], false), bestTanpaPeak = best;
  function coba(idxs){
    var r = jalan(idxs, false); if (!r) return;
    if (r.cost < best.cost) best = r;
    if (!r.sesi.some(function(x){ return x.peak; }) && r.cost < bestTanpaPeak.cost) bestTanpaPeak = r;
  }
  function kombinasi(k, mulai, ambil){
    if (ambil.length === k){ coba(ambil.slice()); return; }
    for (var i = mulai; i < calon.length; i++){ ambil.push(calon[i]); kombinasi(k, i + 1, ambil); ambil.pop(); }
  }
  for (var k = 1; k <= 3; k++) kombinasi(k, 0, []);
  /* Empat sesi dicoba bila tiga masih menembus lantai ATAU masih memuat sesi
     di peak -- jeda kosong harus dipakai sebelum peak sore dikorbankan. */
  var jedaKosong = []; pieces.forEach(function(p, i){ if (p.jeda && best.idxs.indexOf(i) < 0) jedaKosong.push(i); });
  if (best.viol > 0.001) kombinasi(4, 0, []);
  else if (jedaKosong.length && best.sesi.some(function(x){ return x.peak; })){
    /* hanya kombinasi 4 sesi yang memakai jeda yang masih kosong */
    var cobaLama = coba; coba = function(idxs){ if (idxs.some(function(i){ return jedaKosong.indexOf(i) >= 0; })) cobaLama(idxs); };
    kombinasi(4, 0, []); coba = cobaLama;
  }
  var out = jalan(best.idxs, true);
  out.sesi.forEach(function(x){ if (x.peak) x.terpaksa = bestTanpaPeak.viol > 0.03 || bestTanpaPeak === best; });
  return out;
}

/* Bobot permintaan per tempat per blok (BOBOT_TEMPAT di data.js): pengali
   terhadap rata-rata wilayah tarifnya; 1 bila tidak ada. Terkalibrasi oleh
   catatan harian lewat CALIB.bobotTempat (dikalikan). */
function bobotTempat(id, namaBlok){
  var t = (typeof BOBOT_TEMPAT !== "undefined" && BOBOT_TEMPAT[id]) ? BOBOT_TEMPAT[id] : null;
  var dasar = (t && typeof t[namaBlok] === "number") ? t[namaBlok] : 1;
  var kal = (CALIB.bobotTempat && typeof CALIB.bobotTempat[id] === "number") ? CALIB.bobotTempat[id] : 1;
  return dasar * kal;
}

/* o.urutan (opsional): tempat (id LOK) per potongan kerja, sepanjang potongBlok(o)
   -- dipakai pembangkit peluang rute. Dengan itu tiap potongan memakai wilayah
   tarif tempatnya, bobot permintaan tempat itu, km/jam wilayahnya, dan waktu +
   km pindah dari tempat sebelumnya (o.tempatAwal untuk potongan pertama). */
function simulate(o){
  var z = ZONA[o.zona], ctx = o.ctx, hari = ctx.shapeDay;
  var adaUrutan = !!(o.urutan && o.urutan.length);
  /* Acara dari kalender sudah masuk di ctx.mult; centang "acara besar" hanya
     untuk acara yang Ibu tandai sendiri. Musim gajian: asumsi +5%. */
  var extra = (o.hujan ? 1.20 : 1) * ((o.acara && !ctx.ev) ? 1.15 : 1) * (ctx.gajian ? 1.05 : 1);
  var pieces = potongBlok(o);
  var kerja = pieces.filter(function(p){ return !p.jeda; });
  var jedaJam = 0; pieces.forEach(function(p){ if (p.jeda) jedaJam += p.w; });
  if (adaUrutan){
    var sebelum = o.tempatAwal || null, kk = 0;
    pieces.forEach(function(p){
      if (p.jeda) return;
      var T = LOKMAP[o.urutan[kk++]] || sebelum || LOKMAP.kota;
      p.tempat = T; p.zonaT = ZONA[T.z] || z;
      p.pindahKm = sebelum ? jarakAntar(sebelum, T) : 0;
      p.pindahJam = sebelum ? jamTempuhAntar(sebelum, T, p.s) : 0;
      sebelum = T;
    });
    o.tempatAkhir = sebelum;
  }

  /* Jatah Filter Tujuan: tiap peak yang dikerjakan di Jakarta butuh satu jatah
     untuk pulang berbayar (09:00 dan 21:15). Peak tanpa jatah cuma dapat 35%
     kelebihan tarif Jakarta. Jatah diberikan ke peak sore dulu (terbesar). */
  var peakOK = {};
  var dikerjakan = [];
  kerja.forEach(function(p){
    var zp = p.zonaT || z;
    if (PEAKS[p.b.n] && (adaUrutan ? zp.need : true)){ var g = p.b.n === "Peak sore" ? "sore" : "pagi"; if (dikerjakan.indexOf(g) < 0) dikerjakan.push(g); } });
  var jatah = o.filter;
  ["sore", "pagi"].forEach(function(g){
    if (dikerjakan.indexOf(g) < 0) return;
    if ((!adaUrutan && !z.need) || jatah >= 1){ peakOK[g] = true; if (adaUrutan || z.need) jatah--; } else peakOK[g] = false;
  });
  var filterOK = Object.keys(peakOK).every(function(g){ return peakOK[g]; });
  function multOf(b, zp){
    zp = zp || z;
    var g = b.n === "Peak sore" ? "sore" : "pagi";
    var m = PEAKS[b.n] ? ((peakOK[g] || !zp.need) ? zp.peak : (1 + (zp.peak - 1) * 0.35)) : zp.off;
    return m * ctx.mult * extra;
  }

  var cap = o.bat, kmkwh = CALIB.kmkwh, kmPerFrac = cap * kmkwh;   /* km untuk 100% */
  var soc0 = (typeof o.soc === "number" && o.soc > 0) ? Math.min(1, o.soc/100) : (o.rumah ? 1.00 : 0.90);
  var deadKm = adaUrutan ? 0 : ((typeof o.deadKm === "number") ? o.deadKm : z.dead);
  var kmHome = o.stay ? 0 : (adaUrutan && o.tempatAkhir ? o.tempatAkhir.home : ((typeof o.kmHome === "number") ? o.kmHome : z.pulang));
  var adaJkt = adaUrutan ? kerja.some(function(p){ return p.tempat && p.tempat.z === "jkt"; }) : (o.zona === "jkt" || o.zona === "mix");
  var floor = adaJkt ? 0.25 : 0.20;
  var ambangPulang = 0.15 + kmHome / kmPerFrac;
  var fullSesi = cap > 35 ? 1.0 : 0.85;   /* jam untuk 15->90%; asumsi dari 40 kW yang menurun */

  kerja.forEach(function(p){
    var zp = p.zonaT || z, bobot = p.tempat ? bobotTempat(p.tempat.id, p.b.n) : 1;
    p.mult = multOf(p.b, zp) * bobot;
    p.grossH = blockGross(p.b, hari) * p.mult;
    p.rateH = blockRate(p.b, hari) * p.mult;
    p.kmH = p.b.km * zp.kmx;
    p.paidKmH = p.b.km * blockU(p.b, hari) * p.mult;
    p.tripKm = tripLen(p.b.n, p.tempat ? p.tempat.z : o.zona);
  });

  pieces.forEach(function(p){ p.pakai = p.jeda ? 0 : (p.kmH * p.w + (p.pindahKm || 0)) / kmPerFrac; });
  var socAwal = soc0 - deadKm / kmPerFrac;
  /* Km kosong menuju pangkalan memakan WAKTU juga, bukan hanya baterai. */
  var deadJam = deadKm / CALIB.kecepatan;
  var tl = pilihSesi(pieces, socAwal, floor, ambangPulang, fullSesi, kmPerFrac, deadJam, !!o.rumah, cap);
  var sesi = tl.sesi;

  var gross = 0, effHours = 0, chargeHours = 0, hilangRp = 0, trips = 0, paidKm = 0, kmKerja = 0, perBlok = [];
  var murah = Infinity, adaMal = false;
  kerja.forEach(function(p){
    var jam = p.jamJalan, g = p.grossH * jam, pk = p.paidKmH * jam;
    gross += g; effHours += jam; kmKerja += p.kmH * jam; paidKm += pk; trips += pk / p.tripKm;
    chargeHours += p.casPakai || 0; hilangRp += p.grossH * (p.casPakai || 0);
    if (jam > 0 && p.rateH < murah) murah = p.rateH;
    if (p.b.n === "Siang" || p.b.n === "Malam" || p.b.n === "Pagi akhir") adaMal = true;
    perBlok.push({ n:p.b.n, s:p.s, e:p.e, jam:jam, gross:g, paidKm:pk, trips:pk / p.tripKm, km:p.kmH * jam,
                   rateH:p.rateH, mult:p.mult, sesi:p.sesi || null });
  });
  var deadJamPakai = tl.matiPakai;
  var kmPindah = 0; kerja.forEach(function(p){ kmPindah += p.pindahKm || 0; });
  var kmTotal = kmKerja + deadKm + kmHome + kmPindah;
  var listrik = kmTotal / kmkwh * TARIF_KWH;
  var blockNet = gross - listrik;   /* jam yang hilang sudah tidak ada di gross */
  var jamDinding = Math.max(0.1, (o.pulang - o.keluar) - jedaJam);
  var insentif = CALIB.ins * Math.min(1, (effHours + (o.jamSebelum || 0)) / 10.5) * ctx.mult;
  var feeCharge = sesi.length * SESSION_FEE;
  var parkir = adaMal ? PARKIR : 0;
  var net = blockNet + insentif - feeCharge - parkir;

  var segs = BASE.map(function(b){
    var on = kerja.some(function(p){ return p.b === b && p.jamJalan > 0; });
    var pc = kerja.filter(function(p){ return p.b === b; })[0];
    return { n:b.n, s:b.s, e:b.e, on:on, rate:(pc ? pc.rateH : blockRate(b, hari)) };
  });

  return { net:net, blockNet:blockNet, insentif:insentif, feeCharge:feeCharge, parkir:parkir,
    deadKm:deadKm, deadJam:deadJamPakai, kmHome:kmHome, kmPindah:kmPindah, sessions:sesi.length, sesi:sesi, chargeHours:chargeHours, hilangRp:hilangRp,
    effHours:effHours, jamDinding:jamDinding, jedaJam:jedaJam,
    km:kmKerja, kmTotal:kmTotal, kwh:kmTotal / kmkwh, listrik:listrik,
    gross:gross, trips:trips, paidKm:paidKm, rpOrder:(trips > 0 ? gross / trips : 0),
    perHour:net / jamDinding, perJamEfektif:(effHours > 0 ? net / effHours : 0),
    segs:segs, filterOK:filterOK, peakOK:peakOK, zona:z, pieces:pieces, perBlok:perBlok,
    soc0:soc0, socAkhir:tl.socAkhir, socTiba:tl.socAkhir - kmHome / kmPerFrac, socMin:tl.socMin, socMinKerja:tl.socMinKerja,
    ambangPulang:ambangPulang, floor:floor, kmPerFrac:kmPerFrac, fullSesi:fullSesi,
    murah:(isFinite(murah) ? murah : 0) };
}

/* Jeda termurah dengan durasi tertentu di dalam sif: coba tiap 15 menit. */
function jedaTermurah(o, durasi){
  var best = null;
  for (var s = Math.ceil(o.keluar * 4) / 4; s + durasi <= o.pulang; s += 0.25){
    var p = {}; Object.keys(o).forEach(function(k){ p[k] = o[k]; });
    p.rehat = [s, s + durasi];
    var r = simulate(p);
    if (!best || r.net > best.net) best = { s:s, e:s + durasi, net:r.net };
  }
  return best;
}

/* ---------------- steps ---------------- */
function buildSteps(o, r, opts){
  opts = opts || {};
  if (!r || !r.pieces) r = simulate(o);
  var z = ZONA[o.zona], ctx = o.ctx;
  var noPagi = !!ctx.holi || ctx.dow === 6 || ctx.dow === 0;
  var pos = opts.L, jauh = pos && pos.jauh, diJkt = pos && pos.z === "jkt";
  var jamPulang = jauh ? Math.max(0.75, jamTempuhRumah(pos, o.pulang - 0.5)) : 0;
  var mulaiPulang = o.pulang - jamPulang;
  var sudahSampai = false;
  var out = [], cum = opts.cum || 0;
  var pertama = r.pieces[0];
  var rehatDipilih = rehatRange(o.rehat);
  if (rehatDipilih){ rehatDipilih = [Math.max(rehatDipilih[0], o.keluar), Math.min(rehatDipilih[1], o.pulang)]; if (rehatDipilih[1] - rehatDipilih[0] < 0.25) rehatDipilih = null; }
  out.meta = { avail: Math.max(0, r.soc0 - r.floor) * r.kmPerFrac - r.deadKm,
               km0: (pertama && !pertama.jeda) ? pertama.kmH * pertama.w : 0,
               sessions:r.sessions, sesi:r.sesi, socMin:r.socMin, socMinKerja:r.socMinKerja, socTiba:r.socTiba, floor:r.floor,
               rehat:rehatDipilih, effHours:r.effHours, chargeHours:r.chargeHours, deadJam:r.deadJam, jedaJam:r.jedaJam, keluar:o.keluar, pulang:o.pulang };

  r.pieces.forEach(function(L, idx){
    var def, nama = L.jeda ? "Istirahat" : L.b.n;
    var tengah = (L.s + L.e) / 2;
    var masihPulang = jauh && tengah >= mulaiPulang;
    var sisaKm = masihPulang ? Math.max(0, pos.home * (o.pulang - tengah) / jamPulang) : 0;
    if (idx === 0 && opts.verdict && !L.jeda){
      def = { b:opts.verdict.h, s:opts.verdict.r, i:opts.verdict.p };
    } else if (L.jeda){
      def = L.sesi
        ? { b:"Istirahat &mdash; sekalian isi daya",
            s:"Colok di rumah atau SPKLU jangkar &middot; <b>" + Math.round(L.sesi.dari*100) + " &rarr; " + Math.round(L.sesi.ke*100) + "%</b> &middot; &plusmn;" + Math.round(L.sesi.durasi*60) + " menit",
            i:"Inilah waktu terbaik mengisi daya: tidak ada order yang hilang" + (L.sesi.jamHilang > 0.05 ? " kecuali " + Math.round(L.sesi.jamHilang*60) + " menit yang melewati jeda" : "") +
              (L.sesi.ac ? ". Jeda panjang dan ada charger di rumah: <b>colok di rumah (7 kW) sampai " + Math.round(L.sesi.ke*100) + "%, &plusmn;" + (L.sesi.durasi).toFixed(1).replace(".", ",") + " jam</b> -- sisa hari butuh lebih dari 90%." : ". Isi secukupnya sampai pulang dengan cadangan, jangan menunggu 100%.") }
        : STEP["Istirahat"];
    } else if (masihPulang){
      if (!sudahSampai){
        sudahSampai = true;
        def = { b:"Mulai merapat pulang", s:pulangStep(sisaKm, pos.n).s,
                i:"Sampai jam ini Anda bebas kerja di sekitar sana. Mulai sekarang, <b>hanya terima order yang mendekatkan ke Modernland</b> &mdash; sisa " + Math.round(sisaKm) + " km, pas untuk tiba di jam pulang." };
      } else def = pulangStep(sisaKm, pos.n);
    } else if (jauh){
      def = { b:"Kerja di sekitar sini dulu", s:"Utamakan order yang mengarah ke barat &middot; belum perlu pulang",
              i:"Waktu masih longgar. Kerjakan order apa adanya, tapi kalau ada dua pilihan ambil yang ke arah barat. Merapat pulang baru dimulai pukul <b>" + hhmm(mulaiPulang) + "</b>." };
    } else if (noPagi && (nama === "Peak pagi" || nama === "Subuh")){
      def = OFFPAGI;
    } else if (ctx.eve && (nama === "Peak sore" || nama === "Malam")){
      def = EVEPETANG;
    } else if (pos && pos.z === "apt" && STEP_APT[nama]){
      def = STEP_APT[nama];
    } else if (opts.rencana && pos && (pos.z === "mix" || pos.z === "jkt") && STEP_MIX[nama]){
      def = STEP_MIX[nama];
    } else if (!opts.rencana && diJkt && !jauh && STEP_JKT[nama]){
      def = STEP_JKT[nama];
    } else {
      def = STEP[nama];
    }
    var charge = !!L.sesi;
    var val = 0, order = 0, kmBayar = 0, detail = "";
    if (!L.jeda){
      val = L.grossH * L.jamJalan - (L.kmH * L.jamJalan / CALIB.kmkwh) * TARIF_KWH;
      kmBayar = L.paidKmH * L.jamJalan; order = kmBayar / L.tripKm;
      detail = "&asymp; " + (order < 1 ? "1" : Math.round(order)) + " order &middot; " + Math.round(kmBayar) + " km berbayar" +
               (order >= 1 ? " &middot; Rp " + Math.round(L.grossH * L.jamJalan / order).toLocaleString("id-ID") + "/order" : "") +
               " &middot; baterai " + Math.round(L.socMulai*100) + (L.sesi ? "&rarr;" + Math.round(L.sesi.ke*100) + "% setelah colok" : "") + "&rarr;" + Math.round(L.socAkhir*100) + "%";
    } else {
      detail = "baterai " + Math.round(L.socMulai*100) + "%" + (L.sesi ? " &rarr; " + Math.round(L.sesi.ke*100) + "% setelah ngecas" : " (istirahat, tidak jalan)");
    }
    cum += val;
    var sesiTeks = charge && !L.jeda
      ? " &middot; <b>colok " + Math.round(L.sesi.dari*100) + "&rarr;" + Math.round(L.sesi.ke*100) + "% &plusmn;" + Math.round(L.sesi.durasi*60) + " mnt</b>" +
        (L.sesi.luber > 0.05 ? " (" + Math.round(L.sesi.luber*60) + " menit masuk blok berikutnya)" : "") : "";
    out.push({ t:hhmm(L.s) + "&ndash;" + hhmm(L.e), dur:L.jeda ? "jeda" : L.w.toFixed(1) + " jam",
      b:(charge && !L.jeda) ? def.b + " + isi daya" : def.b,
      s:(charge && !L.jeda) ? def.s + sesiTeks : def.s,
      i:def.i + (charge && !L.jeda && L.sesi.peak ? " <b>Sesi ini terpaksa di jam peak</b> karena baterai tidak cukup sampai blok murah berikutnya; berangkat dengan baterai lebih penuh menggesernya." : ""),
      d:detail, v:L.jeda ? "&mdash;" : rp(val), cum:rp(cum),
      cls:charge ? "charge" : ((idx === 0 && opts.markNow) ? "now" : "") });
  });

  if (!opts.noHome){
    var kmHome = (typeof opts.kmHome === "number") ? opts.kmHome : r.kmHome;
    var jamTempuh = pos ? jamTempuhRumah(pos, o.pulang - 0.5, kmHome) : kmHome / CALIB.kecepatan * faktorMacet(o.pulang - 0.5, o.zona);
    var mulai = o.pulang - Math.max(0.5, jamTempuh + 0.25);
    /* Batas keras 22:00 (Minggu 20:30): protokol pulang tidak pernah dijadwalkan lewat batas itu. */
    var batas = (ctx.dow === 0 && !ctx.holi) ? 20.5 : 22;
    if (mulai > batas) mulai = batas;
    var listrikPulang = (r.kmHome + r.deadKm) / CALIB.kmkwh * TARIF_KWH;
    cum -= opts.stay ? 0 : listrikPulang;
    out.push({ t:"mulai<br>" + hhmm(Math.max(o.keluar, mulai)), dur:"penutup",
      b:opts.stay ? "Berhenti di area kerja" : "Protokol pulang",
      s:opts.stay ? "Cari SPKLU 24 jam untuk besok pagi"
                  : "Filter Tujuan Saya &rarr; Modernland &middot; " + Math.round(kmHome) + " km &middot; &plusmn;" + Math.round(jamTempuh*60) + " menit",
      i:opts.stay ? "Tidak pulang: pastikan daya cukup untuk peak pagi besok, isi malam ini juga."
                  : "Aktifkan filter di jam ini. Kalau jatah habis, hanya terima order ke arah barat. Batas keras " + hhmm(batas) + "." +
                    (r.socTiba < 0.40 && !o.rumah ? " Tiba dengan &plusmn;" + Math.round(Math.max(0, r.socTiba)*100) + "%: <b>mampir SPKLU dekat rumah dan isi ke 85% sebelum pulang</b>, bukan besok pagi." : ""),
      d:opts.stay ? "" : "listrik pulang &amp; km kosong &minus;" + rp(listrikPulang) + " &middot; tiba &plusmn;" + Math.round(Math.max(0, r.socTiba)*100) + "%",
      v:opts.stay ? "&mdash;" : "&minus;" + rp(listrikPulang), cum:rp(cum), cls:"home" });
  }
  /* Rekap: kumulatif langkah bertemu angka bersih. */
  var potongan = r.feeCharge + r.parkir;
  out.push({ t:"rekap", dur:"hari ini",
    b:"Bersih hari ini " + rp(cum + r.insentif - potongan + (opts.cum || 0) * 0),
    s:"+ insentif " + rp(r.insentif) + (r.feeCharge ? " &minus; " + r.sessions + " sesi SPKLU " + rp(r.feeCharge) : "") + (r.parkir ? " &minus; parkir " + rp(r.parkir) : ""),
    i:"Insentif dihitung proporsional jam kerja hari ini (" + r.effHours.toFixed(1) + " jam efektif" + (o.jamSebelum ? " + " + o.jamSebelum.toFixed(1) + " jam sebelumnya" : "") + "). Sebelum cicilan, asuransi, servis, dan ban.",
    d:"&asymp; " + Math.round(r.trips) + " order &middot; " + Math.round(r.paidKm) + " km berbayar dari " + Math.round(r.kmTotal) + " km &middot; " + (r.trips > 0 ? "Rp " + Math.round(r.rpOrder).toLocaleString("id-ID") + "/order" : ""),
    v:rp(r.insentif - potongan), cum:rp(cum + r.insentif - potongan), cls:"rekap" });
  return out;
}

function note(k,t,x){ return '<div class="note '+k+'"><span class="tag">'+t+"</span><span>"+x+"</span></div>"; }

/* ---------------- advice ---------------- */
function blockAt(t, shapeDay){
  for (var i=0;i<BASE.length;i++) if (t>=BASE[i].s && t<BASE[i].e)
    return { n:BASE[i].n, rate:blockRate(BASE[i],shapeDay) };
  return { n:"Di luar jam", rate:0 };
}
function advise(blk, L, o){
  var ctx=o.ctx, noPagi = !!ctx.holi||ctx.dow===6||ctx.dow===0;
  if (L.jauh){
    var jamPulang = Math.max(0.75, jamTempuhRumah(L, o.pulang - 0.5));
    var slack = (o.pulang - o.keluar) - jamPulang;
    var mulai = hhmm(o.pulang - jamPulang);
    var dasar = "Jarak pulang dari "+L.n+" <b>"+Math.round(L.home)+" km</b>, sekitar <b>"+
                Math.round(jamPulang*60)+" menit</b>, dan butuh sisa daya minimal <b>"+L.res+"%</b>.";

    if (slack < 1.0) return {k:"bad", h:"Waktu mepet &mdash; pulang sekarang, jangan cari order lagi",
      r:"Rute langsung: JORR arah barat &rarr; keluar Ulujami atau Pondok Aren &rarr; Serpong &rarr; Modernland",
      p:dasar+" Sisa waktu Anda tinggal "+((o.pulang-o.keluar).toFixed(1))+" jam &mdash; <b>habis untuk perjalanan pulang saja</b>. "+
        "Berhenti menerima order kecuali yang benar-benar searah, dan berangkat sekarang."};

    if (slack < 3.5) return {k:"bad", h:"Mulai merapat sekarang, sambil tetap ambil order",
      r:"Pindai tujuan bernama: "+KATA_BARAT,
      p:dasar+" Waktu Anda cukup, tapi tidak longgar. <b>Mulai bergerak ke barat sekarang</b> sambil tetap menerima order &mdash; "+
        "tapi hanya yang mendekatkan Anda. Sasaran berurutan: <b>Ulujami &rarr; Pondok Aren &rarr; Bintaro &rarr; Serpong</b>. "+
        "Kalau 10 menit kosong, jalan sendiri lewat JORR sambil online."};

    return {k:"warn", h:"Masih longgar &mdash; kerja dulu di sini",
      r:"Baru perlu mulai merapat pukul <b>"+mulai+"</b>",
      p:dasar+" Anda punya <b>"+slack.toFixed(1)+" jam kelonggaran</b>, jadi tidak perlu buru-buru pulang. "+
        "<b>Kerjakan order apa adanya di sekitar sini dulu</b> &mdash; tapi kalau ada dua pilihan, ambil yang mengarah ke barat. "+
        "Mulai pukul "+mulai+", barulah beralih ke mode pulang bertahap dan hanya menerima yang mendekatkan Anda ke Modernland."};
  }
  if (L.luar && L.z==="tng" && !PEAKS[blk.n]) return {k:"warn", h:"Di pinggir wilayah &mdash; bergerak ke arah inti",
    r:"Arahkan ke Alam Sutera / Kota Tangerang &middot; "+Math.round(L.home)+" km ke rumah",
    p:"Ini masih wilayah Tangerang, tapi di luar sirkuit inti Anda. Di jam yang bukan peak, permintaannya lebih tipis. <b>Bergerak ke arah Alam Sutera atau Kota Tangerang sambil tetap online</b>, jangan menunggu di sini."};
  if (ctx.eve && (blk.n==="Peak sore"||blk.n==="Malam"||blk.n==="Pra-peak"))
    return {k:"good",h:"Malam sebelum libur &mdash; kejar arus keluar kota",
      r:"Bandara &middot; Stasiun Batu Ceper &middot; Terminal Poris Plawad",
      p:"Besok tanggal merah, dan malam ini orang berangkat. Penumpang berkoper dengan tujuan jauh &mdash; <b>utamakan tiga titik itu di atas sirkuit mal biasa</b>. Ini salah satu malam terkuat dalam sebulan."};
  if (blk.n==="Peak pagi"||blk.n==="Subuh"){
    if (noPagi) return {k:"warn",h: ctx.holi?"Tanggal merah &mdash; peak pagi tidak ada":"Belum ada arus komuter",
      r:"Tetap dekat rumah &middot; jangan buang km",
      p:(ctx.holi?"<b>"+ctx.holi[0]+".</b> ":"")+"Tidak ada arus berangkat kerja hari ini. Permintaan baru naik menjelang siang dan puncaknya sore sampai malam. <b>Jangan berputar mencari order sekarang</b> &mdash; itu km kosong. Isi daya, dan mulai serius jam 10 ke atas."};
    if (L.z==="tng"&&L.home<=10) return {k:"good",h:"Anda di posisi terbaik hari ini",
      r:"Cluster perumahan &rarr; Jakarta / Bandara",
      p:"Tetap di dalam cluster, jangan pindah ke jalan raya. Order yang lahir di sini jam segini adalah <b>komuter ke Jakarta dan penumpang penerbangan pagi</b> &mdash; trip panjang, jarak jemput nyaris nol."};
    if (L.id==="bsd"||L.id==="serpong") return {k:"",h:"Kerjakan kantor dan stasiun",
      r:"Green Office Park &middot; Digital Hub &middot; Stasiun Rawa Buntu",
      p:"Arus berangkat KRL memuncak 06:00&ndash;08:00 di Rawa Buntu. <b>Jangan bergerak ke selatan</b> &mdash; itu menjauhkan Anda dari rumah dan dari arus."};
    if (L.z==="jkt") return {k:"good",h:"Panen koridor Jakarta sekarang",
      r:"Puri &middot; Kebon Jeruk &middot; Slipi &rarr; Sudirman",
      p:"Tarif tertinggi sepanjang hari, dan pelat listrik Anda bebas ganjil&ndash;genap saat pesaing tersaring. <b>Kerja lokal sampai sekitar 09:00</b>, lalu aktifkan filter untuk pulang berbayar."};
    return {k:"warn",h:"Antre bandara, atau keluar sambil online",
      r:"Antre &le; 45 menit &middot; kalau lebih: keluar lewat Batu Ceper",
      p:"Bandara satu-satunya titik yang <b>menjamin</b> order panjang. Tapi pergi kosong berarti 23,4 km hangus &mdash; kalau keluar, <b>tetap online</b> lewat Batu Ceper atau Poris."};
  }
  if (blk.n==="Pagi akhir"){
    if (L.z==="jkt") return {k:"warn",h:"Peak habis &mdash; pulang berbayar sekarang",
      r:"Filter Tujuan Saya &rarr; Tangerang &middot; "+Math.round(L.home)+" km",
      p:"Tarif turun ke sekitar "+rp(blk.rate)+" per jam, dan <b>Anda tidak punya SPKLU jangkar di Jakarta</b>. Pakai jatah filter sekarang supaya perjalanan pulang tetap dibayar, lalu isi daya di Karawaci atau Kunciran."};
    return {k:"warn",h:"Peak habis &mdash; jam termurah hari ini",
      r:"Sirkuit dekat rumah &middot; Tangcity &middot; Siloam Lippo Village",
      p:"Tarif turun ke sekitar "+rp(blk.rate)+" per jam. Jangan mengejar order jauh sekarang &mdash; kerjakan yang dekat saja. "+
        "<b>Jangan menunggu di stasiun jam segini</b> &mdash; menurut jadwal KRL, kereta di Stasiun Tangerang tinggal separuh dibanding jam ramai pagi. "+
        "Kalau hari ini butuh sesi pengisian daya, urutan di bawah sudah menaruhnya di jam yang paling murah."};
  }
  if (blk.n==="Siang"){
    if (L.z==="jkt") return {k:"warn",h:"Jakarta paling sepi siang hari",
      r:"Bergerak balik ke arah barat sambil online",
      p:"Blok siang di Jakarta lebih buruk daripada di Tangerang, dan Anda "+Math.round(L.home)+" km dari rumah. <b>Pulang sambil tetap online</b> &mdash; peluang dapat order naik justru saat Anda mendekati Tangerang."};
    return {k:"",h:"Sirkuit siang, atau pulang istirahat",
      r:"Living World &rarr; Summarecon &rarr; AEON &rarr; Karawaci",
      p:"Blok ini hanya sekitar "+rp(blk.rate)+" per jam. Kalau dekat rumah, <b>pulang istirahat hampir tidak berbiaya</b> dan membuat peak sore jauh lebih baik."};
  }
  if (blk.n==="Jam mati"){
    if (L.z==="jkt") return {k:"bad",h:"Jangan menunggu di Jakarta",
      r:"Balik ke wilayah inti sambil online",
      p:"Jam tersepi dalam sehari, dan Anda jauh dari jangkar SPKLU. <b>Bergerak pulang lebih baik daripada diam menunggu</b> &mdash; sekalian menyiapkan posisi untuk peak sore."};
    return {k:"bad",h:"Blok terburuk. Jangan dipaksa",
      r:"Istirahat &middot; top-up &middot; siapkan posisi sore",
      p:"14:00&ndash;15:15 paling sepi. Memaksa di sini <b>membakar baterai untuk hasil terkecil</b>. Pastikan daya cukup untuk peak sore plus pulang."};
  }
  if (blk.n==="Pra-peak"){
    var telat = o.keluar > 15.5;   /* lewat 15:30 tidak boleh lagi disuruh berangkat ke Jakarta */
    if (L.z==="tng" && o.filter>=1 && !telat) return {k:"good",h:"Kalau mau Jakarta, berangkat sekarang",
      r:"Tol &rarr; Jakarta Barat / CBD &middot; batas 15:30",
      p:"Peak sore di Jakarta lebih tinggi daripada di Tangerang &mdash; <b>tapi hanya kalau tiba sebelum arus keluar kota memadat</b>, dan jatah filter masih ada untuk pulang berbayar. Lewat 15:30, batalkan."};
    if (L.z==="tng") return {k:"warn",h:"Ambil posisi di Tangerang",
      r:"Green Office Park &middot; Prominence &middot; Karawaci",
      p:(telat ? "Sudah lewat batas 15:30 untuk berangkat ke Jakarta &mdash; arus keluar kota mulai memadat, tibanya kesorean. "
               : "Jatah filter habis, Jakarta terlalu berisiko &mdash; pulangnya bisa 18&ndash;30 km kosong. ") +
        "<b>Berdiri di kawasan kantor 20 menit sebelum bubaran.</b>"};
    return {k:"good",h:"Bertahan di Jakarta sampai peak sore",
      r:"Pangkal di kawasan kantor &middot; keluar 20:30 dengan filter",
      p:"Anda sudah di zona termahal. Bertahan tiga jam ke depan lebih untung daripada pulang sekarang &mdash; asal keluarnya nanti berpenumpang."};
  }
  if (blk.n==="Peak sore"){
    if (L.z==="jkt") return {k:"good",h:"Panen arus keluar kota",
      r:"Kantor Jakarta &rarr; Tangerang / pinggiran",
      p:"Blok terbesar hari ini. <b>Hindari order ke Jakarta Timur, Utara, atau Bekasi setelah 18:30</b> &mdash; pulangnya jauh dan kosong."};
    return {k:"good",h:"Kantor bubaran, lalu arus pulang KRL",
      r:"Green Office Park / Prominence &rarr; Stasiun &middot; 16:00&ndash;20:00",
      p:"Dua sumber bertumpuk: karyawan pulang, dan penumpang KRL yang butuh antaran terakhir. <b>Stasiun Tangerang dan Rawa Buntu ramai sekarang</b>, jarak jemput kecil."};
  }
  if (blk.n==="Malam") return {k:"",h:"Panen terakhir",
    r:"Mal tutup 21:00 &middot; kuliner &middot; kedatangan bandara",
    p:"Ambil posisi 15 menit sebelum mal tutup. Kedatangan bandara 19:00&ndash;22:00 masih ramai dan <b>searah pulang Anda</b>."};
  return {k:"warn",h:"Waktunya pulang",
    r:"Filter Tujuan Saya &rarr; Modernland",
    p:"Tarif sudah turun dan jam ini merusak peak pagi besok. <b>Aktifkan filter sekarang</b>, atau terima hanya order ke arah barat. Batas keras 22:00."};
}

var WEATHER = null, REGISTRI = {}, lastLok = "kota";

/* Berapa tambahan bersih kalau jam pulang digeser -- dicabut dari runNow
   supaya aturan ke-12 bisa mengujinya dari luar.

   WAJIB memakai hari yang SAMA diperpanjang. Dulu dihitung sebagai sif baru
   yang berdiri sendiri mulai jam pulang; karena soc tidak ikut diteruskan,
   sif itu selalu dianggap berangkat baterai penuh dan tidak pernah
   menanggung sesi ngecas yang justru dipicu km perpanjangan itu sendiri. */
function tambahanJam(o, r, jam){
  var sampai = Math.min(23, o.pulang + jam);
  if (sampai <= o.pulang) return { sampai:sampai, tambah:0 };
  var p = {}; Object.keys(o).forEach(function(k){ p[k] = o[k]; });
  p.pulang = sampai;
  return { sampai:sampai, tambah: simulate(p).net - r.net };
}

/* Selisih yang disebabkan satu faktor, supaya pengaruhnya terlihat angka. */
function dampak(o, ubah){
  var tanpa = {}; Object.keys(o).forEach(function(k){ tanpa[k] = o[k]; });
  Object.keys(ubah).forEach(function(k){ tanpa[k] = ubah[k]; });
  return simulate(o).net - simulate(tanpa).net;
}
/* Cari kecamatan dari teks bebas. Dipakai dua tempat: saat Ibu mengetik
   nama daerah, dan saat memperbarui catatan lama yang dulu angkanya tebakan.
   Mengembalikan null kalau tidak ada yang cocok. */
function cariKecamatan(teks){
  var cari = String(teks || "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (cari.length < 3) return null;
  var cocok = [];
  for (var i = 0; i < KEC.length; i++){
    var nk = KEC[i][0].toLowerCase();
    if (nk === cari || (" "+cari+" ").indexOf(" "+nk+" ") >= 0) cocok.push(KEC[i]);
  }
  if (!cocok.length) return null;
  if (cocok.length === 1) return { kec:cocok[0], catatan:"" };

  /* Dua kecamatan bisa bernama sama: Setu ada di Tangerang Selatan (23 km)
     DAN di Kab. Bekasi (63 km) -- salah pilih berarti cadangan baterai
     meleset 40 km. Kalau induknya ikut disebut, itu yang menang. Kalau
     tidak, diambil yang TERJAUH: cadangan berlebih cuma merepotkan,
     cadangan kurang membuat Ibu kehabisan daya di jalan. */
  for (var j = 0; j < cocok.length; j++){
    var ind = INDUK[cocok[j][1]].toLowerCase().replace("kab. ", "").replace("kota ", "");
    if (cari.indexOf(ind) >= 0) return { kec:cocok[j], catatan:"" };
  }
  var jauh = cocok[0];
  for (var k = 1; k < cocok.length; k++) if (cocok[k][4] > jauh[4]) jauh = cocok[k];
  var lain = [];
  for (var m = 0; m < cocok.length; m++) if (cocok[m] !== jauh) lain.push(INDUK[cocok[m][1]] + " " + cocok[m][4] + " km");
  return { kec:jauh, catatan:" · ada juga " + lain.join(", ") + " — kalau itu yang benar, ketik lengkap dengan wilayahnya" };
}
function catatKecamatan(kec){
  var i = KEC.indexOf(kec);
  return { nama: kec[0] + ", " + INDUK[kec[1]], km: kec[4], menit: kec[5], anchor:"kota",
           rmax: (i >= 0 ? RKEC[i] : 0),
           terukur:true, zPaksa: kec[6], v:3, dibuat: iso(new Date()) };
}

/* Tiga SPKLU terdekat menurut jalan, untuk kecamatan yang memuat titik ini. */
function spkluDekat(la, lo, n){
  var d = Infinity, k = -1;
  for (var i = 0; i < KEC.length; i++){
    var q = jarakDatar(la, lo, KEC[i][3], KEC[i][2]);
    if (q < d){ d = q; k = i; }
  }
  var list = (k >= 0 && SPD[k]) ? SPD[k] : [];
  return list.slice(0, n || 3).map(function(x){
    return { nama: SPKLU[x[0]][0], km: x[1] };
  });
}
/* Untuk lokasi yang sedang dipilih, apa pun asalnya. */
function spkluUntuk(L){
  var v = L && L.id;
  if (v && v.indexOf("custom:gps:") === 0){
    var p = v.slice(11).split(",");
    var la = parseFloat(p[0]), lo = parseFloat(p[1]);
    if (isFinite(la) && isFinite(lo)) return spkluDekat(la, lo, 3);
  }
  if (v && v.indexOf("custom:") === 0){
    var r = REGISTRI[v.slice(7)];
    var nm = r && String(r.nama || "").split(",")[0].trim().toLowerCase();
    for (var i = 0; nm && i < KEC.length; i++)
      if (KEC[i][0].toLowerCase() === nm && SPD[i] && SPD[i].length)
        return SPD[i].slice(0,3).map(function(x){ return { nama: SPKLU[x[0]][0], km: x[1] }; });
    return null;
  }
  /* Tempat bernama: pakai ukuran dari titiknya sendiri, bukan pusat kecamatan. */
  if (SPLOK[v]) return SPLOK[v].map(function(x){ return { nama: SPKLU[x[0]][0], km: x[1] }; });
  var l = LOKMAP[v];
  return (l && l.lat != null) ? spkluDekat(l.lat, l.lon, 3) : null;
}
function spkluTeks(list){
  if (!list || !list.length) return "";
  return list.map(function(x){ return "<b>" + x.nama + "</b> " + x.km + " km"; }).join(" &middot; ");
}

/* Watak untuk lokasi yang sedang dipilih. Tiga jalur, karena posisi bisa
   datang dari tiga tempat: titik terukur (punya koordinat), titik GPS
   (koordinatnya ada di kuncinya), dan nama kecamatan yang diketik. */
function watakLok(L){
  var v = L && L.id;
  if (v && v.indexOf("custom:gps:") === 0){
    var p = v.slice(11).split(",");
    var la = parseFloat(p[0]), lo = parseFloat(p[1]);
    if (isFinite(la) && isFinite(lo)) return watakDi(la, lo);
    return null;
  }
  if (v && v.indexOf("custom:") === 0){
    var r = REGISTRI[v.slice(7)];
    var nm = r && String(r.nama || "").split(",")[0].trim().toLowerCase();
    if (!nm) return null;
    for (var i = 0; i < KEC.length; i++)
      if (KEC[i][0].toLowerCase() === nm)
        return { kode: WATAK[i] || "", kec: KEC[i][0], i: i };
    return null;
  }
  var l = LOKMAP[v];
  return (l && l.lat != null) ? watakDi(l.lat, l.lon) : null;
}

/* Watak kecamatan tempat sebuah titik berada -- dipakai tab Sekarang. */
function watakDi(la, lo){
  var d = Infinity, k = -1;
  for (var i = 0; i < KEC.length; i++){
    var q = jarakDatar(la, lo, KEC[i][3], KEC[i][2]);
    if (q < d){ d = q; k = i; }
  }
  /* Indeksnya dikembalikan APA ADANYA, walau wataknya kosong: 13 kecamatan
     di koridor Bekasi-Depok-Bogor punya data stasiun tanpa watak, dan di
     sanalah kalimat lembah tengah hari justru paling berguna -- Ibu sedang
     jauh dari rumah. Pemanggilnya yang memutuskan ada isi atau tidak. */
  return (k >= 0) ? { kode: WATAK[k] || "", kec: KEC[k][0], i: k } : null;
}

/* Jarak datar; cukup teliti untuk seluas Jabodetabek dan jauh lebih ringan
   dari haversine kalau dipanggil 184 kali tiap kali GPS berbunyi. */
function jarakDatar(la, lo, la2, lo2){
  var dx = (lo - lo2) * 0.99406, dy = la - la2;      /* 0,99406 = cos 6,25 derajat */
  return Math.sqrt(dx*dx + dy*dy) * 111.32;
}

/* Perkiraan jarak dan waktu PULANG dari titik mana pun di Jabodetabek.
   Ambil 4 pusat kecamatan terdekat, bobot 1/jarak, lalu tiap pusat dikoreksi
   menurut selisih jarak lurusnya ke rumah (1,35 = kelokan jalan rata-rata,
   0,88 menit tiap km -- keduanya dihitung dari 183 pengukuran itu sendiri).

   Diuji pada 90 titik nyata yang BUKAN pusat kecamatan: meleset median 3,6%,
   p90 9,8%. Rumus lama yang cuma memakai jarak lurus meleset median 10,5%
   dan p90 29,8%, jadi ini tiga kali lebih rapat.

   Angka ini untuk TAMPILAN dan hitungan uang. Cadangan baterai memakai
   angka lain yang selalu lebih besar -- lihat currentLok dan RKEC. Waktunya
   adalah waktu jalan lancar; kemacetan ditangani terpisah lewat blok jam.

   Diuji ulang pada 183 titik acak di dalam poligon kecamatan (UJI, dibuat
   sesudah parameter dikunci): meleset median 3,2%, p90 9,4%. Aturan ke-11
   di uji mandiri memeriksa ini tiap kali tombolnya ditekan. */
function hampiranPulang(la, lo){
  var d = [], i;
  for (i = 0; i < ANCHOR.length; i++) d.push([jarakDatar(la, lo, ANCHOR[i][3], ANCHOR[i][2]), ANCHOR[i]]);
  d.sort(function(p, q){ return p[0] - q[0]; });
  var dr = jarakDatar(la, lo, RUMAH.lat, RUMAH.lon);
  var km = 0, mnt = 0, w = 0;
  for (i = 0; i < 4 && i < d.length; i++){
    var a = d[i][1];
    var rp = dr - jarakDatar(a[3], a[2], RUMAH.lat, RUMAH.lon);
    var b = 1 / Math.max(d[i][0], 0.3);
    km  += (a[4] + 1.35 * rp) * b;
    mnt += (a[5] + 1.19 * rp) * b;
    w += b;
  }
  var n = d[0][1];
  return { km: Math.max(km / w, 1), menit: Math.max(Math.round(mnt / w), 3),
           kec: n[0], induk: INDUK[n[1]], zona: n[6], sifat: n[7], jauhnya: d[0][0] };
}

function jarakLurus(a1,o1,a2,o2){
  var R=6371, dLa=(a2-a1)*Math.PI/180, dLo=(o2-o1)*Math.PI/180;
  var x=Math.sin(dLa/2)*Math.sin(dLa/2)+
        Math.cos(a1*Math.PI/180)*Math.cos(a2*Math.PI/180)*Math.sin(dLo/2)*Math.sin(dLo/2);
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

/* ---------------- UJI MANDIRI ----------------
   Aturan yang HARUS selalu benar, diperiksa di ribuan kombinasi tiap kali
   halaman dibuka. Ini menggantikan cara lama: saya menjalankan UI lalu
   melihat hasilnya — yang hanya menangkap apa yang saya ingat dicek. */
var ATURAN = [
  ["teks lengkap", function(s){
    return !s.some(function(x){ return /undefined/.test(x.b+x.s+x.i); }); }],
  /* Ngecas di langkah pertama sah HANYA kalau daya awal memang tak cukup
     menyelesaikan blok itu. Kalau cukup, berarti penempatannya salah. */
  /* Ngecas di langkah pertama boleh kalau blok pertamanya bukan peak (top-up
     di jam murah sebelum peak itu justru benar), atau kalau daya memang
     tidak cukup menyelesaikan blok pertama. */
  ["ngecas di langkah pertama tidak di peak kecuali daya memaksa", function(s, k){
    if (!(s.length && s[0].cls==="charge")) return true;
    if (s[0].dur === "jeda") return true;
    if (!/Panen |keberangkatan pagi|Kedatangan sore|penerbangan pertama/.test(s[0].b)) return true;
    return k.avail < k.km0; }],
  /* Dua sesi berdampingan hanya sah sebagai "jembatan": yang pertama sesi
     kecil (<= 35%) supaya sampai ke jeda / blok murah berikutnya, atau salah
     satunya memang di jeda. Sesi 90% di blok kerja disusul sesi kecil lagi
     adalah kesalahan penempatan. */
  ["dua sesi ngecas beruntun hanya sebagai jembatan", function(s, k){
    var ss = k.sesi || [];
    for (var i=0;i<ss.length-1;i++){
      if (ss[i+1].idx !== ss[i].idx + 1) continue;
      if (ss[i].diJeda || ss[i+1].diJeda) continue;
      /* jembatan: sesi pertama habis tepat di lantai saat sesi kedua mulai */
      if (ss[i+1].dari > k.floor + 0.08) return false;
    }
    return true; }],
  /* Ngecas di blok peak salah hanya kalau ada blok non-peak SEBELUMNYA
     yang bisa dipakai — bukan kalau memang tidak ada pilihan. */
  /* Kesalahan yang tak terbantahkan: mengisi di jam panen padahal ada
     blok istirahat di hari itu yang dibiarkan kosong. */
  ["ngecas tidak di blok peak bila ada istirahat kosong sebelumnya", function(s){
    var pk = /Panen |keberangkatan pagi|Kedatangan sore/;
    for (var i=0;i<s.length;i++){
      if (s[i].cls==="charge" && pk.test(s[i].b)){
        for (var j=0;j<i;j++)
          if (s[j].dur==="jeda" && s[j].cls!=="charge") return false;
      }
    }
    return true; }],
  ["kumulatif naik monoton di langkah kerja", function(s){
    var prev=-1, ok=true;
    s.forEach(function(x){ if (x.cls==="home" || x.cls==="rekap") return;
      var v=parseFloat(String(x.cum).replace(/[^0-9]/g,""))||0;
      if (v+1 < prev) ok=false; prev=Math.max(prev,v); });
    return ok; }],
  ["jarak pulang tidak nol", function(s){
    var h = s.filter(function(x){ return x.cls==="home"; })[0];
    return !h || !/·\s*0\s*km/.test(h.s); }],
  ["langkah penutup lalu rekap di akhir", function(s){
    if (s.length < 2) return true;
    return s[s.length-1].cls==="rekap" && s[s.length-2].cls==="home"; }],
  /* Baterai: paling banyak 5% di bawah lantai (lantai itu cadangan nyaman,
     ditembus sedikit hanya bila lebih murah daripada satu sesi lagi), dan
     tiba di rumah dengan cadangan -- kecuali tiga sesi pun tidak cukup (sif
     Jakarta 18 jam), itu dicatat. */
  ["baterai tidak jauh di bawah lantai", function(s, k){
    return k.sessions >= 3 || k.socMinKerja == null || k.socMinKerja >= k.floor - 0.061; }],
  ["tiba di rumah dengan cadangan", function(s, k){
    return k.sessions >= 3 || k.socTiba == null || k.socTiba >= 0.099; }],
  ["sesi ngecas tidak di peak kecuali terpaksa", function(s, k){
    return !(k.sesi || []).some(function(x){ return x.peak && !x.terpaksa; }); }],
  ["tidak ada potongan di bawah 25 menit", function(s){
    return !s.some(function(x){ var m=/^([\d.]+) jam$/.exec(x.dur);
      return m && parseFloat(m[1]) < 0.4; }); }],
  /* Aturan 9 — instruksi mengisi daya hanya boleh muncul di langkah yang
     memang ditandai sebagai sesi ngecas. */
  ["perintah ngecas hanya di langkah ngecas", function(s){
    /* Diperiksa pada baris rute (perintah), bukan baris penjelasan. */
    return !s.some(function(x){
      return x.cls!=="charge" && x.cls!=="home" && x.cls!=="rekap" && /colok|SPKLU|isi daya/i.test(x.s); }); }],
  /* Jumlah sesi mesin = jumlah langkah yang ditandai ngecas: dua paruh layar
     tidak boleh bercerita beda. */
  ["jumlah sesi sama dengan langkah ngecas", function(s, k){
    if (k.sessions == null) return true;
    return s.filter(function(x){ return x.cls==="charge"; }).length === k.sessions; }],
  /* Baris jeda persis rentang yang dipilih (dipotong jam keluar/pulang):
     jeda 13:00-15:00 tidak boleh tampil sebagai 13:00-15:15. */
  ["baris jeda persis rentang yang dipilih", function(s, k){
    if (k.rehat === undefined) return true;
    var j = s.filter(function(x){ return x.dur==="jeda"; });
    if (!k.rehat) return j.length === 0;
    if (j.length !== 1) return false;
    var m = /^(\d\d):(\d\d)(?:&ndash;|–)(\d\d):(\d\d)$/.exec(j[0].t); if (!m) return false;
    var a = +m[1] + +m[2]/60, b = +m[3] + +m[4]/60;
    return Math.abs(a - k.rehat[0]) < 0.02 && Math.abs(b - k.rehat[1]) < 0.02; }],
  /* Jam di langkah kerja = jam efektif + jam ngecas di blok kerja: waktu
     tidak hilang dan tidak dihitung dua kali. */
  ["jam langkah kerja sama dengan jam efektif + jam ngecas", function(s, k){
    if (k.effHours == null) return true;
    var jam = 0; s.forEach(function(x){ var m=/^([\d.]+) jam$/.exec(x.dur); if (m) jam += parseFloat(m[1]); });
    /* jam ngecas (termasuk luberan) dan km kosong keluar dari jam langkah kerja */
    return Math.abs(jam - (k.effHours + k.chargeHours + (k.deadJam || 0))) < 0.06 + 0.05 * s.length; }],
  /* Aturan 10 — tidak boleh ada lubang waktu antar langkah, dan tidak boleh
     ada langkah yang tumpang tindih. */
  ["tidak ada lubang waktu antar langkah", function(s){
    var akhir = null, ok = true;
    s.forEach(function(x){
      var m = /^(\d\d):(\d\d)&ndash;(\d\d):(\d\d)$/.exec(x.t) ||
              /^(\d\d):(\d\d)–(\d\d):(\d\d)$/.exec(x.t);
      if (!m) return;
      var mulai = +m[1]+ +m[2]/60, selesai = +m[3]+ +m[4]/60;
      if (akhir !== null && Math.abs(mulai - akhir) > 0.02) ok = false;
      akhir = selesai;
    });
    return ok; }]
];

/* Aturan ke-11 -- satu-satunya yang menguji ANGKA, bukan urutan langkah.
   Sepuluh aturan di atas lolos penuh waktu anchor bandara masih membuat
   Batuceper meleset +60%, karena tidak satu pun dari mereka pernah
   membandingkan jarak dengan kenyataan. Yang ini membandingkan.

   Dua jalur diperiksa terpisah, karena keduanya memang berbeda mesinnya:
     a. deteksi GPS      -> hampiranPulang, interpolasi 4 pusat terdekat
     b. ketik nama       -> pusat kecamatan + margin jari-jari (RKEC)

   Ambangnya sengaja dipasang di ATAS nilai sekarang, supaya yang ketahuan
   adalah kemunduran, bukan supaya kotaknya selalu hijau. Nilai pada saat
   aturan ini ditulis: (a) median 3,2% dan terburuk 33,7%; (b) 4 kecamatan
   meremehkan lebih dari 3 km, yang terparah Jasinga 8,6 km. */
function ujiJarak(){
  var langgar = [], err = [], n3 = 0, maks = 0, maksNama = "";
  for (var i = 0; i < UJI.length && i < KEC.length; i++){
    var u = UJI[i];
    var h2 = hampiranPulang(u[1], u[0]);
    err.push(Math.abs(h2.km - u[2]) / u[2] * 100);
    /* Persis perhitungan yang dipakai currentLok untuk cadangan baterai. */
    var kmAman = Math.max(KEC[i][4] * 1.08, KEC[i][4] + 1.35 * RKEC[i]);
    var kurang = u[2] - kmAman;
    if (kurang > 3) n3++;
    if (kurang > maks){ maks = kurang; maksNama = KEC[i][0]; }
  }
  err.sort(function(a, b){ return a - b; });
  var med = err[Math.floor(err.length / 2)], top = err[err.length - 1];
  if (med > 5)   langgar.push("interpolasi meleset median " + med.toFixed(1) + "% (ambang 5%)");
  if (top > 45)  langgar.push("interpolasi meleset terburuk " + top.toFixed(1) + "% (ambang 45%)");
  if (n3 > 6)    langgar.push("ketik-nama meremehkan >3 km di " + n3 + " kecamatan (ambang 6)");
  if (maks > 10) langgar.push("cadangan kurang " + maks.toFixed(1) + " km di " + maksNama + " (ambang 10)");
  return langgar;
}

/* Aturan ke-12 -- menjaga EKONOMI tab Rencana. Aturan 1-10 memeriksa urutan
   langkah, aturan ke-11 memeriksa jarak; tidak satu pun pernah memeriksa
   uang. Dua hal PERNAH salah di sini dan tidak dijaga apa pun:

   a. Nasihat "Kalau mau mengejar" dihitung sebagai sif baru dari jam pulang
      dengan baterai dianggap penuh. Pada 14 dari 60 kasus yang benar-benar
      tampil angkanya lebih dari dua kali terlalu besar, dan beberapa SALAH
      TANDA: halaman menyuruh Ibu narik 1,5 jam lagi untuk sesuatu yang
      justru mengurangi uangnya. Kemunduran itu akan terlihat masuk akal
      saat dibaca -- karena itu aturan ini memeriksanya, bukan mata.

   b. Jam yang hilang karena ngecas dibebankan pada tarif RATA-RATA seluruh
      sif, padahal buildSteps sengaja menaruh sesinya di blok TERMURAH dan
      menghukum blok peak dengan 1e6. Dua paruh layar yang sama saling
      bertentangan.

   Diperiksa pada 312 kombinasi zona/jam. Keduanya hal yang harus SELALU
   benar, bukan ambang yang bisa digeser. */
function ujiEkonomi(){
  var langgar = [], ctx = dayCtx(iso(new Date())), n = 0;
  ["tng","mix","jkt","apt"].forEach(function(z){
    [3.5,5.25,9.5].forEach(function(k){
      for (var p = 15; p <= 21.25; p += 0.25){
        var o = { ctx:ctx, keluar:k, pulang:p, rehat:"none", zona:z, filter:2,
                  bat:30.08, rumah:false, hujan:false, acara:false, soc:65 };
        var r = simulate(o), t = tambahanJam(o, r, 1.5);
        if (t.sampai <= p) continue;
        n++;
        /* (a) harus PERSIS selisih hari yang sama, dihitung ulang di sini
           dengan cara yang tidak boleh berbagi kode dengan tambahanJam. */
        var q = {}; Object.keys(o).forEach(function(x){ q[x] = o[x]; });
        q.pulang = t.sampai;
        if (Math.abs(t.tambah - (simulate(q).net - r.net)) > 1){
          langgar.push("tambahan 1,5 jam bukan selisih hari yang sama ("+z+"/"+hhmm(p)+")");
          return;
        }
        /* (b) bersih = pendapatan blok + insentif - sesi - parkir, persis. */
        if (Math.abs(r.net - (r.blockNet + r.insentif - r.feeCharge - r.parkir)) > 1){
          langgar.push("bersih tidak sama dengan komponennya ("+z+"/"+hhmm(p)+")");
          return;
        }
        /* (c) kumulatif langkah terakhir (rekap) bertemu angka bersih. */
        var st = buildSteps(o, r, { kmHome:ZONA[z].pulang, L:{ z:z, jauh:false }, rencana:true });
        var cumAkhir = parseFloat(String(st[st.length-1].cum).replace(/[^0-9-]/g, "")) || 0;
        if (Math.abs(cumAkhir - Math.round(r.net)) > 2){
          langgar.push("kumulatif langkah ("+cumAkhir+") tidak bertemu bersih ("+Math.round(r.net)+") ("+z+"/"+hhmm(p)+")");
          return;
        }
        /* (d) sesi ngecas tidak pernah di peak kecuali terpaksa. */
        if (r.sesi.some(function(x){ return x.peak && !x.terpaksa; })){
          langgar.push("sesi ngecas di peak tanpa paksaan ("+z+"/"+hhmm(p)+")");
          return;
        }
      }
    });
  });
  return { langgar:langgar, n:n };
}

function ujiMandiri(){
  var langgar = [], n = 0;
  var zonas = ["tng","mix","jkt","apt"], haris = [1,2,3,4,5,6,0];
  var keluars = [3.5,5.25,9.5,15], rehats = ["none","duapeak","full","short",[12,13],[10.5,15.5]];
  var bats = [30.08,38.88], socs = [null,15,30,65,95];

  zonas.forEach(function(z){ haris.forEach(function(hh){
    keluars.forEach(function(k){ rehats.forEach(function(rh){
      bats.forEach(function(bt){ socs.forEach(function(sc){
        var d = new Date(2026, 8, 7 + ((hh+6)%7));
        var ctx = dayCtx(iso(d));
        var o = { ctx:ctx, keluar:k, pulang:21.5, rehat:rh, zona:z, filter:2,
                  bat:bt, rumah:false, hujan:false, acara:false };
        if (sc != null) o.soc = sc;
        var r, s;
        try {
          r = simulate(o);
          s = buildSteps(o, r, { kmHome:ZONA[z].pulang, L:{z:z,jauh:false}, rencana:true });
        } catch (e){ langgar.push("galat: "+e.message); return; }
        n++;
        ATURAN.forEach(function(a){
          if (!a[1](s, s.meta||{})) langgar.push(a[0]+" — "+z+"/"+DAYNAME[hh]+"/"+hhmm(k)+"/"+rh+
                                     "/"+bt+(sc!=null?"/"+sc+"%":""));
        });
      }); }); }); }); }); });

  /* lokasi nyata di tab Sekarang */
  LOK.forEach(function(L){ [5.25,9.5,11,15,19.5].forEach(function(k){ [30,65,95].forEach(function(sc){
    ["none","full","duapeak"].forEach(function(rh){
    var ctx = dayCtx(iso(new Date()));
    var o = { ctx:ctx, keluar:k, pulang:21.5, rehat:rh, zona:L.z, filter:2,
              bat:30.08, rumah:false, hujan:false, acara:false, soc:sc };
    var r, s;
    try {
      r = simulate(o);
      var blk = blockAt(k, ctx.shapeDay);
      s = buildSteps(o, r, { kmHome:Math.max(L.home,6), L:L, verdict:advise(blk,L,o), markNow:true });
    } catch (e){ langgar.push("galat: "+e.message); return; }
    n++;
    ATURAN.forEach(function(a){
      if (!a[1](s, s.meta||{})) langgar.push(a[0]+" — "+L.id+"/"+hhmm(k)+"/"+sc+"%/"+rh);
    });
    }); }); }); });

  ujiJarak().forEach(function(x){
    langgar.push("jarak terhadap nilai terukur — " + x);
  });
  n += UJI.length;

  var ek = ujiEkonomi();
  ek.langgar.forEach(function(x){
    langgar.push("ekonomi rencana — " + x);
  });
  n += ek.n;

  return { n:n, langgar:langgar };
}
