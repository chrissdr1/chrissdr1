/* Antarmuka: tab Sekarang, Catatan, Rencana, Tanya, dan boot. */
"use strict";

var POSISI_GPS = null;   /* {lat, lon, akurasi, at} dari deteksi terakhir; dipakai peta */
var MULAI_HARI = null;   /* jam mulai kerja hari ini (dari check-in); dipakai untuk insentif */

function renderDayFlag(ctx, dateStr){
  var n = el("dayflag");
  if (ctx.ev){
    var lokal = ctx.ev[2] === "lokal";
    n.hidden = false; n.className = "flag" + (lokal ? "" : " warn");
    n.innerHTML = '<span class="tag">Acara besar</span><span><b>' + ctx.ev[0] + "</b> di " + ctx.ev[1] + ". " +
      (lokal
        ? "Ini <b>di wilayah kerja Anda sendiri</b> &mdash; ICE BSD 16,7 km dari rumah. Bubaran acara memberi lonjakan permintaan yang searah pulang. Rencanakan berada di sekitar BSD saat acara bubar."
        : "Di Jakarta, 26&ndash;30 km dari rumah. Bubarannya sekitar 22:30&ndash;23:30 dengan tarif dinamis tinggi, <b>tapi pulangnya jauh dan merusak peak pagi besok</b> &mdash; ambil hanya kalau besok Anda memang libur atau mulai siang.") +
      (ctx.holi || ctx.eve ? " Perhatikan juga catatan tanggal merah di bawah." : "") + "</span>";
    return;
  }
  if (ctx.holi){
    n.hidden = false; n.className = "flag warn";
    n.innerHTML = '<span class="tag">Tanggal merah</span><span><b>' + ctx.holi[0] +
      (ctx.holi[1]==="C" ? " (cuti bersama)" : "") + ".</b> Tidak ada arus komuter hari ini &mdash; " +
      "<b>peak pagi hilang</b>. Bobot pindah ke mal, kuliner, dan bandara, dan puncaknya siang sampai malam. " +
      (ctx.runLen>=3 ? "Ini bagian dari libur panjang " + ctx.runLen + " hari; bandara dan terminal ramai di ujung-ujungnya." : "") +
      " Mulai siang, selesai larut.</span>";
  } else if (ctx.eve){
    n.hidden = false; n.className = "flag";
    n.innerHTML = '<span class="tag">Malam sebelum libur</span><span><b>Besok tanggal merah' +
      (ctx.evePlus ? ", awal libur panjang" : "") + ".</b> Sore dan malam ini arus keluar kota: " +
      "<b>bandara, Stasiun Batu Ceper, dan Terminal Poris Plawad</b> jauh lebih ramai dari biasanya, " +
      "penumpang berkoper, tujuan jauh. " + (ctx.evePlus ? "Ini salah satu malam terkuat dalam sebulan &mdash; kerjakan penuh." : "Pertimbangkan memperpanjang sampai 23:00.") + "</span>";
  } else if (ctx.dow===6 || ctx.dow===0){
    n.hidden = false; n.className = "flag quiet";
    n.innerHTML = '<span class="tag">Akhir pekan</span><span>Tidak ada peak pagi komuter. ' +
      '<b>Mulai 07:30&ndash;09:00 saja</b>, dan geser bobot ke sore dan malam.</span>';
  } else { n.hidden = true; }
}

function renderSteps(node, list, title){
  var h='<div class="steps-head"><span class="eyebrow">'+title+
        '</span><span class="eyebrow">Perkiraan &middot; kumulatif</span></div>';
  list.forEach(function(s){
    h+='<div class="step '+s.cls+'"><div class="t">'+s.t+"<em>"+s.dur+"</em></div>"+
       '<div class="a"><b>'+s.b+"</b><span>"+s.s+"</span><i>"+s.i+"</i>"+(s.d ? '<span class="dt">'+s.d+"</span>" : "")+"</div>"+
       '<div class="v">'+s.v+"<em>"+s.cum+"</em></div></div>";
  });
  node.innerHTML=h;
}

/* ---------------- lokasi yang diketik sendiri ----------------
   Halaman tidak boleh memanggil peta, jadi lokasi bebas dipetakan ke
   titik terukur terdekat lewat capability sample. Hasilnya PERKIRAAN. */

function simpanRegistri(){
  try { localStorage.setItem("registri-lokasi", JSON.stringify(REGISTRI)); } catch (e) {}
}
function muatRegistri(){
  try { REGISTRI = JSON.parse(localStorage.getItem("registri-lokasi") || "{}") || {}; }
  catch (e) { REGISTRI = {}; }
  naikkanRegistri();
}

/* Catatan lokasi yang tersimpan sebelum peta 183 kecamatan ada isinya
   TEBAKAN -- dulu jaraknya dikira-kira dari garis lurus atau ditanyakan ke
   Claude. Sekarang jarak jalannya sudah terukur, jadi catatan lama yang
   namanya cocok dengan nama kecamatan diganti angka ukur. Tanpa ini,
   catatan lama akan terus dipakai selamanya dan perbaikannya sia-sia.

   Yang TIDAK disentuh: titik GPS (angkanya sudah dihitung dari 4 pusat
   terdekat, lebih teliti daripada satu pusat kecamatan), dan nama yang
   tidak cocok dengan kecamatan mana pun -- itu kemungkinan nama tempat
   yang kilometernya Ibu isi sendiri. */
function naikkanRegistri(){
  var ubah = 0;
  Object.keys(REGISTRI).forEach(function(k){
    var r = REGISTRI[k];
    /* ">= 3", bukan "=== 2". catatKecamatan menstempel v:3, jadi penjaga yang
       cuma menolak v===2 membiarkan catatan yang SUDAH bermigrasi dimigrasi
       lagi tiap halaman dibuka. Akibatnya tidak terlihat di localStorage --
       karena kilometernya tidak berubah, ubah tetap 0 dan tidak ikut disimpan --
       tapi salinan di memori sudah telanjur rusak, dan itulah yang dipakai
       mesin dan dilihat Ibu di daftar.

       Sempat dipasang ">= 2". Itu menghentikan migrasi ulang, tapi sekaligus
       MENGUNCI catatan v:2 yang dibuat sebelum RKEC ada -- catatan itu tidak
       punya jari-jari, jadi cadangannya selamanya jatuh ke x1,08 saja
       (Teluknaga jadi 26% padahal ujung wilayahnya butuh 32%). Ambang 3
       melepasnya. Ini aman HANYA karena pencocokan di bawah sudah dipotong
       di koma; tanpa itu, seluruh catatan lama justru menjalankan ulang bug
       Teluknaga -> Tangerang sekaligus. */
    if (!r || r.v >= 3) return;
    if (k.indexOf("gps:") === 0) { r.v = 3; return; }
    /* Hanya bagian sebelum koma yang dicocokkan. Nama hasil migrasi berbentuk
       "Teluknaga, Kab. Tangerang", dan "Tangerang" itu sendiri nama kecamatan
       (2,2 km dari rumah) -- mencocokkan seluruh teks membuat Teluknaga
       berubah jadi Tangerang, lengkap dengan jari-jari dan zona yang salah. */
    var namaCari = String(r.nama || k.replace(/-/g, " ")).split(",")[0];
    var temu = cariKecamatan(namaCari);
    if (!temu) { r.v = 2; return; }
    var lama = r.km;
    var baru = catatKecamatan(temu.kec);
    baru.dibuat = r.dibuat || baru.dibuat;
    /* Kalau Ibu pernah mengisi kilometernya sendiri dan angkanya LEBIH BESAR
       dari pusat kecamatan, itu bukan tebakan yang perlu dikoreksi. Pusat
       kecamatan memang meremehkan di wilayah yang luas -- Teluknaga pusatnya
       19,9 km sementara ujung wilayahnya terukur 35,0 km. Pengalaman Ibu
       menang; dari peta hanya diambil zona dan jari-jarinya. */
    if (lama > baru.km + 0.5){ baru.km = lama; baru.sendiri = true; }
    REGISTRI[k] = baru;
    /* Dihitung tiap catatan yang DIGANTI, bukan hanya yang kilometernya
       bergeser. Dulu syaratnya selisih km >= 0,5, jadi catatan yang cuma
       bertambah jari-jari atau naik versi tidak ikut tersimpan -- memori
       benar, localStorage tertinggal, dan migrasinya terulang tiap halaman
       dibuka. Selisih memori-vs-simpanan itu yang sempat menyesatkan saya
       waktu memburu bug Teluknaga. */
    ubah++;
  });
  if (ubah) simpanRegistri();
  REGISTRI.__diperbarui = undefined; delete REGISTRI.__diperbarui;
  naikkanRegistri.jumlah = ubah;
}
function slug(s){
  return s.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,60);
}
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;"); }

/* Satu kolom, satu sumber kebenaran: nilai <select>. Lokasi ketikan
   masuk sebagai pilihan sendiri, jadi tidak ada dua kolom yang bersaing. */
function lokOptions(){
  var h = '<optgroup label="Wilayah inti">' +
    LOK.filter(function(l){ return !l.luar; })
       .map(function(l){ return '<option value="'+l.id+'">'+l.n+"</option>"; }).join("") +
    '</optgroup><optgroup label="Luar wilayah inti">' +
    LOK.filter(function(l){ return l.luar; })
       .map(function(l){ return '<option value="'+l.id+'">'+l.n+" · "+Math.round(l.home)+" km</option>"; }).join("") +
    "</optgroup>";
  var keys = Object.keys(REGISTRI).filter(function(k){ return REGISTRI[k] && REGISTRI[k].km > 0; });
  if (keys.length){
    h += '<optgroup label="Diketik sendiri">' + keys.map(function(k){
      var r = REGISTRI[k];
      return '<option value="custom:'+esc(k)+'">'+esc(r.nama)+" · "+Math.round(r.km)+" km"+
             (r.sendiri ? " · angka Anda" : (r.terukur ? "" : " · perkiraan"))+"</option>";
    }).join("") + "</optgroup>";
  }
  return h + '<optgroup label="Tidak ada di daftar?"><option value="__lain">Ketik lokasi lain…</option></optgroup>';
}
function renderLok(pilih){
  var sel = el("n-lok"), want = pilih || sel.value || lastLok;
  sel.innerHTML = lokOptions();
  var ada = false;
  for (var i=0;i<sel.options.length;i++) if (sel.options[i].value === want) ada = true;
  sel.value = ada ? want : lastLok;
  if (sel.value !== "__lain") lastLok = sel.value;
}
function currentLok(){
  var v = el("n-lok").value;
  if (v === "__lain") v = lastLok;
  if (v.indexOf("custom:") === 0){
    var r = REGISTRI[v.slice(7)];
    if (r && r.km > 0){
      var a = LOKMAP[r.anchor] || LOKMAP.kota;
      /* Cadangan SELALU pakai margin -- termasuk untuk nama kecamatan yang
         jaraknya terukur, karena yang terukur adalah PUSATNYA, bukan posisi
         Ibu. Dasarnya +8%; kalau luas kecamatannya diketahui, dipakai yang
         lebih besar antara itu dan pusat + 1,35 x jari-jari (lihat RKEC).
         Angka tampilan dan hitungan uang tetap memakai r.km apa adanya. */
      var kmAman = r.km * 1.08;
      if (r.rmax > 0) kmAman = Math.max(kmAman, r.km + 1.35 * r.rmax);
      return { id:v, n:r.nama, home:r.km, res:Math.round(kmAman/2+15),
               z: r.zPaksa || a.z,
               luar:r.km>10?1:0, jauh:r.km>34?1:0, anchor:a.n, perkiraan:!r.terukur };
    }
    return LOKMAP.kota;
  }
  return LOKMAP[v] || LOKMAP.kota;
}

function setHint(txt, cls){
  var h = el("ketikhint"); h.textContent = txt;
  h.style.color = cls==="ok" ? "var(--accent)" : (cls==="err" ? "var(--alert)" : "var(--muted)");
}
function pasangLokasi(key){
  renderLok("custom:"+key);
  setLokSumber("manual");
  el("ketikwrap").hidden = true;
  el("n-ketik").value = ""; el("n-ketikkm").value = "";
  setHint("Ketik nama daerah. Kolom km opsional — isi kalau Anda tahu kira-kira jaraknya ke rumah.");
  runNow();
}

function resolveKetik(){
  var txt = el("n-ketik").value.trim();
  if (!txt){ setHint("Isi nama daerahnya dulu.", "err"); return; }

  /* Sudah pernah diketik? pakai langsung, tanpa menebak lagi. */
  var s = slug(txt);
  if (REGISTRI[s] && REGISTRI[s].km > 0){ pasangLokasi(s); return; }

  /* Jalur 2 — Anda isi sendiri kilometernya. Tidak butuh Claude. */
  var manual = parseFloat(el("n-ketikkm").value);
  if (isFinite(manual) && manual > 0){
    var dekat = LOK[0], beda = Infinity;
    LOK.forEach(function(l){ var d = Math.abs(l.home - manual); if (d < beda){ beda = d; dekat = l; } });
    var recM = { nama:txt, km:manual, anchor:dekat.id, terukur:false, dibuat:iso(new Date()) };
    REGISTRI[s] = recM; pasangLokasi(s);
    simpanRegistri();
    return;
  }

  /* Jalur 3 — cocokkan dengan 183 nama kecamatan yang jarak pulangnya sudah
     diukur peta. Tidak perlu internet dan tidak perlu menunggu. */
  var temu = cariKecamatan(txt);
  if (temu){
    REGISTRI[s] = catatKecamatan(temu.kec);
    simpanRegistri();
    pasangLokasi(s);
    /* Sengaja tanpa menit: angka menit hasil ukur OSRM adalah waktu jalan
       LANCAR, sementara rencana di bawah memakai kecepatan Jabodetabek yang
       sebenarnya. Menampilkan keduanya cuma membuat dua angka berbeda untuk
       perjalanan yang sama. Yang dipakai Ibu adalah angka di rencana. */
    setHint("Ketemu: " + REGISTRI[s].nama + " · pulang " + temu.kec[4] +
            " km · jarak terukur peta" + temu.catatan, temu.catatan ? "" : "ok");
    return;
  }

  /* Jalur 4 — tanpa Claude dan tanpa km: tidak ada yang bisa menebak jaraknya.
     Dulu tertulis "akan diukur agen semalam" -- agen itu tidak pernah ada. */
  if (!sampler){
    var recQ = { nama:txt, km:0, anchor:"kota", terukur:false, dibuat:iso(new Date()) };
    REGISTRI[s] = recQ;
    simpanRegistri();
    setHint("Nama itu tidak ada di 183 kecamatan terukur, dan tidak ada sambungan Claude untuk "+
            "menebaknya. Isi kolom km, atau pilih wilayah terdekat dari daftar.", "err");
    return;
  }

  /* Jalur 5 — di luar Jabodetabek: Claude memetakan supaya bisa langsung dipakai sekarang. */
  setHint("Memetakan…");
  var daftar = LOK.map(function(l){ return l.id+" = "+l.n+" ("+l.home+" km)"; }).join("; ");
  sampler.json(
    "Kamu memetakan lokasi di Jabodetabek untuk seorang pengemudi yang tinggal di Modernland, "+
    "Kelapa Indah, Kota Tangerang, Banten.\n\nTitik yang sudah terukur jarak jalannya ke rumah itu: "+
    daftar+"\n\nPengguna menyebut lokasinya sekarang: \""+txt+"\"\n\n"+
    "Jawab HANYA JSON tanpa penjelasan lain, bentuknya: "+
    "{\"anchor\":\"<id titik terdekat dari daftar>\",\"km\":<perkiraan jarak jalan dari lokasi itu ke Modernland Tangerang, angka desimal>,"+
    "\"nama\":\"<nama lokasi yang dirapikan>\",\"catatan\":\"<satu kalimat sangat singkat>\"}\n"+
    "Kalau lokasinya tidak dikenali atau di luar Jabodetabek, pakai anchor \"kota\", km 0, "+
    "dan catatan yang menjelaskan bahwa lokasi tidak dikenali.",
    { modelTier:"quick", cache:true }
  ).then(function(res){
    var a = LOKMAP[res && res.anchor] || LOKMAP.kota;
    var km = (res && typeof res.km === "number" && res.km > 0) ? res.km : a.home;
    if (!res || !res.km){
      setHint("Tidak dikenali — coba nama daerah yang lebih umum.", "err"); return;
    }
    var rec = { nama:(res.nama||txt), km:km, anchor:a.id, terukur:false,
                dibuat:iso(new Date()) };
    REGISTRI[s] = rec;
    pasangLokasi(s);
    /* Titipkan ke agen supaya diukur peta semalam dan jadi permanen. */
    simpanRegistri();
  })["catch"](function(err){
    var c=(err&&err.code)||"error";
    setHint(c==="rate_limited" ? "Terlalu sering, coba lagi sebentar." : "Gagal memetakan ("+c+").", "err");
  });
}

/* ---------------- deteksi lokasi ----------------
   Memakai API lokasi browser — bukan pengambilan data internet, jadi
   tidak terhalang aturan yang memblokir peta. Koordinatnya tidak pernah
   dikirim ke mana pun: hanya dipakai memilih titik terdekat dari 17
   lokasi yang jaraknya sudah terukur. */

function setGpsHint(t, cls){
  var h = el("gpshint"); h.textContent = t;
  h.style.color = cls==="ok" ? "var(--accent)" : (cls==="err" ? "var(--alert)" : "var(--muted)");
}
var gpsTerakhir = 0;
/* Dari mana nilai kolom posisi berasal: "auto" kalau GPS yang menaruhnya,
   "manual" kalau Ibu memilih atau mengetik sendiri, "gagal" kalau deteksi
   otomatis dicoba tapi tidak berhasil. Dipakai supaya kolom itu tidak pernah
   menyatakan sebuah tempat tanpa menyebut siapa yang menentukannya. */
var lokSumber = "";
function setLokSumber(v){ lokSumber = v; tandaiLok(); }
function tandaiLok(){
  var e = el("src-lok"); if (!e) return;
  if (lokSumber === "auto"){ e.textContent = "otomatis"; e.className = ""; }
  else if (lokSumber === "manual"){ e.textContent = "dipilih sendiri"; e.className = "man"; }
  else if (lokSumber === "gagal"){ e.textContent = "belum terbaca"; e.className = "err"; }
  else { e.textContent = ""; e.className = ""; }
}
function deteksiLokasi(otomatis){
  if (!navigator.geolocation){
    if (!otomatis) setGpsHint("Perangkat ini tidak mendukung deteksi lokasi. Pilih dari daftar.", "err");
    return;
  }
  /* Jangan mengulang terlalu sering saat berpindah-pindah tab. */
  var now = Date.now();
  if (otomatis && now - gpsTerakhir < 120000) return;
  gpsTerakhir = now;
  setGpsHint(otomatis ? "Memeriksa lokasi…" : "Mencari lokasi…");
  navigator.geolocation.getCurrentPosition(function(pos){
    var la = pos.coords.latitude, lo = pos.coords.longitude;
    POSISI_GPS = { lat:la, lon:lo, akurasi:pos.coords.accuracy || 0, at:Date.now() };
    Baterai.catatFix(la, lo, Date.now());
    petaPosisi();
    var best = null, bestD = Infinity;
    LOK.forEach(function(l){
      if (l.lat == null) return;
      var d = jarakLurus(la, lo, l.lat, l.lon);
      if (d < bestD){ bestD = d; best = l; }
    });
    var akurasi = pos.coords.accuracy ? " ±" + Math.round(pos.coords.accuracy) + " m" : "";

    /* Persis di salah satu titik terukur — pakai angka ukurnya, itu jarak
       jalan sungguhan dari titik itu. Radiusnya sengaja rapat: dulu 4 km,
       dan itu membuat posisi 4 km dari patokan "Bekasi" ikut memakai 52,9 km.
       Bandara dapat radius lebih lebar karena kompleksnya memang seluas itu. */
    /* Bandara 2 km: sejauh itu hukuman akses tolnya masih berlaku, lebih jauh
       sudah tidak. Kalau ragu di batas itu, angka bandara yang kelebihan
       lebih aman daripada angka biasa yang kekurangan. */
    var radius = (best && best.id === "bandara") ? 2 : 2.5;
    if (best && bestD <= radius){
      renderLok(best.id);
      setLokSumber("auto");
      setGpsHint("Terdeteksi di " + best.n + " · " + bestD.toFixed(1) + " km dari titiknya" +
                 akurasi + " · jarak terukur peta", "ok");
      runNow(); return;
    }

    /* Di mana pun selain itu — cari dari 183 kecamatan yang jarak pulangnya
       sudah diukur. Halaman tidak perlu internet untuk ini. */
    var h = hampiranPulang(la, lo);
    var kmJalan = Math.round(h.km * 10) / 10;
    var kunci = "gps:" + la.toFixed(3) + "," + lo.toFixed(3);
    REGISTRI[kunci] = {
      nama: h.kec + ", " + h.induk,
      km: kmJalan, menit: h.menit, anchor: (best ? best.id : "kota"), terukur: false,
      dibuat: iso(new Date())
    };
    simpanRegistri();
    renderLok("custom:" + kunci);
    /* Zona ikut kecamatan tempat Ibu berdiri, bukan titik terdekat. */
    REGISTRI[kunci].zPaksa = h.zona;
    setLokSumber("auto");
    setGpsHint("Terdeteksi di " + h.kec + ", " + h.induk + " · pulang ≈ " + kmJalan +
               " km" + akurasi, "ok");
    runNow();
  }, function(err){
    if (otomatis){
      /* Dulu baris ini mengosongkan petunjuk supaya tidak berisik. Akibatnya
         kalau izin belum diberikan, GPS mati, atau Ibu di dalam gedung, kolom
         posisi diam-diam tetap menunjuk Modernland -- dan seluruh rencana
         dihitung untuk tempat yang bukan posisinya, tanpa satu pun tanda.
         Sekarang kolomnya menyebut siapa yang menentukan, dan menawarkan
         jalan keluarnya. Tetap tidak mengganggu: warnanya redam. */
      if (lokSumber !== "manual"){
        setLokSumber("gagal");
        var pakai = currentLok();
        setGpsHint("Lokasi belum terbaca — sementara memakai " + pakai.n +
                   ". Tekan “Lokasi saya”, atau pilih sendiri di atas.");
      }
      return;
    }
    var pesan = err && err.code === 1
      ? "Izin lokasi ditolak. Aktifkan di pengaturan browser, atau pilih dari daftar."
      : "Lokasi tidak bisa dibaca di sini. Pilih dari daftar saja.";
    setLokSumber("gagal");
    setGpsHint(pesan, "err");
  }, { enableHighAccuracy:true, timeout:10000, maximumAge:60000 });
}

/* Deteksi sendiri saat halaman dibuka dan tiap kali dilihat lagi — tapi
   HANYA kalau izinnya sudah pernah diberikan, supaya tidak tiba-tiba
   memunculkan dialog izin yang mengagetkan. */
function gpsOtomatisAktif(){
  try { return localStorage.getItem("gps-otomatis") !== "0"; } catch (e) { return true; }
}
/* Odometer GPS: selama halaman terlihat dan izin lokasi sudah ada, tiap
   perpindahan posisi dicatat ke jejak baterai (Baterai.catatFix). Tidak
   menggambar ulang halaman -- hanya menambah km dan menggeser penanda peta. */
var odometerId = null;
function pasangOdometer(){
  if (!navigator.geolocation || !navigator.geolocation.watchPosition) return;
  function mulai(){
    if (odometerId != null || document.hidden || !gpsOtomatisAktif()) return;
    odometerId = navigator.geolocation.watchPosition(function(pos){
      var la = pos.coords.latitude, lo = pos.coords.longitude;
      if (pos.coords.accuracy && pos.coords.accuracy > 150) return;   /* fix kasar: jangan dihitung */
      POSISI_GPS = { lat:la, lon:lo, akurasi:pos.coords.accuracy || 0, at:Date.now() };
      if (Baterai.catatFix(la, lo, Date.now()) > 0.3) renderSocEstSaja();
      if (Peta.ada()) Peta.posisi(la, lo, POSISI_GPS.akurasi);
    }, function(){}, { enableHighAccuracy:true, maximumAge:15000, timeout:30000 });
  }
  function berhenti(){ if (odometerId != null){ navigator.geolocation.clearWatch(odometerId); odometerId = null; } }
  mulai();
  document.addEventListener("visibilitychange", function(){ if (document.hidden) berhenti(); else mulai(); });
}
function pasangGpsOtomatis(){
  if (!navigator.geolocation || !gpsOtomatisAktif()) return;
  function coba(){
    if (document.hidden) return;
    if (el("n-lok").value === "__lain") return;   /* sedang mengetik lokasi */
    deteksiLokasi(true);
  }
  if (navigator.permissions && navigator.permissions.query){
    navigator.permissions.query({name:"geolocation"}).then(function(p){
      if (p.state === "granted"){
        coba();
        document.addEventListener("visibilitychange", coba);
        pasangOdometer();
      }
      p.onchange = function(){ if (p.state === "granted"){ coba(); pasangOdometer(); } };
    })["catch"](function(){});
  }
}

/* ---------------- jam yang ikut jalan ----------------
   Kolom "Jam sekarang" dulu diisi SEKALI saat halaman dibuka lalu diam.
   Untuk pengemudi yang membiarkan halamannya terbuka di HP sepanjang hari,
   itu berarti seluruh tab Sekarang membeku di jam pembukaan: kartu langkah,
   proyeksi, urutan sampai pulang, dan jawaban Tanya. Posisinya diperbarui
   sendiri lewat GPS, jamnya tidak -- timpang, dan yang membeku justru yang
   paling menentukan.

   Sekarang jamnya ikut jalan sendiri, KECUALI kalau Ibu memilih sendiri --
   misalnya ingin melihat "kalau saya keluar jam 15:00 nanti bagaimana".
   Pilihannya dihormati, dan ada jalan kembali yang terlihat. */
var jamManual = false, jamLuar = false, jamManualSejak = 0;
function jamSekarangTepat(){ var d = new Date(); return d.getHours() + d.getMinutes()/60; }
/* Jam yang dipakai mesin: tepat ke menit kalau mengikuti jam, nilai kolom
   kalau Ibu memilih sendiri (untuk "kalau saya keluar jam 15:00?"). */
function jamKeluarSekarang(){
  var t = jamSekarangTepat();
  if (!jamManual && !jamLuar && t >= 3.5 && t <= 23.5) return Math.round(t * 60) / 60;
  return parseFloat(el("n-jam").value);
}
function jamHidup(){
  var e = el("jamhidup"); if (!e) return;
  var d = new Date(); e.textContent = String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
}
function tandaiJam(){
  var e = el("src-jam"), b = el("jam-auto");
  if (!e) return;
  /* Di luar 03:30-23:30 kolom jam TIDAK BISA mengikuti -- tidak ada pilihan
     yang sah di sana. Itu harus terlihat, bukan disembunyikan. */
  if (jamLuar && !jamManual){
    e.textContent = "di luar jam"; e.className = "err"; if (b) b.hidden = true; return;
  }
  if (jamManual){ e.textContent = "dipilih sendiri (20 mnt)"; e.className = "man"; if (b) b.hidden = false; }
  else { e.textContent = "ikut jam, tepat ke menit"; e.className = ""; if (b) b.hidden = true; }
}
function jamSekarangBulat(){
  var d = new Date();
  return Math.round((d.getHours() + d.getMinutes()/60) * 4) / 4;
}
function ikutJam(paksa){
  jamHidup();
  /* Pilihan manual kedaluwarsa sendiri: setelah 20 menit kolom jam kembali
     mengikuti jam, supaya tidak ada rencana yang diam-diam membeku. */
  if (jamManual && !paksa && Date.now() - jamManualSejak > 20*60*1000){ jamManual = false; tandaiJam(); }
  if (jamManual && !paksa) return;
  var t = jamSekarangBulat();
  /* Di luar 03:30-23:30 tidak ada pilihan jam yang sah, jadi kolomnya tidak
     bisa mengikuti. Dulu fungsi ini diam-diam keluar di sini dan penandanya
     TETAP berbunyi "ikut jam" -- jadi pukul 01:00 halaman masih menghitung
     untuk 23:30: blok jam, kartu langkah, proyeksi, protokol pulang, dan
     jawaban Tanya. Semuanya untuk jam yang sudah lewat satu setengah jam.
     Dan itu jatuh persis di malam yang halaman ini sendiri sebut paling
     berharga -- bubaran konser 22:30-23:30, malam sebelum libur panjang.
     Keluarga bug yang sama dengan GPS gagal diam-diam dan cuaca basi. */
  if (t < 3.5 || t > 23.5){
    if (!jamLuar){ jamLuar = true; tandaiJam(); runNow(); }
    return;
  }
  jamLuar = false;
  if (paksa) jamManual = false;
  var sel = el("n-jam");
  if (parseFloat(sel.value) === t){ tandaiJam(); runNow(); return; }   /* menit berubah walau kotak sama */
  sel.value = t;
  tandaiJam();
  /* Jam pulang tidak boleh tertinggal di belakang jam sekarang. */
  if (parseFloat(el("n-pulang").value) <= t){
    el("n-pulang").value = Math.min(24, t + 0.5);
  }
  runNow();
}

/* ---------------- plan of the day (the loop) ---------------- */
var PLAN = null, AKTUAL = null, LSP = "buku-setoran-plan";
function loadPlan(){ try{ PLAN = JSON.parse(localStorage.getItem(LSP)||"null"); }catch(e){ PLAN=null; } }
function savePlan(p){
  PLAN = p;
  try{ localStorage.setItem(LSP, JSON.stringify(p)); }catch(e){}

}

function renderPlanCheck(nowT, dpt, lokZ){
  var n = el("plancheck");
  var today = iso(new Date());
  if (!PLAN || PLAN.date !== today){ n.hidden = true; return; }
  /* Belum ada angka "sudah dapat" -> belum ada yang bisa dibandingkan. */
  if (!(dpt > 0) && !(nowT < PLAN.keluar)){ n.hidden = true; return; }
  n.hidden = false;

  var ctx = dayCtx(today);
  var upto = Math.max(PLAN.keluar, Math.min(nowT, PLAN.pulang));
  var sofar = simulate({ ctx:ctx, keluar:PLAN.keluar, pulang:upto, rehat:PLAN.rehat,
    zona:PLAN.zona, filter:PLAN.filter, bat:PLAN.bat, rumah:PLAN.rumah,
    hujan:PLAN.hujan, acara:PLAN.acara });
  var full = simulate({ ctx:ctx, keluar:PLAN.keluar, pulang:PLAN.pulang, rehat:PLAN.rehat,
    zona:PLAN.zona, filter:PLAN.filter, bat:PLAN.bat, rumah:PLAN.rumah,
    hujan:PLAN.hujan, acara:PLAN.acara });

  var seharusnya = sofar.gross;   /* "sudah dapat" itu pendapatan kotor, dibandingkan dengan yang kotor juga */
  var selisih = dpt - seharusnya;
  var cls = selisih >= 0 ? "up" : "dn";
  var drift = lokZ !== PLAN.zona;
  var jeda = rehatRange(PLAN.rehat);
  var sedangJeda = jeda && nowT >= jeda[0] && nowT < jeda[1];

  var msg;
  if (sedangJeda){
    msg = "<b>Menurut rencana, jam ini waktunya istirahat</b> (" + hhmm(jeda[0]) + "&ndash;" +
          hhmm(jeda[1]) + "). Blok ini memang paling sepi &mdash; kalau Ibu tetap jalan, "+
          "hasilnya kecil dan peak sore jadi lebih berat. Urutan di bawah sudah menghormati jeda itu.";
  } else if (nowT < PLAN.keluar){
    msg = "Rencana hari ini mulai pukul <b>" + hhmm(PLAN.keluar) + "</b> dengan wilayah <b>" +
          ZONA[PLAN.zona].label + "</b>, sasaran <b>" + rp(full.net) + "</b>. Belum mulai.";
  } else {
    msg = (selisih >= 0
      ? "<b>Anda di depan rencana " + rp(selisih) + ".</b> "
      : "<b>Tertinggal " + rp(-selisih) + " dari rencana.</b> ") +
      (drift
        ? "Dan posisi Anda sekarang di luar wilayah yang direncanakan (<b>" + ZONA[PLAN.zona].label +
          "</b>). "
        : "") +
      "Urutan langkah di bawah <b>sudah disusun ulang dari posisi dan jam Anda sekarang</b> &mdash; bukan dari rencana awal.";
  }

  n.innerHTML =
    '<div class="pc"><span class="lbl">Menurut rencana</span><span class="v">' + rp(seharusnya) + "</span></div>" +
    '<div class="pc"><span class="lbl">Aktual</span><span class="v">' + rp(dpt) + "</span></div>" +
    '<div class="pc"><span class="lbl">Selisih</span><span class="v ' + cls + '">' +
      (selisih>=0?"+":"") + rp(selisih).replace("Rp ","") + "</span></div>" +
    '<div class="pc"><span class="lbl">Sasaran rencana</span><span class="v">' + rp(full.net) + "</span></div>" +
    '<div class="msg">' + msg + "</div>";
}

/* ---------------- NOW ---------------- */
function runNow(){
  var dateStr = iso(new Date());
  var ctx = dayCtx(dateStr);
  renderDayFlag(ctx, dateStr);

  var L = currentLok(), lok = L.id;
  /* Kalau ada rencana hari ini, tab Sekarang mengikuti jeda istirahatnya —
     jangan sampai menyuruh kerja di jam yang sudah Ibu rencanakan libur. */
  var planAktif = PLAN && PLAN.date === iso(new Date());
  var o = { ctx:ctx, keluar:jamKeluarSekarang(), pulang:parseFloat(el("n-pulang").value),
    rehat: planAktif ? PLAN.rehat : "none", zona:L.z, filter:parseInt(el("n-filter").value,10),
    bat:parseFloat(el("n-bat").value), rumah:el("n-rumah").checked,
    hujan:el("n-hujan").checked, acara:el("n-acara").checked,
    deadKm:0 };   /* Ibu sudah di posisinya: tidak ada km kosong menuju pangkalan */
  if (o.pulang<=o.keluar){ o.pulang=Math.min(24,o.keluar+0.5); el("n-pulang").value=o.pulang; }

  var soc = Math.max(1,Math.min(100, parseFloat(el("n-soc").value)||0));
  /* Perkiraan baterai dari jangkar terakhir (Mulai hari / selesai ngecas):
     mengisi kolom sendiri selama Ibu belum mengetik angka lain sejak jangkar. */
  var est = Baterai.perkiraan(o.keluar, { bat:o.bat, zona:o.zona, rehat:o.rehat });
  var seTouched = el("n-soc").dataset.touched === "1";
  if (est && !seTouched && Math.abs(est.soc - soc) >= 1 && est.soc >= 1){ el("n-soc").value = est.soc; soc = est.soc; }
  renderSocEst(est, soc, seTouched);
  var dpt = Math.max(0, parseFloat(el("n-dpt").value)||0);
  o.soc = soc;   /* rencana ngecas harus memakai daya nyata, bukan 90% */
  var stay = el("n-tujuan").value === "stay";
  var kmHome = stay ? 0 : L.home;
  /* Kalau Anda jauh tapi sifnya masih panjang, perjalanan pulang dari
     luar wilayah sudah selesai jauh sebelum jam pulang — jadi protokol
     pulangnya dihitung dari wilayah inti, bukan dari titik terjauh. */
  var kmProtokol = kmHome;
  if (!stay && L.jauh && (o.pulang - o.keluar) > (L.home / CALIB.kecepatan) + 1.5) kmProtokol = 9;
  /* Jam pulang nanti Ibu tidak akan persis di titik ini — pakai jarak
     khas wilayah inti, jangan nol. */
  if (!stay) kmProtokol = Math.max(kmProtokol, 6);
  o.kmHome = kmHome; o.stay = stay;
  /* Insentif dihitung untuk SEHARI: jam yang sudah dikerjakan sejak mulai
     (dari rencana hari ini, atau jam mulai yang diisi) ditambah jam sisa. */
  var mulaiHari = planAktif ? PLAN.keluar : (typeof MULAI_HARI === "number" ? MULAI_HARI : (dpt > 0 ? 5.25 : o.keluar));
  o.jamSebelum = Math.max(0, Math.min(o.keluar, o.pulang) - mulaiHari);
  if (planAktif){ var jd = rehatRange(PLAN.rehat); if (jd) o.jamSebelum -= Math.max(0, Math.min(o.keluar, jd[1]) - jd[0]); }
  o.jamSebelum = Math.max(0, o.jamSebelum);

  var r = simulate(o);
  var insentifHarian = r.insentif;
  var sisa = r.blockNet - r.feeCharge - r.parkir;
  var proyeksi = dpt + r.net;
  renderPlanCheck(o.keluar, dpt, L.z);
  AKTUAL = { jam:o.keluar, dpt:dpt, lok:L.n, home:Math.round(kmHome*10)/10,
             tanggal:iso(new Date()) };
  try { localStorage.setItem("sekarang-terakhir", JSON.stringify(AKTUAL)); } catch (e) {}

  el("n-net").textContent = rp(proyeksi);
  el("n-net").className = "big " + (proyeksi>=TARGET_DAY?"ok":(proyeksi>=TARGET_DAY*0.75?"mid":"bad"));
  el("n-bar").style.width = Math.max(0,Math.min(100,(proyeksi/TARGET_DAY)*100)).toFixed(1)+"%";
  var gap = TARGET_DAY - proyeksi;
  el("n-vs").innerHTML = gap>5000
    ? "Kurang <b>"+rp(gap)+"</b> dari rata-rata harian Rp 515.000"
    : "<b>Sudah di atas rata-rata harian.</b> Kelebihan "+rp(-gap)+" masuk saldo bulanan";

  var usableKm = ((soc-10)/100)*o.bat*CALIB.kmkwh;
  var butuh = r.km + kmHome;
  var blk = blockAt(o.keluar, ctx.shapeDay);

  el("n-side").innerHTML = [
    ["Blok sekarang", blk.n], ["Sisa jam", (o.pulang-o.keluar).toFixed(1)+" j"],
    ["Perkiraan sisa", rp(sisa)], ["Insentif hari ini", rp(insentifHarian)],
    ["&asymp; Order sisa", Math.round(r.trips)+" &middot; "+Math.round(r.paidKm)+" km bayar"],
    ["Km sampai pulang", Math.round(butuh)+" km"],
    ["Daya tersedia", Math.round(usableKm)+" km"], ["Pulang dari sini", Math.round(kmHome)+" km"],
    ["Sisa daya minimum", L.res+"%"],
    ["Tiba di rumah", "&asymp; "+Math.round(Math.max(0, r.socTiba)*100)+"%"+(r.sessions ? " &middot; "+r.sessions+"&times; ngecas" : "")]
  ].map(function(x){ return "<div><span>"+x[0]+"</span><b>"+x[1]+"</b></div>"; }).join("");

  /* Baterai jadi banner terpisah, supaya judul kartu selalu mencerminkan
     lokasi dan blok jam — bukan tertimpa peringatan daya. */
  var bw = el("batwarn");
  if (soc < L.res && !stay){
    bw.hidden = false; bw.className = "batwarn";
    bw.innerHTML = '<span class="tag">Daya kritis</span><span><b>Ngecas sekarang, sebelum menerima order lagi.</b> '+
      "Dari "+L.n+" Anda butuh minimal <b>"+L.res+"%</b> untuk pulang dengan cadangan &mdash; sekarang "+soc+
      "%. Tolak order berikutnya, atau pulang sekarang juga." +
      (spkluTeks(spkluUntuk(L)) ? " Terdekat dari sini: " + spkluTeks(spkluUntuk(L)) +
        " <span style=\"opacity:.75\">(jarak jalan)</span>." : "") + "</span>";
  } else if (usableKm < butuh && !o.rumah){
    bw.hidden = false; bw.className = "batwarn mild";
    bw.innerHTML = '<span class="tag">Perlu 1 sesi</span><span>Sampai pulang perlu sekitar <b>'+
      Math.round(butuh)+" km</b>, daya sekarang cukup untuk <b>"+Math.round(usableKm)+
      " km</b>. Sisipkan satu sesi ngecas di blok termurah &mdash; sudah ditandai oranye di urutan langkah di bawah." +
      (spkluTeks(spkluUntuk(L)) ? " Terdekat dari sini: " + spkluTeks(spkluUntuk(L)) +
        " <span style=\"opacity:.75\">(jarak jalan)</span>." : "") + "</span>";
  } else { bw.hidden = true; }

  /* Tandai centang mana yang terisi sendiri, mana yang Anda ubah. */
  function srcTag(id, auto){
    var e = el("src-"+id), inp = el("n-"+id);
    if (inp.dataset.touched){ e.textContent = "manual"; e.className = "man"; }
    else if (auto){ e.textContent = "otomatis"; e.className = ""; }
    else { e.textContent = ""; }
  }
  srcTag("hujan", !!(WEATHER && WEATHER.hujan && WEATHER.tanggal === iso(new Date())));
  srcTag("acara", !!ctx.ev);

  var v;
  var jedaPlan = planAktif ? rehatRange(PLAN.rehat) : null;
  if (jedaPlan && o.keluar >= jedaPlan[0] && o.keluar < jedaPlan[1]){
    /* Rencana Ibu sendiri bilang jam ini istirahat — kartu tidak boleh
       menyuruh kerja dan menabrak rencananya. */
    v = { k:"warn", h:"Menurut rencana, jam ini istirahat",
          r:"Pulang, makan, tidur sebentar &middot; sampai "+hhmm(jedaPlan[1]),
          p:"Blok ini paling sepi dalam sehari, dan rencana hari ini memang mengosongkannya. "+
            "Kalau Ibu tetap jalan, hasilnya kecil dan peak sore jadi lebih berat. "+
            "<b>Kalau memang ingin lanjut, ubah dulu rencananya di tab Rencana</b> supaya angkanya ikut menyesuaikan." };
  } else {
    v = advise(blk, L, o);
  }
  el("verdict").className = "verdict"+(v.k?" "+v.k:"");
  el("verdict").innerHTML = '<span class="n">Langkah berikutnya &middot; '+hhmm(o.keluar)+" &middot; "+
    L.n+(L.perkiraan?" &middot; perkiraan":"")+"</span><h3>"+v.h+
    '</h3><p class="route">'+v.r+"</p><p>"+v.p+"</p>";

  var langkah = buildSteps(o, r,
    { cum:dpt, markNow:true, kmHome:kmProtokol, stay:stay, L:L, verdict:v });
  renderSteps(el("n-steps"), langkah, "Urutan dari " + L.n);
  catatProyeksi(dateStr, proyeksi);
  SEKARANG = { v:v, langkah:langkah, proyeksi:proyeksi, sisa:sisa, gap:gap,
               insentif:insentifHarian, blok:blk, r:r, L:L, o:o,
               usableKm:usableKm, butuh:butuh, soc:soc, stay:stay };
  SEKARANG.rek = renderRekomendasi(o, L, soc, stay);
  briefingOtomatis();

  var nn=[];
  /* Didahulukan dari semua catatan lain: kalau jamnya salah, semua angka di
     atasnya salah, dan tidak ada gunanya membaca sisanya. */
  if (jamLuar && !jamManual){
    var jn = new Date();
    nn.push(note("bad","Jam sekarang di luar jangkauan halaman",
      "Sekarang pukul <b>"+String(jn.getHours()).padStart(2,"0")+":"+
      String(jn.getMinutes()).padStart(2,"0")+"</b>, di luar 03:30&ndash;23:30 yang dicakup "+
      "halaman ini. Kolom jam berhenti di <b>"+hhmm(o.keluar)+"</b>, jadi <b>semua angka di "+
      "atas dihitung untuk jam itu, bukan untuk sekarang</b>. Jam segini tarifnya memang "+
      "tidak pernah diukur dan tidak ada di model. <b>Kalau Ibu masih di jalan: pulang.</b>"));
  }
  nn.push(note("","Protokol pulang","Mulai mengarah pulang pukul <b>"+
    hhmm(o.pulang-Math.max(0.5,kmHome/CALIB.kecepatan+0.25))+"</b> &mdash; "+Math.round(kmHome)+
    " km dari sini, plus cadangan."));
  /* Kalau sesi ngecas terpaksa jatuh di blok peak, penyebabnya hampir
     selalu berangkat dengan baterai rendah — sebutkan, jangan dibiarkan. */
  var ngecasDiPeak = Array.prototype.some.call(
    el("n-steps").querySelectorAll(".step.charge"), function(s){
      var b = s.querySelector(".a b");
      return b && /Panen komuter|Panen bubaran|Panen koridor|Panen arus|keberangkatan pagi|Kedatangan sore/.test(b.textContent);
    });
  if (ngecasDiPeak && soc < 85) nn.push(note("bad","Ngecas di jam peak",
    "Sesi ngecas terpaksa jatuh di blok peak karena berangkat dengan baterai <b>"+soc+
    "%</b>. Blok itu bernilai sekitar "+rp(blockRate(BASE[1], ctx.shapeDay))+" per jam &mdash; "+
    "<b>berangkat di atas 85% menggesernya ke jam murah</b> dan menambah sekitar "+
    rp(blockRate(BASE[1], ctx.shapeDay)*0.6)+" ke hari Ibu."));
  if (o.keluar < 5.25) nn.push(note("warn","Blok subuh belum terbukti",
    "Angka blok 03:30&ndash;05:15 adalah <b>hipotesis</b>, bukan hasil ukur &mdash; saya menduga tarifnya tinggi karena "+
    "penerbangan pertama dan hampir tanpa pesaing, tapi belum ada datanya. Coba tiga hari, catat di tab Catatan, "+
    "lalu bandingkan Rp per jamnya dengan blok peak pagi biasa."));
  if (L.perkiraan) nn.push(note("warn","Lokasi perkiraan",
    "<b>"+L.n+"</b> tidak ada di daftar terukur, jadi jaraknya (<b>"+Math.round(L.home)+
    " km</b>) adalah perkiraan, bukan hasil ukur peta &mdash; anggap meleset sampai 20%. "+
    "Perilakunya disamakan dengan <b>"+L.anchor+"</b>. Kalau lokasi ini sering Anda datangi, "+
    "sebutkan ke saya dan akan saya ukur lalu masukkan ke daftar tetap."));
  nn.push(note(CALIB.kecUkur ? "good" : "warn",
    CALIB.kecUkur ? "Kecepatan pulang terukur" : "Kecepatan pulang masih tebakan",
    CALIB.kecUkur
      ? ("Perjalanan pulang dihitung <b>" + Math.round(CALIB.kecepatan) + " km/jam</b>, dari " +
         CALIB.kecN + " hari yang menit pulangnya Ibu catat sendiri. Itu yang menentukan jam berapa " +
         "kartu di atas menyuruh mulai merapat.")
      : ("Perjalanan pulang dihitung <b>26 km/jam</b> &mdash; itu <b>tebakan saya</b>, belum pernah " +
         "diuji. Angka itu menentukan kapan Ibu disuruh mulai pulang, dan dari Bekasi selisih " +
         "10 km/jam berarti beda lebih dari satu jam. <b>Sekali saja catat menit perjalanan " +
         "pulang</b> di tab Catatan, dan tebakan ini berhenti jadi tebakan.")));
  var sp = spkluUntuk(L);
  if (sp && sp.length) nn.push(note("","SPKLU terdekat",
    spkluTeks(sp) + " &mdash; <b>jarak jalan</b>, diukur lewat peta, bukan garis lurus. " +
    "<b>Jenis colokan dan dayanya belum tercatat</b> di sumber mana pun yang terbuka, jadi " +
    "daftar ini menjawab <i>di mana</i>, bukan <i>apakah cocok</i>. Cek sekali di aplikasi " +
    "PLN Mobile atau BYD, lalu sebutkan ke saya supaya saya catat permanen."));
  var wk = watakLok(L);
  if (wk){
    var isi = wk.kode.split("").map(function(c){
      var a = WATAK_ARTI[c]; return a ? "<b>"+a[0]+".</b> "+a[1] : ""; })
      .filter(function(x){ return x; }).join(" ");
    /* Kalau kecamatan ini punya stasiun berjadwal, sebut dalamnya lembah
       tengah hari -- itu satu-satunya bagian jadwal KRL yang lolos uji. */
    var lem = (wk.i >= 0) ? KRLL[wk.i] : 0;
    if (lem){
      isi += (isi ? " " : "") + "<b>Stasiunnya tengah hari.</b> Antara 10:00 dan 15:00 keretanya tinggal <b>" +
             Math.round(lem*100) + "%</b> dari jam ramainya" +
             (lem <= 0.6 ? " &mdash; praktis separuh. <b>Jangan menunggu di stasiun jam segitu.</b>"
                         : ", jadi masih lumayan dibanding stasiun lain.");
    }
    if (isi) nn.push(note("","Watak wilayah ini",
      "Yang ada di sekitar " + wk.kec + ": " + isi +
      " <span style=\"opacity:.75\">Ini dari <b>apa yang ada</b> di sana menurut peta, bukan dari " +
      "jumlah order yang terukur &mdash; jamnya penalaran, bukan pengamatan.</span>"));
  }
  if (CALIB.live) nn.push(note("good","Kalibrasi hidup",
    "Perhitungan ini memakai <b>angka Anda sendiri</b> dari "+CALIB.n+" hari terakhir: Rp "+
    Math.round(CALIB.rpkm).toLocaleString("id-ID")+"/km, insentif "+rp(CALIB.ins)+", "+
    dec(CALIB.kmkwh,1)+" km/kWh."));
  else nn.push(note("warn","Belum terkalibrasi",
    "Masih memakai asumsi bawaan. <b>Isi 3 hari di tab Catatan</b> dan seluruh angka di halaman ini berganti jadi milik Anda."));
  if (gap>5000 && o.pulang<21.5){
    /* Dihitung sebagai HARI YANG SAMA diperpanjang, bukan sebagai sif baru
       yang berdiri sendiri mulai jam pulang. Dulu begitu -- dan karena soc
       tidak ikut diteruskan, sif baru itu selalu dianggap berangkat dengan
       baterai penuh, jadi tidak pernah menanggung sesi ngecas tambahan yang
       justru dipicu oleh km perpanjangan itu sendiri.

       Akibatnya pada 14 dari 60 kasus yang benar-benar tampil, angkanya
       lebih dari dua kali terlalu besar, dan beberapa SALAH TANDA: halaman
       menyuruh Ibu narik 1,5 jam lagi untuk sesuatu yang sebenarnya
       mengurangi uangnya (mix 15:00 "+Rp 33.136" padahal -Rp 6.453). Itu
       jam hidupnya, ditukar dengan angka yang arahnya terbalik. */
    var tj = tambahanJam(o, r, 1.5);
    var sampai = tj.sampai, tambah = tj.tambah;
    if (tambah > 10000) nn.push(note("warn","Kalau mau mengejar",
      "Menambah 1,5 jam sampai <b>"+hhmm(sampai)+"</b> menambah sekitar <b>"+
      rp(tambah)+"</b> &mdash; menutup "+Math.round(Math.min(100,tambah/gap*100))+"% kekurangan."));
    else if (tambah < -2000) nn.push(note("bad","Jangan diperpanjang",
      "Menambah 1,5 jam sampai <b>"+hhmm(sampai)+"</b> justru <b>mengurangi</b> sekitar "+
      rp(-tambah)+". Km tambahannya memaksa satu sesi ngecas lagi &mdash; "+rp(SESSION_FEE)+
      " ditambah waktu mencoloknya. <b>Kekurangan hari ini lebih murah ditutup besok.</b>"));
  }
  /* Insentif di halaman ini dihitung RATA menurut jam (CALIB.ins x jam/10,5).
     Kalau insentif Grab sebenarnya BERTINGKAT -- "sekian trip dapat sekian" --
     bentuknya sama sekali lain, dan bedanya jatuh persis di keputusan yang
     paling menentukan: kapan berhenti. Contoh dengan tingkatan 8/12/18 trip:
     berhenti di jam ke-10 dengan 17 trip, model rata mengaku insentif
     Rp 123.810 padahal yang didapat Rp 75.000 -- kelebihan Rp 48.810 -- dan
     36 menit berikutnya yang sebenarnya bernilai Rp 55.000 ditampilkan cuma
     Rp 6.190. Terbalik.

     Tidak saya tambal dengan tingkatan karangan: model bertingkat yang salah
     angkanya lebih berbahaya daripada model rata, karena terlihat presisi.
     Yang bisa dilakukan sekarang adalah mengatakannya, dan hanya saat
     keputusan berhentinya memang sedang hidup -- dua jam terakhir. */
  if ((o.pulang - o.keluar) <= 2.5) nn.push(note("warn","Insentif belum tentu rata",
    "Angka insentif di atas (<b>"+rp(insentifHarian)+"</b>) dihitung <b>rata menurut jam</b>. "+
    "Kalau insentif Grab hari ini bertingkat &mdash; misalnya target sekian trip &mdash; maka "+
    "<b>trip terakhir menjelang target jauh lebih berharga</b> daripada yang ditampilkan di sini, "+
    "dan berhenti sedikit sebelum target berarti kehilangan seluruh bonusnya. "+
    "<b>Cek sisa target di aplikasi Grab sebelum memutuskan berhenti.</b> "+
    "Kalau Ibu sebutkan bentuk insentifnya ke saya, saya bisa memasukkannya ke hitungan."));
  if (gap>100000 && (ctx.dow===2||ctx.dow===3)) nn.push(note("","Jangan dipaksa",
    "Ini hari lemah dalam minggu. <b>Kekurangan hari ini lebih murah ditutup hari Jumat</b> daripada dengan jam ke-13 &mdash; target Anda bulanan."));
  if (o.filter===0 && L.z==="jkt") nn.push(note("bad","Filter habis",
    "Anda di Jakarta tanpa jatah filter. <b>Pulangnya berisiko "+Math.round(kmHome)+" km kosong.</b> Prioritaskan order apa pun ke arah barat mulai sekarang."));
  if (o.hujan){
    var dh = dampak(o, {hujan:false});
    var dariBMKG = WEATHER && WEATHER.hujan && WEATHER.tanggal === iso(new Date());
    nn.push(note("warn","Hujan sudah dihitung",
      (dariBMKG ? "Prakiraan "+(WEATHER.sumber||"BMKG")+(WEATHER.jam?" ("+WEATHER.jam+")":"")+
                  " masuk otomatis pagi tadi. " : "")+
      "Proyeksi di atas <b>sudah termasuk</b> kenaikan permintaan: <b>+"+rp(dh)+
      "</b> dibanding hari kering. Tapi hindari titik banjir di Periuk, Ciledug, dan sebagian Jakarta Barat &mdash; "+
      "<b>jangan menembus genangan lebih dari 15 cm.</b>"));
  }
  if (ctx.ev){
    nn.push(note("good","Acara sudah dihitung",
      "<b>"+ctx.ev[0]+"</b> di "+ctx.ev[1]+" masuk dari kalender otomatis, dan sudah tercermin di proyeksi serta urutan langkah di atas. "+
      (ctx.ev[2]==="lokal"
        ? "Venue ini di wilayah Anda &mdash; rencanakan berada di sekitar BSD saat acara bubar."
        : "Venue di Jakarta &mdash; bubarannya larut dan pulangnya jauh; ambil hanya kalau besok Anda libur atau mulai siang.")));
  } else if (o.acara){
    var da = dampak(o, {acara:false});
    nn.push(note("good","Acara sudah dihitung",
      "Anda menandai ada acara besar. Proyeksi di atas sudah termasuk kenaikannya: <b>+"+rp(da)+"</b>."));
  }
  el("n-notes").innerHTML = nn.join("");
}

/* ---------------- PLAN ---------------- */

function segColor(rate,on){
  if (!on) return "var(--t-off)";
  if (rate>=40000) return "var(--t-hi)";
  if (rate>=28000) return "var(--t-mid)";
  return "var(--t-lo)";
}
function runPlan(){
  var dateStr = el("p-tgl").value || iso(new Date());
  var ctx = dayCtx(dateStr);
  var o = { ctx:ctx, keluar:parseFloat(el("p-keluar").value), pulang:parseFloat(el("p-pulang").value),
    rehat:rehatDariUI(), zona:el("p-zona").value, filter:parseInt(el("p-filter").value,10),
    bat:parseFloat(el("p-bat").value), rumah:el("p-rumah").checked,
    hujan:el("p-hujan").checked, acara:el("p-acara").checked };
  if (o.pulang<=o.keluar){ o.pulang=Math.min(24,o.keluar+1); el("p-pulang").value=o.pulang; }
  /* Rencana untuk HARI INI berangkat dari baterai yang Ibu isi di Mulai hari
     (bukan asumsi 90%), asal jam mulainya tidak jauh sebelum isian itu. */
  var socAwalPlan = null;
  if (typeof MULAI_HARI !== "undefined" && MULAI_HARI && el("p-tgl").value === iso(new Date()) && MULAI_HARI.jam - o.keluar < 1.5){
    o.soc = MULAI_HARI.soc; socAwalPlan = MULAI_HARI.soc;
  }
  var r = simulate(o);
  var jedaR = rehatRange(o.rehat);

  el("p-net").textContent = rp(r.net);
  el("p-net").className = "big "+(r.net>=TARGET_DAY?"ok":(r.net>=TARGET_DAY*0.75?"mid":"bad"));
  el("p-bar").style.width = Math.max(0,Math.min(100,(r.net/TARGET_DAY)*100)).toFixed(1)+"%";

  var from=3.5,to=24,span=to-from,h="";
  r.segs.forEach(function(s){
    var w=((s.e-s.s)/span)*100, lbl=(s.e-s.s)>=1.4?s.n:"";
    h+='<div class="seg'+(s.on?"":" off")+'" style="width:'+w.toFixed(2)+"%;background:"+
       segColor(s.rate,s.on)+'"><span>'+lbl+"</span></div>";
  });
  el("p-tl").innerHTML=h;

  el("p-side").innerHTML = [
    ["Jam efektif", r.effHours.toFixed(1)+" j"], ["Per jam kerja", rp(r.perHour)],
    ["&asymp; Order", Math.round(r.trips)+" &middot; Rp "+Math.round(r.rpOrder).toLocaleString("id-ID")+"/order"],
    ["Km berbayar", Math.round(r.paidKm)+" dari "+Math.round(r.kmTotal)+" km"],
    ["Listrik", dec(r.kwh,1)+" kWh &middot; "+rp(r.listrik)],
    ["Pendapatan blok", rp(r.blockNet)], ["Insentif", rp(r.insentif)],
    ["Sesi SPKLU", r.sessions+"&times;"+(r.sessions ? " &middot; "+Math.round(r.chargeHours*60)+" mnt kerja hilang" : "")],
    ["Baterai", Math.round(r.soc0*100)+"%"+(socAwalPlan != null ? " (Mulai hari)" : "")+" &rarr; terendah "+Math.round(Math.max(0,r.socMinKerja)*100)+"% &rarr; tiba "+Math.round(Math.max(0,r.socTiba)*100)+"%"]
  ].map(function(x){ return "<div><span>"+x[0]+"</span><b>"+x[1]+"</b></div>"; }).join("");
  el("p-ringkas").innerHTML = "Keluar <b>"+hhmm(o.keluar)+"</b>"+(jedaR ? ", jeda <b>"+hhmm(jedaR[0])+"&ndash;"+hhmm(jedaR[1])+"</b>" : ", tanpa jeda")+
    ", pulang <b>"+hhmm(o.pulang)+"</b>: &asymp; <b>"+Math.round(r.trips)+" order</b>, <b>"+Math.round(r.kmTotal)+" km</b> ("+
    Math.round(r.paidKm)+" berbayar), "+(r.sessions ? "<b>"+r.sessions+"&times; ngecas</b> &plusmn;"+Math.round(r.sesi.reduce(function(a,x){return a+x.durasi;},0)*60)+" menit" : "tanpa ngecas")+
    ", bersih <b>"+rp(r.net)+"</b> ("+rp(r.perHour)+" per jam kerja). Sebelum cicilan, asuransi, servis, dan ban.";

  renderSteps(el("p-steps"), buildSteps(o, r,
    { kmHome:ZONA[o.zona].pulang, L:{ z:o.zona, jauh:false }, rencana:true }), "Urutan hari itu");

  var nn=[];
  if (ctx.holi) nn.push(note("warn","Tanggal merah",
    "<b>"+ctx.holi[0]+".</b> Peak pagi tidak ada. Mulai siang, kerjakan mal, kuliner, dan bandara sampai larut."));
  if (ctx.eve) nn.push(note("good","Malam sebelum libur",
    "Besok tanggal merah"+(ctx.evePlus?", awal libur panjang":"")+". <b>Sore dan malam ini arus keluar kota</b> &mdash; bandara, Batu Ceper, Terminal Poris."));
  if (o.keluar>=10.5 && o.keluar<14.5) nn.push(note("bad","Jam termurah",
    "Mulai di blok siang berarti membeli jam paling murah. <b>Lebih untung tidur lagi dan keluar pukul 15:00.</b>"));
  if (r.effHours>12) nn.push(note("bad","Jam kerja",
    "<b>"+r.effHours.toFixed(1)+" jam</b> melewati batas 12 jam pengemudi angkutan umum."));
  else if (r.effHours<=8.4) nn.push(note("good","Sesuai batas kerja",
    "<b>"+r.effHours.toFixed(1)+" jam</b> &mdash; masih di dalam batas 8 jam mengemudi menurut UU Lalu Lintas dan Angkutan Jalan. "+
    "Hasil per jamnya <b>"+rp(r.perHour)+"</b>, biasanya yang tertinggi dari semua pola sif, karena hanya jam peak yang dikerjakan."));
  if (r.sessions) nn.push(note(r.sesi.some(function(x){ return x.peak; }) ? "bad" : "", "Ngecas",
    r.sesi.map(function(x, i){
      return "<b>Sesi "+(i+1)+"</b> pukul "+hhmm(x.jam)+" di "+x.blok.toLowerCase()+": "+Math.round(x.dari*100)+"&rarr;"+Math.round(x.ke*100)+"%, "+
             "&plusmn;"+Math.round(x.durasi*60)+" menit"+(x.diJeda ? " (di dalam jeda, tidak memakan jam kerja)" : ", "+Math.round(x.jamHilang*60)+" menit kerja hilang")+
             (x.peak ? " &mdash; <b>terpaksa di jam peak</b>" : "")+".";
    }).join(" ")+" Biaya layanan "+rp(r.feeCharge)+". Semua penempatan dicoba dan yang termurah dipilih; tiap sesi diisi secukupnya sampai sesi berikutnya atau sampai pulang dengan cadangan (sebelum jeda hanya jembatan kecil, isi penuhnya di jeda)."));
  if (r.socTiba < 0.12) nn.push(note("bad","Baterai tidak cukup",
    "Dengan pola ini Ibu tiba di rumah dengan &plusmn;<b>"+Math.round(Math.max(0,r.socTiba)*100)+"%</b>"+
    (r.sessions >= 3 ? " walau sudah tiga sesi ngecas" : "")+". <b>Pendekkan sif, tambah jeda untuk ngecas, atau berangkat lebih penuh.</b>"));
  else if (r.socMinKerja < r.floor - 0.005) nn.push(note(r.socMinKerja < r.floor - 0.05 ? "bad" : "warn","Baterai sempat di bawah lantai",
    "Ada saat baterai turun ke &plusmn;<b>"+Math.round(Math.max(0,r.socMinKerja)*100)+"%</b>, di bawah lantai "+Math.round(r.floor*100)+"%"+
    (o.zona==="jkt"||o.zona==="mix" ? " untuk Jakarta" : "")+
    (r.socMinKerja >= r.floor - 0.05 ? " &mdash; sengaja dibiarkan karena satu sesi lagi lebih mahal daripada selisihnya. Ambil order pendek saat itu, jangan yang jauh dari SPKLU." : ". Sisipkan jeda ngecas lebih awal atau berangkat lebih penuh.")));
  if (jedaR){
    var makanPeak = BASE.filter(function(b){ return PEAKS[b.n] && Math.min(b.e, jedaR[1]) - Math.max(b.s, jedaR[0]) > 0.25; });
    if (makanPeak.length) nn.push(note("warn","Jeda memakan jam peak",
      "Jeda "+hhmm(jedaR[0])+"&ndash;"+hhmm(jedaR[1])+" memotong <b>"+makanPeak.map(function(b){ return b.n.toLowerCase(); }).join(" dan ")+
      "</b>, blok termahal hari ini. Kalau bisa digeser, geser."));
    var dur = jedaR[1]-jedaR[0], jt = jedaTermurah(o, dur);
    if (jt && jt.net - r.net > 10000) nn.push(note("good","Jeda termurah dengan durasi sama",
      "Jeda <b>"+hhmm(jt.s)+"&ndash;"+hhmm(jt.e)+"</b> ("+Math.round(dur*60)+" menit) menghasilkan <b>"+rp(jt.net)+"</b>, "+
      rp(jt.net - r.net)+" lebih banyak daripada jeda yang dipilih. <button type=\"button\" class=\"linkbtn\" data-jeda=\""+jt.s+","+jt.e+"\">Pakai jeda ini</button>"));
  } else if ((o.pulang - o.keluar) > 4.5){
    var jt2 = jedaTermurah(o, 0.5);
    nn.push(note("warn","Istirahat wajib",
      "Sif "+(o.pulang-o.keluar).toFixed(1)+" jam tanpa jeda. UU Lalu Lintas mewajibkan istirahat 30 menit tiap 4 jam mengemudi."+
      (jt2 ? " Jeda 30 menit termurah: <b>"+hhmm(jt2.s)+"&ndash;"+hhmm(jt2.e)+"</b> ("+(jt2.net - r.net >= 0 ? "+" : "\u2212")+rp(Math.abs(jt2.net - r.net))+"). <button type=\"button\" class=\"linkbtn\" data-jeda=\""+jt2.s+","+jt2.e+"\">Pakai jeda ini</button>" : "")));
  }
  var batasPulang = (ctx.dow === 0 && !ctx.holi) ? 20.5 : 22;
  if (o.pulang > batasPulang + 0.01) nn.push(note("bad","Lewat batas pulang",
    "Jam pulang <b>"+hhmm(o.pulang)+"</b> melewati batas "+(batasPulang === 20.5 ? "Minggu 20:30 (Senin pagi menuntut segar)" : "keras 22:00")+
    ". Protokol pulang di daftar tetap dijadwalkan sebelum batas itu; jam sesudahnya dihitung, tapi dokumen Rute 700K bilang: jangan."));
  if (ctx.dow === 6 && !ctx.holi && o.keluar < 7.5) nn.push(note("","Sabtu",
    "Tidak ada peak pagi komuter. Rute 700K menyarankan mulai <b>07:30</b>; blok pagi Sabtu dinilai lebih rendah oleh mesin."));
  if (ctx.dow === 0 && !ctx.holi && o.keluar < 7) nn.push(note("","Minggu",
    "Pagi tenang; Rute 700K menyarankan mulai <b>07:00</b> dan selesai <b>20:30</b>."));
  if (ctx.dow === 1 && !ctx.holi && o.keluar > 4.75 && o.keluar <= 5.25) nn.push(note("","Senin",
    "Peak pagi Senin paling berat; Rute 700K menyarankan berangkat <b>04:45</b>."));
  if (ctx.gajian) nn.push(note("good","Musim gajian",
    "Tanggal 25&ndash;5: permintaan naik di hampir semua blok (mesin memakai +5%, asumsi). Pakai jadwal penuh, bukan split."));
  if ((o.zona==="jkt"||o.zona==="mix") && !r.filterOK) nn.push(note("bad","Jatah filter kurang",
    "Bekerja di Jakarta butuh satu jatah Filter Tujuan per peak untuk pulang berbayar (09:00 dan 21:15). Dengan "+o.filter+" jatah, "+
    (o.filter ? "peak pagi" : "kedua peak")+" dihitung hanya 35% dari kelebihan tarif Jakarta."));
  /* Arah balik: apa yang terjadi di lapangan masuk ke tab Rencana. */
  if (AKTUAL && AKTUAL.tanggal === dateStr && AKTUAL.dpt > 0){
    var sampai = simulate({ ctx:ctx, keluar:o.keluar, pulang:Math.max(o.keluar,AKTUAL.jam),
      rehat:o.rehat, zona:o.zona, filter:o.filter, bat:o.bat, rumah:o.rumah,
      hujan:o.hujan, acara:o.acara });
    var beda = AKTUAL.dpt - sampai.gross;
    nn.push(note(beda>=0?"good":"warn","Dari lapangan",
      "Pukul <b>"+hhmm(AKTUAL.jam)+"</b> di <b>"+AKTUAL.lok+"</b>, tab Sekarang mencatat sudah dapat <b>"+
      rp(AKTUAL.dpt)+"</b>. Menurut rencana ini seharusnya sekitar <b>"+rp(sampai.gross)+"</b> (kotor) &mdash; "+
      (beda>=0 ? "<b>unggul "+rp(beda)+"</b>." : "<b>tertinggal "+rp(-beda)+"</b>.")+
      " Sisa harinya tetap dihitung dari posisi nyata di tab Sekarang, bukan dari rencana ini."));
  }
  if (ctx.ev) nn.push(note("good","Acara sudah dihitung",
    "<b>"+ctx.ev[0]+"</b> di "+ctx.ev[1]+" masuk dari kalender otomatis dan sudah tercermin di angka serta urutan langkah di atas."));
  if (o.hujan){
    var dhp = dampak(o, {hujan:false});
    nn.push(note("warn","Hujan sudah dihitung",
      ((WEATHER && WEATHER.hujan && WEATHER.tanggal===dateStr)
        ? "Prakiraan "+(WEATHER.sumber||"BMKG")+(WEATHER.jam?" ("+WEATHER.jam+")":"")+" masuk otomatis. " : "")+
      "Angka di atas sudah termasuk kenaikannya: <b>+"+rp(dhp)+"</b> dibanding hari kering."));
  }
  el("p-notes").innerHTML = nn.join("");
  Array.prototype.forEach.call(el("p-notes").querySelectorAll("[data-jeda]"), function(b){
    b.addEventListener("click", function(){
      var v = b.getAttribute("data-jeda").split(",");
      setJedaUI([parseFloat(v[0]), parseFloat(v[1])]); runPlan();
    });
  });

  var best=-1, res=PRESETS.map(function(p){
    var rr=simulate({ctx:ctx,keluar:p.k,pulang:p.p,rehat:p.r,zona:o.zona,filter:o.filter,
      bat:o.bat,rumah:o.rumah,hujan:o.hujan,acara:o.acara});
    if (rr.net>best) best=rr.net; return {p:p,r:rr};
  });
  el("cmphead").textContent = ctx.name+(ctx.holi?" · tanggal merah":"")+" · "+ZONA[o.zona].label;
  el("cmp").innerHTML = res.map(function(x){
    return '<tr'+(x.r.net===best?' class="best"':"")+'><td class="n">'+x.p.n+"</td><td>"+
      hhmm(x.p.k)+"&ndash;"+hhmm(x.p.p)+"</td><td>"+x.r.effHours.toFixed(1)+" j</td><td>"+
      rp(x.r.net)+"</td><td>"+rp(x.r.perHour)+"</td></tr>";
  }).join("");
  var gap=best-r.net;
  el("p-vs").innerHTML = gap>5000
    ? "Target Rp 515.000 &middot; sif terbaik <b>"+rp(best)+"</b>, selisih "+rp(gap)
    : "Target Rp 515.000 &middot; <b>ini sif terbaik untuk kondisi itu</b>";
}

/* ---------------- TANYA ----------------
   Asisten di dalam aplikasi. Ia hanya menerima apa yang ada di halaman ini
   — catatan Ibu, rencana hari ini, cuaca, tarif blok. Tidak punya jalan ke
   data lain mana pun. Percakapan disimpan di HP ini saja. */
/* Apa yang SEDANG ditampilkan halaman. Tanpa ini Tanya menyimpulkan ulang
   dari fakta mentah sementara di sebelahnya kartu langkah sudah dihitung --
   dua otak yang tidak saling bicara, dan jawabannya terasa seperti template
   karena memang tidak punya apa-apa untuk ditanggapi. */
var SEKARANG = null;

/* Proyeksi halaman disimpan per hari, lalu dipasangkan dengan hasil nyata
   yang Ibu catat malamnya. Gunanya bukan hiasan: tarif blok jam masih
   tebakan saya, dan satu-satunya cara mengetahui SEBERAPA meleset tebakan
   itu adalah membandingkan proyeksi dengan kenyataan berulang kali.
   Tanya diberi tahu selisihnya supaya jawabannya bisa mengoreksi sendiri.

   TIDAK dipakai untuk mengubah angka proyeksi secara otomatis: begitu Ibu
   punya 3 hari catatan, CALIB sudah mengoreksi dari arah lain (Rp/km,
   km/kWh, insentif). Mengoreksi dua kali dari data yang sama akan
   menghitung ganti rugi yang sama dua kali. */
var LSPROY = "riwayat-proyeksi";
function catatProyeksi(tanggal, nilai){
  try {
    var m = JSON.parse(localStorage.getItem(LSPROY) || "{}") || {};
    if (!m[tanggal]) m[tanggal] = { awal: Math.round(nilai), jam: hhmm(parseFloat(el("n-jam").value)) };
    m[tanggal].akhir = Math.round(nilai);
    var kunci = Object.keys(m).sort();
    while (kunci.length > 40) { delete m[kunci.shift()]; }   /* simpan 40 hari saja */
    localStorage.setItem(LSPROY, JSON.stringify(m));
  } catch (e) {}
}
function bandingProyeksi(){
  var out = [], rasio = [];
  try {
    var m = JSON.parse(localStorage.getItem(LSPROY) || "{}") || {};
    rows.slice(0, 14).forEach(function(r){
      var p = m[r.id]; if (!p || !p.awal) return;
      var nyata = derive(r).net;
      if (!(nyata > 0)) return;
      out.push({ id:r.id, jam:p.jam, proy:p.awal, nyata:Math.round(nyata) });
      rasio.push(nyata / p.awal);
    });
  } catch (e) {}
  rasio.sort(function(a,b){ return a-b; });
  return { baris: out, tengah: rasio.length ? rasio[Math.floor(rasio.length/2)] : null };
}
var CHAT = [], LSC = "tanya-riwayat";
var CONTOH = ["Sekarang enaknya ke mana?", "Pulang sekarang atau lanjut?",
              "Kenapa langkahnya begitu?", "Masih kuat nggak baterainya?",
              "Hari ini kejar berapa?"];

function muatChat(){
  try { CHAT = JSON.parse(localStorage.getItem(LSC) || "[]") || []; } catch (e) { CHAT = []; }
}
function simpanChat(){
  try { localStorage.setItem(LSC, JSON.stringify(CHAT.slice(-40))); } catch (e) {}
}
function renderChat(){
  var n = el("chatlog");
  if (!CHAT.length){
    n.innerHTML = '<div class="chat-empty">Belum ada pertanyaan. Coba salah satu di bawah, atau ketik sendiri.</div>';
  } else {
    n.innerHTML = CHAT.map(function(m){
      return '<div class="bubble '+(m.role==="user"?"me":"ai")+'">'+
             String(m.content).replace(/&/g,"&amp;").replace(/</g,"&lt;")+"</div>";
    }).join("");
    n.scrollTop = n.scrollHeight;
  }
  el("chatchips").innerHTML = CONTOH.map(function(c){
    return "<button type=\"button\">"+c+"</button>"; }).join("");
  Array.prototype.forEach.call(el("chatchips").children, function(b){
    b.addEventListener("click", function(){ el("chatinput").value = b.textContent; kirimChat(); });
  });
}

/* Teks di halaman penuh entitas HTML dan tag tebal; dibersihkan dulu supaya
   yang sampai ke Tanya kalimat biasa, bukan markup. */
function rapi(x){
  return String(x == null ? "" : x)
    .replace(/<[^>]*>/g, "")
    .replace(/&middot;/g, "·").replace(/&rarr;/g, "->").replace(/&mdash;/g, "--")
    .replace(/&ndash;/g, "-").replace(/&amp;/g, "&").replace(/&le;/g, "<=")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/<br\s*\/?>/g, " ").trim();
}
/* Semua yang diketahui asisten, dirakit dari halaman ini saja. */
function konteksTanya(){
  var d = new Date(), ctx = dayCtx(iso(d));
  var L = currentLok();
  var jam = parseFloat(el("n-jam").value), pulang = parseFloat(el("n-pulang").value);
  var soc = parseFloat(el("n-soc").value)||0, dpt = parseFloat(el("n-dpt").value)||0;
  var baris = ["=== HARI INI ===",
    "Tanggal " + iso(d) + ", " + ctx.name + (ctx.holi ? " (TANGGAL MERAH: "+ctx.holi[0]+")" : ""),
    ctx.eve ? "Besok tanggal merah - malam ini arus keluar kota." : "",
    ctx.ev ? ("Acara besar: "+ctx.ev[0]+" di "+ctx.ev[1]) : "",
    WEATHER && WEATHER.tanggal===iso(d) ? ("Cuaca: "+(WEATHER.hujan?("hujan "+(WEATHER.jam||"")):"tidak hujan")) : "",
    "",
    "=== POSISI DAN KEADAAN ===",
    "Posisi: " + L.n + ", " + Math.round(L.home) + " km dari rumah (Modernland, Kota Tangerang)",
    "Jam sekarang " + hhmm(jam) + ", rencana pulang " + hhmm(pulang),
    "Sisa baterai " + soc + "%, minimum untuk pulang dari sini " + L.res + "%",
    "Sudah dapat hari ini Rp " + Math.round(dpt).toLocaleString("id-ID"),
    "Mobil BYD Atto 1 listrik, " + el("n-bat").value + " kWh, isi cepat maksimum 40 kW",
    "",
    "=== TARIF TIAP BLOK JAM (bersih per jam) ===",
    BASE.map(function(b){
      return hhmm(b.s)+"-"+hhmm(b.e)+" "+b.n+": "+rp(blockRate(b, ctx.shapeDay));
    }).join("\n"),
    "",
    "=== ANGKA IBU ===",
    CALIB.live ? ("Terkalibrasi dari "+CALIB.n+" hari: Rp "+Math.round(CALIB.rpkm)+
                  "/km berpenumpang, insentif "+rp(CALIB.ins)+", "+dec(CALIB.kmkwh,1)+" km/kWh")
               : "Belum terkalibrasi - masih memakai asumsi: Rp 2.900/km, insentif Rp 130.000, 6,7 km/kWh",
    "Target: Rp 515.000 per hari, Rp 13,4 juta per bulan dari sekitar 26 hari kerja",
    "Ambang sehat: 15 km berbayar per jam untuk Rp 500rb, 22 untuk Rp 700rb"
  ];

  /* Apa yang halaman SUDAH simpulkan. Tanya bertugas menilai ini, bukan
     menyusun ulang dari nol. */
  if (SEKARANG){
    baris.push("", "=== YANG SUDAH DIHITUNG HALAMAN (nilai ini, jangan diulang) ===",
      "Kartu langkah berikutnya: " + rapi(SEKARANG.v.h),
      "  rutenya: " + rapi(SEKARANG.v.r),
      "  alasannya: " + rapi(SEKARANG.v.p),
      "Proyeksi sampai pulang Rp " + Math.round(SEKARANG.proyeksi).toLocaleString("id-ID") +
        " (target harian Rp 515.000, " +
        (SEKARANG.gap > 0 ? "kurang Rp " + Math.round(SEKARANG.gap).toLocaleString("id-ID")
                          : "sudah lewat Rp " + Math.round(-SEKARANG.gap).toLocaleString("id-ID")) + ")",
      "Sesi ngecas yang direncanakan: " + SEKARANG.r.sessions + "x",
      "Daya cukup untuk " + Math.round(SEKARANG.usableKm) + " km, sampai pulang butuh " +
        Math.round(SEKARANG.butuh) + " km");
    baris.push("Urutan langkah sampai pulang:");
    SEKARANG.langkah.forEach(function(x){
      baris.push("  " + rapi(x.t).replace(/\s+/g," ") + " | " + rapi(x.b) + " | " + rapi(x.s) + " | " + x.v);
    });
  }

  /* Watak dan stasiun di kecamatan tempat dia berdiri. */
  var wkT = SEKARANG ? watakLok(SEKARANG.L) : null;
  if (wkT){
    var isiT = wkT.kode.split("").map(function(c){
      return WATAK_ARTI[c] ? WATAK_ARTI[c][0] : ""; }).filter(function(x){return x;}).join(", ");
    var lemT = (wkT.i >= 0) ? KRLL[wkT.i] : 0;
    baris.push("", "=== WATAK TEMPAT INI (" + wkT.kec + ") ===",
      isiT ? ("Yang ada di sekitar sini: " + isiT) : "Belum ada data jenis tempat di sini.",
      lemT ? ("Stasiun di sini: tengah hari (10:00-15:00) keretanya tinggal " +
              Math.round(lemT*100) + "% dari jam ramai. Ini dari jadwal resmi KRL.")
           : "Tidak ada stasiun KRL berjadwal di kecamatan ini.");
  }

  /* PILIHAN LAIN, dengan angkanya. Tanpa ini Tanya cuma tahu keadaan di
     tempat Ibu berdiri -- kalau ditanya "ke BSD atau bandara?" dia hanya
     bisa berpendapat, tidak bisa menghitung. Sekarang dia punya jarak
     terukur, ambang daya, watak, dan lembah stasiun untuk tiap tempat yang
     memang punya nama di daftar Ibu. */
  baris.push("", "=== TEMPAT LAIN YANG BISA DIBANDINGKAN ===",
    "(km = jarak pulang terukur ke rumah; daya min = sisa baterai yang dibutuhkan dari situ)");
  LOK.forEach(function(l){
    if (l.lat == null) return;
    var w = watakDi(l.lat, l.lon);
    var kode = w && w.kode ? w.kode.split("").map(function(c){
      return WATAK_ARTI[c] ? WATAK_ARTI[c][0].toLowerCase() : ""; })
      .filter(function(x){return x;}).join("/") : "";
    var lem = (w && w.i >= 0) ? KRLL[w.i] : 0;
    baris.push("  " + l.n + ": " + Math.round(l.home) + " km, daya min " + l.res + "%" +
      (kode ? ", " + kode : "") +
      (lem ? ", stasiunnya tengah hari tinggal " + Math.round(lem*100) + "%" : "") +
      (l.id === (SEKARANG && SEKARANG.L.id) ? "   <- posisi Ibu sekarang" : ""));
  });

  /* SKENARIO PULANG, dihitung betulan oleh mesin yang sama. "Pulang sekarang
     atau lanjut" itu pertanyaan tersering dan paling mahal; Tanya tidak
     boleh menjawabnya dengan perasaan kalau angkanya bisa dihitung. */
  if (SEKARANG){
    var o0 = SEKARANG.o, r0 = SEKARANG.r;
    baris.push("", "=== KALAU PULANGNYA DIGESER (hitungan mesin, bukan perkiraan kasar) ===");
    var terakhirP = -1;
    [0, 1, 2, 3].forEach(function(tambah){
      var p2 = Math.min(23.5, o0.pulang + tambah);
      if (tambah > 0 && p2 <= o0.pulang) return;
      /* Dijepit di 23:30, jadi dua langkah terakhir bisa jatuh ke jam yang
         sama; jangan disebut dua kali. */
      if (p2 === terakhirP) return;
      terakhirP = p2;
      var o2 = {}; Object.keys(o0).forEach(function(k){ o2[k] = o0[k]; });
      o2.pulang = p2;
      var r2 = simulate(o2);
      var selisih = r2.net - r0.net;
      baris.push("  pulang " + hhmm(p2) + ": bersih Rp " +
        Math.round(r2.net).toLocaleString("id-ID") +
        (tambah === 0 ? "   (rencana sekarang)"
                      : "   selisih " + (selisih>=0?"+":"") + "Rp " +
                        Math.round(selisih).toLocaleString("id-ID")) +
        ", sesi ngecas " + r2.sessions + "x, jam efektif " + r2.effHours.toFixed(1));
    });
    baris.push("  Catatan: selisih itu sudah termasuk biaya sesi ngecas tambahan " +
               "kalau km-nya memicu satu sesi lagi.");
  }

  /* SPKLU terdekat dari posisinya sekarang. */
  var spT = SEKARANG ? spkluUntuk(SEKARANG.L) : null;
  if (spT && spT.length){
    baris.push("", "=== SPKLU TERDEKAT DARI POSISI IBU (jarak jalan terukur) ===");
    spT.forEach(function(x){ baris.push("  " + x.nama + ": " + x.km + " km"); });
    baris.push("  Jenis colokan dan dayanya TIDAK diketahui -- belum tercatat di sumber " +
               "terbuka mana pun. Jangan menjanjikan bahwa salah satunya cocok untuk Atto 1.");
  }

  /* Rekam jejak proyeksi halaman ini sendiri. */
  var bp = bandingProyeksi();
  if (bp.baris.length){
    baris.push("", "=== SEBERAPA TEPAT PROYEKSI HALAMAN INI SELAMA INI ===");
    bp.baris.forEach(function(x){
      baris.push("  " + x.id + " (dilihat " + x.jam + "): halaman memproyeksikan Rp " +
        x.proy.toLocaleString("id-ID") + ", hasil nyatanya Rp " + x.nyata.toLocaleString("id-ID") +
        " (" + Math.round(x.nyata/x.proy*100) + "%)");
    });
    if (bp.tengah){
      var pct = Math.round((bp.tengah - 1) * 100);
      baris.push("  Median: hasil nyata " +
        (Math.abs(pct) < 5 ? "kira-kira sama dengan proyeksi"
         : (pct > 0 ? pct + "% DI ATAS proyeksi" : Math.abs(pct) + "% DI BAWAH proyeksi")) +
        ". Pakai ini untuk menimbang, dan sebutkan ke Ibu kalau relevan. " +
        "Jangan mengalikan ulang angka proyeksi dengan rasio ini: kalau catatan Ibu " +
        "sudah 3 hari, mesin sudah dikoreksi dari arah lain dan itu jadi dobel.");
    }
  }

  /* Batas pengetahuan, ditulis terus terang supaya Tanya tidak menyajikan
     tebakan saya seolah-olah hasil ukur. */
  baris.push("", "=== MANA YANG TERUKUR, MANA YANG ASUMSI ===",
    "TERUKUR (boleh dipakai dengan yakin):",
    "  - Jarak pulang tiap kecamatan: diukur lewat peta jalan, meleset median 3,2%",
    "  - Ambang sisa daya: dari jarak itu, sudah ditambah margin luas kecamatan",
    "  - Jadwal KRL: dari jadwal resmi. TAPI menghitung kereta, bukan penumpang",
    "  - Tanggal merah dan kalender acara besar",
    "ASUMSI SAYA (sebutkan kalau jawaban bertumpu pada ini):",
    "  - Tarif tiap blok jam di atas: perkiraan, BUKAN hasil ukur",
    "  - Pengali hari (Jumat 1,15 dsb) dan pengali wilayah: perkiraan",
    "  - Blok subuh 03:30-05:15: hipotesis murni, belum ada datanya sama sekali",
    (CALIB.kecUkur
      ? ("  - Kecepatan pulang " + Math.round(CALIB.kecepatan) + " km/jam: TERUKUR dari " +
         CALIB.kecN + " catatan Ibu sendiri.")
      : "  - Kecepatan pulang 26 km/jam: tebakan, belum diuji. Ia menentukan kapan Ibu " +
        "disuruh mulai pulang, jadi sebutkan kalau jawabanmu bergantung pada waktu tempuh."),
    "  - Insentif dihitung RATA menurut jam. Kalau insentif Grab bertingkat",
    "    (target sekian trip), bentuknya beda jauh: trip terakhir menjelang",
    "    target jauh lebih berharga, dan berhenti sedikit sebelum target",
    "    kehilangan seluruh bonus. Halaman belum tahu bentuk aslinya.",
    (CALIB.live ? "  - Rp/km, insentif, km/kWh SUDAH dari catatan Ibu sendiri, bukan asumsi."
                : "  - Rp/km, insentif, km/kWh masih asumsi. Ibu belum mencatat 3 hari."));
  var recent = rows.slice(0, 10);
  if (recent.length){
    baris.push("", "=== CATATAN 10 HARI TERAKHIR ===");
    recent.forEach(function(r){
      var dv = derive(r), dt = new Date(r.id+"T00:00:00");
      baris.push(r.id+" "+DAYNAME[dt.getDay()]+" jam="+num(r.jam)+" trip="+num(r.trip)+
        " km="+num(r.kmt)+" kmBayar="+num(r.kmp)+
        " kmBayarPerJam="+(dv.kmjam==null?"?":dv.kmjam.toFixed(1))+
        " bersih=Rp"+Math.round(dv.net)+(r.cat?(" catatan="+r.cat):""));
    });
  }
  if (PLAN && PLAN.date === iso(d)){
    baris.push("", "=== RENCANA HARI INI ===",
      "Keluar "+hhmm(PLAN.keluar)+", pulang "+hhmm(PLAN.pulang)+
      ", wilayah "+ZONA[PLAN.zona].label+", jeda "+rehatTeks(PLAN.rehat));
  }
  return baris.filter(function(x){ return x !== ""; }).join("\n");
}

/* Fungsi halaman yang boleh dipanggil Claude sendiri saat menjawab.
   Sebelumnya Tanya hanya menerima teks: kalau Ibu bertanya sesuatu yang
   tidak saya duga -- "kalau saya mulai jam 4 subuh dan pulang jam 2 siang?"
   -- dia harus mengarang perkiraan. Sekarang dia bisa MENJALANKAN mesin
   yang sama dengan halaman ini dan menjawab dengan angka sungguhan.

   Ongkosnya nyata: tiap putaran alat itu satu permintaan terpisah, dan
   jawaban bisa jadi lebih lambat. Karena itu skenario yang paling sering
   ditanya tetap dihitung di muka dan ikut di konteks -- alat cuma dipakai
   untuk yang di luar itu. */
function alatTanya(){
  return [
    {
      name: "hitung_skenario",
      description: "Hitung hasil bersih satu hari kerja memakai mesin yang sama dengan halaman ini. " +
        "Pakai untuk menjawab pertanyaan 'bagaimana kalau' dengan angka sungguhan, bukan perkiraan. " +
        "Mengembalikan bersih, jam efektif, Rp per jam, jumlah sesi ngecas, dan km tempuh.",
      inputSchema: {
        type: "object",
        properties: {
          keluar: { type:"number", description:"jam mulai dalam desimal, mis. 5.25 = 05:15, 3.5 = 03:30" },
          pulang: { type:"number", description:"jam pulang dalam desimal, mis. 21.5 = 21:30" },
          zona:   { type:"string", description:"tng (Tangerang saja), mix (Tangerang+Jakarta peak), jkt (Jakarta dominan), apt (fokus bandara)" },
          rehat:  { type:"string", description:"none, full (10:30-15:00), short (13:00-15:00), duapeak (09:30-16:45)" },
          soc:    { type:"number", description:"sisa baterai persen saat mulai; kosongkan kalau tidak disebut" },
          hujan:  { type:"boolean", description:"anggap hujan" }
        },
        required: ["keluar", "pulang"]
      },
      execute: function(inp){
        var keluar = Number(inp.keluar), pulang = Number(inp.pulang);
        if (!isFinite(keluar) || !isFinite(pulang)) throw new Error("jam keluar dan pulang harus angka desimal");
        if (pulang <= keluar) throw new Error("jam pulang harus lebih besar dari jam keluar");
        var z = String(inp.zona || (SEKARANG ? SEKARANG.L.z : "tng"));
        if (!ZONA[z]) z = "tng";
        var rh = String(inp.rehat || "none");
        if (["none","full","short","duapeak"].indexOf(rh) < 0 && !rehatRange(rh)) rh = "none";
        var o2 = { ctx: dayCtx(iso(new Date())), keluar:keluar, pulang:pulang, rehat:rh, zona:z,
                   filter: SEKARANG ? SEKARANG.o.filter : 2,
                   bat: parseFloat(el("n-bat").value), rumah: el("n-rumah").checked,
                   hujan: inp.hujan === true || (inp.hujan == null && el("n-hujan").checked),
                   acara: el("n-acara").checked };
        if (inp.soc != null && isFinite(Number(inp.soc))) o2.soc = Number(inp.soc);
        var r2 = simulate(o2);
        return {
          jam: hhmm(keluar) + "-" + hhmm(pulang), wilayah: ZONA[z].label, istirahat: rh,
          bersih_rp: Math.round(r2.net), jam_efektif: Number(r2.effHours.toFixed(1)),
          rp_per_jam: Math.round(r2.perHour), sesi_ngecas: r2.sessions,
          km_tempuh: Math.round(r2.km),
          catatan: "Tarif blok jam yang dipakai mesin ini perkiraan, bukan hasil ukur."
        };
      }
    },
    {
      name: "cari_daerah",
      description: "Cari satu kecamatan di Jabodetabek dari namanya. Mengembalikan jarak pulang " +
        "terukur ke rumah, sisa baterai minimum yang dibutuhkan dari sana, wataknya, dan " +
        "seberapa sepi stasiunnya tengah hari. Pakai kalau Ibu menyebut tempat yang tidak " +
        "ada di daftar tempat pembanding.",
      inputSchema: { type:"object", properties:{ nama:{ type:"string", description:"nama kecamatan, mis. Cikarang Utara" } }, required:["nama"] },
      execute: function(inp){
        var t = cariKecamatan(String(inp.nama || ""));
        if (!t) throw new Error("tidak ada kecamatan bernama itu di 183 yang terukur");
        var i = KEC.indexOf(t.kec);
        var kmAman = Math.max(t.kec[4] * 1.08, t.kec[4] + 1.35 * (i >= 0 ? RKEC[i] : 0));
        var kode = (i >= 0 && WATAK[i]) ? WATAK[i] : "";
        var lem = (i >= 0) ? KRLL[i] : 0;
        return {
          nama: t.kec[0] + ", " + INDUK[t.kec[1]],
          km_pulang_terukur: t.kec[4],
          daya_minimum_persen: Math.round(kmAman/2 + 15),
          wilayah_tarif: ZONA[t.kec[6]] ? ZONA[t.kec[6]].label : t.kec[6],
          watak: kode ? kode.split("").map(function(c){
            return WATAK_ARTI[c] ? WATAK_ARTI[c][0] : ""; }).filter(function(x){return x;}).join(", ")
            : "belum ada data jenis tempat di sana",
          stasiun_tengah_hari: lem ? (Math.round(lem*100) + "% dari jam ramai") : "tidak ada stasiun KRL berjadwal",
          catatan_ambigu: t.catatan ? rapi(t.catatan) : ""
        };
      }
    }
  ];
}

function kirimChat(){
  var q = el("chatinput").value.trim();
  if (!q) return;
  if (!sampler){
    el("tanyastatus").textContent = "Belum tersambung ke Claude";
    CHAT.push({role:"user", content:q});
    CHAT.push({role:"assistant", content:"Saya belum tersambung ke Claude di HP ini. "+
      "Isi kunci API sekali di bagian \"Sambungan ke Claude\" di bawah, lalu tanyakan lagi."});
    el("chatinput").value = "";
    renderChat(); simpanChat();
    var pnl = el("ai-panel"); if (pnl) pnl.scrollIntoView({behavior:"smooth", block:"start"});
    return;
  }
  el("chatinput").value = "";
  CHAT.push({role:"user", content:q});
  CHAT.push({role:"assistant", content:"Sedang berpikir…"});
  renderChat(); simpanChat();
  el("chatsend").disabled = true; el("tanyastatus").textContent = "Menjawab…";

  /* Prompt ini pernah mengunci jawaban di 120 kata dan cuma menyodorkan
     fakta mentah. Hasilnya terasa seperti template: benar tapi tidak
     menimbang apa pun, dan tidak pernah menanggapi apa yang sudah
     ditampilkan halaman di sebelahnya. Sekarang tugasnya dinaikkan --
     BERNALAR dengan data yang ada, bukan membacakannya. */
  var sistem =
    "Kamu asisten pribadi Shanti, pengemudi GrabCar yang tinggal di Modernland, Kota Tangerang. " +
    "Panggil dia Ibu. Bahasa Indonesia yang hangat dan sederhana, seperti orang yang duduk di " +
    "sebelahnya dan ikut memikirkan harinya -- bukan seperti aplikasi yang membacakan angka.\n\n" +

    "CARA MENJAWAB:\n" +
    "1. Jawab pertanyaannya dulu, satu kalimat, tanpa pembuka.\n" +
    "2. Lalu tunjukkan alasannya pakai angka yang ada di bawah. Kamu BOLEH DAN HARUS " +
    "menghitung sendiri: kurangi, bagi, bandingkan. Contoh: sisa jam dikali tarif blok, " +
    "km pulang dibanding daya tersisa, selisih dua pilihan dalam rupiah.\n" +
    "3. Kalau ada lebih dari satu pilihan masuk akal, sebutkan keduanya dengan angkanya, " +
    "lalu bilang mana yang kamu pilih dan kenapa. Jangan menyodorkan daftar tanpa pendapat.\n" +
    "4. Tutup dengan apa yang bisa membuat jawabanmu salah, kalau memang ada.\n\n" +

    "PANJANGNYA mengikuti pertanyaannya. Pertanyaan pendek -- \"masih kuat nggak baterainya?\" -- " +
    "dijawab pendek. Pertanyaan yang menentukan -- \"pulang sekarang atau lanjut?\" -- layak " +
    "beberapa paragraf. Jangan memotong penalaran cuma demi ringkas.\n\n" +

    "MENILAI HALAMAN, BUKAN MENGULANGNYA. Di bawah ada bagian YANG SUDAH DIHITUNG HALAMAN. " +
    "Itu kesimpulan mesinnya. Tugasmu menanggapi: jelaskan kenapa begitu kalau Ibu bertanya, " +
    "atau BANTAH kalau menurut data ada yang lebih masuk akal. Kamu boleh tidak setuju dengan " +
    "kartu langkah -- sebutkan alasannya. Yang dilarang cuma mengulanginya kata per kata.\n\n" +

    "JUJUR SOAL BATAS. Bagian MANA YANG TERUKUR, MANA YANG ASUMSI itu penting. " +
    "Kalau jawabanmu bertumpu pada angka terukur, jawab dengan yakin. Kalau bertumpu pada " +
    "asumsi -- tarif blok, pengali hari, bentuk insentif, blok subuh -- katakan itu dalam " +
    "satu kalimat singkat. Jangan menyajikan tebakan seperti hasil ukur, dan jangan juga " +
    "meragukan segalanya sampai jawabannya jadi tidak berguna.\n\n" +

    "KAMU PUNYA DUA ALAT. hitung_skenario menjalankan mesin hitung halaman ini dengan jam, " +
    "wilayah, atau istirahat apa pun yang kamu mau -- pakai kalau Ibu bertanya 'bagaimana kalau' " +
    "dan jawabannya belum ada di daftar skenario di bawah. cari_daerah memberi jarak terukur, " +
    "ambang daya, dan watak untuk kecamatan mana pun di Jabodetabek. Panggil alat kalau itu " +
    "membuat jawabanmu berdiri di atas angka; jangan panggil kalau angkanya sudah ada di bawah, " +
    "karena tiap panggilan membuat Ibu menunggu lebih lama.\n\n" +

    (sampler.sumber === "api"
      ? "ALAT KETIGA, web_search, hanya untuk hal yang berubah HARI INI di luar aplikasi: berita kemacetan " +
        "atau penutupan jalan, banjir, acara mendadak, gangguan di bandara. Sebutkan sumbernya dalam " +
        "beberapa kata. Jangan dipakai untuk yang sudah ada di data di bawah.\n\n"
      : "") +

    "KALAU DATANYA TIDAK ADA, bilang tidak tahu, lalu sebutkan apa yang perlu dicatat atau " +
    "dicek supaya lain kali bisa dijawab. Jangan mengarang angka, sekali pun.\n\n" +

    "DUA HAL YANG TIDAK BISA DITAWAR:\n" +
    "- Kalau sisa baterai di bawah ambang aman untuk pulang, itu yang pertama disebut, " +
    "sebelum urusan uang.\n" +
    "- Jangan pernah menyarankan kerja melewati 12 jam. Target Ibu bulanan, bukan harian; " +
    "kekurangan hari ini lebih murah ditutup di hari yang kuat.\n\n" +
    konteksTanya();

  var turns = [{role:"user", content: sistem + "\n\n=== PERTANYAAN IBU ===\n" + q}];
  var riwayat = CHAT.slice(0,-2).slice(-12);
  if (riwayat.length){
    turns = riwayat.concat([{role:"user", content: sistem + "\n\n=== PERTANYAAN IBU ===\n" + q}]);
    if (turns[0].role !== "user") turns.shift();
  }

  /* modelTier "complex": penalarannya lebih dalam, tapi jawabannya lebih
     lama -- dan Ibu membacanya sambil di jalan. Kalau terasa lambat,
     turunkan ke "default"; nilainya cuma satu kata di baris ini. */
  var alat = alatTanya();
  if (sampler.sumber === "api") alat = alat.concat([{ type:"web_search_20260209", name:"web_search", max_uses:3 }]);
  sampler(turns, { modelTier:"complex", tools:alat, onText:function(ev){
    CHAT[CHAT.length-1].content = ev.text; renderChat();
  }}).then(function(res){
    CHAT[CHAT.length-1].content = res.text;
    renderChat(); simpanChat();
    el("chatsend").disabled = false; el("tanyastatus").textContent = "";
  })["catch"](function(err){
    var c = (err && err.code) || "error";
    CHAT[CHAT.length-1].content = c==="rate_limited"
      ? "Terlalu sering bertanya. Tunggu sebentar, lalu coba lagi."
      : "Maaf, gagal menjawab (" + c + "). Coba lagi sebentar lagi.";
    renderChat(); simpanChat();
    el("chatsend").disabled = false; el("tanyastatus").textContent = "";
  });
}

function renderUji(){
  var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
  var h = ujiMandiri();
  var t1 = (window.performance && performance.now) ? performance.now() : Date.now();
  var unik = {}; h.langgar.forEach(function(x){ unik[x.split(" — ")[0]] = (unik[x.split(" — ")[0]]||0)+1; });
  var kunci = Object.keys(unik);
  var n = el("ujihasil");
  if (!h.langgar.length){
    n.className = "uji ok";
    n.innerHTML = "<b>"+h.n.toLocaleString("id-ID")+" kombinasi diperiksa, semua aturan terpenuhi.</b> "+
      (ATURAN.length+2)+" aturan &middot; "+Math.round(t1-t0)+" md.";
  } else {
    n.className = "uji bad";
    n.innerHTML = "<b>"+h.langgar.length+" pelanggaran dari "+h.n.toLocaleString("id-ID")+" kombinasi.</b><br>"+
      kunci.map(function(k){ return "&bull; "+k+" ("+unik[k]+"&times;)"; }).join("<br>")+
      "<br><span style='opacity:.75'>Contoh: "+h.langgar.slice(0,3).join(" | ")+"</span>";
  }
}

/* ---------------- LOG ---------------- */
var F=["tgl","jam","trip","dpt","ins","kmt","kmp","kwh","biaya","mnt","cat"];
function preview(){
  var r={}; F.forEach(function(k){ r[k]=el(k).value; });
  var d=derive(r), any=num(r.dpt)>0||num(r.kmt)>0;
  function set(id,txt,good){ el(id).textContent=txt; el(id).className="v"+(txt==="—"?"":(good?" good":" warn")); }
  set("pv-net", any?rp(d.net):"—", d.net>=TARGET_DAY);
  set("pv-jam", d.perjam==null?"—":rp(d.perjam), d.perjam>=42000);
  set("pv-kmj", d.kmjam==null?"—":dec(d.kmjam,1), d.kmjam>=15);
  set("pv-util",d.util==null?"—":dec(d.util,0)+"%", d.util>=75);
  set("pv-eff", d.eff==null?"—":dec(d.eff,1), d.eff>=6.7);
}
function tile(l,v,c,s){ return '<div class="tile '+s+'"><span class="lbl">'+l+
  '</span><span class="val">'+v+'</span><span class="cmp">'+c+"</span></div>"; }
function renderCal(){
  var recent=rows.slice(0,14);
  el("calbasis").textContent = recent.length ? "Rata-rata "+recent.length+" hari" : "Belum ada data";
  var a=avgOf(recent,function(d){return d.rpkm;}), b=avgOf(recent,function(d){return d.eff;});
  var c=avgOf(recent,function(d){return d.util;}), e=avgOf(recent,function(d){return d.kmjam;});
  el("caltiles").innerHTML =
    tile("Rp / km penumpang", a?Math.round(a.v).toLocaleString("id-ID"):"—","asumsi <b>2.900</b>",
      a?(a.v>=2900?"ok":(a.v>=2465?"low":"bad")):"") +
    tile("km / kWh", b?dec(b.v,1):"—","asumsi <b>6,7</b>",
      b?(b.v>=6.7?"ok":(b.v>=5.7?"low":"bad")):"") +
    tile("Utilisasi", c?dec(c.v,0)+"%":"—","target <b>75%</b>",
      c?(c.v>=75?"ok":(c.v>=62?"low":"bad")):"") +
    tile("Km bayar / jam", e?dec(e.v,1):"—","ambang <b>15</b> &middot; <b>22</b>",
      e?(e.v>=15?"ok":"low"):"");
  if (a){
    var dl=Math.round(((a.v-BASE_RPKM)/BASE_RPKM)*100);
    el("calnote").innerHTML = "Rp per km Anda <b>"+(dl>=0?dl+"% di atas":Math.abs(dl)+"% di bawah")+
      "</b> asumsi rencana"+(CALIB.live?" &mdash; dan sudah dipakai mesin di tab Sekarang dan Rencana.":".");
  }
}
function weekMonth(){
  var now=new Date(), y=now.getFullYear(), m=now.getMonth();
  var pre=y+"-"+String(m+1).padStart(2,"0")+"-", sum=0, worked=0;
  rows.forEach(function(r){ if (String(r.id).indexOf(pre)===0){ sum+=derive(r).net; worked++; } });
  el("monthname").textContent = now.toLocaleDateString("id-ID",{month:"long",year:"numeric"});
  el("mnet").textContent = rp(sum);
  el("mbar").style.width = Math.max(0,Math.min(100,(sum/TARGET_MONTH)*100)).toFixed(1)+"%";
  var dim=new Date(y,m+1,0).getDate(), left=dim-now.getDate();
  var lw=Math.max(0,Math.round(left*6/7)), rem=TARGET_MONTH-sum, msg;
  if (!worked) msg="Belum ada catatan bulan ini. Target <b>"+rp(TARGET_MONTH)+"</b> dari sekitar <b>"+
    Math.round(dim*6/7)+"</b> hari kerja.";
  else if (rem<=0) msg='<span class="up">Target bulan ini sudah tercapai.</span> Kelebihan <b>'+rp(-rem)+"</b>.";
  else if (lw<=0) msg="Bulan hampir habis. Kurang <b>"+rp(rem)+"</b>.";
  else { var need=rem/lw, cls=need<=515000?"up":(need<=620000?"":"dn");
    msg=worked+" hari tercatat &middot; sisa sekitar <b>"+lw+"</b> hari kerja &middot; perlu <b class=\""+
      cls+"\">"+rp(need)+"</b> per hari"+(cls==="up"?" &mdash; Anda sedang unggul":(cls==="dn"?" &mdash; kejar di hari kuat":"")); }
  el("pace").innerHTML=msg;
}
function renderHist(){
  el("histcount").textContent = rows.length ? rows.length+" hari tercatat" : "";
  el("histempty").style.display = rows.length ? "none" : "block";
  el("hist").innerHTML = rows.slice(0,30).map(function(r){
    var d=derive(r), dt=new Date(r.id+"T00:00:00"), hd=HOLI[r.id];
    return "<tr><td class=\"n\">"+r.id+(r.cat?' <span style="color:var(--muted)">· '+r.cat+"</span>":"")+
      "</td><td>"+DAYNAME[dt.getDay()].slice(0,3)+(hd?" ●":"")+"</td><td>"+(num(r.jam)||"—")+
      "</td><td>"+(num(r.trip)||"—")+"</td><td>"+(num(r.kmt)||"—")+"</td><td>"+
      (d.util==null?"—":dec(d.util,0)+"%")+"</td><td>"+(d.kmjam==null?"—":dec(d.kmjam,1))+
      "</td><td class=\"n\">"+rp(d.net)+"</td></tr>";
  }).join("");
  el("ask").disabled = !(sampler && rows.length>=3);
}
function petunjukMenit(){
  var e = el("mnthint"); if (!e) return;
  var tgl = el("tgl").value || iso(new Date());
  if (AKTUAL && AKTUAL.tanggal === tgl && AKTUAL.home > 0){
    e.innerHTML = "Dari <b>" + esc(AKTUAL.lok) + "</b>, " + Math.round(AKTUAL.home) + " km";
  } else {
    e.textContent = "Isi hanya kalau tab Sekarang dipakai hari itu — km-nya diambil dari sana.";
  }
}
function renderAll(){ recalibrate(); renderCal(); weekMonth(); renderHist(); runNow(); runPlan(); petunjukMenit(); }

el("save").addEventListener("click", function(){
  var tgl = el("tgl").value || iso(new Date());
  var rec = { id:tgl };
  F.forEach(function(k){ if (k!=="tgl") rec[k] = (k==="cat") ? el(k).value : num(el(k).value); });
  /* Menit pulang tidak ada artinya tanpa tahu berapa km yang ditempuh. Km-nya
     diambil dari posisi terakhir yang tercatat di tab Sekarang hari itu, jadi
     Ibu cukup mengetik satu angka. */
  if (rec.mnt > 0 && AKTUAL && AKTUAL.tanggal === tgl && AKTUAL.home > 0) rec.pkm = AKTUAL.home;
  if (!rec.dpt && !rec.kmt){ el("status").textContent="Isi minimal pendapatan atau km."; el("status").className="status err"; return; }
  rec.diubah = new Date().toISOString();   /* untuk penggabungan saat sinkron */
  rows = rows.filter(function(r){ return r.id!==rec.id; }); rows.push(rec); sortRows();
  lsWrite(rows); renderAll();
  el("status").textContent="Tersimpan."; el("status").className="status ok";
  sinkronNanti();
});
F.forEach(function(k){ el(k).addEventListener("input", preview); });

/* ---------- cadangan: salin ke papan klip, pulihkan dari tempelan ---------- */
function teksCadangan(){
  return "BUKU SETORAN SHANTI - " + iso(new Date()) + " - " + rows.length + " hari\n" +
         JSON.stringify({ v:1, dibuat:iso(new Date()), harian:rows });
}
function setCad(t, cls){
  var s = el("cadstatus"); s.textContent = t;
  s.className = "status" + (cls ? " " + cls : "");
}
el("salin").addEventListener("click", function(){
  if (!rows.length){ setCad("Belum ada catatan untuk disalin.", "err"); return; }
  var teks = teksCadangan();
  function manual(){
    el("cadwrap").hidden = false;
    el("cadteks").value = teks;
    el("cadteks").select();
    setCad("Tidak bisa menyalin sendiri — tekan lama di kotak bawah, lalu pilih Salin.", "err");
  }
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(teks).then(function(){
      setCad(rows.length + " hari tersalin. Tinggal tempel ke WhatsApp.", "ok");
    })["catch"](manual);
  } else manual();
});

el("pulihkan").addEventListener("click", function(){
  var w = el("cadwrap");
  if (w.hidden){
    w.hidden = false; el("cadteks").value = ""; el("cadteks").focus();
    setCad("Tempel salinannya di kotak bawah, lalu tekan Pulihkan lagi.");
    return;
  }
  var t = el("cadteks").value.trim();
  if (!t){ setCad("Kotaknya masih kosong.", "err"); return; }
  var mulai = t.indexOf("{");
  if (mulai < 0){ setCad("Tidak menemukan data di teks itu.", "err"); return; }
  var data;
  try { data = JSON.parse(t.slice(mulai)); }
  catch (e){ setCad("Salinannya tidak lengkap atau rusak. Minta dikirim ulang.", "err"); return; }
  if (!data || !data.harian || !data.harian.length){ setCad("Tidak ada catatan di dalamnya.", "err"); return; }

  /* Gabungkan: catatan yang sudah ada di HP ini tidak ditimpa. */
  var ada = {}; rows.forEach(function(r){ ada[r.id] = true; });
  var tambah = 0;
  data.harian.forEach(function(r){ if (r && r.id && !ada[r.id]){ rows.push(r); tambah++; } });
  sortRows(); lsWrite(rows); renderAll(); sinkronNanti();
  w.hidden = true; el("cadteks").value = "";
  setCad(tambah ? (tambah + " hari dipulihkan, total sekarang " + rows.length + " hari.")
                : "Semua catatan di salinan itu sudah ada di sini.", "ok");
});

el("p-save").addEventListener("click", function(){
  savePlan({ date: el("p-tgl").value || iso(new Date()),
    keluar:parseFloat(el("p-keluar").value), pulang:parseFloat(el("p-pulang").value),
    rehat:rehatDariUI(), zona:el("p-zona").value,
    filter:parseInt(el("p-filter").value,10), bat:parseFloat(el("p-bat").value),
    rumah:el("p-rumah").checked, hujan:el("p-hujan").checked, acara:el("p-acara").checked });
  sinkronNanti();
  el("p-status").textContent = "Tersimpan. Tab Sekarang akan membandingkan ke rencana ini.";
  el("p-status").className = "status ok";
  runNow();
});

el("ask").addEventListener("click", function(){
  if (!sampler) return;
  var btn=el("ask"); btn.disabled=true;
  el("aistatus").textContent="Menganalisa…"; el("aistatus").className="status"; el("aiout").textContent="";
  var lines = rows.slice(0,14).map(function(r){
    var d=derive(r), dt=new Date(r.id+"T00:00:00");
    return [r.id, DAYNAME[dt.getDay()], "jam="+num(r.jam), "trip="+num(r.trip), "km="+num(r.kmt),
      "kmBayar="+num(r.kmp), "util="+(d.util==null?"?":Math.round(d.util)+"%"),
      "kmBayarPerJam="+(d.kmjam==null?"?":d.kmjam.toFixed(1)),
      "bersih="+Math.round(d.net), r.cat?("catatan="+r.cat):""].join(" ");
  }).join("\n");
  sampler("Anda menganalisa catatan harian pengemudi GrabCar di Tangerang dengan BYD Atto 1 listrik. "+
    "Target bulanan Rp 13,4 juta dari sekitar 26 hari kerja, rata-rata Rp 515rb per hari. "+
    "Ambang sehat 15 km berbayar per jam (22 untuk Rp 700rb), utilisasi 75%, 6,7 km/kWh. "+
    "Blok termahal: peak pagi 05:15-09:30 dan peak sore 17:00-20:00 (~Rp 45rb/jam); blok siang 11:00-15:15 hanya Rp 20-24rb/jam.\n\n"+
    "Catatan (terbaru dulu):\n"+lines+"\n\nJawab dalam Bahasa Indonesia, maksimal 200 kata. "+
    "Beri TEPAT TIGA saran konkret berdasarkan angka di atas, sebut angkanya. "+
    "Kalau ada pola hari tertentu, sebutkan. Langsung tiga poin bernomor, tanpa pembuka.",
    { modelTier:"default", onText:function(ev){ el("aiout").textContent=ev.text; } })
    .then(function(res){ el("aiout").textContent=res.text; el("aistatus").textContent=""; btn.disabled=false; })
    ["catch"](function(err){
      var c=(err&&err.code)||"error";
      el("aistatus").textContent = c==="rate_limited" ? "Terlalu sering. Coba lagi nanti." : "Gagal ("+c+").";
      el("aistatus").className="status err"; btn.disabled=false;
    });
});

/* ---------------- boot ---------------- */
var now = new Date();
el("today").innerHTML = DAYNAME[now.getDay()] + ", " +
  now.toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"}) +
  " &middot; <span id='jamhidup'></span><em id='todaysub'></em>";
jamHidup();
var hd = HOLI[iso(now)];
document.getElementById("todaysub").textContent = hd ? hd[0] : "";

renderLok("kota");
fillTimes(el("n-jam"),3.5,23.5,9.5);
fillTimes(el("n-pulang"),9,24,21.5);
fillTimes(el("p-keluar"),3.5,17,5.25);
fillTimes(el("p-pulang"),9,24,21.5);
var t = Math.round((now.getHours()+now.getMinutes()/60)*4)/4;
if (t>=3.5 && t<=23.5) el("n-jam").value = t;
el("tgl").value = iso(now); el("p-tgl").value = iso(now);

["n-jam","n-lok","n-soc","n-dpt","n-pulang","n-tujuan","n-bat","n-filter","n-hujan","n-acara","n-rumah"]
  .forEach(function(id){ el(id).addEventListener("change",runNow); el(id).addEventListener("input",runNow); });
el("n-lok").addEventListener("change", function(){
  if (this.value === "__lain"){
    el("ketikwrap").hidden = false;
    setHint("Ketik nama daerah, lalu tekan Petakan");
    el("n-ketik").focus();
  } else {
    lastLok = this.value;
    el("ketikwrap").hidden = true;
    el("n-ketik").value = "";
    /* renderLok menyetel .value lewat program dan itu tidak memicu "change",
       jadi sampai di sini artinya Ibu sendiri yang memilih. */
    setLokSumber("manual");
    setGpsHint("");
  }
}, true);
/* Fase capture, supaya tercatat sebelum runNow menggambar. renderLok dan
   ikutJam menyetel .value lewat program dan itu tidak memicu "change",
   jadi sampai di sini artinya Ibu sendiri yang memilih. */
el("n-jam").addEventListener("change", function(){ jamManual = true; jamManualSejak = Date.now(); tandaiJam(); }, true);
/* Angka baterai yang Ibu ketik sendiri menjadi jangkar baru perkiraan. */
el("n-soc").addEventListener("change", function(){
  this.dataset.touched = "1";
  var v = parseFloat(this.value);
  if (isFinite(v) && v >= 1 && v <= 100 && Baterai.terakhir()){ Baterai.jangkar(jamSekarangTepat(), Math.round(v), "diketik"); this.dataset.touched = ""; }
}, true);
el("jam-auto").addEventListener("click", function(){ ikutJam(true); });
tandaiJam();
/* Diperiksa tiap 30 detik: cukup rapat untuk kotak seperempat jam, dan
   tidak melakukan apa pun kalau jamnya belum berpindah. */
setInterval(function(){ if (!document.hidden) ikutJam(false); }, 30000);
document.addEventListener("visibilitychange", function(){ if (!document.hidden) ikutJam(false); });
el("n-ketik").addEventListener("keydown", function(e){
  if (e.key === "Enter"){ e.preventDefault(); resolveKetik(); }
});
el("n-petakan").addEventListener("click", resolveKetik);
el("n-gps").addEventListener("click", function(){ deteksiLokasi(false); });
el("n-gpsauto").checked = gpsOtomatisAktif();
el("n-gpsauto").addEventListener("change", function(){
  try { localStorage.setItem("gps-otomatis", this.checked ? "1" : "0"); } catch (e) {}
  if (this.checked){ gpsTerakhir = 0; pasangGpsOtomatis(); }
  else { setLokSumber("manual");
    setGpsHint("Deteksi otomatis dimatikan. Tekan Lokasi saya kalau perlu."); }
});
tandaiLok();
if (gpsOtomatisAktif()) setGpsHint("Memeriksa lokasi…");
pasangGpsOtomatis();
["p-tgl","p-keluar","p-pulang","p-zona","p-filter","p-bat","p-rumah","p-hujan","p-acara"]
  .forEach(function(id){ el(id).addEventListener("change",runPlan); });
/* Ganti tanggal rencana: acara dan cuaca ikut menyesuaikan sendiri. */
el("p-tgl").addEventListener("change", function(){
  var d = el("p-tgl").value;
  el("p-acara").checked = !!EVENTS[d];
  if (WEATHER && WEATHER.tanggal === d && !el("p-hujan").dataset.touched)
    el("p-hujan").checked = !!WEATHER.hujan;
  runPlan();
});

function tab(which){
  ["now","log","plan","tanya"].forEach(function(k){
    el("t-"+k).className = "tab" + (which===k ? " on" : "");
    el("v-"+k).hidden = which!==k;
  });
}
["now","log","plan","tanya"].forEach(function(k){
  el("t-"+k).addEventListener("click", function(){ tab(k); });
});
el("chatsend").addEventListener("click", kirimChat);
el("chatinput").addEventListener("keydown", function(e){
  if (e.key === "Enter"){ e.preventDefault(); kirimChat(); }
});
el("chatclear").addEventListener("click", function(){
  CHAT = []; simpanChat(); renderChat();
});
muatChat(); renderChat();

/* Panduan: terbuka saat pertama kali dibuka, lalu diingat pilihannya. */
(function(){
  var sudah = false;
  try { sudah = localStorage.getItem("panduan-dibaca") === "1"; } catch (e) {}
  el("panduan").hidden = sudah;
  function tutup(){
    el("panduan").hidden = true;
    try { localStorage.setItem("panduan-dibaca","1"); } catch (e) {}
  }
  el("panduan-tutup").addEventListener("click", tutup);
  el("panduan-btn").addEventListener("click", function(){
    var p = el("panduan");
    p.hidden = !p.hidden;
    if (!p.hidden) p.scrollIntoView({behavior:"smooth", block:"start"});
  });
})();

loadPlan(); muatRegistri();
/* Acara hasil pencarian web yang tersimpan di HP ikut masuk kalender sebelum
   hitungan pertama, supaya hari ini langsung memakainya. */
(function(){ var a = Acara.baca(); if (a && a.daftar) Acara.terapkan(a.daftar); })();
/* Daftar lokasi dibangun di renderLok("kota") di atas, SEBELUM catatan
   lokasi dimuat -- jadi tanpa baris ini semua tempat yang pernah Ibu
   simpan hilang dari daftar tiap kali halaman dibuka lagi. Datanya tidak
   hilang, cuma tidak ikut tampil. Bug ini sudah ada sejak lama. */
renderLok(el("n-lok").value || "kota");
/* Rencana hari ini mengisi tab Sekarang, supaya tidak perlu diketik dua kali. */
if (PLAN && PLAN.date === iso(now)){
  el("n-pulang").value = PLAN.pulang;
  el("n-bat").value    = PLAN.bat;
  el("n-filter").value = PLAN.filter;
  el("n-rumah").checked = !!PLAN.rumah;
  ["p-keluar","p-pulang","p-zona","p-filter","p-bat"].forEach(function(id){
    var v = { "p-keluar":PLAN.keluar, "p-pulang":PLAN.pulang,
              "p-zona":PLAN.zona, "p-filter":PLAN.filter, "p-bat":PLAN.bat }[id];
    if (v != null) el(id).value = v;
  });
  setJedaUI(PLAN.rehat);
  el("p-rumah").checked = !!PLAN.rumah;
  el("p-hujan").checked = !!PLAN.hujan;
  el("p-acara").checked = !!PLAN.acara;
}
if (EVENTS[iso(now)]) el("n-acara").checked = true;
/* Fase capture: penanda "manual" harus tercatat sebelum runNow menggambar. */
el("n-acara").addEventListener("change", function(){ this.dataset.touched = "1"; }, true);
el("n-hujan").addEventListener("change", function(){ this.dataset.touched = "1"; }, true);
rows = lsRead(); sortRows(); renderAll(); preview();
/* Pemeriksaan TIDAK berjalan sendiri: di HP ia menghentikan tampilan
   sampai belasan detik, dan halaman terlihat seperti tidak mau terbuka. */
el("ujijalan").addEventListener("click", function(){
  el("ujistatus").textContent = "Memeriksa…";
  el("ujijalan").disabled = true;
  setTimeout(function(){
    renderUji();
    el("ujistatus").textContent = "";
    el("ujijalan").disabled = false;
  }, 30);
});

/* Versi aplikasi, dan kapan kalendernya habis. */
function renderSegar(){
  var n = el("segar"); if (!n) return;
  var hariIni = iso(new Date());
  function selisihHari(a, b){
    return Math.round((new Date(b+"T00:00:00") - new Date(a+"T00:00:00")) / 86400000);
  }
  var umur = selisihHari(TERBIT, hariIni);
  var pesan = [], kelas = "quiet";

  if (umur < -1){
    /* Tanggal HP lebih awal dari tanggal terbit -- jamnya yang salah, dan itu
       merusak tanggal merah, kalender acara, dan seluruh saldo bulanan. */
    n.hidden = false; n.className = "flag warn";
    n.innerHTML = '<span class="tag">Tanggal HP</span><span><b>Tanggal di HP ini ('+hariIni+
      ') lebih awal daripada tanggal halaman dibuat ('+TERBIT+').</b> Berarti jam atau tanggal '+
      'HP-nya salah &mdash; dan itu membuat hari, tanggal merah, dan saldo bulanan di halaman ini '+
      'ikut salah. <b>Betulkan tanggal HP dulu</b>, baru angka di bawah bisa dipercaya.</span>';
    return;
  }

  pesan.push("Aplikasi versi <b>"+TERBIT+"</b>"+(umur>0?" &middot; "+umur+" hari lalu":" &middot; hari ini")+
    ". Versi baru diambil sendiri saat aplikasi dibuka dengan sambungan internet.");

  if (hariIni > EVENTS_SAMPAI){ kelas = "warn";
    pesan.push("<b>Kalender acara besar sudah habis</b> &mdash; isinya berhenti di "+
      EVENTS_SAMPAI+". Konser dan pameran setelah tanggal itu tidak akan muncul sendiri; "+
      "pakai centang &ldquo;Acara besar&rdquo; kalau Ibu tahu ada.");
  }
  if (hariIni > HOLI_SAMPAI){ kelas = "warn";
    pesan.push("<b>Kalender tanggal merah juga tinggal tanggal yang pasti saja</b> untuk "+
      "tahun depan, karena SKB-nya belum terbit waktu halaman ini dibuat.");
  }

  var nWeb = Object.keys(EVENTS).filter(function(k){ return EVENTS[k][3] === "web"; }).length;
  if (nWeb) pesan.push("Kalender acara ditambah <b>" + nWeb + " acara dari pencarian web</b>.");
  n.hidden = false;
  n.className = "flag " + kelas;
  n.innerHTML = '<span class="tag">Umur halaman</span><span>' + pesan.join(" ") + "</span>";
}
renderSegar();

/* Cuaca: diambil dari Open-Meteo (js/cuaca.js); CUACA di js/data.js hanya cadangan.

   Satu baris dulu menelan TIGA keadaan yang sangat berbeda -- belum pernah
   diisi, diisi tapi tanggalnya sudah lewat, dan diisi untuk hari ini -- lalu
   menyembunyikan kotaknya pada dua yang pertama. Ibu tidak punya cara tahu
   bahwa fitur cuacanya sedang mati; dia hanya melihat halaman yang tampak
   baik-baik saja. Keluarga bug yang sama dengan GPS yang gagal diam-diam.

   Ini penting karena penerbitan ulang TIDAK sampai sendiri ke pembaca:
   tautan berbagi dipatok ke satu versi, dan patokan itu harus digeser
   manual tiap kali. Jadi cuaca basi bukan kemungkinan langka -- itu keadaan
   bawaannya sampai ada yang menggeser patokan. Kalau begitu keadaannya,
   satu-satunya jalan yang jujur adalah mengatakannya dan menunjuk ke
   centang Hujan, bukan diam. */
var cuacaTerpasang = null;
function terapkanCuaca(c){
  var n = el("cuaca"), hariIni = iso(new Date());
  cuacaTerpasang = c && c.diambil || null;
  if (c && c.tanggal === hariIni){
    WEATHER = c;
    n.hidden = false;
    n.className = "flag" + (c.hujan ? " warn" : " quiet");
    n.innerHTML = '<span class="tag">Cuaca hari ini</span><span>' +
      (c.hujan
        ? "<b>Diperkirakan hujan" + (c.jam ? " sekitar " + c.jam : "") + ".</b> " +
          "Permintaan dan tarif dinamis naik &mdash; tapi hindari titik banjir di Periuk, Ciledug, dan sebagian Jakarta Barat, dan <b>jangan menembus genangan lebih dari 15 cm</b>."
        : "<b>Diperkirakan tidak hujan.</b>") +
      (c.ringkas ? " " + c.ringkas : "") +
      ' <span style="opacity:.7">&mdash; ' + (c.sumber || "BMKG") +
      (c.diambil ? ", diambil " + hhmm(new Date(c.diambil).getHours() + new Date(c.diambil).getMinutes()/60) : "") +
      "</span>" + Cuaca.pita(c) + "</span>";
    if (c.hujan){
      if (!el("n-hujan").dataset.touched) el("n-hujan").checked = true;
      if (!el("p-hujan").dataset.touched && el("p-tgl").value === c.tanggal) el("p-hujan").checked = true;
      runNow(); runPlan();
    }
    return;
  }
  n.hidden = false;
  n.className = "flag quiet";
  n.innerHTML = '<span class="tag">Cuaca hari ini</span><span>' +
    "<b>Prakiraan hari ini belum terambil dari internet.</b>" +
    (c && c.tanggal ? " Yang tersimpan tertanggal " + c.tanggal + " &mdash; sudah lewat, jadi tidak dipakai." : "") +
    " Akan dicoba lagi saat ada sambungan. Sementara itu <b>lihat langitnya, lalu centang " +
    "&ldquo;Hujan&rdquo; sendiri</b> kalau mendung &mdash; seluruh hitungan di bawah langsung ikut menyesuaikan." +
    "</span>";
}
terapkanCuaca(CUACA);
function segarkanCuaca(){
  Cuaca.ambil().then(function(c){ if (c && c.diambil !== cuacaTerpasang) terapkanCuaca(c); });
}
segarkanCuaca();
document.addEventListener("visibilitychange", function(){ if (!document.hidden) segarkanCuaca(); });
window.addEventListener("online", segarkanCuaca);
el("n-hujan").addEventListener("change", function(){ this.dataset.touched = "1"; });
el("p-hujan").addEventListener("change", function(){ this.dataset.touched = "1"; });

/* ---------------- tautan pengaturan ----------------
   Mengetik kunci sepanjang 100 huruf di HP mengundang salah ketik. Anak bisa
   membuat tautan sekali pakai dari komputernya dan mengirimnya ke HP Ibu:
     https://chrissdr1.github.io/chrissdr1/#kunci=sk-ant-...&repo=pemilik/nama&token=github_pat_...&tomtom=...
   Bagian setelah # tidak pernah dikirim ke server mana pun (browser tidak
   menyertakannya dalam permintaan). Halaman membacanya, menyimpannya di HP
   ini, lalu menghapusnya dari alamat supaya tidak tinggal di riwayat browser.
   Harus berjalan SEBELUM pasangAI() dan sinkron, yang membaca simpanan itu. */
var PENGATURAN_DARI_TAUTAN = [];
(function(){
  var h = location.hash ? location.hash.slice(1) : "";
  if (!h || h.indexOf("=") < 0) return;
  var p = {};
  h.split("&").forEach(function(kv){
    var i = kv.indexOf("=");
    if (i > 0){ try { p[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1)).trim(); } catch (e) {} }
  });
  if (p.kunci){ AI.setKey(p.kunci); PENGATURAN_DARI_TAUTAN.push("kunci Claude"); }
  if (p.tomtom){ Peta.setKunciTomTom(p.tomtom); PENGATURAN_DARI_TAUTAN.push("kunci TomTom"); }
  if (p.token){
    var c = Sinkron.cfg();
    Sinkron.setCfg({ repo:(p.repo || c.repo || Sinkron.BAWAAN.repo), path:Sinkron.BAWAAN.path, token:p.token });
    PENGATURAN_DARI_TAUTAN.push("sinkron GitHub" + (p.repo ? " (" + p.repo + ")" : ""));
  }
  if (!PENGATURAN_DARI_TAUTAN.length) return;
  try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  var n = el("tautan");
  if (n){
    n.hidden = false; n.className = "flag";
    n.innerHTML = '<span class="tag">Pengaturan</span><span><b>Tersimpan dari tautan: ' + PENGATURAN_DARI_TAUTAN.join(", ") +
      ".</b> Tautannya sudah dihapus dari alamat; tidak perlu disimpan. Kalau pengaturannya ditolak, pesannya muncul di tab Tanya atau Catatan.</span>";
  }
})();

/* ---------------- sambungan ke Claude ---------------- */
function tandaiAI(){
  var st = AI.status(), e = el("aistat"), k = AI.getKey();
  /* Label mengikuti sampler yang benar-benar ada, bukan dugaan: di claude.ai
     window.claude bisa ada tanpa izin "sample" -- itu tetap "belum ada kunci". */
  var teks = (sampler && sampler.sumber === "artifact") ? "Lewat claude.ai" :
             sampler ? "Kunci tersimpan" :
             k ? "Kunci ada, belum tersambung" :
             st === "no_sdk" ? "SDK tidak termuat" : "Belum ada kunci";
  if (e) e.textContent = teks;
  el("tanyastatus").textContent = sampler ? "" : "Belum tersambung";
  el("ai-key").placeholder = k ? "tersimpan · ····" + k.slice(-4) : "sk-ant-…";
  el("ai-clear").hidden = !k;
}
function setAiStatus(t, cls){ var s = el("ai-status"); s.textContent = t; s.className = "status" + (cls ? " " + cls : ""); }
function pasangAI(){
  AI.connect().then(function(ns){
    sampler = ns || null;
    el("ask").disabled = !(sampler && rows.length >= 3);
    tandaiAI();
    briefingOtomatis();
    if (sampler && sampler.sumber === "api" && Acara.perluSegar() && navigator.onLine !== false)
      setTimeout(function(){ segarkanAcara(true); }, 4000);
  })["catch"](function(){ sampler = null; tandaiAI(); });
}
el("ai-save").addEventListener("click", function(){
  var k = el("ai-key").value.trim();
  if (!k){ setAiStatus("Tempel kuncinya dulu.", "err"); return; }
  AI.setKey(k); el("ai-key").value = "";
  setAiStatus("Memeriksa kunci…");
  AI.uji().then(function(){ setAiStatus("Tersambung. Tab Tanya dan Analisa sudah bisa dipakai.", "ok"); pasangAI(); },
    function(err){
      var c = err && err.code;
      setAiStatus(c === "unauthorized" ? "Kunci ditolak Anthropic. Periksa lagi, lalu simpan ulang." :
                  c === "offline" ? "Kunci tersimpan, tapi tidak ada sambungan internet untuk memeriksanya." :
                  "Kunci tersimpan, tapi pemeriksaan gagal (" + c + ").", c === "offline" ? "" : "err");
      pasangAI();
    });
});
el("ai-key").addEventListener("keydown", function(e){ if (e.key === "Enter"){ e.preventDefault(); el("ai-save").click(); } });
el("ai-test").addEventListener("click", function(){
  setAiStatus("Memeriksa…");
  AI.uji().then(function(){ setAiStatus("Tersambung.", "ok"); },
    function(err){ var c = err && err.code;
      setAiStatus(c === "no_key" ? "Belum ada kunci." : c === "unauthorized" ? "Kunci ditolak Anthropic." :
                  c === "offline" ? "Tidak ada sambungan internet." : "Gagal (" + c + ").", "err"); });
});
el("ai-clear").addEventListener("click", function(){
  AI.setKey(""); sampler = null; el("ask").disabled = true;
  setAiStatus("Kunci dihapus dari HP ini."); tandaiAI();
});
pasangAI();

/* ---------------- peta ---------------- */
function petaLinkMacet(){
  var a = el("peta-macet"); if (!a) return;
  var L0 = currentLok(), p = POSISI_GPS;
  var lat = p ? p.lat : (L0.lat != null ? L0.lat : RUMAH.lat);
  var lon = p ? p.lon : (L0.lon != null ? L0.lon : RUMAH.lon);
  a.href = Peta.tautanMacet(lat, lon);
  el("peta-status").textContent = p ? "dipusatkan di posisi GPS Ibu" : "dipusatkan di " + L0.n;
}
function petaPosisi(){
  if (POSISI_GPS && Peta.ada()) Peta.posisi(POSISI_GPS.lat, POSISI_GPS.lon, POSISI_GPS.akurasi);
  petaLinkMacet();
}
function tampilkanPeta(){
  var box = el("peta");
  box.hidden = false; el("peta-actions").hidden = false; el("peta-toggle").textContent = "Sembunyikan peta";
  Peta.init(box, function(id){
    renderLok(id); lastLok = id; setLokSumber("manual"); setGpsHint(""); runNow(); petaLinkMacet();
  });
  Peta.refresh();
  var L0 = currentLok();
  if (!POSISI_GPS && L0.lat != null) Peta.fokus(L0.lat, L0.lon, 12);
  petaPosisi();
}
el("peta-toggle").addEventListener("click", function(){
  if (el("peta").hidden) tampilkanPeta();
  else { el("peta").hidden = true; el("peta-actions").hidden = true; this.textContent = "Tampilkan peta"; }
});
el("n-lok").addEventListener("change", petaLinkMacet);
petaLinkMacet();

/* ---------------- kalender acara dari web ---------------- */
function renderAcara(){
  var a = Acara.baca(), list = Acara.mendatang(12);
  el("acara-head").textContent = "Bawaan sampai " + EVENTS_SAMPAI +
    (a && a.diambil ? " · web " + String(a.diambil).slice(0, 10) : " · web belum diambil");
  el("acara-daftar").innerHTML = list.length ? list.map(function(x){
    return '<div class="acara-row"><span class="t">' + x.tanggal + '</span><span class="a"><b>' + esc(x.nama) + "</b> " +
      esc(x.tempat) + "<em>" + (x.zona === "lokal" ? "wilayah kerja" : "Jakarta") +
      (x.sumber === "web" ? " · dari pencarian web" : " · kalender bawaan") + "</em></span></div>";
  }).join("") : '<div class="empty">Belum ada acara mendatang di kalender.</div>';
}
function setAcaraStatus(t, cls){ var s = el("acara-status"); s.textContent = t; s.className = "status" + (cls ? " " + cls : ""); }
function segarkanAcara(otomatis){
  if (!sampler || sampler.sumber !== "api"){
    if (!otomatis) setAcaraStatus("Butuh kunci API: isi di tab Tanya, bagian Sambungan ke Claude.", "err");
    return;
  }
  setAcaraStatus("Mencari di web…"); el("acara-segar").disabled = true;
  Acara.segarkan(sampler).then(function(r){
    setAcaraStatus(r.total + " acara ditemukan, " + r.jumlah + " masuk kalender.", "ok");
    renderAcara(); renderSegar();
    if (EVENTS[iso(new Date())] && !el("n-acara").dataset.touched) el("n-acara").checked = true;
    runNow(); runPlan();
  }, function(err){
    var c = (err && err.code) || "error";
    setAcaraStatus(c === "rate_limited" ? "Terlalu sering, coba lagi nanti." :
                   c === "bad_json" ? "Jawaban pencarian tidak bisa dibaca; coba lagi." : "Gagal (" + c + ").", "err");
  }).then(function(){ el("acara-segar").disabled = false; });
}
el("acara-segar").addEventListener("click", function(){ segarkanAcara(false); });
renderAcara();

/* ---------------- sinkron ke GitHub (untuk anak) ---------------- */
var sinkronTimer = null, sinkronJalan = false;
function setSkStatus(t, cls){ var s = el("sk-status"); s.textContent = t; s.className = "status" + (cls ? " " + cls : ""); }
function tandaiSinkron(){
  var c = Sinkron.cfg();
  el("sk-stat").textContent = Sinkron.aktif() ? "Aktif · " + c.repo : "Belum diatur";
  if (!el("sk-repo").value) el("sk-repo").value = c.repo || Sinkron.BAWAAN.repo;
  el("sk-token").placeholder = c.token ? "tersimpan · ····" + String(c.token).slice(-4) : "github_pat_…";
  el("sk-clear").hidden = !c.token;
}
function jalankanSinkron(){
  if (!Sinkron.aktif() || sinkronJalan) return Promise.resolve();
  sinkronJalan = true; setSkStatus("Menyinkronkan…");
  return Sinkron.sinkron(rows, PLAN).then(function(r){
    sinkronJalan = false;
    if (r.status === "tersinkron"){
      if (JSON.stringify(r.rows) !== JSON.stringify(rows)){ rows = r.rows; sortRows(); lsWrite(rows); renderAll(); }
      var j = new Date();
      setSkStatus("Tersinkron " + hhmm(j.getHours() + j.getMinutes()/60) + " · " + r.jumlah + " hari di repo", "ok");
    } else if (r.status === "offline") setSkStatus("Tidak ada internet; disinkronkan begitu tersambung.");
    else if (r.status === "nonaktif") setSkStatus("");
    else setSkStatus(r.status === "unauthorized" ? "Token ditolak GitHub. Periksa token dan izin Contents-nya." :
                     r.status === "notfound" ? "Repo tidak ditemukan. Buat dulu repo privatnya, atau periksa namanya." :
                     "Gagal sinkron (" + r.status + ").", "err");
  });
}
function sinkronNanti(){
  if (!Sinkron.aktif()) return;
  clearTimeout(sinkronTimer); sinkronTimer = setTimeout(jalankanSinkron, 1500);
}
el("sk-save").addEventListener("click", function(){
  var repo = el("sk-repo").value.trim() || Sinkron.BAWAAN.repo, tok = el("sk-token").value.trim(), c = Sinkron.cfg();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)){ setSkStatus("Tulis repo sebagai pemilik/nama-repo.", "err"); return; }
  if (!tok && !c.token){ setSkStatus("Tempel tokennya dulu.", "err"); return; }
  Sinkron.setCfg({ repo:repo, path:Sinkron.BAWAAN.path, token:tok || c.token });
  el("sk-token").value = ""; tandaiSinkron(); setSkStatus("Memeriksa…");
  Sinkron.uji().then(function(r){
    setSkStatus(r.privat ? "Repo privat, token diterima." : "PERHATIAN: repo ini PUBLIK, catatan Ibu bisa dibaca siapa saja. Ganti ke repo privat.", r.privat ? "ok" : "err");
    if (r.privat) return jalankanSinkron();
  }, function(err){
    var k = err && err.code;
    setSkStatus(k === "unauthorized" ? "Token ditolak GitHub." :
                k === "notfound" ? "Repo tidak ditemukan, atau token tidak punya akses ke sana." : "Gagal (" + k + ").", "err");
  });
});
el("sk-token").addEventListener("keydown", function(e){ if (e.key === "Enter"){ e.preventDefault(); el("sk-save").click(); } });
el("sk-now").addEventListener("click", function(){ if (!Sinkron.aktif()) setSkStatus("Belum diatur: isi repo dan token dulu.", "err"); else jalankanSinkron(); });
el("sk-clear").addEventListener("click", function(){
  Sinkron.setCfg(null); tandaiSinkron(); setSkStatus("Token dihapus dari HP ini. Catatan tetap ada di HP dan di repo.");
});
window.addEventListener("online", function(){ jalankanSinkron(); });
document.addEventListener("visibilitychange", function(){ if (!document.hidden && Sinkron.aktif()) jalankanSinkron(); });
tandaiSinkron();
if (Sinkron.aktif()) jalankanSinkron();

/* ---------------- rekomendasi rute otomatis ---------------- */
var rekSemua = false;
function renderRekomendasi(o, L, soc, stay){
  var box = el("rek"); if (!box) return null;
  var h = Rekomendasi.hitung(o, L, soc, stay);
  el("rek-faktor").textContent = Rekomendasi.faktor(o, soc).join(" · ");
  if (!h.daftar.length){
    el("rek-list").innerHTML = '<div class="empty">Sisa waktu terlalu pendek untuk berpindah tempat.</div>';
    el("rek-catatan").textContent = ""; return h;
  }
  var tampil = rekSemua ? h.daftar : h.daftar.slice(0, 3);
  el("rek-list").innerHTML = tampil.map(function(x, i){
    var sel = x.diSini ? "acuan" : (x.selisih >= 0 ? "+" : "−") + rp(Math.abs(x.selisih)) + " dibanding tetap di sini";
    var gerak = x.diSini ? "Tetap di sini."
      : "Pindah " + Math.round(x.kmPindah) + " km, ±" + Math.round(x.jamPindah * 60) + " menit" + (x.macet > 1 ? " (jam macet ×" + x.macet.toFixed(1).replace(".", ",") + ")" : "") + ", tiba " + hhmm(x.tiba) +
        " dengan baterai ±" + x.socTiba + "%" + (x.socTiba < x.res ? " (di bawah ambang pulang " + x.res + "%)" : "") + ".";
    return '<div class="rek-item' + (i === 0 ? " top" : "") + (x.diSini ? " here" : "") + '">' +
      '<div class="rek-rank">' + (i + 1) + "</div>" +
      '<div class="rek-body"><b>' + esc(x.n) + "</b>" +
      '<span class="rek-num">' + rp(x.sisa) + " <em>sisa hari, sebelum insentif</em></span>" +
      "<i>" + gerak + " " + rapi(x.saran.h) + "." + (x.sesi ? " " + x.sesi + "× ngecas." : "") + " Pulang " + Math.round(x.kmHome) + " km.</i>" +
      '<span class="rek-delta ' + (x.selisih > 0 ? "up" : x.selisih < 0 ? "dn" : "") + '">' + sel + "</span>" +
      (x.diSini ? "" : '<a class="linkbtn" target="_blank" rel="noopener" href="' + Rekomendasi.tautanArah(x.lat, x.lon) + '">Arahkan lewat Google Maps</a>') +
      "</div></div>";
  }).join("") + (h.daftar.length > 3
    ? '<button type="button" class="linkbtn" id="rek-toggle">' + (rekSemua ? "Tampilkan 3 teratas saja" : "Lihat semua " + h.daftar.length + " tempat") + "</button>" : "");
  var t = el("rek-toggle");
  if (t) t.addEventListener("click", function(){ rekSemua = !rekSemua; runNow(); });
  el("rek-catatan").innerHTML = "Dihitung mesin yang sama dengan proyeksi di bawah: hari, jam, wilayah tarif (Tangerang, Jakarta, bandara), " +
    "jarak pindah dari posisi Ibu, baterai setelah pindah, cuaca, acara, dan jarak pulang. <b>Tempat-tempat di wilayah tarif yang sama hanya " +
    "berbeda karena jarak</b>; mesin ini belum punya data permintaan per tempat, jadi kalimat sarannya yang membedakan, bukan angkanya.";
  return h;
}

/* ---------------- briefing otomatis dari Claude ----------------
   Satu paragraf pendek tiap kali blok jam (atau wilayah) berganti, disusun dari
   rekomendasi mesin dan konteks yang sama dengan tab Tanya. Disimpan di HP
   supaya membuka ulang halaman tidak membayar dua kali. Bisa dimatikan di
   tab Tanya. Tanpa sambungan Claude, kotaknya tidak muncul sama sekali. */
var LSBRIEF = "briefing-claude", briefingJalan = false, briefingKunci = null, briefingTimer = null;
function briefingAktif(){ try { return localStorage.getItem("briefing-otomatis") !== "0"; } catch (e) { return true; } }
function kunciBriefing(){ return SEKARANG ? iso(new Date()) + "|" + SEKARANG.blok.n + "|" + SEKARANG.L.z : null; }
function bacaBriefing(){ try { return JSON.parse(localStorage.getItem(LSBRIEF) || "null"); } catch (e) { return null; } }
function renderBriefing(b, status){
  var n = el("briefing"); if (!n) return;
  if (!b && !status){ n.hidden = true; return; }
  n.hidden = false;
  n.innerHTML = '<div class="ai-head"><span class="eyebrow">Briefing dari Claude' + (b ? " &middot; " + b.jam : "") + "</span>" +
    '<button type="button" class="linkbtn" id="briefing-segar">Segarkan</button></div>' +
    '<div class="ai-out">' + (b ? esc(b.teks) : "") + "</div>" +
    (status ? '<div class="status">' + esc(status) + "</div>" : "");
  var s = el("briefing-segar"); if (s) s.addEventListener("click", function(){ jalankanBriefing(true); });
}
function jalankanBriefing(paksa){
  if (!sampler || !SEKARANG || briefingJalan) return Promise.resolve();
  var kunci = kunciBriefing(), lama = bacaBriefing();
  var lamaCocok = (lama && lama.kunci === kunci) ? lama : null;
  if (!paksa && lamaCocok){ renderBriefing(lamaCocok); return Promise.resolve(); }
  briefingJalan = true; renderBriefing(lamaCocok, "Menyusun briefing…");
  var rek = SEKARANG.rek ? SEKARANG.rek.daftar.slice(0, 5).map(function(x, i){
    return (i + 1) + ". " + x.n + ": sisa hari Rp " + Math.round(x.sisa).toLocaleString("id-ID") +
           (x.diSini ? " (posisi sekarang)" : ", pindah " + Math.round(x.kmPindah) + " km, tiba " + hhmm(x.tiba)) +
           " -- " + rapi(x.saran.h);
  }).join("\n") : "(belum ada)";
  var prompt =
    "Kamu asisten pribadi Shanti, pengemudi GrabCar listrik yang tinggal di Modernland, Tangerang. Panggil dia Ibu. " +
    "Tulis BRIEFING SINGKAT untuk saat ini: paling banyak 5 kalimat, bahasa Indonesia hangat dan lugas, tanpa pembuka, " +
    "tanpa daftar bernomor, tanpa judul. Isinya: (1) apa yang sebaiknya dilakukan sekarang dan ke mana, (2) satu alasan " +
    "berangka dari data di bawah, (3) satu hal yang perlu diwaspadai hari ini (cuaca, acara, baterai, atau jam pulang). " +
    "Pakai HANYA data di bawah; jangan mengarang angka; kalau bertumpu pada asumsi, sebut dalam beberapa kata.\n\n" +
    "=== REKOMENDASI MESIN, URUT DARI TERBAIK (nilai ini, jangan diulang mentah) ===\n" + rek + "\n\n" + konteksTanya();
  return sampler(prompt, { modelTier:"default" }).then(function(res){
    var j = new Date();
    var b = { kunci:kunci, teks:String(res.text || "").trim(), jam:hhmm(j.getHours() + j.getMinutes()/60), dibuat:j.toISOString() };
    try { localStorage.setItem(LSBRIEF, JSON.stringify(b)); } catch (e) {}
    briefingJalan = false; renderBriefing(b);
  }, function(err){
    briefingJalan = false;
    var c = (err && err.code) || "error";
    renderBriefing(lamaCocok, c === "rate_limited" ? "Terlalu sering; coba lagi nanti." : "Briefing gagal (" + c + ").");
  });
}
function briefingOtomatis(){
  if (!SEKARANG) return;
  if (!briefingAktif() || !sampler){ renderBriefing(null); briefingKunci = null; return; }
  var kunci = kunciBriefing(), lama = bacaBriefing();
  if (lama && lama.kunci === kunci){ if (briefingKunci !== kunci){ briefingKunci = kunci; renderBriefing(lama); } return; }
  if (briefingKunci === kunci) return;   /* sudah dijadwalkan atau sedang berjalan untuk kunci ini */
  briefingKunci = kunci;
  clearTimeout(briefingTimer); briefingTimer = setTimeout(function(){ jalankanBriefing(false); }, 2000);
}
el("ai-briefing").checked = briefingAktif();
el("ai-briefing").addEventListener("change", function(){
  try { localStorage.setItem("briefing-otomatis", this.checked ? "1" : "0"); } catch (e) {}
  briefingKunci = null; briefingOtomatis();
});

/* ---------------- jeda bebas (UI) ----------------
   Satu sumber kebenaran: rehatDariUI(). Preset mengisi dua kolom jam; mengubah
   kolom jam membuat preset jadi "Atur sendiri". PLAN.rehat menyimpan string
   preset atau [dari, sampai]. */
function rehatDariUI(){
  var v = el("p-rehat").value;
  if (v === "none") return "none";
  if (v === "custom"){
    var a = parseFloat(el("p-rehat-dari").value), b = parseFloat(el("p-rehat-sampai").value);
    return (isFinite(a) && isFinite(b) && b > a) ? [a, b] : "none";
  }
  return v;
}
function setJedaUI(rehat){
  var r = rehatRange(rehat), sel = el("p-rehat");
  var preset = (typeof rehat === "string" && ["none","duapeak","full","short"].indexOf(rehat) >= 0) ? rehat : (r ? "custom" : "none");
  sel.value = preset;
  if (r){ el("p-rehat-dari").value = Math.round(r[0]*4)/4; el("p-rehat-sampai").value = Math.round(r[1]*4)/4; }
  el("f-jeda").hidden = (preset === "none");
  el("jedahint").textContent = r
    ? "Jeda " + hhmm(r[0]) + "\u2013" + hhmm(r[1]) + " (" + Math.round((r[1]-r[0])*60) + " menit). Ubah kolom jam untuk mengatur sendiri."
    : "Bebas dipilih; mesin menghitung ulang dan menyarankan jeda termurah dengan durasi sama.";
}
fillTimes(el("p-rehat-dari"), 3.5, 23.75, 10.5);
fillTimes(el("p-rehat-sampai"), 3.75, 24, 15);
el("p-rehat").addEventListener("change", function(){
  var v = this.value;
  if (v === "custom"){
    el("f-jeda").hidden = false;
    if (!(parseFloat(el("p-rehat-sampai").value) > parseFloat(el("p-rehat-dari").value))){ el("p-rehat-dari").value = 12; el("p-rehat-sampai").value = 14; }
    setJedaUI(rehatDariUI());
  } else setJedaUI(v);
  runPlan();
});
["p-rehat-dari","p-rehat-sampai"].forEach(function(id){
  el(id).addEventListener("change", function(){
    var a = parseFloat(el("p-rehat-dari").value), b = parseFloat(el("p-rehat-sampai").value);
    if (b <= a){ el("p-rehat-sampai").value = Math.min(24, a + 0.5); }
    el("p-rehat").value = "custom";
    setJedaUI(rehatDariUI());
    runPlan();
  });
});
setJedaUI(rehatDariUI());
runPlan();


/* ---------------- perkiraan baterai di tab Sekarang ---------------- */
function renderSocEst(est, soc, touched){
  var n = el("socest"), src = el("src-soc"); if (!n) return;
  if (!est){
    n.innerHTML = 'Belum ada jangkar hari ini: isi lewat <button type="button" class="linkbtn" id="socest-mulai">Mulai hari</button> supaya baterai diperkirakan sendiri.';
    if (src){ src.textContent = ""; src.className = ""; }
    var m = el("socest-mulai"); if (m) m.addEventListener("click", bukaCheckin);
    return;
  }
  var selisih = est.soc - soc;
  if (src){ src.textContent = touched ? "diketik sendiri" : "perkiraan mesin"; src.className = touched ? "man" : ""; }
  n.innerHTML = "Perkiraan mesin " + esc(Baterai.teks(est)) +
    (touched && Math.abs(selisih) >= 2 ? ' <button type="button" class="linkbtn" id="socest-pakai">Pakai ' + est.soc + "%</button>" : "") +
    (est.sumber === "ngecas" ? " Jangkar terakhir: selesai ngecas." : "");
  var b = el("socest-pakai");
  if (b) b.addEventListener("click", function(){ el("n-soc").value = est.soc; el("n-soc").dataset.touched = ""; runNow(); });
}
function renderSocEstSaja(){
  var o = { bat:parseFloat(el("n-bat").value), zona:currentLok().z, rehat:(PLAN && PLAN.date === iso(new Date())) ? PLAN.rehat : "none" };
  var est = Baterai.perkiraan(jamKeluarSekarang(), o);
  if (est && el("n-soc").dataset.touched !== "1" && Math.abs(est.soc - parseFloat(el("n-soc").value)) >= 1){ runNow(); return; }
  renderSocEst(est, parseFloat(el("n-soc").value) || 0, el("n-soc").dataset.touched === "1");
}
el("cas-selesai").addEventListener("click", function(){
  var v = parseFloat(el("cas-ke").value);
  if (!(v >= 1 && v <= 100)){ el("hari-status").textContent = "Isi dulu berapa % setelah ngecas."; el("hari-status").className = "status err"; return; }
  Baterai.jangkar(jamSekarangTepat(), Math.round(v), "ngecas");
  el("n-soc").value = Math.round(v); el("n-soc").dataset.touched = "";
  el("cas-ke").value = "";
  el("hari-status").textContent = "Dicatat: " + Math.round(v) + "% pukul " + hhmm(jamSekarangTepat()) + ". Perkiraan dihitung dari sini.";
  el("hari-status").className = "status ok";
  runNow();
});

/* ---------------- Mulai hari (check-in) ----------------
   Halaman khusus saat aplikasi dibuka: Ibu mengisi keadaan sekarang (baterai,
   varian, jam mulai, rencana pulang, wilayah, jatah filter, sudah dapat,
   jeda, charger). Jam, hari, tanggal merah, acara, cuaca, dan posisi GPS
   diisi mesin. Isian ini menjadi rencana hari ini (PLAN) dan jangkar
   perkiraan baterai, lalu tab Sekarang langsung memakainya. Sekali per hari;
   bisa dilewati; bisa dibuka lagi lewat tombol "Isi keadaan hari ini". */
var LSMULAI = "mulai-hari", LSLEWATI = "mulai-hari-lewati";
function muatMulaiHari(){
  try { MULAI_HARI = JSON.parse(localStorage.getItem(LSMULAI) || "null"); } catch (e) { MULAI_HARI = null; }
  if (MULAI_HARI && MULAI_HARI.date !== iso(new Date())) MULAI_HARI = null;
  return MULAI_HARI;
}
function simpanMulaiHari(m){ MULAI_HARI = m; try { localStorage.setItem(LSMULAI, JSON.stringify(m)); } catch (e) {} }
function lewatiHariIni(){ try { return localStorage.getItem(LSLEWATI) === iso(new Date()); } catch (e) { return false; } }
function rehatCI(){
  if (el("ci-rehat").value !== "custom") return "none";
  var a = parseFloat(el("ci-rehat-dari").value), b = parseFloat(el("ci-rehat-sampai").value);
  return (isFinite(a) && isFinite(b) && b > a) ? [a, b] : "none";
}
function tampilJedaCI(){
  var ada = el("ci-rehat").value === "custom";
  ["ci-rehat-dari", "ci-rehat-panah", "ci-rehat-sampai"].forEach(function(id){ el(id).hidden = !ada; });
}
function isiOtomatisCI(){
  var now = new Date(), ctx = dayCtx(iso(now)), f = [];
  f.push("<b>" + ctx.name + ", " + hhmm(jamSekarangTepat()) + "</b>" + (ctx.holi ? " &middot; tanggal merah" : "") + (ctx.eve ? " &middot; malam sebelum libur" : "") +
         (Math.abs(ctx.mult - 1) > 0.005 ? " &middot; pengali hari &times;" + ctx.mult.toFixed(2).replace(".", ",") : ""));
  if (ctx.ev) f.push("acara kalender: " + esc(ctx.ev[0]));
  if (ctx.gajian) f.push("musim gajian");
  var sh = el("src-hujan"); if (sh && sh.textContent) f.push("cuaca: " + esc(sh.textContent) + (el("n-hujan").checked ? " (hujan dicentang)" : ""));
  var L0 = currentLok(); f.push("posisi: " + esc(L0.n) + (lokSumber === "auto" ? " (GPS)" : ""));
  var pl = PLAN && PLAN.date === iso(now);
  if (pl) f.push("rencana tersimpan: keluar " + hhmm(PLAN.keluar) + ", pulang " + hhmm(PLAN.pulang) + ", istirahat " + rehatTeks(PLAN.rehat));
  el("ci-auto").innerHTML = "Yang sudah diketahui mesin: " + f.join(" &middot; ") + ".";
}
function bukaCheckin(){
  var now = new Date(), t = Math.round((now.getHours() + now.getMinutes()/60) * 4) / 4;
  var m = MULAI_HARI, pl = (PLAN && PLAN.date === iso(now)) ? PLAN : null;
  el("ci-tgl").textContent = now.toLocaleDateString("id-ID", { weekday:"long", day:"numeric", month:"long" });
  el("ci-soc").value = m ? m.soc : (parseFloat(el("n-soc").value) || 90);
  el("ci-bat").value = String(m ? m.bat : (pl ? pl.bat : parseFloat(el("n-bat").value)));
  el("ci-keluar").value = String(m ? m.keluar : (pl ? pl.keluar : Math.max(3.5, Math.min(23.5, t))));
  el("ci-pulang").value = String(m ? m.pulang : (pl ? pl.pulang : parseFloat(el("n-pulang").value)));
  el("ci-zona").value = m ? m.zona : (pl ? pl.zona : (currentLok().z === "apt" ? "apt" : currentLok().z === "jkt" ? "jkt" : "tng"));
  el("ci-filter").value = String(m ? m.filter : (pl ? pl.filter : parseInt(el("n-filter").value, 10)));
  el("ci-dpt").value = m ? m.dpt : (parseFloat(el("n-dpt").value) || 0);
  el("ci-rumah").checked = m ? !!m.rumah : (pl ? !!pl.rumah : el("n-rumah").checked);
  var rh = rehatRange(m ? m.rehat : (pl ? pl.rehat : "none"));
  el("ci-rehat").value = rh ? "custom" : "none";
  if (rh){ el("ci-rehat-dari").value = String(Math.round(rh[0]*4)/4); el("ci-rehat-sampai").value = String(Math.round(rh[1]*4)/4); }
  tampilJedaCI(); isiOtomatisCI();
  el("checkin").hidden = false;
  try { el("ci-soc").focus(); } catch (e) {}
}
function tutupCheckin(){ el("checkin").hidden = true; }
fillTimes(el("ci-keluar"), 3.5, 23.5, 5.25);
fillTimes(el("ci-pulang"), 9, 24, 21.5);
fillTimes(el("ci-rehat-dari"), 3.5, 23.75, 12);
fillTimes(el("ci-rehat-sampai"), 3.75, 24, 14);
el("ci-rehat").addEventListener("change", tampilJedaCI);
["ci-rehat-dari", "ci-rehat-sampai"].forEach(function(id){
  el(id).addEventListener("change", function(){
    var a = parseFloat(el("ci-rehat-dari").value), b = parseFloat(el("ci-rehat-sampai").value);
    if (b <= a) el("ci-rehat-sampai").value = String(Math.min(24, a + 0.5));
  });
});
el("ci-mulai").addEventListener("click", function(){
  var soc = Math.round(parseFloat(el("ci-soc").value));
  if (!(soc >= 1 && soc <= 100)){ el("ci-soc").focus(); return; }
  var jam = jamSekarangTepat();
  var keluar = parseFloat(el("ci-keluar").value), pulang = parseFloat(el("ci-pulang").value);
  if (!(pulang > jam)) pulang = Math.min(24, Math.round((jam + 0.5) * 4) / 4);
  var m = { date:iso(new Date()), jam:jam, soc:soc, bat:parseFloat(el("ci-bat").value), keluar:keluar, pulang:pulang,
            zona:el("ci-zona").value, filter:parseInt(el("ci-filter").value, 10), dpt:Math.max(0, parseFloat(el("ci-dpt").value) || 0),
            rehat:rehatCI(), rumah:el("ci-rumah").checked };
  simpanMulaiHari(m);
  Baterai.mulai(jam, soc, "mulai hari");
  /* Tab Sekarang mengikuti isian ini. */
  el("n-soc").value = soc; el("n-soc").dataset.touched = "";
  el("n-bat").value = String(m.bat); el("n-pulang").value = String(m.pulang);
  el("n-filter").value = String(m.filter); el("n-rumah").checked = m.rumah; el("n-dpt").value = m.dpt;
  /* Rencana hari ini = isian ini, supaya jeda, jam mulai, dan insentif sehari ikut. */
  savePlan({ date:m.date, keluar:Math.min(keluar, Math.round(jam * 4) / 4), pulang:m.pulang, rehat:m.rehat, zona:m.zona,
             filter:m.filter, bat:m.bat, rumah:m.rumah, hujan:el("n-hujan").checked, acara:el("n-acara").checked });
  ["p-keluar", "p-pulang", "p-zona", "p-filter", "p-bat"].forEach(function(id){
    el(id).value = String({ "p-keluar":PLAN.keluar, "p-pulang":PLAN.pulang, "p-zona":PLAN.zona, "p-filter":PLAN.filter, "p-bat":PLAN.bat }[id]);
  });
  setJedaUI(PLAN.rehat); el("p-rumah").checked = m.rumah; el("p-tgl").value = m.date;
  sinkronNanti();
  tutupCheckin();
  el("hari-status").textContent = "Hari dimulai pukul " + hhmm(jam) + " dengan " + soc + "%. Baterai diperkirakan sendiri mulai sekarang.";
  el("hari-status").className = "status ok";
  if (el("ci-gps").checked) deteksiLokasi(false);
  runNow(); runPlan();
});
el("ci-lewati").addEventListener("click", function(){
  try { localStorage.setItem(LSLEWATI, iso(new Date())); } catch (e) {}
  tutupCheckin();
});
el("ci-buka").addEventListener("click", bukaCheckin);
el("checkin").addEventListener("keydown", function(e){ if (e.key === "Escape") tutupCheckin(); });

/* ---------------- kunci TomTom ---------------- */
function tandaiTomTom(){
  var k = Peta.kunciTomTom();
  el("tt-key").placeholder = k ? "tersimpan · ····" + k.slice(-4) : "Kunci TomTom (opsional)";
  el("tt-clear").hidden = !k;
  el("tt-status").textContent = k ? "Lapisan kemacetan TomTom aktif di peta (tampilkan peta untuk melihatnya)." : "";
}
el("tt-save").addEventListener("click", function(){
  var k = el("tt-key").value.trim();
  if (!k){ el("tt-status").textContent = "Tempel kuncinya dulu."; return; }
  Peta.setKunciTomTom(k); el("tt-key").value = ""; tandaiTomTom();
});
el("tt-clear").addEventListener("click", function(){ Peta.setKunciTomTom(""); tandaiTomTom(); });
tandaiTomTom();

/* Buka halaman Mulai hari sekali sehari, di jam kerja, kecuali dilewati
   atau dibuka dengan ?tanpa-mulai (untuk uji). */
muatMulaiHari();
(function(){
  var t = jamSekarangTepat();
  if (MULAI_HARI || lewatiHariIni() || /tanpa-mulai/.test(location.search) || t < 3.5 || t > 23.5) return;
  bukaCheckin();
})();
if (MULAI_HARI) renderSocEstSaja();
