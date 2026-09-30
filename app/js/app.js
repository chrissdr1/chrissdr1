/* Antarmuka: tab Sekarang, Catatan, Rencana, Tanya, dan boot. */
"use strict";

var POSISI_GPS = null;   /* {lat, lon, akurasi, at} dari deteksi terakhir; dipakai peta */
var MULAI_HARI = null;   /* jam mulai kerja hari ini (dari check-in); dipakai untuk insentif */

/* "Sudah dapat (Rp)" hari ini dipulihkan SEBELUM hitungan pertama. Dulu
   kolomnya kembali ke 0 setiap aplikasi dibuka ulang, proyeksi hari itu
   kehilangan pendapatan yang sudah masuk, dan runNow menimpa angka yang
   tersimpan dengan 0. */
(function(){
  try {
    var ak = JSON.parse(localStorage.getItem("sekarang-terakhir") || "null");
    var e = document.getElementById("n-dpt");
    if (e && ak && ak.tanggal === iso(new Date()) && ak.dpt > 0 && !(parseFloat(e.value) > 0)) e.value = ak.dpt;
  } catch (err) {}
})();

/* Hari sudah dimulai: Mulai hari hari ini, sudah ada pendapatan, atau jam
   mulai rencana hari ini sudah lewat. Sesudah itu "sisa filter" adalah yang
   tersisa sekarang, bukan jatah sehari dari rencana. */
function hariSudahMulai(){
  var h = iso(new Date());
  if (MULAI_HARI && MULAI_HARI.date === h) return true;
  if (parseRp(el("n-dpt").value) > 0) return true;
  return !!(PLAN && PLAN.date === h && jamSekarangTepat() >= PLAN.keluar);
}
/* Fakta mobil (tipe baterai, colokan rumah) diingat terus, seperti tema.
   Dulu kembali ke 30,08 kWh / tanpa colokan tiap dibuka ulang, dan rencana
   besok yang tersimpan menimpanya lagi tengah malam. */
var LSFAKTA = "fakta-mobil";
function simpanFakta(){
  var f = { bat:parseFloat(el("n-bat").value), rumah:el("n-rumah").checked };
  if (!isFinite(f.bat)) return;
  try { localStorage.setItem(LSFAKTA, JSON.stringify(f)); } catch (e) {}
  /* rencana hari ini dan hari depan ikut fakta terbaru */
  var h = iso(new Date()), ubah = false;
  Object.keys(RENCANA || {}).forEach(function(k){
    var P = RENCANA[k]; if (k < h || !P) return;
    if (P.bat !== f.bat || !!P.rumah !== f.rumah){ P.bat = f.bat; P.rumah = f.rumah; ubah = true; }
  });
  if (ubah){
    PLAN = RENCANA[h] || null;
    try {
      localStorage.setItem(LSP_HARI, JSON.stringify(RENCANA));
      var lama = JSON.parse(localStorage.getItem(LSP) || "null");   /* slot lama dibaca paling akhir saat dibuka: ikut diperbarui */
      if (lama && lama.date && RENCANA[lama.date]) localStorage.setItem(LSP, JSON.stringify(RENCANA[lama.date]));
    } catch (e) {}
  }
}
function terapkanFakta(){
  var f = null; try { f = JSON.parse(localStorage.getItem(LSFAKTA) || "null"); } catch (e) {}
  if (!f || !isFinite(f.bat)) return;
  ["n-bat", "p-bat"].forEach(function(id){ var e = el(id); if (e && Array.prototype.some.call(e.options, function(o){ return parseFloat(o.value) === f.bat; })) e.value = String(f.bat); });
  el("n-rumah").checked = !!f.rumah; if (el("p-rumah")) el("p-rumah").checked = !!f.rumah;
}
/* Isian Sedang narik hari ini (jam pulang, sisa filter, Tidak pulang, hujan,
   acara) bertahan kalau aplikasi dibuka ulang di hari yang sama. */
var LSISIAN = "isian-hari-ini";
function simpanIsianHari(){
  var x = { tanggal:iso(new Date()), pulang:parseFloat(el("n-pulang").value), filter:parseInt(el("n-filter").value, 10),
            tujuan:el("n-tujuan").value };
  if (el("n-hujan").dataset.touched) x.hujan = el("n-hujan").checked;
  if (el("n-acara").dataset.touched) x.acara = el("n-acara").checked;
  try { localStorage.setItem(LSISIAN, JSON.stringify(x)); } catch (e) {}
}
function pulihkanIsianHari(){
  var x = null; try { x = JSON.parse(localStorage.getItem(LSISIAN) || "null"); } catch (e) {}
  if (!x || x.tanggal !== iso(new Date())) return false;
  var ada = function(e, v){ return Array.prototype.some.call(e.options, function(o){ return parseFloat(o.value) === v; }); };
  if (isFinite(x.pulang) && x.pulang > jamSekarangTepat() && ada(el("n-pulang"), x.pulang)) el("n-pulang").value = String(x.pulang);
  if (isFinite(x.filter) && ada(el("n-filter"), x.filter)) el("n-filter").value = String(x.filter);
  if (x.tujuan === "stay" || x.tujuan === "rumah") el("n-tujuan").value = x.tujuan;
  if (typeof x.hujan === "boolean"){ el("n-hujan").checked = x.hujan; el("n-hujan").dataset.touched = "1"; }
  if (typeof x.acara === "boolean"){ el("n-acara").checked = x.acara; el("n-acara").dataset.touched = "1"; }
  return true;
}

/* Catatan pendek: judul = keputusan, isi <= 1 kalimat, penjelasan panjang di
   balik "Kenapa?" (details) supaya layar bisa dilirik 3 detik. */
function catatan(k, judul, isi, kenapa){
  return '<div class="note ' + k + '"><span class="tag">' + judul + "</span><span>" + isi +
    (kenapa ? '<details class="kenapa"><summary>Kenapa?</summary><div>' + kenapa + "</div></details>" : "") + "</span></div>";
}
/* Jam mulai bawaan (Rute 700K): Senin 04:45, Sabtu 07:30, Minggu 07:00,
   lainnya 05:15; tanggal merah 10:00 -- "Mulai siang" seperti bendera
   harinya (dulu Natal/Idulfitri 05:15, sebelum peak pagi yang tidak ada). */
function jamMulaiBawaan(tgl){
  var d = new Date(tgl + "T00:00:00"), dow = d.getDay();
  if (HOLI[tgl]) return 10;
  return dow === 1 ? 4.75 : dow === 6 ? 7.5 : dow === 0 ? 7 : 5.25;
}
function renderDayFlag(ctx, dateStr){
  var n = el("dayflag");
  /* acara besar DITAMBAHKAN ke bendera hari (dulu menggantikan "Tanggal
     merah" / "Malam sebelum libur") */
  var acara = "";
  if (ctx.ev){
    var lokal = ctx.ev[2] === "lokal";
    acara = "<b>" + esc(ctx.ev[0]) + "</b> di " + esc(ctx.ev[1]) + ". " +
      (lokal
        ? "Dekat rumah. Sore/malam ada di sekitar BSD saat acara bubar."
        : "Di Jakarta (26&ndash;30 km). Bubar 22:30&ndash;23:30, tarif tinggi, tapi pulang jauh. Ambil hanya kalau besok Ibu libur.");
  }
  var tag = null, isi = "", kelas = "flag";
  if (ctx.holi){
    tag = "Tanggal merah"; kelas = "flag warn";
    isi = "<b>" + ctx.holi[0] + (ctx.holi[1]==="C" && !/cuti bersama/i.test(ctx.holi[0]) ? " (cuti bersama)" : "") +
      ".</b> Tidak ada peak pagi. Mulai siang; ramai di mal, tempat makan, bandara sampai malam. " +
      (ctx.runLen>=3 ? "Libur panjang " + ctx.runLen + " hari" + (ctx.hariKe > 1 ? " (hari ke-" + ctx.hariKe + ")" : "") + ": bandara ramai di awal dan akhirnya." : "");
  } else if (ctx.eve){
    tag = "Malam sebelum libur";
    isi = "<b>" + (ctx.eveMulaiLibur ? "Besok mulai libur panjang" : "Besok tanggal merah" + (ctx.evePlus ? ", awal libur panjang" : "")) +
      ".</b> Sore&ndash;malam ini orang keluar kota: <b>bandara, Stasiun Batu Ceper, Terminal Poris</b> ramai. " +
      (ctx.evePlus ? "Salah satu malam terkuat bulan ini &mdash; narik penuh." : "");
  } else if (ctx.dow===6 || ctx.dow===0){
    tag = "Akhir pekan"; kelas = "flag quiet";
    isi = "Tidak ada peak pagi. <b>Mulai 07:30&ndash;09:00</b>, andalkan sore&ndash;malam.";
  }
  if (acara){
    if (!tag){ tag = "Acara besar"; isi = acara; kelas = "flag" + (ctx.ev[2] === "lokal" ? "" : " warn"); }
    else isi += " <br>Acara besar: " + acara;
  }
  if (!tag){ n.hidden = true; return; }
  n.hidden = false; n.className = kelas;
  n.innerHTML = '<span class="tag">' + tag + "</span><span>" + isi + "</span>";
}

function renderSteps(node, list, title){
  var h='<div class="steps-head"><span class="eyebrow">'+title+
        '</span><span class="eyebrow">perkiraan &middot; total sampai sini</span></div>';
  list.forEach(function(s){
    h+='<div class="step '+s.cls+'"><div class="t">'+s.t+"<em>"+s.dur+"</em></div>"+
       '<div class="a"><b>'+s.b+"</b><span>"+s.s+"</span><i>"+s.i+"</i>"+(s.d ? '<span class="dt">'+s.d+"</span>" : "")+
       (s.k ? '<details class="kenapa"><summary>Kenapa?</summary><div>'+s.k+"</div></details>" : "")+"</div>"+
       '<div class="v">'+s.v+"<em>"+s.cum+"</em></div></div>";
  });
  node.innerHTML=h;
}
/* Tab Sekarang dipakai sambil mengemudi: sekali lirik cukup lihat langkah
   sekarang + berikutnya, bukan semua sisa hari (itu untuk tab Rencana,
   lewat renderSteps langsung, tidak lewat sini). */
var STEPS_BATAS = 2;
function renderStepsRingkas(node, list, title){
  var tampil = stepsSemua ? list : list.slice(0, STEPS_BATAS);
  var sisa = stepsSemua ? 0 : Math.max(0, list.length - STEPS_BATAS);
  renderSteps(node, tampil, title);
  if (sisa > 0 || stepsSemua){
    node.innerHTML += '<button type="button" class="linkbtn" id="steps-toggle">' +
      (stepsSemua ? "Tampilkan langkah berikutnya saja" : "Lihat semua " + list.length + " langkah" + (/sampai pulang/.test(title) ? " sampai pulang" : "")) + "</button>";
  }
  var st = el("steps-toggle");
  if (st) st.addEventListener("click", function(){ stepsSemua = !stepsSemua; runNow(); });
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
             (r.sendiri ? " · angka Ibu" : (r.terukur ? "" : " · perkiraan"))+"</option>";
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
      /* Posisi GPS: koordinatnya ada di kunci registri ("gps:lat,lon"). Tanpa
         ini "Urutan tempat" menebak posisi dari jarak-ke-rumah saja dan bisa
         salah sisi kota (Cikupa 20 km dikira Jakarta Barat 18 km). */
      var kk = v.slice(7), la = null, lo = null;
      if (kk.indexOf("gps:") === 0){
        var pr = kk.slice(4).split(","); la = parseFloat(pr[0]); lo = parseFloat(pr[1]);
        if (!isFinite(la) || !isFinite(lo)){ la = null; lo = null; }
      } else if (r.lat != null && r.lon != null){ la = r.lat; lo = r.lon; }
      else if (r.terukur){ var kc = koordinatKecamatan(r.nama); if (kc){ la = kc.lat; lo = kc.lon; } }
      /* nama ketikan / jawaban Claude tanpa tanda HTML: mesin memasangnya ke
         innerHTML di banyak tempat (dulu "<img onerror=...>" dijalankan) */
      var hasil = { id:v, n:String(r.nama || "").replace(/[<>"'`&]/g, "").trim() || "Tempat ketikan", home:r.km, res:Math.round(kmAman/2+15),
               z: r.zPaksa || a.z,
               luar:r.km>10?1:0, jauh:r.km>34?1:0, anchor:a.n, perkiraan:!r.terukur };
      if (la != null){ hasil.lat = la; hasil.lon = lo; }
      return hasil;
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
  setHint("Ketik nama daerah. Kolom km opsional — isi kalau Ibu tahu kira-kira jaraknya ke rumah.");
  runNow();
}

function resolveKetik(){
  var txt = el("n-ketik").value.trim();
  if (!txt){ setHint("Isi nama daerahnya dulu.", "err"); return; }

  /* Sudah pernah diketik? pakai langsung, tanpa menebak lagi. */
  var s = slug(txt);
  var manual = parseFloat(el("n-ketikkm").value);
  if (REGISTRI[s] && REGISTRI[s].km > 0){
    /* km baru yang Ibu ketik menggantikan yang lama (dulu diam-diam diabaikan) */
    if (isFinite(manual) && manual > 0 && Math.abs(manual - REGISTRI[s].km) >= 0.5){ REGISTRI[s].km = manual; REGISTRI[s].sendiri = true; simpanRegistri(); }
    pasangLokasi(s); return;
  }

  /* Jalur 2 — Ibu isi sendiri kilometernya. Tidak butuh Claude. */
  if (isFinite(manual) && manual > 0){
    /* patokan wilayah: bukan Bandara (antrean & parkir bandara bukan milik
       tempat yang cuma kebetulan sama jaraknya) */
    var dekat = LOKMAP.kota, beda = Infinity;
    LOK.forEach(function(l){ if (l.z === "apt") return; var d = Math.abs(l.home - manual); if (d < beda){ beda = d; dekat = l; } });
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
    if (!(pos.coords.accuracy > 150)){ Baterai.catatFix(la, lo, Date.now(), pos.coords.accuracy || 0); JejakZona.catat(la, lo, Date.now()); }
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
    /* Kota = titik rumah (0 km): hanya dalam 1 km, sama dengan aturan "sudah
       di sekitar rumah" -- dulu 2,3 km dari rumah dianggap 0 km */
    var radius = (best && best.id === "bandara") ? 2 : (best && best.home <= 1) ? 1 : 2.5;
    if (best && bestD <= radius){
      renderLok(best.id);
      setLokSumber("auto");
      setGpsHint("Terdeteksi di " + best.n + " · " + bestD.toFixed(1).replace(".", ",") + " km dari titiknya" +
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
                   ". Tekan “Cari posisi”, atau pilih sendiri di atas.");
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
   menggambar ulang halaman -- hanya menambah km dan menggeser penibu peta. */
var odometerId = null, odometerTerpasang = false;
function hentikanOdometer(){ if (odometerId != null && navigator.geolocation){ navigator.geolocation.clearWatch(odometerId); odometerId = null; } }
function pasangOdometer(){
  if (!navigator.geolocation || !navigator.geolocation.watchPosition) return;
  function mulai(){
    if (odometerId != null || document.hidden || !gpsOtomatisAktif()) return;
    odometerId = navigator.geolocation.watchPosition(function(pos){
      var la = pos.coords.latitude, lo = pos.coords.longitude;
      if (pos.coords.accuracy && pos.coords.accuracy > 150) return;   /* fix kasar: jangan dihitung */
      POSISI_GPS = { lat:la, lon:lo, akurasi:pos.coords.accuracy || 0, at:Date.now() };
      JejakZona.catat(la, lo, Date.now());
      if (Baterai.catatFix(la, lo, Date.now(), pos.coords.accuracy || 0) > 0.3) renderSocEstSaja();
      if (Peta.ada()) Peta.posisi(la, lo, POSISI_GPS.akurasi);
    }, function(){}, { enableHighAccuracy:true, maximumAge:15000, timeout:30000 });
  }
  mulai();
  if (!odometerTerpasang){
    odometerTerpasang = true;
    document.addEventListener("visibilitychange", function(){ if (document.hidden) hentikanOdometer(); else mulai(); });
  }
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
/* Jam yang dipakai aplikasi: tepat ke menit kalau mengikuti jam, nilai kolom
   kalau Ibu memilih sendiri (untuk "kalau saya keluar jam 15:00?"). */
function jamKeluarSekarang(){
  var t = jamSekarangTepat();
  if (!jamManual && !jamLuar && t >= 3.5 && t <= 23.5) return Math.round(t * 60) / 60;
  /* dini hari (00:00-03:29): Ibu belum mulai -- hitung dari blok pertama 03:30 */
  if (!jamManual && t < 3.5) return 3.5;
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
    e.textContent = "di luar 03:30\u201323:30"; e.className = "err"; if (b) b.hidden = true; return;
  }
  if (!jamManual && jamSekarangTepat() < 3.5){ e.textContent = "belum 03:30 \u00b7 dihitung dari 03:30"; e.className = ""; if (b) b.hidden = true; return; }
  if (jamManual){ e.textContent = "diubah sendiri \u00b7 otomatis lagi 20 menit"; e.className = "man"; if (b) b.hidden = false; }
  else { e.textContent = "otomatis"; e.className = ""; if (b) b.hidden = true; }
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
  /* Dini hari (00:00-03:29) BUKAN "lewat jam": Ibu bersiap berangkat
     subuh. Dulu kolom jam tertinggal di 09:30 (nilai awal) dan seluruh tab
     Sekarang -- termasuk perkiraan baterai -- dihitung untuk jam 09:30. */
  if (t < 3.5){
    jamLuar = false; if (paksa) jamManual = false;
    if (!jamManual){ el("n-jam").value = 3.5; if (parseFloat(el("n-pulang").value) <= 3.5) el("n-pulang").value = 4; }
    tandaiJam(); runNow(); return;
  }
  if (t > 23.5){
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
    if (PULANG_ASLI == null) PULANG_ASLI = parseFloat(el("n-pulang").value);
    el("n-pulang").value = Math.min(24, t + 0.5);
  }
  bukaCheckinOtomatis();   /* halaman terbuka sejak dini hari / semalam: Mulai hari tetap muncul */
  runNow();
}
/* Jam pulang sebelum digeser ikutJam. Kolom pulang ikut jam supaya tidak
   tertinggal, tapi mobil sudah diam sesudah jam pulang yang sebenarnya:
   dulu baterai terus turun (21:30 54% -> 23:00 41%) karena batasnya ikut
   bergeser. Dihapus saat Ibu memilih jam pulang sendiri / hari baru. */
var PULANG_ASLI = null;
/* Pilihan perkiraan baterai: jam mulai, jam pulang, dan wilayah HARI INI
   (rencana / Mulai hari), bukan posisi dan kolom yang ikut jam.
   - mulai: yang lebih akhir dari rencana & Mulai hari -- mobil di rumah
     sebelum itu (dulu 61 km "terpakai" selagi menunggu rencana 08:00);
     kalau sudah ada pendapatan sebelum jam itu, Ibu ternyata sudah jalan.
   - wilayah: dulu wilayah posisi SEKARANG dipakai untuk semua jam sejak
     jangkar, jadi pindah dari Jakarta ke Karawaci menaikkan baterai 5%. */
function opsiBaterai(pulangKolom){
  var hari = iso(new Date()), pl = (PLAN && PLAN.date === hari) ? PLAN : null, m = MULAI_HARI;
  var keluar = (m && typeof m.keluar === "number") ? m.keluar : 0;
  if (pl && pl.keluar > keluar) keluar = pl.keluar;
  if ((parseRp(el("n-dpt").value) || 0) > 0 && jamSekarangTepat() < keluar) keluar = (m && typeof m.keluar === "number") ? Math.min(m.keluar, jamSekarangTepat()) : 0;
  var pulang = PULANG_ASLI != null ? PULANG_ASLI : pulangKolom;
  return { bat:parseFloat(el("n-bat").value), zona:pl ? pl.zona : (m && m.zona ? m.zona : currentLok().z),
           rehat:pl ? pl.rehat : "none", keluar:keluar, pulang:isFinite(pulang) ? pulang : 24 };
}

/* ---------------- plan of the day (the loop) ---------------- */
/* Rencana disimpan PER TANGGAL (dulu satu slot: menyimpan rencana besok
   menghapus rencana hari ini, termasuk istirahatnya). PLAN = rencana hari
   ini; rencanaUntuk(tgl) untuk tanggal lain. Slot lama LSP tetap ditulis
   (rencana terakhir yang disimpan) dan dibaca untuk data lama. */
var PLAN = null, AKTUAL = null, LSP = "buku-setoran-plan", LSP_HARI = "rencana-per-hari", RENCANA = {};
function loadPlan(){
  RENCANA = {};
  try { RENCANA = JSON.parse(localStorage.getItem(LSP_HARI) || "{}") || {}; } catch (e) { RENCANA = {}; }
  try { var lama = JSON.parse(localStorage.getItem(LSP) || "null"); if (lama && lama.date) RENCANA[lama.date] = lama; } catch (e) {}
  PLAN = RENCANA[iso(new Date())] || null;
}
function rencanaUntuk(d){ return (d && RENCANA[d]) || null; }
function savePlan(p){
  RENCANA[p.date] = p;
  var batas = iso(new Date(Date.now() - 14 * 864e5));
  Object.keys(RENCANA).forEach(function(k){ if (k < batas) delete RENCANA[k]; });
  PLAN = RENCANA[iso(new Date())] || null;
  try { localStorage.setItem(LSP_HARI, JSON.stringify(RENCANA)); localStorage.setItem(LSP, JSON.stringify(p)); return true; } catch (e) { return false; }
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
  /* stay: "sampai jam sekarang" bukan jam pulang -- tanpa pemangkasan perjalanan pulang */
  var sofar = simulate({ ctx:ctx, keluar:PLAN.keluar, pulang:upto, rehat:PLAN.rehat,
    zona:PLAN.zona, filter:PLAN.filter, bat:PLAN.bat, rumah:PLAN.rumah,
    hujan:PLAN.hujan, acara:PLAN.acara, stay:true });
  var full = simulate({ ctx:ctx, keluar:PLAN.keluar, pulang:PLAN.pulang, rehat:PLAN.rehat,
    zona:PLAN.zona, filter:PLAN.filter, bat:PLAN.bat, rumah:PLAN.rumah,
    hujan:PLAN.hujan, acara:PLAN.acara });

  var seharusnya = sofar.gross;   /* "sudah dapat" itu pendapatan kotor, dibandingkan dengan yang kotor juga */
  var selisih = dpt - seharusnya;
  var cls = selisih >= 0 ? "up" : "dn";
  var ZONA_LOK = { tng:["tng"], mix:["tng","jkt"], jkt:["jkt"], apt:["apt","tng"] };
  var drift = (ZONA_LOK[PLAN.zona] || [PLAN.zona]).indexOf(lokZ) < 0;
  var jeda = rehatRange(PLAN.rehat);
  var sedangJeda = jeda && nowT >= jeda[0] && nowT < jeda[1];

  var msg;
  if (sedangJeda){
    msg = "<b>Menurut rencana, sekarang istirahat</b> (" + hhmm(jeda[0]) + "&ndash;" + hhmm(jeda[1]) + "). Jam ini paling sepi.";
  } else if (nowT < PLAN.keluar && !(dpt > 0)){
    msg = "Rencana: mulai <b>" + hhmm(PLAN.keluar) + "</b>, " + ZONA[PLAN.zona].label + ", perkiraan bersih <b>" + rp(full.net) + "</b>. Belum mulai.";
  } else {
    msg = (selisih >= 0
      ? "<b>Di atas rencana " + rp(selisih) + ".</b> "
      : "<b>Di bawah rencana " + rp(-selisih) + ".</b> ") +
      (drift ? "Ibu di luar daerah rencana (" + ZONA[PLAN.zona].label + "). Langkah di bawah sudah dihitung dari posisi sekarang." : "");
  }

  n.innerHTML =
    /* semua kotor (sama dengan "Sudah dapat"); tidak memakai kata "target" --
       target harian Rp 515.000 bersih ada di atas */
    '<div class="pc"><span class="lbl">Rencana kotor s/d kini</span><span class="v">' + rp(seharusnya) + "</span></div>" +
    '<div class="pc"><span class="lbl">Sudah dapat</span><span class="v">' + rp(dpt) + "</span></div>" +
    '<div class="pc"><span class="lbl">Selisih</span><span class="v ' + cls + '">' +
      (selisih>=0?"+":"") + rp(selisih).replace("Rp ","") + "</span></div>" +
    '<div class="pc"><span class="lbl">Rencana kotor sehari</span><span class="v">' + rp(full.gross) + "</span></div>" +
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
  /* Sebelum jam mulai rencana hari ini dan belum mulai: hitung dari jam mulai
     rencana (dulu 04:00-05:15 dihitung kerja, kartu rencana "Belum mulai") */
  var belumMulai = planAktif && !jamManual && o.keluar < PLAN.keluar - 0.01 && !(parseRp(el("n-dpt").value) > 0);
  if (belumMulai) o.keluar = PLAN.keluar;
  /* Dibulatkan ke atas ke kelipatan 15 menit: pilihan "Rencana pulang" hanya
     berisi kelipatan 15 menit -- nilai lain (mis. 23,83 saat dibuka 23:20)
     membuat kolomnya kosong dan semua hitungan jadi NaN. */
  if (!(o.pulang>o.keluar)){ o.pulang=Math.min(24, Math.ceil((o.keluar+0.5)*4)/4); el("n-pulang").value=String(o.pulang); }

  /* kolom baterai kosong/bukan angka: pakai angka terakhir yang sah (dulu 1% -> "Baterai kritis") */
  var socKetik = parseFloat(el("n-soc").value);
  if (!isFinite(socKetik)) socKetik = (typeof runNow.socTerakhir === "number") ? runNow.socTerakhir : 65;
  var soc = Math.max(1,Math.min(100, socKetik));
  runNow.socTerakhir = soc;
  /* Perkiraan baterai dari jangkar terakhir (Mulai hari / selesai ngecas):
     mengisi kolom sendiri selama Ibu belum mengetik angka lain sejak jangkar. */
  var est = Baterai.perkiraan(o.keluar, opsiBaterai(o.pulang));
  var seTouched = el("n-soc").dataset.touched === "1";
  /* perkiraan 0% juga dipakai (dulu diabaikan dan kolom tetap 65%); kolom,
     bilah status, dan peringatan memakai angka yang sama (min. 1%) */
  if (est && !seTouched && Math.abs(Math.max(1, est.soc) - soc) >= 1 && est.soc >= 0){ soc = Math.max(1, est.soc); el("n-soc").value = soc; }
  renderSocEst(est, soc, seTouched);
  var dpt = Math.max(0, parseRp(el("n-dpt").value)||0);
  o.soc = soc;   /* rencana ngecas harus memakai daya nyata, bukan 90% */
  o.diRumahAwal = L.home <= 1;
  var stay = el("n-tujuan").value === "stay";
  var kmHome = stay ? 0 : L.home;
  /* Kalau Ibu jauh tapi sifnya masih panjang, perjalanan pulang dari
     luar wilayah sudah selesai jauh sebelum jam pulang — jadi protokol
     pulangnya dihitung dari wilayah inti, bukan dari titik terjauh. */
  var kmProtokol = kmHome;
  /* hanya untuk posisi berkoordinat (urutan tempat memang memindahkannya);
     km diketik tanpa koordinat = jarak sebenarnya (dulu "9 km ±16 menit"
     untuk tempat 40 km) */
  if (!stay && L.jauh && L.lat != null && (o.pulang - o.keluar) > (L.home / CALIB.kecepatan) + 1.5) kmProtokol = 9;
  /* Jam pulang nanti Ibu tidak akan persis di titik ini — pakai jarak
     khas wilayah inti, jangan nol. */
  if (!stay) kmProtokol = Math.max(kmProtokol, 6);
  o.kmHome = kmHome; o.stay = stay;
  o.kmProtokol = kmProtokol; o.tempatPulang = L;   /* jam berhenti narik = kartu "Waktunya pulang" */
  /* Insentif dihitung untuk SEHARI: jam yang sudah dikerjakan sejak mulai
     (dari rencana hari ini, atau jam mulai yang diisi) ditambah jam sisa. */
  var mulaiHari = planAktif ? PLAN.keluar : ((MULAI_HARI && typeof MULAI_HARI.keluar === "number") ? Math.min(MULAI_HARI.keluar, MULAI_HARI.jam) : (dpt > 0 ? 5.25 : o.keluar));
  /* sudah ada pendapatan tapi jam mulai rencana belum tiba: mulai sebenarnya lebih awal */
  if (dpt > 0 && mulaiHari > o.keluar) mulaiHari = (MULAI_HARI && typeof MULAI_HARI.keluar === "number") ? Math.min(MULAI_HARI.keluar, MULAI_HARI.jam, o.keluar) : Math.min(5.25, o.keluar);
  o.jamSebelum = Math.max(0, Math.min(o.keluar, o.pulang) - mulaiHari);
  if (planAktif){ var jd = rehatRange(PLAN.rehat); if (jd) o.jamSebelum -= Math.max(0, Math.min(o.keluar, jd[1]) - jd[0]); }
  o.jamSebelum = Math.max(0, o.jamSebelum);

  /* Dihitung dengan cara yang SAMA dengan kartu "tetap di sini": bobot ramai
     tempat per jam, aturan keluar Jakarta 20:00, pulang dari tempat terakhir.
     Posisi tanpa koordinat (km diketik) tetap cara lama per wilayah tarif. */
  var tpNow = tempatPosisi(L);
  if (tpNow){ o.urutan = Peluang.urutanTinggal(tpNow, o); o.tempatAwal = tpNow; }
  var r = simulate(o);
  var insentifHarian = r.insentif;
  var sisa = r.blockNet - r.feeCharge - r.parkir;
  /* "Sudah dapat" adalah angka KOTOR dari aplikasi; listrik yang sudah
     terbakar sejak mulai (model km per blok) dikurangkan supaya proyeksinya
     bersih seperti angka sisa hari. */
  /* jam "kalau..." pilihan Ibu tidak dihitung sudah dijalani; zona = daerah
     rencana/Mulai hari, bukan posisi sekarang (dulu pindah ke Jakarta menambah
     km pagi yang sudah lewat) */
  var akhirSejak = jamManual ? Math.min(o.keluar, jamSekarangTepat()) : o.keluar;
  var zonaSejak = planAktif ? PLAN.zona : (MULAI_HARI && MULAI_HARI.zona) || o.zona;
  var kmSejak = (dpt > 0 && akhirSejak > mulaiHari) ? Baterai.kmModel(mulaiHari, akhirSejak, zonaSejak, planAktif ? PLAN.rehat : "none") : 0;
  var listrikSejak = kmSejak / CALIB.kmkwh * TARIF_KWH;
  var proyeksi = dpt - listrikSejak + r.net;
  renderPlanCheck(o.keluar, dpt, L.z);
  AKTUAL = { jam:jamManual ? Math.min(o.keluar, jamSekarangTepat()) : o.keluar, dpt:dpt, lok:L.n, home:Math.round(kmHome*10)/10, z:L.z,
             tanggal:iso(new Date()) };
  try { localStorage.setItem("sekarang-terakhir", JSON.stringify(AKTUAL)); } catch (e) {}
  /* posisi narik terakhir hari ini yang JAUH dari rumah: km untuk "menit
     perjalanan pulang" (dulu terhapus begitu aplikasi dibuka di rumah) */
  if (!stay && kmHome > 1.5){ try { localStorage.setItem("posisi-narik-terakhir", JSON.stringify({ tanggal:AKTUAL.tanggal, home:AKTUAL.home, z:AKTUAL.z })); } catch (e) {} }

  el("n-net").textContent = rp(proyeksi);
  el("n-net").className = "big " + (proyeksi>=TARGET_DAY?"ok":(proyeksi>=TARGET_DAY*0.75?"mid":"bad"));
  el("n-bar").style.width = Math.max(0,Math.min(100,(proyeksi/TARGET_DAY)*100)).toFixed(1)+"%";
  var gap = TARGET_DAY - proyeksi;
  el("n-vs").innerHTML = gap>5000
    ? "Kurang <b>"+rp(gap)+"</b> dari target harian (Rp 515.000)"
    : gap > 0 ? "<b>Hampir tepat target</b> (kurang "+rp(gap)+")"
    : "<b>Di atas target.</b> Lebih "+rp(-gap)+" untuk bulan ini";

  /* Satu ambang untuk semua: batas aman (20%, 25% Jakarta) untuk "masih
     boleh terima order", dan batas pulang (15% + km pulang) untuk
     "minimal saat mulai pulang" -- bukan 10% di satu tempat dan L.res di
     tempat lain. */
  var resMin = socMinPulang(L.home, o.bat);
  var usableKm = Math.max(0, soc/100 - r.floor)*o.bat*CALIB.kmkwh;   /* km sampai lantai */
  var butuh = r.km + kmHome;
  var blk = blockAt(o.keluar, ctx.shapeDay);

  el("n-side").innerHTML = [
    ["Jam sekarang", (typeof labelBlok === "function" ? labelBlok(blk.n) : blk.n)], ["Sisa", Math.round(r.pieces.reduce(function(a, p){ return a + (p.jeda ? 0 : p.w); }, 0)*10)/10+" jam kerja"+(r.jedaJam > 0.01 ? ", "+Math.round(r.jedaJam*10)/10+" jam istirahat" : "")],
    ["Sisa hari (belum insentif)", rp(sisa)], ["Insentif hari ini", rp(insentifHarian)],
    ["Order sisa", "&asymp;"+Math.round(r.trips)+" &middot; "+Math.round(r.paidKm)+" km berpenumpang"]
  ].concat(dpt > 0 ? [["Listrik terpakai sejak "+hhmm(mulaiHari), "&minus;"+rp(listrikSejak)+" &middot; &asymp;"+Math.round(kmSejak)+" km"]] : []).concat([
    [stay ? "Km sampai "+hhmm(o.pulang) : "Km sampai pulang", Math.round(butuh)+" km"],
    ["Baterai cukup untuk", Math.round(usableKm)+" km"]
  ]).concat(stay ? [["Baterai akhir hari", "&asymp;"+pctB(r.socAkhir)+"%"+(r.sessions ? " &middot; "+r.sessions+"&times; ngecas" : "")]] : [
    ["Pulang dari sini", Math.round(kmHome)+" km"],
    ["Baterai minimal untuk pulang", resMin+"%"],
    ["Sampai rumah", "&asymp;"+Math.round(Math.max(0, r.socTiba)*100)+"%"+(r.sessions ? " &middot; "+r.sessions+"&times; ngecas" : "")]
  ]).map(function(x){ return "<div><span>"+x[0]+"</span><b>"+x[1]+"</b></div>"; }).join("");

  /* Baterai jadi banner terpisah, supaya judul kartu selalu mencerminkan
     lokasi dan blok jam — bukan tertimpa peringatan daya. */
  var bw = el("batwarn");
  /* "Ngecas sekarang" hanya kalau rencana memang ngecas sekarang (atau tidak
     sempat ngecas sama sekali); kalau sesi pertamanya nanti, spanduk biasa
     dengan jamnya -- dulu spanduk "sekarang" vs langkah "jam 20:00". */
  var sesiNanti = r.sessions > 0 && r.sesi[0].jam > o.keluar + 0.25;
  var colokRumah = o.rumah && L.home <= 1;
  if (soc < resMin && !stay && !colokRumah && !sesiNanti){
    bw.hidden = false; bw.className = "batwarn";
    bw.innerHTML = '<span class="tag">Baterai kritis</span><span><b>Ngecas sekarang.</b> Baterai '+soc+
      (L.home <= 1 ? "%: isi dulu di SPKLU terdekat dari rumah sebelum narik lagi."
       : resMin > 95 ? "%; " + L.n + " terlalu jauh untuk pulang dengan sekali isi &mdash; ngecas penuh dan sekali lagi di jalan."
       : "%, untuk pulang dari "+L.n+" butuh minimal <b>"+resMin+"%</b>.") +
      (spkluTeks(spkluUntuk(L)) ? " SPKLU terdekat: " + spkluTeks(spkluUntuk(L)) + "." : "") +
      (spkluCepatTeks(L, spkluUntuk(L)) ? " " + spkluCepatTeks(L, spkluUntuk(L)) : "") + "</span>";
  } else if (r.sessions > 0 && colokRumah && !stay && r.sesi[0].jam <= o.keluar + 0.25 && r.sesi[0].ac){
    var s0 = r.sesi[0];
    bw.hidden = false; bw.className = "batwarn";
    bw.innerHTML = '<span class="tag">Baterai ' + soc + '%</span><span><b>Colok di rumah dulu</b>, sampai &plusmn;' + pctB(s0.ke) + '%' + (s0.ac ? ' (&plusmn;' + (s0.durasi < 1 ? Math.round(s0.durasi * 60) + ' menit' : s0.durasi.toFixed(1).replace(".", ",") + ' jam') + ' dengan colokan rumah)' : '') + ', baru berangkat.</span>';
  } else if (r.sessions > 0){
    var s1 = r.sesi[0];
    bw.hidden = false; bw.className = "batwarn mild";
    bw.innerHTML = '<span class="tag">Ngecas '+r.sessions+'&times;</span><span><b>Ngecas jam '+hhmm(s1.jam)+", "+
      pctB(s1.dari)+"&rarr;"+pctB(s1.ke)+"%, &plusmn;"+Math.round(s1.durasi*60)+" menit</b>"+
      (s1.diJeda ? " (saat istirahat)" : (s1.peak ? " &mdash; <b>terpaksa di jam peak</b>" : ""))+
      ". Baterai cukup "+Math.round(usableKm)+" km, "+(o.stay ? "sampai selesai narik" : "sampai pulang")+" perlu "+Math.round(butuh)+" km." +
      (spkluTeks(spkluUntuk(L)) ? '<details class="kenapa"><summary>SPKLU terdekat</summary><div>' + spkluTeks(spkluUntuk(L)) +
        (typeof SpkluTT !== "undefined" && SpkluTT.status() ? " (jarak jalan; colokan dari TomTom)." : " (jarak jalan; jenis colokan belum dicek &mdash; isi kunci TomTom untuk melihatnya).") +
        (spkluCepatTeks(L, spkluUntuk(L)) ? "<br>" + spkluCepatTeks(L, spkluUntuk(L)) : "") + "</div></details>" : "") + "</span>";
  } else { bw.hidden = true; }

  /* Tandai centang mana yang terisi sendiri, mana yang Ibu ubah. */
  function srcTag(id, auto){
    var e = el("src-"+id), inp = el("n-"+id);
    if (inp.dataset.touched){ e.textContent = "diubah Ibu"; e.className = "man"; }
    else if (auto){ e.textContent = "otomatis"; e.className = ""; }
    else { e.textContent = ""; }
  }
  srcTag("hujan", !!(WEATHER && WEATHER.hujan && WEATHER.tanggal === iso(new Date())));
  srcTag("acara", !!ctx.ev);

  var v;
  var jedaPlan = planAktif ? rehatRange(PLAN.rehat) : null;
  /* sisa istirahat < 15 menit, atau jam narik sudah habis: kartu biasa
     (dulu "istirahat sampai 16:00" jam 15:50, padahal langkahnya pulang) */
  /* sama dengan langkah: istirahat di rumah hanya kalau simulasi memulangkan Ibu */
  var jedaKini = r.pieces.filter(function(q){ return q.jeda && q.s <= o.keluar + 0.01 && q.e > o.keluar; })[0];
  var jedaSini = stay || (jedaKini && jedaKini.diRumah != null ? !jedaKini.diRumah : L.home > 15);
  /* kartu istirahat hanya kalau hitungan juga istirahat sekarang (dulu kartu
     "istirahat sampai 21:15" padahal jam narik habis 20:30) */
  if (jedaPlan && jedaKini && o.keluar >= jedaPlan[0] && jedaPlan[1] - o.keluar >= 0.25 && !o.habisKerja){
    /* Rencana Ibu sendiri bilang jam ini istirahat — kartu tidak boleh
       menyuruh kerja dan menabrak rencananya. */
    v = { k:"warn", h:"Menurut rencana, jam ini istirahat",
          r:(jedaKini && jedaKini.sesi && jedaKini.sesi.sebelumPindah ? "Ngecas dulu di SPKLU terdekat, lalu " + (jedaSini ? "istirahat" : "pulang istirahat")
             : jedaSini ? "Makan dan istirahat di sekitar sini" : "Pulang, makan, tidur sebentar")+" &middot; sampai "+hhmm(jedaPlan[1]),
          p:"Jam paling sepi. Kalau mau lanjut, ubah dulu di Rencanakan." };
  } else {
    v = advise(blk, L, o);
  }
  el("verdict").className = "verdict"+(v.k?" "+v.k:"");
  el("verdict").innerHTML = '<span class="n">'+(belumMulai ? "Mulai" : "Sekarang")+' &middot; '+hhmm(o.keluar)+" &middot; "+
    L.n+(L.perkiraan?" (perkiraan)":"")+"</span><h3>"+v.h+
    '</h3><p class="route">'+v.r+"</p><p>"+v.p+"</p>"+
    (v.kenapa ? '<details class="kenapa"><summary>Kenapa?</summary><div>'+v.kenapa+"</div></details>" : "");
  renderStatusBar(o, L, soc, dpt);

  var langkah = buildSteps(o, r,
    { cum:dpt - listrikSejak, markNow:true, kmHome:kmProtokol, stay:stay, L:L, verdict:v });
  /* "Tidak pulang": tidak ada "sampai pulang" di judul mana pun */
  var sampaiTeks = stay ? "sampai " + hhmm(o.pulang) : "sampai pulang";
  renderStepsRingkas(el("n-steps"), langkah, "Langkah " + sampaiTeks);
  if (el("proy-judul")) el("proy-judul").textContent = "Perkiraan bersih " + sampaiTeks;
  if (el("peluang-judul")) el("peluang-judul").textContent = "Urutan tempat " + sampaiTeks;
  catatProyeksi(dateStr, proyeksi);
  SEKARANG = { v:v, langkah:langkah, proyeksi:proyeksi, sisa:sisa, gap:gap,
               insentif:insentifHarian, blok:blk, r:r, L:L, o:o,
               usableKm:usableKm, butuh:butuh, soc:soc, stay:stay };
  SEKARANG.rek = renderRekomendasi(o, L, soc, stay);
  SEKARANG.peluang = renderPeluang("peluang", o, L, { dpt:dpt });
  briefingOtomatis();
  lalulintasOtomatis(o, L);
  renderJalan(o, L, false);
  perbaruiRute();
  renderTujuan();

  var nn=[];
  var URUTAN_NOTE = { bad:0, warn:1, good:3 };   /* default (netral "") = 2 */
  function tambah(k, judul, isi, kenapa){
    nn.push({ k:k, s:URUTAN_NOTE.hasOwnProperty(k) ? URUTAN_NOTE[k] : 2, html:catatan(k, judul, isi, kenapa) });
  }
  if (dpt > 0 && dpt < 1000) tambah("bad","Sudah dapat Rp "+Math.round(dpt)+"?","Maksudnya <b>Rp "+(Math.round(dpt)*1000).toLocaleString("id-ID")+"</b>? Ketik angkanya lengkap, boleh pakai titik ribuan (150.000).");
  if (jamLuar && !jamManual){
    var jn = new Date();
    tambah("bad","Sudah lewat jam",
      "Sekarang "+String(jn.getHours()).padStart(2,"0")+":"+String(jn.getMinutes()).padStart(2,"0")+", angka di atas untuk jam <b>"+hhmm(o.keluar)+"</b>. <b>Kalau masih di jalan: " + (o.perluCasPulang || o.casSekarang ? "ngecas dulu, lalu pulang." : "pulang.") + "</b>",
      "Aplikasi hanya punya tarif untuk 03:30\u201323:30; jam di luar itu tidak pernah diukur.");
  }
  var ngecasDiPeak = langkah.some(function(x){ return x.cls === "charge" && (x.peak === true || (x.blok && PEAKS[x.blok])); });
  if (ngecasDiPeak && soc < 85) tambah("bad","Ngecas kena jam peak",
    "Berangkat di atas 85% besok bisa nambah &plusmn;<b>"+rp(blockRate(BASE[1], ctx.shapeDay)*0.6)+"</b>.",
    "Ngecas terpaksa jatuh di jam peak karena berangkat dengan baterai "+soc+"%. Jam peak bernilai sekitar "+rp(blockRate(BASE[1], ctx.shapeDay))+" per jam.");
  if (o.keluar < 5.25) tambah("warn","Angka subuh masih tebakan",
    "Tarif 03:30\u201305:15 belum ada catatannya.", "Coba tiga hari, catat di tab Catatan, lalu bandingkan Rp per jamnya dengan peak pagi biasa.");
  if (L.perkiraan) tambah("warn","Jarak masih perkiraan",
    "Jarak dari "+L.n+" (&plusmn;"+Math.round(L.home)+" km) bisa meleset 20%.", "Tempat ini tidak ada di daftar terukur; perilakunya disamakan dengan "+L.anchor+".");
  if (!CALIB.kecUkur) tambah("warn","Waktu pulang masih tebakan",
    "Catat sekali <b>menit perjalanan pulang</b> di tab Catatan supaya pas.", "Perjalanan pulang dihitung "+Math.round(CALIB.kecepatan)+" km/jam di jam sibuk; dari tempat jauh selisih 10 km/jam berarti beda lebih dari satu jam.");
  var wk = watakLok(L);
  if (wk){
    var isi = wk.kode.split("").map(function(c){ var a = WATAK_ARTI[c]; return a ? "<b>"+a[0]+":</b> "+a[1] : ""; }).filter(function(x){ return x; }).join(" ");
    var lem = (wk.i >= 0) ? KRLL[wk.i] : 0;
    if (lem) isi += (isi ? " " : "") + "<b>Stasiun:</b> 10:00\u201315:00 kereta tinggal " + Math.round(lem*100) + "%" + (lem <= 0.6 ? " \u2014 jangan menunggu di stasiun jam segitu." : ".");
    if (isi) tambah("","Di sekitar " + wk.kec, isi, "Dari apa yang ada di sana menurut peta, bukan dari jumlah order terukur.");
  }
  /* per angka: mana yang dari catatan Ibu, mana yang masih perkiraan (dulu
     semuanya disebut "angka Ibu" walau km berpenumpang tidak pernah diisi) */
  var dariI = CALIB.dari || {};
  if (CALIB.live) tambah("good","Pakai angka Ibu ("+CALIB.n+" hari)",
    "Rp "+Math.round(CALIB.rpkm).toLocaleString("id-ID")+"/km"+(dariI.rpkm ? "" : " (perkiraan &mdash; isi km berpenumpang)")+
    ", insentif "+rp(CALIB.ins)+(dariI.ins ? "" : " (perkiraan)")+", "+dec(CALIB.kmkwh,1)+" km/kWh"+(dariI.kmkwh ? "" : " (perkiraan)")+".");
  else tambah("warn","Masih angka perkiraan","Isi 3 hari di tab Catatan supaya jadi angka Ibu.");
  if (gap>5000 && o.pulang<21.5){
    var tj = tambahanJam(o, r, 1.5);
    var sampai = tj.sampai, tambahRp = tj.tambah;
    var lamaT = sampai - o.pulang, lamaTeks = lamaT >= 1 ? lamaT.toFixed(1).replace(".", ",").replace(",0", "") + " jam" : Math.round(lamaT * 60) + " menit";
    if (lamaT < 0.25) tambahRp = 0;   /* tidak ada ruang sebelum batas pulang */
    if (tambahRp > 10000) tambah("warn","Kalau lanjut "+lamaTeks+" (sampai "+hhmm(sampai)+")","+<b>"+rp(tambahRp)+"</b>, menutup "+Math.round(Math.min(100,tambahRp/gap*100))+"% kekurangan.");
    else if (tambahRp < -2000) tambah("bad","Jangan lanjut",lamaTeks+" lagi malah rugi &plusmn;"+rp(-tambahRp)+" (harus ngecas lagi). Kejar besok saja.");
  }
  if ((o.pulang - o.keluar) <= 2.5) tambah("warn","Cek target insentif Grab",
    "Sebelum berhenti, lihat sisa target insentif di aplikasi Grab; kalau tinggal 1\u20132 order, selesaikan dulu.",
    "Insentif di sini dihitung rata menurut jam ("+rp(insentifHarian)+"). Kalau insentif Grab bertingkat, order terakhir menjelang target jauh lebih berharga.");
  if (gap>100000 && (ctx.dow===2||ctx.dow===3)) tambah("","Selasa/Rabu biasanya lebih sepi","Kejar kekurangannya hari Jumat, jangan narik lewat 12 jam.","Pengali hari (Selasa/Rabu terlemah, Jumat terkuat) masih asumsi dari Rute 700K, belum dari catatan Ibu.");
  if (ctx.ramadan) tambah("", "Bulan puasa: pola jam berubah",
    "Jelang buka (&plusmn;15:30&ndash;18:00) biasanya paling ramai dan paling macet; saat buka (&plusmn;18:00&ndash;19:00) order turun; ramai lagi setelah tarawih/bukber. <b>Angka perkiraan di atas belum memperhitungkan ini.</b>",
    esc(ctx.ramadan) + ". Pola ini pengetahuan umum, bukan hasil ukur. Aplikasi baru bisa menghitung dampaknya dari catatan Ibu di hari-hari puasa (isi order per jam tiap malam).");
  if (ctx.sekolahLibur) tambah("", "Libur sekolah",
    "Pagi biasanya lebih lengang; bandara dan mal cenderung lebih ramai. <b>Angka perkiraan di atas belum memperhitungkan ini.</b>",
    esc(ctx.sekolahLibur) + " (kalender pendidikan Banten 2026/2027). Dampaknya ke order Ibu belum pernah diukur; catatan harian di hari libur sekolah yang akan menunjukkannya.");
  if (ctx.dow===5 && blk.n==="Siang") tambah("","Jumat siang: taksiran, bukan angka pasti",
    "Perkiraan diturunkan sedikit sekitar jam ini untuk sholat Jumat &mdash; ini dugaan kasar, belum dari catatan Ibu sendiri.",
    "Rute 700K tidak memisahkan jam sholat Jumat dari siang biasa, jadi angkanya ditaksir turun ~17% untuk blok 11:00&ndash;14:00 di hari Jumat. Kalau kenyataannya beda, isian &ldquo;Order per jam&rdquo; di hari Jumat akan mengoreksinya sendiri (lihat &ldquo;Pola jam dari catatan Ibu&rdquo; di tab Catatan).");
  if (o.filter===0 && L.z==="jkt") tambah("bad","Filter habis di Jakarta","Ambil order apa pun ke arah barat, jangan pulang kosong "+Math.round(kmHome)+" km.");
  if (o.hujan){
    var dh = dampak(o, {hujan:false});
    tambah("warn","Hujan sudah dihitung","+"+rp(dh)+". Hindari banjir Periuk, Ciledug, Jakarta Barat; jangan terobos genangan &gt;15 cm.");
  }
  if (ctx.ev){
    tambah("good","Acara sudah dihitung", "<b>"+esc(ctx.ev[0])+"</b> di "+esc(ctx.ev[1])+". "+
      (ctx.ev[2]==="lokal" ? "Sore/malam ada di sekitar BSD saat bubar." : "Di Jakarta: bubar larut, pulang jauh. Ambil hanya kalau besok libur."));
  } else if (o.acara){
    var da = dampak(o, {acara:false});
    tambah("good","Acara besar sudah dihitung","+"+rp(da)+".");
  }
  /* Kartu bad (kritis) selalu tampil. Selain itu, ringkas ke NOTES_BATAS
     supaya tidak sampai 10 kartu berbobot sama menumpuk sekali lirik --
     sisanya di balik satu tombol, pola yang sama dengan #rek-toggle. */
  nn.sort(function(a, b){ return a.s - b.s; });
  var NOTES_BATAS = 4;
  var wajib = nn.filter(function(x){ return x.k === "bad"; });
  var lain = nn.filter(function(x){ return x.k !== "bad"; });
  var sisaSlot = Math.max(0, NOTES_BATAS - wajib.length);
  var tampil = notesSemua ? nn : wajib.concat(lain.slice(0, sisaSlot));
  var sisa = notesSemua ? [] : lain.slice(sisaSlot);
  var htmlNotes = tampil.map(function(x){ return x.html; }).join("");
  if (sisa.length || notesSemua){
    htmlNotes += '<button type="button" class="linkbtn" id="notes-toggle">' +
      (notesSemua ? "Tampilkan sedikit saja" : "Lihat " + sisa.length + " catatan lainnya") + "</button>";
  }
  el("n-notes").innerHTML = htmlNotes;
  var ntg = el("notes-toggle");
  if (ntg) ntg.addEventListener("click", function(){ notesSemua = !notesSemua; runNow(); });
}

/* Baris status untuk lirikan 3 detik; ketuk untuk membuka panel masukan. */
function renderStatusBar(o, L, soc, dpt){
  var b = el("statusbar"); if (!b) return;
  b.innerHTML = "<span><b>" + hhmm(o.keluar) + "</b></span><span class=\"sb-tempat\">" + esc(L.n) + "</span><span>Baterai <b>" + soc + "%</b></span>" +
    (dpt > 0 ? "<span>Sudah dapat <b>" + rp(dpt) + "</b></span>" : "") + "<span>Pulang <b>" + hhmm(o.pulang) + "</b></span><em>ubah \u25BE</em>";
}

/* ---------------- PLAN ---------------- */

function segColor(rate,on){
  if (!on) return "var(--t-off)";
  if (rate>=40000) return "var(--t-hi)";
  if (rate>=28000) return "var(--t-mid)";
  return "var(--t-lo)";
}
/* warna tulisan yang terbaca di atas warna blok (dulu putih di atas biru muda: 1,8:1) */
function segInk(rate,on){
  if (!on) return "var(--muted)";
  return rate>=40000 ? "var(--t-hi-ink)" : rate>=28000 ? "var(--t-mid-ink)" : "var(--t-lo-ink)";
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
  /* istirahat dipotong ke jam sif; yang di luar sif bukan istirahat rencana ini */
  var jedaR = rehatRange(o.rehat);
  if (jedaR){ jedaR = [Math.max(jedaR[0], o.keluar), Math.min(jedaR[1], o.pulang)]; if (jedaR[1] - jedaR[0] < 0.25) jedaR = null; }

  el("p-net").textContent = rp(r.net);
  el("p-net").className = "big "+(r.net>=TARGET_DAY?"ok":(r.net>=TARGET_DAY*0.75?"mid":"bad"));
  el("p-bar").style.width = Math.max(0,Math.min(100,(r.net/TARGET_DAY)*100)).toFixed(1)+"%";

  var from=3.5,to=24,span=to-from,h="";
  /* label = nama yang dipakai di tempat lain (labelBlok), dan hanya kalau
     muat di lebarnya (dulu "Subuł", "i ak", "a-peak" terpotong) */
  var lebarTl = el("p-tl").clientWidth || Math.min(window.innerWidth || 360, 720) - 40;
  r.segs.forEach(function(s){
    var w=((s.e-s.s)/span)*100, nama=labelBlok(s.n), lbl=(nama.length*6.2+6 <= w/100*lebarTl)?nama:"";
    h+='<div class="seg'+(s.on?"":" off")+'" style="width:'+w.toFixed(2)+"%;background:"+
       segColor(s.rate,s.on)+";color:"+segInk(s.rate,s.on)+'"><span>'+esc(lbl)+"</span></div>";
  });
  el("p-tl").innerHTML=h;

  el("p-side").innerHTML = [
    ["Jam efektif", r.effHours.toFixed(1).replace(".", ",")+" j"], ["Per jam kerja", rp(r.perHour)],
    ["&asymp; Order", Math.round(r.trips)+" &middot; Rp "+Math.round(r.rpOrder).toLocaleString("id-ID")+"/order"],
    ["Km berbayar", Math.round(r.paidKm)+" dari "+Math.round(r.kmTotal)+" km"],
    ["Listrik", dec(r.kwh,1)+" kWh &middot; "+rp(r.listrik)],
    ["Pendapatan blok", rp(r.blockNet)], ["Insentif", rp(r.insentif)],
    ["Sesi SPKLU", r.sessions+"&times;"+(r.sessions ? " &middot; "+Math.round(r.chargeHours*60)+" mnt kerja hilang" : "")],
    ["Baterai", Math.round(r.soc0*100)+"%"+(socAwalPlan != null ? " (Mulai hari)" : "")+" &rarr; terendah "+pctB(Math.min(r.soc0, r.socMinKerja, r.socAkhir))+"% &rarr; tiba "+Math.round(Math.max(0,r.socTiba)*100)+"%"]
  ].map(function(x){ return "<div><span>"+x[0]+"</span><b>"+x[1]+"</b></div>"; }).join("");
  el("p-ringkas").innerHTML = "<b>"+hhmm(o.keluar)+"&ndash;"+hhmm(o.pulang)+"</b>"+(jedaR ? ", istirahat "+hhmm(jedaR[0])+"&ndash;"+hhmm(jedaR[1]) : "")+
    ": &asymp;<b>"+Math.round(r.trips)+" order</b>, "+Math.round(r.kmTotal)+" km, "+(r.sessions ? r.sessions+"&times; ngecas" : "tanpa ngecas")+
    ", bersih &plusmn;<b>"+rp(r.net)+"</b> ("+rp(r.perHour)+"/jam).";

  renderSteps(el("p-steps"), buildSteps(o, r,
    { kmHome:ZONA[o.zona].pulang, L:{ z:o.zona, jauh:false }, rencana:true }), "Langkah hari itu");

  var nn=[];
  if (ctx.holi) nn.push(catatan("warn","Tanggal merah","<b>"+ctx.holi[0]+".</b> Tidak ada peak pagi; mulai siang, mal\u2013kuliner\u2013bandara sampai malam."));
  if (ctx.eve) nn.push(catatan("good","Besok libur","Sore\u2013malam kejar bandara, Batu Ceper, Terminal Poris."));
  /* hanya kalau memang terbukti dengan hitungan yang sama (dulu klaim tetap,
     keliru di 390 dari 410 kasus) */
  if (o.keluar>=10.5 && o.keluar<14.5 && o.pulang > 15.5){
    var r15 = simulate(Object.assign({}, o, { keluar:15 }));
    if (r15.net > r.net + 5000) nn.push(catatan("bad","Mulai siang = jam paling murah","Keluar jam 15:00 lebih untung &plusmn;"+rp(r15.net - r.net)+"."));
  }
  if (r.effHours>12) nn.push(catatan("bad","Lewat batas 12 jam","<b>"+r.effHours.toFixed(1).replace(".", ",")+" jam</b> narik."));
  else if (r.effHours<=8.4 && r.net > 0) nn.push(catatan("good","Sesuai aturan 8 jam","Per jam <b>"+rp(r.perHour)+"</b> \u2014 biasanya paling tinggi."));
  if (!(r.effHours > 0.05)) nn.push(catatan("bad","Tidak ada jam narik","Jam mulai "+hhmm(o.keluar)+" sudah di batas jam pulang hari itu."));
  if (r.sessions) nn.push(catatan(r.sesi.some(function(x){ return x.peak; }) ? "bad" : "", "Ngecas "+r.sessions+"&times;",
    r.sesi.map(function(x){
      return "Jam "+hhmm(x.jam)+": "+pctB(x.dari)+"&rarr;"+pctB(x.ke)+"%, &plusmn;"+Math.round(x.durasi*60)+" menit"+
             (x.diJeda ? " (saat istirahat)" : "")+(x.ac ? " (colok di rumah 7 kW)" : "")+(x.peak ? " \u2014 <b>terpaksa di jam peak</b>" : "")+".";
    }).join(" ")+" Biaya "+rp(r.feeCharge)+".",
    "Semua penempatan dicoba dan yang termurah dipilih; tiap sesi diisi secukupnya sampai sesi berikutnya atau sampai pulang dengan cadangan. Sebelum istirahat hanya sedikit, isi penuhnya saat istirahat."+
    r.sesi.map(function(x){ return (!x.diJeda && (x.jamHilang+(x.luber||0)) > 0.05) ? " Jam "+hhmm(x.jam)+": "+Math.round((x.jamHilang+(x.luber||0))*60)+" menit narik hilang." : ""; }).join("")));
  if (r.socTiba < 0.12) nn.push(catatan("bad","Baterai kurang",
    "Sampai rumah &plusmn;<b>"+Math.round(Math.max(0,r.socTiba)*100)+"%</b>"+(r.sessions >= 3 ? " walau sudah tiga kali ngecas" : "")+". Pulang lebih awal, tambah istirahat untuk ngecas, atau berangkat lebih penuh."));
  else if (r.socMinKerja < r.floor - 0.005) nn.push(catatan(r.socMinKerja < r.floor - 0.05 ? "bad" : "warn","Baterai sempat &plusmn;"+Math.round(Math.max(0,r.socMinKerja)*100)+"%",
    "Di bawah batas aman "+Math.round(r.floor*100)+"%. Saat itu ambil order pendek, dekat SPKLU.",
    r.socMinKerja >= r.floor - 0.05 ? "Sengaja dibiarkan: satu kali ngecas lagi lebih mahal daripada selisihnya." : "Tambah istirahat untuk ngecas lebih awal, atau berangkat lebih penuh."));
  if (jedaR){
    var tanpaPagi = !!ctx.holi || ctx.dow === 0 || ctx.dow === 6;   /* tidak ada peak pagi di hari itu */
    var makanPeak = BASE.filter(function(b){ return PEAKS[b.n] && !(tanpaPagi && b.n === "Peak pagi") && Math.min(b.e, jedaR[1]) - Math.max(b.s, jedaR[0]) > 0.25; });
    if (makanPeak.length) nn.push(catatan("warn","Istirahat memotong "+makanPeak.map(function(b){ return b.n.toLowerCase(); }).join(" dan "),
      "Istirahat "+hhmm(jedaR[0])+"&ndash;"+hhmm(jedaR[1])+" kena jam termahal. Kalau bisa, geser."));
    var dur = jedaR[1]-jedaR[0], jt = jedaTermurah(o, dur);
    if (jt && jt.net - r.net > 10000) nn.push(catatan("good","Istirahat "+hhmm(jt.s)+"&ndash;"+hhmm(jt.e)+" lebih untung",
      "+"+rp(jt.net - r.net)+" dengan lama yang sama. <button type=\"button\" class=\"linkbtn\" data-jeda=\""+jt.s+","+jt.e+"\">Pakai</button>"));
  } else if ((o.pulang - o.keluar) > 4.5){
    var jt2 = jedaTermurah(o, 0.5);
    nn.push(catatan("warn","Belum ada istirahat",
      (jt2 ? "Paling pas 30 menit jam <b>"+hhmm(jt2.s)+"&ndash;"+hhmm(jt2.e)+"</b> ("+(jt2.net - r.net >= 0 ? "+" : "\u2212")+rp(Math.abs(jt2.net - r.net))+"). <button type=\"button\" class=\"linkbtn\" data-jeda=\""+jt2.s+","+jt2.e+"\">Pakai</button>" : ""),
      "Aturan lalu lintas: istirahat 30 menit tiap 4 jam mengemudi."));
  }
  var batasPulang = batasMalam(ctx);
  /* batas = jam paling lambat MULAI pulang (sama dengan simulate, langkah, dan
     "Kalau lanjut"); dulu jam TIBA 22:30 dibilang lewat batas padahal langkah
     dan saran lanjut di tab Sedang narik menyarankan persis itu */
  var jpBatas = jamMulaiPulang(o, null);
  if (o.pulang - jpBatas > batasPulang + 0.01) nn.push(catatan("bad","Pulang "+hhmm(o.pulang)+" lewat batas "+hhmm(batasPulang),"Narik paling lambat sampai "+hhmm(batasPulang)+", lalu pulang (tiba &plusmn;"+hhmm(batasPulang + jpBatas)+"). Sebaiknya jangan lebih."+(batasPulang === 20.5 ? " Senin pagi harus segar." : "")));
  if (ctx.dow === 6 && !ctx.holi && o.keluar < 7.5) nn.push(catatan("","Sabtu","Tidak ada peak pagi; saran mulai <b>07:30</b>."));
  if (ctx.dow === 0 && !ctx.holi && o.keluar < 7) nn.push(catatan("","Minggu","Pagi tenang; saran mulai <b>07:00</b>, selesai <b>"+hhmm(batasMalam(ctx))+"</b>."));
  if (ctx.dow === 1 && !ctx.holi && o.keluar > 4.75 && o.keluar <= 5.25) nn.push(catatan("","Senin","Peak pagi paling berat; saran berangkat <b>04:45</b>."));
  if (ctx.gajian) nn.push(catatan("good","Tanggal gajian (25\u20135)", ctx.holi ? "Ramai; di tanggal merah ramainya siang sampai malam." : "Ramai. Pakai jadwal penuh."));
  if (ctx.ramadan) nn.push(catatan("","Bulan puasa: pola jam berubah","Jelang buka (&plusmn;15:30&ndash;18:00) paling ramai dan macet; saat buka order turun. <b>Angka di atas belum memperhitungkan ini.</b>"));
  if (ctx.sekolahLibur) nn.push(catatan("","Libur sekolah","Pagi biasanya lebih lengang; bandara dan mal lebih ramai. <b>Angka di atas belum memperhitungkan ini.</b>"));
  if ((o.zona==="jkt"||o.zona==="mix") && !r.filterOK) nn.push(catatan("bad","Filter tujuan kurang",
    "Ke Jakarta butuh 1 filter per peak untuk pulang bawa penumpang. Dengan "+o.filter+", "+(o.filter ? "peak pagi" : "kedua peak")+" dihitung lebih rendah."));
  if (AKTUAL && AKTUAL.tanggal === dateStr && AKTUAL.dpt > 0){
    var sampai = simulate({ ctx:ctx, keluar:o.keluar, pulang:Math.max(o.keluar,Math.min(AKTUAL.jam, o.pulang)),
      rehat:o.rehat, zona:o.zona, filter:o.filter, bat:o.bat, rumah:o.rumah,
      hujan:o.hujan, acara:o.acara, stay:true });
    var beda = AKTUAL.dpt - sampai.gross;
    nn.push(catatan(beda>=0?"good":"warn","Dari lapangan",
      "Jam "+hhmm(AKTUAL.jam)+" sudah dapat <b>"+rp(AKTUAL.dpt)+"</b>, rencana "+rp(sampai.gross)+" \u2014 "+(beda>=0 ? "unggul "+rp(beda) : "tertinggal "+rp(-beda))+"."));
  }
  if (ctx.ev) nn.push(catatan("good","Acara sudah dihitung","<b>"+esc(ctx.ev[0])+"</b> di "+esc(ctx.ev[1])+"."));
  if (o.hujan){
    var dhp = dampak(o, {hujan:false});
    nn.push(catatan("warn","Hujan sudah dihitung","+"+rp(dhp)+" dibanding hari kering."));
  }
  el("p-notes").innerHTML = nn.join("");
  Array.prototype.forEach.call(el("p-notes").querySelectorAll("[data-jeda]"), function(b){
    b.addEventListener("click", function(){
      var v = b.getAttribute("data-jeda").split(",");
      setJedaUI([parseFloat(v[0]), parseFloat(v[1])]); runPlan(); statusRencana();
    });
  });

  /* Sif terbaik dipilih dari yang SAH: jam efektif > 12 melanggar batas
     pengemudi angkutan umum, jadi tidak boleh dinobatkan sebagai acuan. */
  /* urutan tempat dihitung per tempat mulai dari rumah; untuk daerah selain
     Tangerang angkanya memakai model lain dari rencana di atas (dulu "terbaik"
     tanpa Jakarta/bandara sama sekali) -- tidak ditampilkan */
  if (o.zona === "tng") renderPeluang("p-peluang", o, LOKMAP.kota, { rencana:true });
  else el("p-peluang").hidden = true;

  /* pola memakai batas pulang hari itu (Minggu 20:30, lainnya 22:00) dan
     baterai awal yang sama dengan rencana di atas -- dulu "paling untung"
     sampai 23:00 lalu "Sebaiknya jangan", dan angka kartu beda dari rencana */
  var batasHari = batasMalam(ctx);
  var best=-1, res=PRESETS.map(function(p0){
    var p = { n:p0.n, k:p0.k, p:Math.min(p0.p, batasHari), r:p0.r };
    var qq = {ctx:ctx,keluar:p.k,pulang:p.p,rehat:p.r,zona:o.zona,filter:o.filter,
      bat:o.bat,rumah:o.rumah,hujan:o.hujan,acara:o.acara};
    if (typeof o.soc === "number") qq.soc = o.soc;
    var rr=simulate(qq);
    var sah = rr.effHours <= 12;
    if (sah && rr.net>best) best=rr.net; return {p:p,r:rr,sah:sah};
  });
  el("cmphead").textContent = ctx.name+(ctx.holi?" · tanggal merah":"")+" · "+ZONA[o.zona].label;
  /* Kartu yang bisa diketuk (dulu tabel 560 px yang harus digeser dan tidak
     bisa dipakai): ketuk = pakai pola itu di rencana di atas. */
  var rehatSekarang = JSON.stringify(rehatRange(o.rehat));
  el("cmp").innerHTML = res.map(function(x, i){
    var rg = rehatRange(x.p.r), dipakai = x.p.k === o.keluar && x.p.p === o.pulang && JSON.stringify(rg) === rehatSekarang;
    return '<button type="button" class="pola' + (x.sah && x.r.net === best ? " best" : "") + (dipakai ? " dipakai" : "") + '" data-pola="' + i + '">' +
      '<span class="pola-n">' + x.p.n + (x.sah ? "" : ' <em class="man">&gt;12 jam</em>') + (x.sah && x.r.net === best ? ' <em class="pola-tag">paling untung</em>' : "") + (dipakai ? ' <em class="pola-tag">dipakai</em>' : "") + "</span>" +
      '<span class="pola-jam">' + hhmm(x.p.k) + "&ndash;" + hhmm(x.p.p) + (rg ? " &middot; istirahat " + hhmm(rg[0]) + "&ndash;" + hhmm(rg[1]) : " &middot; tanpa istirahat") + "</span>" +
      '<span class="pola-angka"><b>' + rp(x.r.net) + "</b> bersih &middot; " + rp(x.r.perHour) + "/jam &middot; narik " + x.r.effHours.toFixed(1).replace(".", ",") + " jam</span></button>";
  }).join("");
  Array.prototype.forEach.call(el("cmp").querySelectorAll("[data-pola]"), function(b){
    b.addEventListener("click", function(){
      var p = res[+b.getAttribute("data-pola")].p;
      el("p-keluar").value = p.k; el("p-pulang").value = p.p; setJedaUI(p.r); runPlan(); statusRencana();
      el("p-net").scrollIntoView({ behavior:"smooth", block:"center" });
      el("p-status").textContent = "Pola \u201c" + p.n + "\u201d dipakai. Tekan \u201cPakai rencana ini\u201d kalau mau dipakai hari itu.";
    });
  });
  el("cmp-asal").innerHTML = "Tiap pola dihitung dengan mesin yang sama dengan rencana di atas: hari yang Ibu pilih (" + esc(ctx.name) +
    (ctx.holi ? ", tanggal merah" : "") + "), daerah, filter tujuan, baterai, hujan, dan acara dari isian di atas. " +
    "Tarif per blok jam " + (CALIB.live ? "dari <b>catatan Ibu sendiri</b>" : "dari <b>Rute 700K</b> (angka umum; setelah 3 hari catatan, angka Ibu sendiri yang dipakai)") + ". " +
    "<b>Bersih</b> = pendapatan + insentif &minus; listrik &minus; biaya ngecas &minus; parkir (sebelum cicilan, servis, ban). " +
    "<b>Per jam</b> = bersih &divide; jam di luar rumah tanpa istirahat. <b>Narik</b> = jam benar-benar narik (tanpa istirahat, ngecas, dan jalan pulang). " +
    "&ldquo;Paling untung&rdquo; hanya dipilih dari pola yang narik &le; 12 jam (batas jam kerja pengemudi).";
  var gap=best-r.net;
  el("p-vs").innerHTML = gap>5000
    ? "Target Rp 515.000 &middot; pola terbaik <b>"+rp(best)+"</b> (+"+rp(gap)+")"
    : r.effHours > 12 ? "Target Rp 515.000 &middot; lewat 12 jam &mdash; pilih pola yang ditandai <b>paling untung</b>"
    : "Target Rp 515.000 &middot; <b>ini pola terbaik</b>";
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
    /* "awal" hanya sesudah hari punya dasar (Mulai hari / rencana hari ini / sudah
       dapat) dan pada jam kerja; dulu dicatat dari tampilan pertama jam 04:30
       dengan baterai 65% bawaan -> Tanya diberi rasio 16677% */
    var dasarHari = (MULAI_HARI && MULAI_HARI.date === tanggal) || (PLAN && PLAN.date === tanggal) || parseRp(el("n-dpt").value) > 0;
    var jamN = jamSekarangTepat();
    if (!m[tanggal] && dasarHari && jamN >= 3.5 && jamN < 17 && nilai > 100000 && el("checkin").hidden) m[tanggal] = { awal: Math.round(nilai), jam: hhmm(jamN) };
    if (!m[tanggal]){ return; }
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
      var p = m[r.id]; if (!p || !(p.awal >= 100000)) return;
      var nyata = derive(r).net;
      if (!(nyata > 0)) return;
      if (nyata / p.awal < 0.3 || nyata / p.awal > 3) return;   /* rasio mustahil = catatan awal yang rusak */
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
/* Jawaban Claude: aman di-escape dulu, lalu **tebal** jadi tebal dan
   "- " di awal baris jadi titik (dulu bintang dan strip tampil apa adanya). */
function teksAI(t){
  return esc(String(t == null ? "" : t)).replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>").replace(/(^|\n)\s*[-*]\s+/g, "$1\u2022 ");
}
function renderChat(){
  var n = el("chatlog");
  if (!CHAT.length){
    n.innerHTML = '<div class="chat-empty">Belum ada pertanyaan. Coba salah satu di bawah, atau ketik sendiri.</div>';
  } else {
    n.innerHTML = CHAT.map(function(m){
      return '<div class="bubble '+(m.role==="user"?"me":"ai")+'">'+
             (m.role==="user" ? esc(String(m.content)) : teksAI(m.content))+"</div>";
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
  var soc = parseFloat(el("n-soc").value)||0, dpt = Math.max(0, parseRp(el("n-dpt").value)||0);
  var baris = ["=== HARI INI ===",
    "Tanggal " + iso(d) + ", " + ctx.name + (ctx.holi ? " (TANGGAL MERAH: "+ctx.holi[0]+")" : ""),
    ctx.eve ? (ctx.eveMulaiLibur ? "Besok mulai libur panjang" : "Besok tanggal merah") + " - malam ini arus keluar kota." : "",
    ctx.runLen >= 3 ? "Libur panjang " + ctx.runLen + " hari" + (ctx.hariKe ? " (hari ke-" + ctx.hariKe + ")" : "") + "." : "",
    ctx.ramadan ? "Bulan puasa: " + ctx.ramadan + " (jelang buka ramai, saat buka sepi)." : "",
    ctx.sekolahLibur ? "Libur sekolah: " + ctx.sekolahLibur + "." : "",
    ctx.ev ? ("Acara besar: "+ctx.ev[0]+" di "+ctx.ev[1]) : "",
    WEATHER && WEATHER.tanggal===iso(d) ? ("Cuaca: "+(WEATHER.hujan?("hujan "+(WEATHER.jam||"")):"tidak hujan")) : "",
    "",
    "=== POSISI DAN KEADAAN ===",
    "Posisi: " + L.n + ", " + Math.round(L.home) + " km dari rumah (Modernland, Kota Tangerang)",
    "Jam sekarang " + hhmm(jam) + ", rencana pulang " + hhmm(pulang),
    "Sisa baterai " + soc + "%, minimum untuk pulang dari sini " + socMinPulang(L.home, +el("n-bat").value) + "%",
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
      if (o2.tempatAwal) o2.urutan = Peluang.urutanTinggal(o2.tempatAwal, o2);   /* aturan 20:00 untuk jam pulang baru */
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
    var adaTT = typeof SpkluTT !== "undefined" && SpkluTT.status();
    spT.forEach(function(x){
      var s = adaTT ? SpkluTT.untukNama(x.nama) : null;
      baris.push("  " + x.nama + ": " + x.km + " km" + (s ? " -- colokan (TomTom): " + SpkluTT.ringkasColokan(s) + "; " +
        SpkluTT.teksCocok(s).replace(/&plusmn;/g, "+-").replace(/&rarr;/g, "->") : " -- colokan tidak diketahui"));
    });
    baris.push(adaTT ? "  Colokan dari data statis TomTom (bukan status kosong/terisi -- itu tidak tersedia untuk Indonesia). " +
               "Atto 1 Dynamic: DC CCS2 maks 30 kW, AC Type 2 maks 6,6 kW (brosur BYD). SPKLU tanpa CCS2 bukan tempat ngecas saat narik."
             : "  Jenis colokan dan dayanya TIDAK diketahui (belum ada data TomTom di HP ini). Jangan menjanjikan bahwa salah satunya cocok untuk Atto 1.");
    if (adaTT && SEKARANG.L && SEKARANG.L.lat != null){
      var tc = SpkluTT.terdekatCocok(SEKARANG.L.lat, SEKARANG.L.lon, 3);
      if (tc.length) baris.push("  SPKLU CCS2 terdekat menurut TomTom (jarak kira-kira = garis lurus x 1,35): " +
        tc.map(function(x){ return String(x.s.n).replace(/[<>]/g, "") + " +-" + x.km + " km"; }).join("; "));
    }
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
          catatan: "Tarif blok jam yang dipakai aplikasi ini perkiraan, bukan hasil ukur."
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
    el("tanyastatus").textContent = "Belum tersambung";
    CHAT.push({role:"user", content:q});
    CHAT.push({role:"assistant", content:"Saya belum tersambung ke Claude di HP ini. "+
      "Isi kunci API sekali di bagian \"Pengaturan anak \u203a Sambungan ke Claude\" di bawah (minta tolong anak), lalu tanyakan lagi."});
    el("chatinput").value = "";
    renderChat(); simpanChat();
    /* bagiannya ada di dalam "Pengaturan anak" yang terlipat: buka dulu (dulu gulir tidak ke mana-mana) */
    var pa = el("pengaturan-anak"); if (pa) pa.open = true;
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
var F=["tgl","jam","trip","dpt","ins","kmt","kmp","kwh","biaya","mnt","rating","acc","comp","cat"];

/* Order per blok jam (dari riwayat perjalanan Grab, diisi malam). Kosong =
   tidak narik di blok itu (TIDAK sama dengan 0 = narik tapi tidak dapat).
   Pembedaan ini penting untuk Belajar.pengali(): blok kosong tidak boleh
   dihitung sebagai jam sepi. */
function isiBlokGrid(){
  var g = el("blok-grid"); if (!g) return;
  g.innerHTML = BASE.map(function(b, i){
    return '<div class="f"><label for="ob-' + i + '">' + esc(labelBlok(b.n)) + ' <em>' + hhmm(b.s) + "&ndash;" + hhmm(b.e) +
      '</em></label><input id="ob-' + i + '" type="number" inputmode="numeric" min="0" max="40" placeholder="&ndash;"></div>';
  }).join("");
  BASE.forEach(function(b, i){ el("ob-" + i).addEventListener("input", cekBlok); });
}
function bacaBlok(){
  var hasil = {}, ada = false;
  BASE.forEach(function(b, i){
    var v = el("ob-" + i).value.trim();
    if (v === "") return;
    var n = parseInt(v, 10);
    if (isFinite(n) && n >= 0 && n <= 40){ hasil[b.n] = n; ada = true; }
  });
  return ada ? hasil : null;
}
function jumlahBlok(bl){ var s = 0; for (var k in bl) s += bl[k]; return s; }
function cekBlok(){
  var e = el("blok-cek"); if (!e) return;
  var bl = bacaBlok(), trip = num(el("trip").value);
  /* isian yang akan dibuang harus kelihatan (dulu 45 dibuang diam-diam lalu "Cocok") */
  var tolak = [];
  BASE.forEach(function(b, i){ var v = el("ob-" + i).value.trim(); if (v === "") return; var n = Number(v);
    if (!(isFinite(n) && n >= 0 && n <= 40 && Math.floor(n) === n)) tolak.push(labelBlok(b.n) + ": " + v); });
  if (tolak.length){ e.textContent = tolak.join(", ") + " tidak masuk akal (0\u201340 order, bilangan bulat) \u2014 cek lagi; tidak ikut disimpan."; e.className = "hint err"; return; }
  if (!bl){ e.textContent = ""; e.className = "hint"; return; }
  var s = jumlahBlok(bl);
  if (!trip){ e.textContent = "Jumlah " + s + " order — dipakai sebagai \"Order selesai\" kalau kolom itu kosong."; e.className = "hint"; }
  else if (s !== trip){ e.textContent = "Jumlah per jam " + s + ", tapi \"Order selesai\" " + trip + ". Cek lagi salah satunya."; e.className = "hint err"; }
  else { e.textContent = "Cocok dengan \"Order selesai\" (" + s + ")."; e.className = "hint ok"; }
}
isiBlokGrid();
el("trip").addEventListener("input", cekBlok);

/* Carter: terpisah dari angka Grab (tidak masuk derive/kalibrasi). */
function bacaCarter(){
  var tarif = num(el("ct-tarif").value);
  if (!(tarif > 0)) return null;
  return { jenis:el("ct-jenis").value, tarif:tarif, jam:num(el("ct-jam").value), km:num(el("ct-km").value), biaya:num(el("ct-biaya").value) };
}
function bersihHari(r){ return derive(r).net + (r.carter ? carterBersih(r.carter).net : 0); }
var JENIS_CARTER = { setengah:"Setengah hari", sehari:"Sehari penuh", lain:"Lainnya" };
function renderCarter(){
  var e = el("carter-info"); if (!e) return;
  var ada = rows.filter(function(r){ return r.carter && r.carter.tarif > 0; });
  e.hidden = !ada.length; if (!ada.length) return;
  var grup = {};
  ada.forEach(function(r){
    var c = carterBersih(r.carter), g = grup[r.carter.jenis] || (grup[r.carter.jenis] = { n:0, net:0, jam:0, netJ:0 });
    g.n++; g.net += c.net;
    /* per jam hanya dari carter yang lamanya diisi */
    if (num(r.carter.jam) > 0){ g.jam += num(r.carter.jam); g.netJ += c.net; }
  });
  var grab = avgOf(rows.filter(function(r){ return num(r.dpt) > 0; }).slice(0, 14), function(d){ return d.perjam; });
  var bagian = Object.keys(grup).map(function(k){
    var g = grup[k], pj = g.jam > 0 ? g.netJ / g.jam : null;
    var banding = (pj != null && grab) ? " &mdash; " + (pj >= grab.v ? "<span class=\"up\">" + rp(pj - grab.v) + "/jam di atas</span>" : "<span class=\"dn\">" + rp(grab.v - pj) + "/jam di bawah</span>") + " narik" : "";
    return esc(JENIS_CARTER[k] || k) + ": " + g.n + "&times;, rata-rata bersih " + rp(g.net / g.n) + (pj != null ? " (" + rp(pj) + "/jam)" : "") + banding;
  });
  e.innerHTML = "<b>Carter</b> &middot; " + bagian.join(" &middot; ") +
    (grab ? ". Narik Grab Ibu rata-rata " + rp(grab.v) + "/jam (" + grab.n + " hari terakhir)." : ". Belum ada catatan narik untuk dibandingkan.") +
    " Bersih carter = dibayar &minus; biaya Ibu &minus; listrik km carter.";
}

/* Kalkulator tawaran carter (paling atas tab Rencana; pintasan dari tab Sekarang). */
el("ke-carter").addEventListener("click", function(){
  setMode("rencana", false); el("tf-wrap").open = true;   /* sekali lihat, bukan pilihan hari ini */
  el("tf-wrap").scrollIntoView({ behavior:"smooth", block:"start" });
});
fillTimes(el("tf-mulai"), 3.5, 20, 8);
el("tf-tgl").value = iso(new Date());
el("tf-hitung").addEventListener("click", function(){
  var out = el("tf-hasil");
  var c = { tarif:num(el("tf-tarif").value), jam:num(el("tf-jam").value), km:num(el("tf-km").value), biaya:num(el("tf-biaya").value),
            mulai:parseFloat(el("tf-mulai").value) };
  if (!(c.tarif > 0) || !(c.jam > 0)){ out.innerHTML = "Isi tawaran (Rp) dan lama (jam) dulu."; return; }
  if (String(el("tf-km").value).trim() === ""){ out.innerHTML = "Isi juga kira-kira km carter (untuk listrik)."; el("tf-km").focus(); return; }
  var tgl = el("tf-tgl").value || iso(new Date()), ctx = dayCtx(tgl);
  var o = { ctx:ctx, zona:el("p-zona").value || "tng", filter:parseInt(el("p-filter").value, 10) || 0, bat:parseFloat(el("p-bat").value),
            rumah:false, hujan:false, acara:false };
  var h = bandingCarter(c, o), beda = Math.abs(h.selisih);
  var vonis = h.selisih >= 0
    ? "<b class=\"up\">Carter lebih untung &plusmn;" + rp(beda) + "</b>"
    : "<b class=\"dn\">Narik lebih untung &plusmn;" + rp(beda) + "</b> (perkiraan)";
  out.innerHTML = vonis + ".<br>" +
    "Carter: bersih &plusmn;" + rpT(h.carter.net) + (h.carter.perJam != null ? " (" + rpT(h.carter.perJam) + "/jam)" : "") +
    " setelah listrik &plusmn;" + rp(h.carter.listrik) + (c.biaya ? " dan biaya " + rp(c.biaya) : "") + ".<br>" +
    "Narik di jam yang sama (" + esc(ctx.name) + " " + hhmm(h.keluar) + "&ndash;" + hhmm(h.pulang) + (h.akhirNarik < h.pulang - 0.1 ? "; narik sampai " + hhmm(h.akhirNarik) + " lalu pulang, sesuai batas pulang" : "") + "): &plusmn;" + rpT(h.grab) + ", termasuk bagian insentif." +
    (beda < 30000 ? "<br>Bedanya kecil: carter pasti dibayar, narik bisa lebih atau kurang dari perkiraan." : "") +
    (CALIB.live ? "" : "<br>Perkiraan narik masih angka umum; setelah 3 hari catatan, angka Ibu sendiri yang dipakai.");
});
function preview(){
  var r={}; F.forEach(function(k){ r[k]=el(k).value; });
  var d=derive(r), ctP=bacaCarter(), any=num(r.dpt)>0||num(r.kmt)>0||!!ctP;
  var netP = d.net + (ctP ? carterBersih(ctP).net : 0);   /* sama dengan yang tersimpan (termasuk carter) */
  function set(id,txt,good){ el(id).textContent=txt; el(id).className="v"+(txt==="—"?"":(good?" good":" warn")); }
  set("pv-net", any?rp(netP):"—", netP>=TARGET_DAY);
  set("pv-jam", d.perjam==null?"—":rp(d.perjam), d.perjam>=42000);
  set("pv-kmj", d.kmjam==null?"—":dec(d.kmjam,1), d.kmjam>=15);
  set("pv-util",d.util==null?"—":dec(d.util,0)+"%", d.util>=75);
  set("pv-eff", d.eff==null?"—":dec(d.eff,1), d.eff>=6.7);
  /* angka yang mustahil tidak boleh tampil hijau (dulu 40 km/kWh "bagus") */
  var jg = nilaiJanggal(d);
  if (d.util != null && d.util > 100) set("pv-util", dec(d.util,0)+"%", false);
  if (d.eff != null && (d.eff > BATAS_CAL.eff[1] || d.eff < BATAS_CAL.eff[0])) set("pv-eff", dec(d.eff,1), false);
  if (d.kmjam != null && d.kmjam > 40) set("pv-kmj", dec(d.kmjam,1), false);
  var st = el("status");
  if (jg.length){ st.textContent = "Cek lagi: " + jg.join("; ") + ". Angka janggal tidak dipakai untuk kalibrasi."; st.className = "status err"; }
  else if (/^Cek lagi/.test(st.textContent)){ st.textContent = ""; st.className = "status"; }
}
function tile(l,v,c,s){ return '<div class="tile '+s+'"><span class="lbl">'+l+
  '</span><span class="val">'+v+'</span><span class="cmp">'+c+"</span></div>"; }
function renderCal(){
  var recent=rows.filter(function(r){ return num(r.dpt) > 0 || num(r.kmt) > 0; }).slice(0,14);
  el("calbasis").textContent = recent.length ? "Nilai tengah "+recent.length+" hari narik" : "Belum ada data";
  var a=medianOf(recent,function(d){return d.util!=null&&d.util>100?null:d.rpkm;},BATAS_CAL.rpkm[0],BATAS_CAL.rpkm[1],1), b=medianOf(recent,function(d){return d.eff;},BATAS_CAL.eff[0],BATAS_CAL.eff[1],1);
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
  renderBelajar(); renderCarter();
  if (a){
    var dl=Math.round(((a.v-BASE_RPKM)/BASE_RPKM)*100);
    el("calnote").innerHTML = "Rp per km Ibu <b>"+(dl>=0?dl+"% di atas":Math.abs(dl)+"% di bawah")+
      "</b> asumsi rencana"+(CALIB.live?" &mdash; dan sudah dipakai aplikasi di tab Hari ini.":".");
  }
}
function renderBelajar(){
  var e = el("belajar-info"); if (!e || typeof Belajar === "undefined") return;
  var s = Belajar.ringkas();
  function pct(m){ var p = Math.round((m - 1) * 100); return (p > 0 ? "+" : "−") + Math.abs(p) + "%"; }
  if (!s.nHari){
    e.innerHTML = "<b>Pola jam ramai:</b> belum ada data. Isi &ldquo;Order per jam&rdquo; di Catat hari ini &mdash; dari situ aplikasi belajar jam dan tempat yang paling ramai untuk Ibu.";
    return;
  }
  var naik = s.blok.filter(function(x){ return x.m > 1; }).map(function(x){ return esc(labelBlok(x.n)) + " (" + pct(x.m) + ")"; });
  var turun = s.blok.filter(function(x){ return x.m < 1; }).map(function(x){ return esc(labelBlok(x.n)) + " (" + pct(x.m) + ")"; });
  var tmp = s.tempat.map(function(x){ return esc(x.n) + " " + pct(x.m); });
  var isi = [];
  if (naik.length) isi.push("lebih ramai dari perkiraan: " + naik.join(", "));
  if (turun.length) isi.push("lebih sepi: " + turun.join(", "));
  if (tmp.length) isi.push("tempat: " + tmp.join(", "));
  e.innerHTML = "<b>Pola jam dari catatan Ibu</b> (" + s.nHari + " hari" + (s.nHariBlok ? ", " + s.nHariBlok + " dengan rincian per jam" : "") + ", &plusmn;" + s.nOrder + " order): " +
    (isi.length ? isi.join("; ") + ". Sudah dipakai di perkiraan dan saran tempat." : "belum ada beda berarti dari perkiraan.") +
    " Dengan sedikit hari angkanya sengaja masih condong ke perkiraan awal; makin banyak catatan makin mengikuti Ibu.";
}
function weekMonth(){
  var now=new Date(), y=now.getFullYear(), m=now.getMonth();
  var pre=y+"-"+String(m+1).padStart(2,"0")+"-", sum=0, worked=0;
  rows.forEach(function(r){ if (String(r.id).indexOf(pre)===0){ sum+=bersihHari(r); worked++; } });   /* termasuk carter */
  el("monthname").textContent = now.toLocaleDateString("id-ID",{month:"long",year:"numeric"});
  el("mnet").textContent = rp(sum);
  el("mbar").style.width = Math.max(0,Math.min(100,(sum/TARGET_MONTH)*100)).toFixed(1)+"%";
  /* hari ini ikut dihitung selama belum dicatat */
  var dim=new Date(y,m+1,0).getDate(), left=dim-now.getDate()+(rows.some(function(r){ return r.id === iso(now); }) ? 0 : 1);
  var lw=Math.max(0,Math.round(left*6/7)), rem=TARGET_MONTH-sum, msg;
  if (!worked) msg="Belum ada catatan bulan ini. Target <b>"+rp(TARGET_MONTH)+"</b> dari sekitar <b>"+
    Math.round(dim*6/7)+"</b> hari kerja.";
  else if (rem<=0) msg='<span class="up">Target bulan ini sudah tercapai.</span> Kelebihan <b>'+rp(-rem)+"</b>.";
  else if (lw<=0) msg="Bulan hampir habis. Kurang <b>"+rp(rem)+"</b>.";
  else if (rem/lw > TARGET_DAY*1.5) msg="Target bulan ini sulit terkejar: kurang <b>"+rp(rem)+"</b> dengan sisa sekitar <b>"+lw+"</b> hari kerja. Jangan dikejar dengan narik lewat 12 jam.";
  else { var need=rem/lw, cls=need<=515000?"up":(need<=620000?"":"dn");
    msg=worked+" hari tercatat &middot; sisa sekitar <b>"+lw+"</b> hari kerja &middot; perlu <b class=\""+
      cls+"\">"+rp(need)+"</b> per hari"+(cls==="up"?" &mdash; Ibu sedang unggul":(cls==="dn"?" &mdash; kejar di hari kuat":"")); }
  el("pace").innerHTML=msg;
}
/* 30 hari terbaru; sisanya lewat tombol (dulu yang lebih lama tidak bisa dilihat) */
var HIST_BATAS = 30;
function renderHist(){
  var nTampil = Math.min(rows.length, HIST_BATAS);
  el("histcount").textContent = !rows.length ? "" : rows.length > nTampil ? nTampil + " dari " + rows.length + " hari tercatat" : rows.length + " hari tercatat";
  el("histempty").style.display = rows.length ? "none" : "block";
  var lagi = el("hist-lagi");
  if (lagi){ lagi.hidden = rows.length <= nTampil; lagi.textContent = "Lihat " + Math.min(30, rows.length - nTampil) + " hari lebih lama"; }
  el("hist").innerHTML = rows.slice(0,HIST_BATAS).map(function(r){
    var d=derive(r), dt=new Date(r.id+"T00:00:00"), hd=HOLI[r.id];
    return "<tr><td class=\"n\">"+r.id+(r.cat?' <span class="hist-cat" title="'+esc(r.cat)+'">· '+esc(r.cat)+"</span>":"")+
      (r.carter&&r.carter.tarif>0?' <span style="color:var(--muted)">· carter '+rp(carterBersih(r.carter).net)+"</span>":"")+
      "</td><td>"+DAYNAME[dt.getDay()].slice(0,3)+(hd?" ●":"")+"</td><td>"+(num(r.jam)||"—")+
      "</td><td>"+(num(r.trip)||"—")+"</td><td>"+(num(r.kmt)||"—")+"</td><td>"+
      (d.util==null?"—":dec(d.util,0)+"%")+"</td><td>"+(d.kmjam==null?"—":dec(d.kmjam,1))+
      "</td><td>"+(num(r.rating)>0?dec(num(r.rating),1):"—")+
      "</td><td>"+(num(r.acc)>0?Math.round(num(r.acc))+"%":"—")+
      "</td><td>"+(num(r.comp)>0?Math.round(num(r.comp))+"%":"—")+
      "</td><td class=\"n\">"+rp(bersihHari(r))+"</td></tr>";
  }).join("");
  aturTombolSaran();
}
/* "Minta saran" mati: sebut alasannya (dulu mati tanpa kabar, judulnya
   "Butuh minimal 3 hari" padahal sudah 5 hari -- yang kurang kuncinya) */
var ALASAN_SARAN = /^Butuh (kunci Claude|minimal 3 hari)/;
function aturTombolSaran(){
  var b = el("ask"), st = el("aistatus"); b.disabled = !(sampler && rows.length >= 3);
  var alasan = !sampler ? "Butuh kunci Claude (Pengaturan anak \u203a Sambungan ke Claude)." :
               rows.length < 3 ? "Butuh minimal 3 hari tercatat (baru " + rows.length + ")." : "";
  if (alasan){ st.textContent = alasan; st.className = "status"; }
  else if (ALASAN_SARAN.test(st.textContent)) st.textContent = "";
}
el("hist-lagi").addEventListener("click", function(){ HIST_BATAS += 30; renderHist(); });
function petunjukMenit(){
  var e = el("mnthint"); if (!e) return;
  var tgl = el("tgl").value || iso(new Date());
  if (AKTUAL && AKTUAL.tanggal === tgl && AKTUAL.home > 0){
    e.innerHTML = "Dari <b>" + esc(AKTUAL.lok) + "</b>, " + Math.round(AKTUAL.home) + " km";
  } else {
    e.textContent = "Isi hanya kalau Sedang narik dipakai hari itu — km-nya diambil dari sana.";
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
  /* catatan tanggal ini sudah ada tapi form tidak dimuat darinya: kolom yang
     dibiarkan kosong memakai angka lama (bukan dihapus) */
  var lamaR = rows.filter(function(r){ return r.id === tgl; })[0], gabung = false;
  if (lamaR && CATATAN_DARI !== tgl){
    F.forEach(function(k){ if (k !== "tgl" && el(k).value === "" && lamaR[k] != null) rec[k] = lamaR[k]; });
    gabung = true;
  }
  var posN = null; try { posN = JSON.parse(localStorage.getItem("posisi-narik-terakhir") || "null"); } catch (e) {}
  var posP = (AKTUAL && AKTUAL.tanggal === tgl && AKTUAL.home > 1.5) ? AKTUAL : (posN && posN.tanggal === tgl && posN.home > 0 ? posN : null);
  if (rec.mnt > 0 && posP){
    rec.pkm = posP.home; rec.pz = posP.z || "tng";
    /* jam berangkat pulang = rencana tiba dikurangi menitnya -- untuk kalibrasi
       kecepatan menurut jam (lalu lintas 21:00 bukan lalu lintas 18:00) */
    var Pt = rencanaUntuk(tgl);
    if (Pt && Pt.pulang > 0) rec.pjam = Math.round((Pt.pulang - rec.mnt / 60) * 100) / 100;
  }
  var carter = bacaCarter();
  if (carter) rec.carter = carter;
  else if (gabung && lamaR.carter) rec.carter = lamaR.carter;
  if (!rec.dpt && !rec.kmt && !carter){ el("status").textContent="Isi minimal pendapatan, km, atau carter."; el("status").className="status err"; return; }
  var blok = bacaBlok();
  if (!blok && gabung && lamaR.blok) blok = lamaR.blok;
  if (blok){
    rec.blok = blok;
    if (!rec.trip) rec.trip = jumlahBlok(blok);
  }
  var zona = (typeof JejakZona !== "undefined") ? JejakZona.untuk(tgl) : null;
  if (zona) rec.blokZona = zona;
  /* Jendela kerja hari itu (dari rencana/Mulai hari) -- penyebut untuk Belajar:
     blok pertama/terakhir yang hanya separuh dikerjakan tidak dihitung penuh. */
  var Pj = rencanaUntuk(tgl);
  if (Pj && Pj.pulang > Pj.keluar){
    rec.jendela = { keluar:Pj.keluar, pulang:Pj.pulang, zona:Pj.zona, rehat:Pj.rehat, bat:Pj.bat };
    if (MULAI_HARI && MULAI_HARI.date === tgl && MULAI_HARI.soc > 0) rec.jendela.soc = MULAI_HARI.soc;
  }
  rec.diubah = new Date().toISOString();   /* untuk penggabungan saat sinkron */
  rows = rows.filter(function(r){ return r.id!==rec.id; }); rows.push(rec); sortRows();
  var tersimpan = lsWrite(rows); renderAll();
  if (tersimpan){
    CATATAN_DARI = tgl;
    el("status").textContent = (gabung ? "Tersimpan (digabung dengan catatan tanggal ini; kolom kosong memakai angka lama)." : "Tersimpan.") +
      (rec.mnt > 0 && !rec.pkm ? " Menit pulang belum bisa dipakai: posisi narik terakhir hari itu tidak diketahui." : "");
    el("status").className="status ok"; sinkronNanti();
  }
  else { el("status").textContent="GAGAL disimpan di HP ini (penyimpanan penuh atau mode privat?). Catat angkanya di tempat lain sebelum keluar halaman ini."; el("status").className="status err"; }
});
F.forEach(function(k){ el(k).addEventListener("input", preview); });
["ct-jenis", "ct-tarif", "ct-jam", "ct-km", "ct-biaya"].forEach(function(k){ el(k).addEventListener("input", preview); el(k).addEventListener("change", preview); });

/* Tanggal yang sudah punya catatan: isiannya dimuat untuk diubah (dulu form
   kosong, dan Simpan menghapus km, insentif, blok, carter hari itu). */
var CATATAN_DARI = null;
function catatanKosong(){
  return F.every(function(k){ return k === "tgl" || el(k).value === ""; }) &&
    ["ct-tarif", "ct-jam", "ct-km", "ct-biaya"].every(function(k){ return el(k).value === ""; }) &&
    BASE.every(function(b, i){ return el("ob-" + i).value === ""; });
}
function resetCatatan(){
  F.forEach(function(k){ if (k !== "tgl") el(k).value = ""; });
  ["ct-tarif", "ct-jam", "ct-km", "ct-biaya"].forEach(function(k){ el(k).value = ""; });
  BASE.forEach(function(b, i){ el("ob-" + i).value = ""; });
  CATATAN_DARI = null; cekBlok(); preview();
}
function isiCatatanDari(r){
  resetCatatan();
  F.forEach(function(k){ if (k === "tgl") return; var v = r[k]; if (v != null && v !== "" && !(k !== "cat" && v === 0)) el(k).value = v; });
  if (r.carter){ el("ct-jenis").value = r.carter.jenis || "setengah"; ["tarif", "jam", "km", "biaya"].forEach(function(k){ if (num(r.carter[k]) > 0) el("ct-" + k).value = r.carter[k]; }); }
  if (r.blok) BASE.forEach(function(b, i){ if (b.n in r.blok) el("ob-" + i).value = r.blok[b.n]; });
  CATATAN_DARI = r.id; cekBlok(); preview();
}
function muatCatatanTanggal(){
  var t = el("tgl").value, r = rows.filter(function(x){ return x.id === t; })[0];
  if (r){ isiCatatanDari(r); el("status").textContent = "Catatan tanggal ini sudah ada \u2014 isiannya dimuat; ubah lalu Simpan."; el("status").className = "status"; }
  else if (CATATAN_DARI){ resetCatatan(); el("status").textContent = ""; el("status").className = "status"; }
}
el("tgl").addEventListener("change", muatCatatanTanggal);

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
  /* ambil satu objek JSON utuh (teks chat di sekitarnya diabaikan) */
  function objekPertama(s, i){
    var d = 0, str = false, esc2 = false;
    for (var j = i; j < s.length; j++){
      var ch = s[j];
      if (str){ if (esc2) esc2 = false; else if (ch === "\\") esc2 = true; else if (ch === '"') str = false; continue; }
      if (ch === '"') str = true; else if (ch === "{") d++; else if (ch === "}"){ d--; if (d === 0) return s.slice(i, j + 1); }
    }
    return s.slice(i);
  }
  try { data = JSON.parse(objekPertama(t, mulai)); }
  catch (e){ setCad("Salinannya tidak lengkap atau rusak. Minta dikirim ulang.", "err"); return; }
  if (!data || !data.harian || !data.harian.length){ setCad("Tidak ada catatan di dalamnya.", "err"); return; }

  /* Gabungkan: catatan yang sudah ada di HP ini tidak ditimpa. */
  var ada = {}; rows.forEach(function(r){ ada[r.id] = r; });
  var tambah = 0, beda = 0;
  var inti = function(r){ var c = {}; Object.keys(r).sort().forEach(function(k){ if (k !== "diubah") c[k] = r[k]; }); return JSON.stringify(c); };
  data.harian.forEach(function(r){ if (!r || !r.id) return; if (!ada[r.id]){ rows.push(r); tambah++; } else if (inti(ada[r.id]) !== inti(r)) beda++; });
  sortRows();
  var pulihOk = lsWrite(rows); renderAll();
  if (!pulihOk){ setCad("Gagal menyimpan di HP ini (penyimpanan penuh atau mode privat?). Coba lagi atau bersihkan penyimpanan HP.", "err"); return; }
  sinkronNanti();
  w.hidden = true; el("cadteks").value = "";
  setCad((tambah ? (tambah + " hari dipulihkan, total sekarang " + rows.length + " hari.")
                 : "Semua tanggal di salinan itu sudah ada di sini.") +
         (beda ? " " + beda + " tanggal di salinan BERBEDA dengan catatan di HP ini dan tidak diambil (yang di HP ini dipakai)." : ""), "ok");
});

el("p-save").addEventListener("click", function(){
  var tglP = el("p-tgl").value || iso(new Date());
  /* tanggal yang sudah lewat tidak disimpan (dulu tersimpan dan menimpa rencana hari ini) */
  if (tglP < iso(new Date())){ el("p-status").textContent = "Tanggal " + tglP + " sudah lewat — pilih hari ini atau nanti."; el("p-status").className = "status err"; return; }
  var simpanOk = savePlan({ date: tglP,
    keluar:parseFloat(el("p-keluar").value), pulang:parseFloat(el("p-pulang").value),
    rehat:rehatDariUI(), zona:el("p-zona").value,
    filter:parseInt(el("p-filter").value,10), bat:parseFloat(el("p-bat").value),
    rumah:el("p-rumah").checked, hujan:el("p-hujan").checked, acara:el("p-acara").checked });
  sinkronNanti();
  /* Rencana HARI INI langsung mengisi tab Sekarang, supaya urutan langkah dan
     protokol pulang dihitung untuk jam pulang yang sama. */
  var hariIniP = tglP === iso(new Date());
  if (hariIniP){
    el("n-pulang").value = String(PLAN.pulang); el("n-bat").value = String(PLAN.bat);
    /* sisa filter = yang tersisa SEKARANG; jatah rencana hanya dipakai kalau hari belum mulai */
    if (!hariSudahMulai()) el("n-filter").value = String(PLAN.filter);
    el("n-rumah").checked = !!PLAN.rumah;
    el("n-hujan").checked = !!PLAN.hujan; el("n-acara").checked = !!PLAN.acara;
    simpanFakta(); simpanIsianHari();
  }
  el("p-status").innerHTML = hariIniP
    ? 'Tersimpan. &ldquo;Sedang narik&rdquo; ikut rencana ini. <button type="button" class="linkbtn" id="p-ke-narik">Lihat &rsaquo;</button>'
    : "Tersimpan untuk " + esc(tglP) + ".";
  el("p-status").className = "status ok";
  /* penyimpanan HP penuh / mode privat: jangan bilang tersimpan (dulu hilang saat dibuka ulang) */
  if (!simpanOk){ el("p-status").textContent = "Dipakai sekarang, tapi GAGAL disimpan di HP ini (penyimpanan penuh atau mode privat?) — rencana hilang kalau aplikasi ditutup."; el("p-status").className = "status err"; }
  var kn = el("p-ke-narik"); if (kn) kn.addEventListener("click", function(){ setMode("narik", true); window.scrollTo(0, 0); });
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
  sampler("Ibu menganalisa catatan harian pengemudi GrabCar di Tangerang dengan BYD Atto 1 listrik. "+
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
/* Kepala (hari, tanggal, libur): juga saat tanggal berganti dengan halaman terbuka */
function isiKepala(){
  var d = new Date();
  el("today").innerHTML = DAYNAME[d.getDay()] + ", " +
    d.toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"}) +
    " &middot; <span id='jamhidup'></span><em id='todaysub'></em>";
  jamHidup();
  var hd = HOLI[iso(d)];
  document.getElementById("todaysub").textContent = hd ? hd[0] : "";
}
isiKepala();

renderLok("kota");
fillTimes(el("n-jam"),3.5,23.5,9.5);
fillTimes(el("n-pulang"),9,24,21.5);
fillTimes(el("p-keluar"),3.5,23,5.25);
fillTimes(el("p-pulang"),9,24,21.5);
var t = Math.round((now.getHours()+now.getMinutes()/60)*4)/4;
if (t>=3.5 && t<=23.5) el("n-jam").value = t; else if (t < 3.5) el("n-jam").value = 3.5;   /* dini hari: dari blok pertama */
/* 23:31-23:59: hitung dari 23:30 (pilihan terakhir), bukan 09:30 bawaan kolom */
else { el("n-jam").value = 23.5; jamLuar = true; }
/* Catatan diisi sesudah sampai rumah: sebelum 04:00 itu catatan kemarin */
el("tgl").value = (now.getHours() < 4) ? iso(new Date(now.getTime() - 864e5)) : iso(now);
el("p-tgl").value = iso(now); el("p-tgl").min = iso(now);

["n-jam","n-lok","n-soc","n-dpt","n-pulang","n-tujuan","n-bat","n-filter","n-hujan","n-acara","n-rumah"]
  .forEach(function(id){ el(id).addEventListener("change",runNow); el(id).addEventListener("input",runNow); });
el("n-lok").addEventListener("change", function(){
  if (this.value === "__lain"){
    el("ketikwrap").hidden = false;
    setHint("Ketik nama daerah, lalu tekan Cari");
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
/* Angka baterai yang Ibu ketik sendiri menjadi jangkar baru perkiraan.
   Selama mengetik (input) kolom ditandai "diketik" supaya perkiraan
   tidak menimpa ketikan yang belum selesai; jangkarnya dibuat saat change. */
el("n-soc").addEventListener("input", function(){ this.dataset.touched = "1"; }, true);
el("n-soc").addEventListener("change", function(){
  this.dataset.touched = "1";
  var v = parseFloat(this.value);
  /* selalu jadi jangkar (dulu hanya kalau sudah Mulai hari: dibuka ulang = 65%) */
  /* tanpa jangkar sebelumnya: ketikan tetap dipakai apa adanya sampai
     dibuka ulang, lalu perkiraan berjalan dari jangkar ini */
  /* ketikan = jangkar baru, lalu kolom mengikuti perkiraan dari jangkar itu
     (dulu tanpa jangkar sebelumnya kolom membeku 80% seharian, sementara
     perkiraannya sudah 3% -- dan dibuka ulang langsung jadi 3%) */
  if (isFinite(v) && v >= 1 && v <= 100){ Baterai.jangkar(jamSekarangTepat(), Math.round(v), "diketik"); this.dataset.touched = ""; }
}, true);
el("jam-auto").addEventListener("click", function(){ ikutJam(true); });
/* Ibu memilih jam pulang sendiri: itulah batas diamnya mobil */
el("n-pulang").addEventListener("change", function(){ PULANG_ASLI = null; }, true);
tandaiJam();
/* Diperiksa tiap 30 detik: cukup rapat untuk kotak seperempat jam, dan
   tidak melakukan apa pun kalau jamnya belum berpindah. */
setInterval(function(){ if (!document.hidden) ikutJam(false); }, 30000);
/* HP dinyalakan lagi: ganti hari DULU (dulu proyeksi "awal" hari baru
   tercatat dengan "sudah dapat" kemarin), lalu jam; Rencanakan yang terbuka
   malam hari pindah ke besok */
document.addEventListener("visibilitychange", function(){
  if (document.hidden) return;
  if (typeof cekGantiHari === "function") cekGantiHari();
  ikutJam(false);
  if (MODE === "rencana" && typeof keBesokBilaMalam === "function") keBesokBilaMalam();
});
el("n-ketik").addEventListener("keydown", function(e){
  if (e.key === "Enter"){ e.preventDefault(); resolveKetik(); }
});
el("n-petakan").addEventListener("click", resolveKetik);
el("n-gps").addEventListener("click", function(){ deteksiLokasi(false); });
el("n-gpsauto").checked = gpsOtomatisAktif();
el("n-gpsauto").addEventListener("change", function(){
  try { localStorage.setItem("gps-otomatis", this.checked ? "1" : "0"); } catch (e) {}
  if (this.checked){ gpsTerakhir = 0; pasangGpsOtomatis(); }
  else { hentikanOdometer(); setLokSumber("manual");
    setGpsHint("Deteksi otomatis dimatikan. Tekan Cari posisi kalau perlu."); }
});
tandaiLok();
if (gpsOtomatisAktif()) setGpsHint("Memeriksa lokasi…");
pasangGpsOtomatis();
["p-tgl","p-keluar","p-pulang","p-zona","p-filter","p-bat","p-rumah","p-hujan","p-acara"]
  .forEach(function(id){ el(id).addEventListener("change",runPlan); });
/* Ganti tanggal rencana: acara dan cuaca ikut menyesuaikan sendiri. */
el("p-tgl").addEventListener("change", function(){
  var d = el("p-tgl").value;
  /* rencana yang sudah disimpan untuk tanggal itu dimuat apa adanya; kalau
     belum ada, hujan/acara mulai dari cuaca & kalender tanggal itu (bukan
     centang hari lain yang terbawa) */
  var Pd = rencanaUntuk(d);
  if (Pd){ isiRencana(Pd); el("p-status").textContent = "Rencana tersimpan untuk " + d + "."; el("p-status").className = "status ok"; }
  else {
    /* tanggal lain tanpa rencana: jam pulang lewat batas malam ini (mis. 23:30) tidak terbawa */
    if (d !== iso(new Date()) && parseFloat(el("p-pulang").value) > 22) el("p-pulang").value = "21.5";
    if (d !== iso(new Date())) el("p-keluar").value = String(jamMulaiBawaan(d));
    el("p-acara").checked = !!EVENTS[d];
    el("p-hujan").dataset.touched = "";
    el("p-hujan").checked = !!(WEATHER && WEATHER.tanggal === d && WEATHER.hujan);
    el("p-status").textContent = "";
  }
  runPlan();
});
/* Isi kolom Rencanakan dari rencana tersimpan. */
function isiRencana(P){
  ["p-keluar","p-pulang","p-zona","p-filter","p-bat"].forEach(function(id){
    var v = { "p-keluar":P.keluar, "p-pulang":P.pulang, "p-zona":P.zona, "p-filter":P.filter, "p-bat":P.bat }[id];
    if (v != null) el(id).value = v;
  });
  setJedaUI(P.rehat);
  el("p-rumah").checked = !!P.rumah; el("p-hujan").checked = !!P.hujan; el("p-acara").checked = !!P.acara;
}
/* Apakah isian Rencanakan berbeda dari rencana tersimpan tanggal itu? */
function rencanaBeda(){
  var P = rencanaUntuk(el("p-tgl").value || iso(new Date()));
  if (!P) return false;
  var r1 = JSON.stringify(rehatRange(rehatDariUI())), r0 = JSON.stringify(rehatRange(P.rehat));
  return parseFloat(el("p-keluar").value) !== P.keluar || parseFloat(el("p-pulang").value) !== P.pulang || r1 !== r0 ||
    el("p-zona").value !== P.zona || parseInt(el("p-filter").value, 10) !== P.filter ||
    el("p-hujan").checked !== !!P.hujan || el("p-acara").checked !== !!P.acara;
}

/* Tab: "now" = Hari ini (dua keadaan: Sedang narik / Rencanakan), "log",
   "tanya". tab("plan") tetap diterima = Hari ini + Rencanakan. */
var MODE = "narik", TAB = "now";
function tab(which){
  if (which === "plan"){ MODE = "rencana"; which = "now"; }
  TAB = which;
  ["now","log","tanya"].forEach(function(k){ el("t-"+k).className = "tab" + (which===k ? " on" : ""); });
  el("v-log").hidden = which !== "log"; el("v-tanya").hidden = which !== "tanya";
  el("modehari").hidden = which !== "now";
  el("v-now").hidden = !(which === "now" && MODE === "narik");
  el("v-plan").hidden = !(which === "now" && MODE === "rencana");
  el("mode-narik").className = "mode" + (MODE === "narik" ? " on" : ""); el("mode-narik").setAttribute("aria-selected", MODE === "narik");
  el("mode-rencana").className = "mode" + (MODE === "rencana" ? " on" : ""); el("mode-rencana").setAttribute("aria-selected", MODE === "rencana");
  if (which === "now" && MODE === "narik" && typeof Peta !== "undefined") Peta.refresh();
}
/* simpan: pilihan Ibu sendiri, diingat untuk hari itu (tidak ditimpa aturan otomatis). */
function setMode(m, simpan){
  MODE = m === "rencana" ? "rencana" : "narik";
  if (simpan){ try { localStorage.setItem("mode-hari", JSON.stringify({ tgl:iso(new Date()), m:MODE })); } catch (e) {} }
  tab("now");
}
/* Keadaan bawaan kalau Ibu belum memilih hari ini: sudah isi Mulai hari ->
   Sedang narik; malam (>= 20:30) atau dini hari (< 03:30) -> Rencanakan
   (untuk besok / sebelum berangkat); selain itu Sedang narik. */
function modeBawaan(){
  try { var s = JSON.parse(localStorage.getItem("mode-hari") || "null"); if (s && s.tgl === iso(new Date()) && (s.m === "narik" || s.m === "rencana")) return s.m; } catch (e) {}
  if (MULAI_HARI) return "narik";
  var t = jamSekarangTepat();
  /* rencana hari ini sedang berjalan, atau sudah ada pendapatan hari ini */
  if (PLAN && PLAN.date === iso(new Date()) && t >= PLAN.keluar - 0.5 && t < PLAN.pulang) return "narik";
  try { var ak = JSON.parse(localStorage.getItem("sekarang-terakhir") || "null"); if (ak && ak.tanggal === iso(new Date()) && ak.dpt > 0) return "narik"; } catch (e) {}
  if ((parseRp(el("n-dpt").value) || 0) > 0) return "narik";
  return (t >= 20.5 || t < 3.5) ? "rencana" : "narik";
}
["now","log","tanya"].forEach(function(k){
  el("t-"+k).addEventListener("click", function(){ tab(k); });
});
el("mode-narik").addEventListener("click", function(){ setMode("narik", true); });
/* Malam (>= 20:30): yang direncanakan besok -- sisa hari ini ada di Sedang narik. */
function keBesokBilaMalam(){
  if (jamSekarangTepat() >= 20.5 && rencanaHariIni()){
    var b = new Date(); b.setDate(b.getDate() + 1);
    el("p-tgl").value = iso(b); el("p-tgl").dispatchEvent(new Event("change", { bubbles:true }));
  }
}
el("mode-rencana").addEventListener("click", function(){ setMode("rencana", true); keBesokBilaMalam(); });

/* Isian yang sama di "Sedang narik" dan "Rencanakan" cukup diubah sekali:
   - tipe mobil dan colokan rumah = fakta, selalu sama ke dua arah;
   - jam pulang, hujan, acara di Sedang narik = keadaan HARI INI: ikut ke
     Rencanakan (bila rencananya untuk hari ini) DAN ke rencana tersimpan
     hari ini, supaya target, Tanya, dan Mulai hari tidak memakai angka lama;
   - di Rencanakan itu masih coba-coba: baru berlaku setelah "Pakai rencana
     ini" (tombol itu yang mengisi Sedang narik);
   - filter tidak disamakan: di Sedang narik = sisa filter SEKARANG, di
     rencana = jatah filter sehari. */
var KEMBAR = [["n-bat", "p-bat", true], ["n-rumah", "p-rumah", true],
              ["n-pulang", "p-pulang", false], ["n-hujan", "p-hujan", false], ["n-acara", "p-acara", false]];
var KE_PLAN = { "n-bat":"bat", "n-rumah":"rumah", "n-pulang":"pulang", "n-hujan":"hujan", "n-acara":"acara" };
function rencanaHariIni(){ return (el("p-tgl").value || iso(new Date())) === iso(new Date()); }
/* Salin satu pasangan; true bila ada yang berubah. */
function salinKembar(dari, ke, selalu, tandai){
  if (!selalu && !rencanaHariIni()) return false;
  var a = el(dari), b = el(ke);
  if (a.type === "checkbox"){
    if (b.checked === a.checked) return false;
    b.checked = a.checked;
    /* pilihan Ibu (bukan penyelarasan otomatis): jangan ditimpa cuaca/kalender */
    if (tandai && (ke === "n-hujan" || ke === "n-acara" || ke === "p-hujan")) b.dataset.touched = "1";
    return true;
  }
  if (b.value === a.value) return false;
  var lama = b.value; b.value = a.value;
  if (b.value !== a.value){ b.value = lama; return false; }   /* nilai tidak ada di pilihan: jangan kosongkan */
  return true;
}
/* Isian Sedang narik diubah Ibu -> rencana tersimpan hari ini ikut. */
function planIkutSekarang(id){
  var f = KE_PLAN[id], today = iso(new Date());
  if (!f || !PLAN || PLAN.date !== today) return;
  var e = el(id), v = e.type === "checkbox" ? e.checked : parseFloat(e.value);
  if (e.type !== "checkbox" && !isFinite(v)) return;
  if (PLAN[f] === v) return;
  PLAN[f] = v; savePlan(PLAN);
  if (typeof sinkronNanti === "function") sinkronNanti();
}
KEMBAR.forEach(function(k){
  el(k[0]).addEventListener("change", function(){ planIkutSekarang(k[0]); if (salinKembar(k[0], k[1], k[2], true)) runPlan(); });
  /* ke arah sebaliknya hanya fakta mobil (tipe, colokan rumah) */
  if (k[2]) el(k[1]).addEventListener("change", function(){ if (salinKembar(k[1], k[0], k[2], true)){ planIkutSekarang(k[0]); runNow(); } });
});
/* Rencanakan diubah tapi belum dipakai: katakan, supaya Ibu tidak mengira
   Sedang narik sudah ikut. */
function statusRencana(){
  if (!rencanaUntuk(el("p-tgl").value || iso(new Date()))) return;
  if (rencanaBeda()){ el("p-status").textContent = "Perubahan belum dipakai \u2014 tekan \u201cPakai rencana ini\u201d."; el("p-status").className = "status"; }
  else { el("p-status").textContent = "Sama dengan rencana tersimpan."; el("p-status").className = "status ok"; }
}
["p-keluar", "p-pulang", "p-rehat", "p-rehat-dari", "p-rehat-sampai", "p-zona", "p-filter", "p-hujan", "p-acara"].forEach(function(id){
  el(id).addEventListener("change", statusRencana);
});
/* Rencana dipindah ke hari ini: ambil keadaan hari ini dari Sedang narik. */
el("p-tgl").addEventListener("change", function(){
  if (!rencanaHariIni()) return;
  var ubah = false;
  KEMBAR.forEach(function(k){ if (salinKembar(k[0], k[1], k[2], false)) ubah = true; });
  if (ubah) runPlan();
});
el("chatsend").addEventListener("click", kirimChat);
el("chatinput").addEventListener("keydown", function(e){
  if (e.key === "Enter"){ e.preventDefault(); kirimChat(); }
});
el("chatclear").addEventListener("click", function(){
  if (CHAT.length && !confirm("Hapus semua riwayat Tanya? Pertanyaan yang sudah dijawab tidak bisa dikembalikan.")) return;
  CHAT = []; simpanChat(); renderChat();
});
muatChat(); renderChat();

/* Tema warna: Otomatis (ikut HP) -> Terang -> Gelap -> Otomatis. Sudah
   diterapkan sekali secepat mungkin oleh skrip kecil di <head> (index.html,
   sebelum style.css dibaca) supaya tidak ada kedipan warna salah sesaat
   halaman terbuka; di sini cuma tombolnya. */
(function(){
  var LS_TEMA = "tema-warna";
  var URUT = ["", "light", "dark"];
  var LABEL = { "":"Otomatis (ikut HP)", "light":"Terang", "dark":"Gelap" };
  var IKON  = { "":"◐", "light":"☀", "dark":"☾" };
  var metaTerang = document.querySelector('meta[name="theme-color"][media*="light"]');
  var metaGelap  = document.querySelector('meta[name="theme-color"][media*="dark"]');
  var WARNA_TERANG = metaTerang ? metaTerang.content : "#1A56C4";
  var WARNA_GELAP  = metaGelap ? metaGelap.content : "#0B1220";

  function baca(){ try { return localStorage.getItem(LS_TEMA) || ""; } catch (e) { return ""; } }
  function simpan(v){ try { if (v) localStorage.setItem(LS_TEMA, v); else localStorage.removeItem(LS_TEMA); } catch (e) {} }
  function terapkan(v){
    if (v) document.documentElement.dataset.theme = v; else delete document.documentElement.dataset.theme;
    /* Status bar HP (theme-color) ikut pilihan eksplisit, bukan cuma prefers-color-scheme,
       supaya tidak ada bar gelap di atas halaman yang dipaksa terang (atau sebaliknya). */
    if (metaTerang && metaGelap){
      if (v === "light"){ metaTerang.content = WARNA_TERANG; metaGelap.content = WARNA_TERANG; }
      else if (v === "dark"){ metaTerang.content = WARNA_GELAP; metaGelap.content = WARNA_GELAP; }
      else { metaTerang.content = WARNA_TERANG; metaGelap.content = WARNA_GELAP; }
    }
    var b = el("tema-btn");
    if (b){ b.textContent = IKON[v]; b.title = "Tema: " + LABEL[v] + " — sentuh untuk ganti"; }
  }
  terapkan(baca());
  el("tema-btn").addEventListener("click", function(){
    /* dari tema yang sedang terpasang (dulu dari penyimpanan: penyimpanan penuh = macet di Terang) */
    var skrg = document.documentElement.dataset.theme || "", i = (URUT.indexOf(skrg) + 1) % URUT.length, baru = URUT[i];
    simpan(baru); terapkan(baru);
  });
})();

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
/* Rencana hari ini mengisi Sedang narik dan Rencanakan, supaya tidak perlu
   diketik dua kali. Dipanggil saat dibuka DAN saat tanggal berganti dengan
   halaman masih terbuka (rencana "besok" jadi rencana hari ini). */
function terapkanRencanaHariIni(){
  var hari = iso(new Date());
  if (!(PLAN && PLAN.date === hari)) return false;
  el("n-pulang").value = PLAN.pulang;
  el("n-bat").value    = PLAN.bat;
  if (!hariSudahMulai()) el("n-filter").value = PLAN.filter;
  el("n-rumah").checked = !!PLAN.rumah;
  el("p-tgl").value = hari;
  isiRencana(PLAN);
  terapkanFakta();   /* tipe mobil & colokan rumah: fakta terakhir, bukan salinan lama di rencana */
  /* hujan/acara yang sudah Ibu pilih di rencana hari ini dipakai juga di
     Sedang narik (cuaca/kalender nanti hanya bisa MENAMBAH centang) */
  if (PLAN.hujan) el("n-hujan").checked = true;
  if (PLAN.acara) el("n-acara").checked = true;
  return true;
}
terapkanRencanaHariIni();
pulihkanIsianHari();
terapkanFakta();
["n-pulang", "n-filter", "n-tujuan", "n-hujan", "n-acara"].forEach(function(id){ el(id).addEventListener("change", simpanIsianHari); });
/* sesudah sinkron KEMBAR (didaftarkan lebih dulu), jadi n-* sudah terisi */
["n-bat", "n-rumah", "p-bat", "p-rumah"].forEach(function(id){ el(id).addEventListener("change", simpanFakta); });
var hariTampil = iso(new Date());
function cekGantiHari(){
  var h = iso(new Date()); if (h === hariTampil) return;
  hariTampil = h;
  /* Hari baru: isian "hari ini" kemarin tidak boleh terbawa. Dulu "Sudah
     dapat" kemarin tetap di kolom, runNow menyimpannya dengan tanggal baru,
     dan proyeksi pagi ini langsung "sudah dekat target". */
  el("n-dpt").value = 0;
  el("n-soc").dataset.touched = "";
  /* baterai perkiraan kemarin malam bukan baterai pagi ini (semalam bisa
     dicas di rumah): tanpa jangkar hari ini kolom kembali seperti dibuka baru */
  if (!Baterai.terakhir()) el("n-soc").value = "65";
  PULANG_ASLI = null; checkinOtomatisTgl = null;
  el("n-hujan").dataset.touched = ""; el("n-hujan").checked = !!(WEATHER && WEATHER.tanggal === h && WEATHER.hujan);
  el("n-acara").dataset.touched = ""; el("n-acara").checked = !!EVENTS[h];
  /* jam pulang, "Tidak pulang", dan sisa filter kemarin juga tidak terbawa
     (sama dengan membuka ulang aplikasi) */
  el("n-pulang").value = "21.5"; el("n-tujuan").value = "rumah"; el("n-filter").value = "2";
  jamManual = false;
  loadPlan();
  muatMulaiHari();
  /* Catatan: tanggal isian ikut hari baru (dulu simpan hari ini menimpa catatan kemarin) */
  /* isian Catatan yang belum disimpan tidak dipindah tanggalnya diam-diam */
  if (el("tgl").value < h && new Date().getHours() >= 4){
    if (catatanKosong() || CATATAN_DARI){ resetCatatan(); el("tgl").value = h; el("status").textContent = ""; el("status").className = "status"; }
    else { el("status").textContent = "Tanggal catatan masih " + el("tgl").value + " \u2014 benar? Ganti tanggalnya kalau untuk hari ini."; el("status").className = "status err"; }
  }
  el("p-tgl").min = h;
  isiKepala();
  el("hari-status").textContent = ""; el("hari-status").className = "status";
  if ((el("p-tgl").value || h) < h){
    /* isian coba-coba Rencanakan kemarin tidak terbawa ke hari baru tanpa rencana */
    if (!rencanaUntuk(h)){ el("p-keluar").value = String(jamMulaiBawaan(h)); el("p-pulang").value = "21.5"; }
    el("p-tgl").value = h; el("p-tgl").dispatchEvent(new Event("change", { bubbles:true }));
  }
  terapkanRencanaHariIni();
  renderAll(); if (typeof renderSegar === "function") renderSegar();   /* kartu bulan, kalibrasi, kesegaran kalender ikut hari baru */
  bukaCheckinOtomatis();
}
setInterval(cekGantiHari, 60000);
document.addEventListener("visibilitychange", function(){ if (!document.hidden) cekGantiHari(); });
if (EVENTS[iso(now)]) el("n-acara").checked = true;
/* Rencanakan tanpa rencana tersimpan: jam mulai bawaan tanggal itu (tanggal merah 10:00) */
if (!rencanaUntuk(el("p-tgl").value || iso(now))) el("p-keluar").value = String(jamMulaiBawaan(el("p-tgl").value || iso(now)));
/* Rencanakan juga (dulu kotaknya kosong sementara catatannya "Acara sudah dihitung") */
if (!rencanaUntuk(el("p-tgl").value || iso(now)) && EVENTS[el("p-tgl").value || iso(now)]) el("p-acara").checked = true;
/* Fase capture: penibu "manual" harus tercatat sebelum runNow menggambar. */
el("n-acara").addEventListener("change", function(){ this.dataset.touched = "1"; }, true);
el("n-hujan").addEventListener("change", function(){ this.dataset.touched = "1"; }, true);
rows = lsRead(); sortRows(); renderAll(); preview(); muatCatatanTanggal();
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
    n.innerHTML = '<span class="tag">Tanggal HP</span><span><b>Tanggal HP salah ('+hariIni+').</b> Betulkan dulu di pengaturan HP, baru angka di sini benar.</span>';
    return;
  }


  if (hariIni > EVENTS_SAMPAI){ kelas = "warn";
    pesan.push("<b>Kalender acara sudah habis</b> (sampai "+EVENTS_SAMPAI+"). Centang &ldquo;Acara besar&rdquo; sendiri kalau ada.");
  }
  if (hariIni > HOLI_SAMPAI){ kelas = "warn";
    pesan.push("<b>Tanggal merah hanya tercatat sampai " + HOLI_SAMPAI + "</b> &mdash; perbarui aplikasi; libur sesudahnya dihitung sebagai hari biasa.");
  }
  if (hariIni > KONTEKS_SAMPAI){ kelas = "warn";
    pesan.push("Kalender libur sekolah dan Ramadan sudah habis (sampai " + KONTEKS_SAMPAI + ").");
  }

  var nWeb = Object.keys(EVENTS).filter(function(k){ return EVENTS[k][3] === "web"; }).length;
  if (nWeb) pesan.push("Kalender acara ditambah <b>" + nWeb + " acara dari pencarian web</b>.");
  if (!pesan.length){ n.hidden = true; return; }
  n.hidden = false;
  n.className = "flag " + kelas;
  n.innerHTML = '<span class="tag">Kalender</span><span>' + pesan.join(" ") + "</span>";
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
        ? "<b>Hujan" + (c.jam ? " sekitar " + c.jam : "") + ".</b> Order naik. Hindari banjir Periuk, Ciledug, Jakarta Barat; jangan terobos genangan &gt;15 cm."
        : "<b>Tidak hujan.</b>") +
      (c.ringkas ? " " + c.ringkas : "") + Cuaca.pita(c) +
      '<details class="kenapa"><summary>Sumber</summary><div>' + (c.sumber || "BMKG") +
      (c.diambil ? ", diambil " + hhmm(new Date(c.diambil).getHours() + new Date(c.diambil).getMinutes()/60) : "") + "</div></details></span>";
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
    "<b>Prakiraan cuaca belum terambil.</b> Kalau mendung, centang &ldquo;Hujan&rdquo; sendiri.</span>";
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
    n.innerHTML = '<span class="tag">Pengaturan</span><span><b>Pengaturan dari anak tersimpan: ' + PENGATURAN_DARI_TAUTAN.join(", ") + ".</b></span>";
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
    aturTombolSaran();
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
  AI.uji().then(function(){ setAiStatus("Tersambung. Tanya dan Minta saran (tab Catatan) sudah bisa dipakai.", "ok"); pasangAI(); },
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
      setAiStatus(c === "no_key" ? "Belum ada kunci." : c === "no_sdk" ? "SDK tidak termuat — muat ulang halaman dengan internet." :
                  c === "unauthorized" ? "Kunci ditolak Anthropic." :
                  c === "offline" ? "Tidak ada sambungan internet." : "Gagal (" + c + ").", "err"); });
});
el("ai-clear").addEventListener("click", function(){
  AI.setKey(""); sampler = null; aturTombolSaran();
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
/* Garis rute ke tempat teratas di "Sebaiknya ke mana sekarang?" -- data
   yang sudah diambil untuk pengali macet (lalulintas.js), bukan permintaan
   TomTom baru. Kalau tujuannya "tetap di sini" atau datanya belum ada
   (menunggu Lalulintas.segarkan selesai), garisnya dihapus/tidak muncul. */
function perbaruiRute(){
  if (!Peta.ada() || typeof Lalulintas === "undefined") { return; }
  var h = SEKARANG && SEKARANG.rek, L = SEKARANG && SEKARANG.L;
  var tujuan = h && h.daftar && h.daftar[0];
  if (!tujuan || tujuan.diSini || tujuan.lat == null || !L || L.lat == null){ Peta.gambarRute(null); return; }
  Peta.gambarRute(Lalulintas.poinCache(L, tujuan));
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
  perbaruiRute();
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
    if (!otomatis) setAcaraStatus("Butuh kunci API: isi di Pengaturan anak \u203a Sambungan ke Claude.", "err");
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
el("acara-segar").addEventListener("click", function(){
  if (!Acara.perluSegar() && !confirm("Kalender sudah disegarkan minggu ini. Menyegarkan lagi memanggil pencarian web berbayar (sekitar Rp 2.000–5.000). Lanjutkan?")) return;
  segarkanAcara(false);
});
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
  if (!Sinkron.siap() || sinkronJalan) return Promise.resolve();
  sinkronJalan = true; setSkStatus("Menyinkronkan…");
  return Sinkron.sinkron(rows, PLAN).then(function(r){
    sinkronJalan = false;
    if (r.status === "tersinkron"){
      var simpanOk = true;
      if (JSON.stringify(r.rows) !== JSON.stringify(rows)){ rows = r.rows; sortRows(); simpanOk = lsWrite(rows); renderAll(); }
      var j = new Date();
      if (simpanOk) setSkStatus("Tersinkron " + hhmm(j.getHours() + j.getMinutes()/60) + " · " + r.jumlah + " hari di repo", "ok");
      else setSkStatus("Tersinkron dari repo, tapi gagal disimpan di HP ini (penyimpanan penuh?).", "err");
    } else if (r.status === "offline") setSkStatus("Tidak ada internet; disinkronkan begitu tersambung.");
    else if (r.status === "nonaktif") setSkStatus("");
    else setSkStatus(r.status === "unauthorized" ? "Token ditolak GitHub. Periksa token dan izin Contents-nya." :
                     r.status === "notfound" ? "Repo tidak ditemukan. Buat dulu repo privatnya, atau periksa namanya." :
                     "Gagal sinkron (" + r.status + ").", "err");
  });
}
function sinkronNanti(){
  if (!Sinkron.siap()) return;
  clearTimeout(sinkronTimer); sinkronTimer = setTimeout(jalankanSinkron, 1500);
}
/* Diverifikasi lebih dulu (repo privat/publik) sebelum sinkron pertama kali
   dijalankan -- mencegah catatan tertulis ke repo yang belum sempat diperiksa. */
function verifikasiLaluSinkron(){
  Sinkron.uji().then(function(r){
    Sinkron.tandaiTerverifikasi(r.privat);
    setSkStatus(r.privat ? "Repo privat, token diterima." : "PERHATIAN: repo ini PUBLIK, catatan Ibu bisa dibaca siapa saja. Ganti ke repo privat.", r.privat ? "ok" : "err");
    if (r.privat) jalankanSinkron();
  }, function(err){
    var k = err && err.code;
    setSkStatus(k === "unauthorized" ? "Token ditolak GitHub." :
                k === "notfound" ? "Repo tidak ditemukan, atau token tidak punya akses ke sana." : "Gagal (" + k + ").", "err");
  });
}
el("sk-save").addEventListener("click", function(){
  var repo = el("sk-repo").value.trim() || Sinkron.BAWAAN.repo, tok = el("sk-token").value.trim(), c = Sinkron.cfg();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)){ setSkStatus("Tulis repo sebagai pemilik/nama-repo.", "err"); return; }
  if (!tok && !c.token){ setSkStatus("Tempel tokennya dulu.", "err"); return; }
  Sinkron.setCfg({ repo:repo, path:Sinkron.BAWAAN.path, token:tok || c.token });
  el("sk-token").value = ""; tandaiSinkron(); setSkStatus("Memeriksa…");
  verifikasiLaluSinkron();
});
el("sk-token").addEventListener("keydown", function(e){ if (e.key === "Enter"){ e.preventDefault(); el("sk-save").click(); } });
el("sk-now").addEventListener("click", function(){
  if (!Sinkron.aktif()) setSkStatus("Belum diatur: isi repo dan token dulu.", "err");
  else if (!Sinkron.siap()) setSkStatus("Belum diverifikasi aman; memeriksa repo dulu…", "err"), verifikasiLaluSinkron();
  else jalankanSinkron();
});
el("sk-clear").addEventListener("click", function(){
  Sinkron.setCfg(null); tandaiSinkron(); setSkStatus("Token dihapus dari HP ini. Catatan tetap ada di HP dan di repo.");
});
window.addEventListener("online", function(){ if (Sinkron.siap()) jalankanSinkron(); });
document.addEventListener("visibilitychange", function(){ if (!document.hidden && Sinkron.siap()) jalankanSinkron(); });
tandaiSinkron();
if (Sinkron.siap()) jalankanSinkron();
else if (Sinkron.aktif()) verifikasiLaluSinkron();

/* ---------------- "Mau ke tempat lain?" (tujuan pilihan Ibu) ---------------- */
function isiTujuan(){
  var s = el("tj-pilih"); if (!s) return;
  s.innerHTML = '<option value="">Pilih tujuan&hellip;</option>' + LOK.filter(function(l){ return l.lat != null; }).map(function(l){
    return '<option value="' + esc(l.id) + '">' + esc(l.n) + " &middot; " + Math.round(l.home) + " km dari rumah</option>";
  }).join("");
}
function renderTujuan(){
  var id = el("tj-pilih").value, out = el("tj-hasil");
  if (!id || !SEKARANG){ out.innerHTML = ""; return; }
  var S = SEKARANG, tgl = iso(S.o.ctx.d);
  var h = Rekomendasi.tujuan(S.o, S.L, S.soc, S.stay, id); if (!h) { out.innerHTML = ""; return; }
  var K = h.K, x = h.x;
  if (S.L && S.L.id === id){ out.innerHTML = "<p>Ibu sudah di " + esc(K.n) + ".</p>"; return; }
  if (x && x.terlewat){ out.innerHTML = '<p><b class="dn">Baterai tidak cukup untuk sampai ke ' + esc(K.n) + "</b> (butuh &plusmn;" + Math.round(x.socPindah) + "%, sisa " + S.soc + "%). Ngecas dulu.</p>"; return; }
  if (!x){ out.innerHTML = '<p><b class="dn">Tidak sempat:</b> sampai di ' + esc(K.n) + " sudah terlalu dekat jam pulang.</p>"; return; }
  var mnt = Math.round(x.jamPindah * 60), mntParah = Math.round(x.jamPindah * Rekomendasi.KALI_PARAH * 60);
  var p = [];
  p.push("<b>Ke " + esc(K.n) + ":</b> &plusmn;" + Math.round(x.kmPindah) + " km, &plusmn;" + mnt + " menit" +
         (x.sumberMacet === "tomtom" ? " (macet TomTom sekarang)" : x.sumberMacet === "terukur" ? " (pola macet TomTom terukur jam itu)" : " (" + labelLalin(x.macet) + ", perkiraan)") +
         " &rarr; tiba " + hhmm(x.tiba) + ", baterai tiba &plusmn;" + Math.max(0, x.socTiba) + "%.");
  p.push("Kalau macet parah: &plusmn;" + mntParah + " menit di jalan.");
  var biasa = x.mulaiPulang != null ? Lalulintas.pulangBiasaCache(K, x.mulaiPulang, tgl) : null;
  if (x.mulaiPulang == null)
    p.push("Ibu tidak pulang malam ini: narik di sana sampai " + hhmm(S.o.pulang) + ".");
  else if (x.keluarJkt != null)
    p.push("Keluar Jakarta jam " + hhmm(x.keluarJkt) + " (aturan 20:00), &plusmn;" + Math.round(x.keluarJktJam * 60) + " menit ke arah rumah, lalu narik dekat rumah sampai &plusmn;" + hhmm(x.mulaiPulang) + ".");
  else if (x.mulaiPulang <= x.tiba + 0.01)
    p.push("<b>Sampai di sana sudah waktunya pulang</b> &mdash; tidak ada waktu narik di sana.");
  else
    p.push("Mulai pulang dari sana &plusmn;" + hhmm(x.mulaiPulang) + (biasa != null ? " &middot; pola macet TomTom jam itu: &plusmn;" + biasa + " menit ke rumah" : "") + ".");
  if (h.basis){
    p.push("Hasil sampai " + (x.mulaiPulang == null ? hhmm(S.o.pulang) : "pulang") + " &plusmn;" + rp(x.sisa) + ", " + (x.selisih >= 0 ? "+" : "−") + rp(Math.abs(x.selisih)) + " dibanding tetap di " + esc(h.tinggal.n) + ".");
    if (!(x.selisih > 0)) p.push('<b class="dn">Tidak sepadan</b> &mdash; waktu di jalan tidak tertutup hasilnya di sana.');
    else if (x.rapuh) p.push('<b class="dn">Berisiko</b> &mdash; untung hanya kalau jalan lancar; kalau macet parah hasilnya ' +
                             (x.selisihParah == null ? "tidak sempat kerja di sana" : (x.selisihParah >= 0 ? "+" : "−") + rp(Math.abs(x.selisihParah)) + " dibanding tetap") + ".");
    else p.push('<b class="up">Sepadan</b> &mdash; tetap lebih untung walau macet parah (+' + rp(x.selisihParah) + ").");
  }
  p.push('<span style="color:var(--muted);font-size:12.5px">Macet parah = uji perjalanan 1,5&times; lebih lama, bukan ramalan.</span>');
  out.innerHTML = p.map(function(t){ return "<p>" + t + "</p>"; }).join("");
}
isiTujuan();
el("tj-pilih").addEventListener("change", renderTujuan);
el("tj-hitung").addEventListener("click", function(){
  renderTujuan();
  var id = el("tj-pilih").value, K = LOKMAP[id], S = SEKARANG;
  if (!K || !S || typeof Lalulintas === "undefined" || !Lalulintas.aktif()) return;
  var janji = [];
  if (S.L && LOKMAP[S.L.id] && S.L.id !== id) janji.push(Lalulintas.segarkan([[S.L, K]]));
  var h = Rekomendasi.tujuan(S.o, S.L, S.soc, S.stay, id);
  if (h && h.x && !h.x.terlewat && h.x.mulaiPulang != null) janji.push(Lalulintas.pulangBiasa(K, h.x.mulaiPulang, iso(S.o.ctx.d)));
  Promise.all(janji).then(function(){ runNow(); });
});

/* Label pengali lalu lintas (faktorLalin) untuk kartu. */
function labelLalin(f){
  return f >= 2 ? "jam pulang kantor, sangat padat" : f >= 1.6 ? "jam sibuk" : f >= 1.4 ? "lalu lintas siang biasa" : f >= 1.2 ? "agak ramai" : "relatif lancar";
}
/* Hasil uji "macet parah" (Rekomendasi.ujiMacet) sebagai satu baris kartu. */
function risikoMacet(x){
  if (x.diSini || !(x.selisih > 0)) return "";
  if (x.rapuh) return '<span class="rek-risiko">Berisiko: kalau macet parah (perjalanan 1,5&times; lebih lama), hasilnya tidak lebih baik dari tetap di sini.</span>';
  if (x.selisihParah != null) return '<span class="rek-aman">Tetap lebih untung walau macet parah (+' + rp(x.selisihParah) + ").</span>";
  return "";
}
/* ---------------- rekomendasi rute otomatis ---------------- */
var rekSemua = false;
var notesSemua = false;
var stepsSemua = false;
function renderRekomendasi(o, L, soc, stay){
  var box = el("rek"); if (!box) return null;
  var h = Rekomendasi.hitung(o, L, soc, stay);
  el("rek-faktor").textContent = "";
  if (!h.daftar.length){
    el("rek-list").innerHTML = '<div class="empty">Waktu tinggal sedikit \u2014 tidak usah pindah.</div>';
    el("rek-catatan").textContent = ""; return h;
  }
  var tampil = rekSemua ? h.daftar : h.daftar.slice(0, 3);
  el("rek-list").innerHTML = tampil.map(function(x, i){
    var sel = x.diSini ? "kalau tetap di sini" : (!h.basis ? "" : (x.selisih >= 0 ? "+" : "−") + rp(Math.abs(x.selisih)) + " dibanding tetap di sini");
    var macetTeks = x.sumberMacet === "tomtom" ? ", macet: TomTom langsung" : x.sumberMacet === "terukur" ? ", macet: pola TomTom terukur" : ", " + labelLalin(x.macet);
    var gerak = x.diSini ? "Tetap di sini."
      : "Pindah " + Math.round(x.kmPindah) + " km (±" + Math.round(x.jamPindah * 60) + " menit" + macetTeks + "), sampai " + hhmm(x.tiba) +
        (x.socTiba < x.res ? ", baterai kurang untuk pulang — perlu ngecas" : "") + ".";
    return '<div class="rek-item' + (i === 0 ? " top" : "") + (x.diSini ? " here" : "") + '">' +
      '<div class="rek-rank">' + (i + 1) + "</div>" +
      '<div class="rek-body"><b>' + esc(x.n) + "</b>" +
      '<span class="rek-num">±' + rp(x.sisa) + " <em>" + (stay ? "sisa hari s/d " + hhmm(o.pulang) : "sisa hari s/d pulang") + "</em></span>" +
      "<i>" + gerak + " " + rapi(x.saran.h) + "." + (x.sesi ? " " + x.sesi + "× ngecas." : "") + (stay ? "" : " Pulang " + Math.round(x.kmHome) + " km.") + "</i>" +
      '<span class="rek-delta ' + (x.selisih > 0 ? "up" : x.selisih < 0 ? "dn" : "") + '">' + sel + "</span>" +
      risikoMacet(x) +
      (x.diSini ? "" : '<a class="linkbtn" target="_blank" rel="noopener" href="' + Rekomendasi.tautanArah(x.lat, x.lon) + '">Arahkan (Google Maps)</a>') +
      "</div></div>";
  }).join("") + (h.daftar.length > 3
    ? '<button type="button" class="linkbtn" id="rek-toggle">' + (rekSemua ? "Tampilkan 3 teratas saja" : "Lihat semua " + h.daftar.length + " tempat") + "</button>" : "");
  var t = el("rek-toggle");
  if (t) t.addEventListener("click", function(){ rekSemua = !rekSemua; runNow(); });
  el("rek-catatan").innerHTML = "Dihitung dengan cara yang sama dengan perkiraan di atas dan kartu urutan tempat: hari, jam, daerah tarif, jarak dan waktu pindah (koridor terukur), baterai, cuaca, acara, jarak dan waktu pulang, insentif, dan ramainya tiap tempat per jam (dari Rute 700K, bukan pengukuran). Di Jakarta, mulai 20:00 dihitung sudah ke arah rumah. Yang ikut: " + Rekomendasi.faktor(o, soc).join(", ") + "." +
    (h.terlewat && h.terlewat.length ? " <b>Tidak ditawarkan karena baterai tidak cukup untuk sampai:</b> " + h.terlewat.map(esc).join(", ") + "." : "") +
    (h.kiraKira ? " <b>Posisi Ibu tanpa koordinat</b> (km diketik sendiri), jadi jarak pindah di atas tebakan kasar &mdash; tekan &ldquo;Cari posisi&rdquo; atau pilih titik di peta untuk angka yang benar." : "");
  return h;
}

/* Segarkan angka macet TomTom untuk kandidat yang benar-benar tampil,
   sekali per posisi per jendela 10 menit (sama dengan cache Lalulintas) --
   supaya tidak memanggil TomTom di setiap keystroke. Tanpa kunci TomTom,
   Lalulintas.aktif() salah dan fungsi ini tidak melakukan apa pun. */
var lalulintasTimer = null, lalulintasKunci = null;
function lalulintasOtomatis(o, L){
  if (typeof Lalulintas === "undefined" || !Lalulintas.aktif()) return;
  if (!(L && L.id && LOKMAP[L.id] && L.lat != null)) return;
  /* Hemat jatah Routing (10.000/bulan per HP): hanya saat aplikasi sedang
     dilihat, paling sering tiap 15 menit per posisi. */
  if (typeof document !== "undefined" && document.hidden) return;
  var kunciSekarang = L.id + "@" + Math.floor(Date.now() / (15 * 60 * 1000));
  if (lalulintasKunci === kunciSekarang) return;
  lalulintasKunci = kunciSekarang;
  clearTimeout(lalulintasTimer);
  lalulintasTimer = setTimeout(function(){
    var pasangan = Rekomendasi.KANDIDAT
      .map(function(id){ return LOKMAP[id]; })
      .filter(function(K){ return K && K.id !== L.id && K.lat != null; })
      .map(function(K){ return [L, K]; });
    Lalulintas.segarkan(pasangan).then(function(){ runNow(); });
  }, 1200);
}

/* ---------------- jalan pulang & kejadian di jalan (TomTom langsung) ----------------
   Kartu di tab Sekarang, hanya kalau ada kunci TomTom dan posisi Ibu punya
   koordinat. Jalan pulang diambil otomatis mulai 1,5 jam sebelum jam mulai
   pulang (atau di Jakarta mulai 18:00, aturan 20:00), atau saat tombol
   ditekan; kejadian di jalan tiap 20 menit. Hanya saat aplikasi dilihat.
   Mesin hitung tidak diubah: ini angka SEKARANG untuk keputusan sekarang. */
/* runNow pertama berjalan SEBELUM baris ini dieksekusi (urutan skrip), jadi
   nilainya diisi di dalam fungsi, bukan di deklarasi. */
var jalanAmbil, jalanCoba, jalanGagal;
function jamJam(j){ return hhmm(((j % 24) + 24) % 24); }   /* 24:20 -> 00:20 */
function renderJalan(o, L, paksa){
  var box = el("jalan"); if (!box) return;
  if (!jalanCoba){ jalanCoba = { pulang:0, kejadian:0 }; jalanGagal = { pulang:0, kejadian:0 }; }
  /* gagal berturut-turut: tunggu 3, 6, 12, 24, lalu 30 menit (izin kunci
     yang kurang, sinyal buruk) -- berhasil sekali, kembali 3 menit */
  function ulang(jenis){ return Math.min(30, 3 * Math.pow(2, Math.max(0, jalanGagal[jenis] - 1))) * 60e3; }
  if (jalanAmbil && Date.now() - jalanAmbil > 30000) jalanAmbil = 0;   /* jawaban yang tak kunjung selesai */
  var ada = typeof Lalulintas !== "undefined" && Lalulintas.aktif() && typeof Kejadian !== "undefined";
  if (!ada || !L || L.lat == null || L.lon == null){
    box.hidden = true;
    if (typeof Peta !== "undefined" && Peta.gambarPulang){ Peta.gambarPulang(null); Peta.gambarKejadian(null); }
    return;
  }
  box.hidden = false;
  var pos = { lat:L.lat, lon:L.lon }, kini = jamSekarangTepat();
  /* jam yang SAMA dengan langkah "Waktunya pulang" (batas 22:00/Minggu 20:30)
     dan jam meninggalkan Jakarta (aturan 20:00); dulu kartu ini punya jam sendiri */
  var metaL = (SEKARANG && SEKARANG.langkah && SEKARANG.langkah.meta) || {};
  var mulai = o.stay ? null : (typeof metaL.mulaiPulang === "number" ? metaL.mulaiPulang : o.pulang - jamMulaiPulang(o, null));
  var keluarJkt = (!o.stay && typeof metaL.tinggalSampai === "number") ? metaL.tinggalSampai : null;
  var batasJalan = keluarJkt != null ? Math.min(keluarJkt, mulai) : mulai;
  var waktunya = (batasJalan != null && kini >= batasJalan - 1.5) || (L.z === "jkt" && kini >= 18);
  /* kejadian: tiap 20 menit menjelang pulang, tiap 60 menit di luar itu */
  var umurKej = (waktunya ? 20 : 60) * 60e3;
  var h = Lalulintas.pulangSekarangCache(pos);
  var p = [];
  if (h){
    var est = Math.round(jamTempuhRumah(L, kini, L.home, tipeDari(o.ctx)) * 60);
    p.push('<span class="jl-besar">&plusmn;' + h.menit + " menit ke rumah</span> kalau berangkat sekarang" +
           (h.km != null ? " &middot; " + String(h.km).replace(".", ",") + " km" : "") +
           (h.biasa != null || h.lancar != null ? " <span class=\"muted\">(" + [h.biasa != null ? "biasanya jam ini &plusmn;" + h.biasa : "", h.lancar != null ? "lancar &plusmn;" + h.lancar : ""].filter(Boolean).join(", ") + ")</span>" : "") + ".");
    if (est > 0 && h.menit - est >= 10) p.push('<b class="dn">Lebih lama &plusmn;' + (h.menit - est) + " menit dari hitungan aplikasi (&plusmn;" + est + " menit).</b> Jalan sedang lebih macet dari biasanya.");
    else if (est > 0 && est - h.menit >= 10) p.push("Lebih cepat &plusmn;" + (est - h.menit) + " menit dari hitungan aplikasi (&plusmn;" + est + " menit): jalan sedang lengang.");
    if (mulai != null){
      /* paling lambat = yang lebih awal dari (jam pulang - macet sekarang) dan
         batas langkah (22:00 / keluar Jakarta 20:00) */
      var mulaiLive = Math.min(o.pulang - h.menit / 60 - 0.25, batasJalan);
      var tibaKini = kini + h.menit / 60;
      if (tibaKini > o.pulang + 0.05) p.push("<b>Sudah tidak bisa sampai rumah " + jamJam(o.pulang) + "</b>: berangkat sekarang, tiba &plusmn;" + jamJam(tibaKini) + " (terlambat &plusmn;" + Math.round((tibaKini - o.pulang) * 60) + " menit).");
      else if (mulaiLive <= kini) p.push("<b>" + (keluarJkt != null && keluarJkt <= kini + 0.01 ? "Keluar Jakarta sekarang" : "Sebaiknya jalan pulang sekarang") + "</b> (tiba rumah &plusmn;" + jamJam(tibaKini) + ").");
      else p.push((keluarJkt != null && keluarJkt < mulai ? "Keluar Jakarta paling lambat &plusmn;<b>" + hhmm(mulaiLive) + "</b> (aturan 20:00), sama dengan langkah" :
                   "Mulai pulang paling lambat &plusmn;<b>" + hhmm(mulaiLive) + "</b>" + (Math.abs(mulaiLive - mulai) >= 0.17 ? " (langkah: " + hhmm(mulai) + ", dengan macet biasa)" : ", sama dengan langkah")) +
                  ". Macet bisa berubah sampai jam itu.");
    }
    h.macet.filter(function(m){ return m.tunda >= 0.5; }).slice(0, 2).forEach(function(m){
      var k = Kejadian.dekatGaris(pos, m.garis || (m.titik ? [m.titik] : null), umurKej);
      var jauh = m.titik ? jarakLurus(pos.lat, pos.lon, m.titik[0], m.titik[1]) : null;
      p.push("Macet di rute: <b>+" + Math.round(m.tunda) + " menit</b>" + (m.kmj ? ", &plusmn;" + Math.round(m.kmj) + " km/jam" : "") +
             (k && (k.dari || k.jalan) ? " &middot; " + esc(k.jalan && k.dari ? k.jalan + ", " : k.jalan) + esc(k.dari) + (k.ke ? " &rarr; " + esc(k.ke) : "") : "") +
             (jauh != null ? (jauh < 1 ? " &middot; di dekat Ibu (garis merah di peta)" : " &middot; &plusmn;" + Math.round(jauh) + " km dari Ibu (garis merah di peta)") : "") + ".");
    });
  } else if (o.stay){
    p.push("Ibu memilih tidak pulang dulu. Tekan <b>Cek jalan pulang sekarang</b> kalau ingin tahu macetnya.");
  } else {
    var tr = Lalulintas.tertahan ? Lalulintas.tertahan("rute", null, true) : null, stJ = Lalulintas.statusJatah ? Lalulintas.statusJatah("rute") : null;
    p.push(L.home <= 1 ? "Ibu sudah di sekitar rumah." :
           (tr === "stop" || tr === "penuh") ? "Jalan pulang langsung dari TomTom tidak tersedia sampai " + (stJ && stJ.bulan >= stJ.bulanMaks ? "tanggal 1 bulan depan (jatah bulan ini habis)" : "besok (" + (tr === "stop" ? "TomTom menolak permintaan" : "jatah hari ini habis") + ")") + "; ikuti jam di langkah." :
           waktunya ? (jalanCoba.pulang && !jalanAmbil && Date.now() - jalanCoba.pulang <= ulang("pulang")
                        ? "Jalan pulang belum bisa diambil dari TomTom (tanpa sinyal?). Dicoba lagi otomatis."
                        : "Mengambil jalan pulang dari TomTom&hellip;") :
           "Jalan pulang (macet sekarang) muncul sendiri mulai &plusmn;" + hhmm(Math.max(0, (batasJalan || kini) - 1.5)) + ". Tekan <b>Cek jalan pulang sekarang</b> untuk melihatnya sekarang.");
  }
  el("jalan-pulang").innerHTML = p.map(function(t){ return "<p>" + t + "</p>"; }).join("");

  var kc = Kejadian.cache(pos, umurKej), daftar = Kejadian.relevan(pos, h && h.poin, 15, umurKej).slice(0, 5);
  var kk = "";
  if (kc){
    kk = daftar.length ? daftar.map(function(k){
      var parah = k.kat === 8 || k.kat === 11 || k.kat === 1;
      return '<div class="jl-kej"><span class="jl-tag' + (parah ? " parah" : "") + '">' + esc(k.jenis) + "</span>" +
        (k.jalan ? "<b>" + esc(k.jalan) + "</b>" + (k.dari ? ", " : " ") : "") + esc(k.dari) + (k.ke ? " &rarr; " + esc(k.ke) : "") +
        " &middot; " + String(k.jarak).replace(".", ",") + " km dari Ibu" +
        (k.diRute ? ' &middot; <span class="jl-rute">di rute pulang</span>' : "") +
        (k.tunda ? " &middot; tertahan &plusmn;" + k.tunda + " menit" : "") +
        (k.ket && k.ket.toLowerCase() !== k.jenis.toLowerCase() ? '<br><span class="muted">' + esc(k.ket) + "</span>" : "") + "</div>";
    }).join("") : '<p class="muted">Tidak ada kecelakaan, jalan ditutup, banjir, atau mogok yang tercatat TomTom dalam 15 km.</p>';
    kk += '<p class="jl-sumber">Sumber: TomTom &middot; kejadian ' + hhmm(new Date(kc.at).getHours() + new Date(kc.at).getMinutes() / 60) +
          (h ? " &middot; jalan pulang " + hhmm(new Date(h.at).getHours() + new Date(h.at).getMinutes() / 60) : "") + "</p>";
  }
  else {
    var tk = Lalulintas.tertahan("insiden");
    var sjI = Lalulintas.statusJatah ? Lalulintas.statusJatah("insiden") : null;
    if (tk === "penuh" || tk === "stop") kk = '<p class="muted">Kejadian di jalan: ' + (sjI && sjI.bulan >= sjI.bulanMaks ? "jatah TomTom bulan ini habis, mulai lagi tanggal 1." : "jatah TomTom hari ini " + (tk === "stop" ? "ditolak (429)" : "habis") + ", dicoba lagi besok.") + "</p>";
  }
  el("jalan-kejadian").innerHTML = kk;
  if (typeof Peta !== "undefined" && Peta.gambarPulang){ Peta.gambarPulang(h); Peta.gambarKejadian(daftar); }

  if (jalanAmbil || (typeof document !== "undefined" && document.hidden)) return;
  /* Gagal (sinyal, jatah) tidak dicoba ulang di setiap hitung ulang: paling
     cepat 3 menit lagi, kecuali tombol ditekan. */
  var t = Date.now(), ambilPulang = !h && (paksa || (waktunya && !o.stay && t - jalanCoba.pulang > ulang("pulang"))),
      ambilKej = !kc && (paksa || t - jalanCoba.kejadian > ulang("kejadian"));
  if (!ambilPulang && !ambilKej) return;
  jalanAmbil = t;
  if (ambilPulang) jalanCoba.pulang = t;
  if (ambilKej) jalanCoba.kejadian = t;
  Promise.all([ambilPulang ? Lalulintas.pulangSekarang(pos) : null, ambilKej ? Kejadian.segarkan(pos, umurKej, !!paksa) : null]).then(function(rs){
    jalanAmbil = 0;
    if (ambilPulang) jalanGagal.pulang = rs[0] ? 0 : jalanGagal.pulang + 1;
    if (ambilKej) jalanGagal.kejadian = rs[1] ? 0 : jalanGagal.kejadian + 1;
    if (rs.some(Boolean) && SEKARANG) renderJalan(SEKARANG.o, SEKARANG.L, false);
    if (ambilPulang && !rs[0] && el("jalan-pulang"))
      el("jalan-pulang").innerHTML = "<p>Jalan pulang belum bisa diambil dari TomTom (tanpa sinyal, jatah hari ini habis, atau Ibu sudah dekat rumah)." +
        (waktunya && !o.stay ? " Dicoba lagi otomatis." : "") + "</p>";
  });
}
el("jalan-cek").addEventListener("click", function(){ if (SEKARANG) renderJalan(SEKARANG.o, SEKARANG.L, true); });
document.addEventListener("visibilitychange", function(){
  if (!document.hidden && SEKARANG){ lalulintasOtomatis(SEKARANG.o, SEKARANG.L); renderJalan(SEKARANG.o, SEKARANG.L, false); }
});

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
  n.innerHTML = '<div class="ai-head"><span class="eyebrow">Saran singkat' + (b ? " &middot; " + b.jam : "") + "</span>" +
    '<button type="button" class="linkbtn" id="briefing-segar">Segarkan</button></div>' +
    '<div class="ai-out">' + (b ? teksAI(b.teks) : "") + "</div>" +
    (status ? '<div class="status">' + esc(status) + "</div>" : "");
  var s = el("briefing-segar"); if (s) s.addEventListener("click", function(){
    var kunciSekarang = kunciBriefing(), lamaSekarang = bacaBriefing();
    var sudahAda = lamaSekarang && lamaSekarang.kunci === kunciSekarang;
    if (sudahAda && !confirm("Saran untuk saat ini sudah ada. Menyusun ulang memanggil Claude lagi (berbayar). Lanjutkan?")) return;
    jalankanBriefing(true);
  });
}
function jalankanBriefing(paksa){
  if (!sampler || !SEKARANG || briefingJalan) return Promise.resolve();
  var kunci = kunciBriefing(), lama = bacaBriefing();
  var lamaCocok = (lama && lama.kunci === kunci) ? lama : null;
  if (!paksa && lamaCocok){ renderBriefing(lamaCocok); return Promise.resolve(); }
  briefingJalan = true; renderBriefing(lamaCocok, "Menyusun…");
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
    ? "Istirahat " + hhmm(r[0]) + "\u2013" + hhmm(r[1]) + " (" + Math.round((r[1]-r[0])*60) + " menit)."
    : "Aplikasi akan menyarankan jam istirahat yang paling untung.";
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
/* fillTimes di atas mengembalikan jam istirahat ke 10:30-15:00: pasang lagi
   rencana tersimpan tanggal itu (dulu istirahat 12:00-14:00 tampil 10:30-15:00
   dan "Pakai" menyimpan yang salah) */
var Pboot = rencanaUntuk(el("p-tgl").value);
setJedaUI(Pboot ? Pboot.rehat : rehatDariUI());
runPlan();


/* ---------------- perkiraan baterai di tab Sekarang ---------------- */
function renderSocEst(est, soc, touched){
  var n = el("socest"), src = el("src-soc"); if (!n) return;
  if (!est){
    n.innerHTML = 'Isi <button type="button" class="linkbtn" id="socest-mulai">Mulai hari</button> supaya baterai dihitung sendiri.';
    if (src){ src.textContent = ""; src.className = ""; }
    var m = el("socest-mulai"); if (m) m.addEventListener("click", bukaCheckin);
    return;
  }
  var selisih = est.soc - soc;
  if (src){ src.textContent = touched ? "diketik sendiri" : "perkiraan"; src.className = touched ? "man" : ""; }
  n.innerHTML = "Perkiraan " + (est.soc < 1 ? "hampir habis (&le;1%)" : "&plusmn;" + est.soc + "%") + " (dari " + est.dariSoc + "% jam " + hhmm(est.dariJam) + ", &plusmn;" + Math.round(est.km) + " km" + (est.gps ? " GPS" : "") + ")." +
    (touched && Math.abs(selisih) >= 2 ? ' <button type="button" class="linkbtn" id="socest-pakai">Pakai ' + est.soc + "%</button>" : "") +
    "";
  var b = el("socest-pakai");
  if (b) b.addEventListener("click", function(){ el("n-soc").value = Math.max(1, est.soc); el("n-soc").dataset.touched = ""; runNow(); });
}
function renderSocEstSaja(){
  var o = opsiBaterai(parseFloat(el("n-pulang").value));
  var est = Baterai.perkiraan(jamKeluarSekarang(), o);
  if (est && el("n-soc").dataset.touched !== "1" && Math.abs(Math.max(1, est.soc) - parseFloat(el("n-soc").value)) >= 1){ runNow(); return; }
  renderSocEst(est, parseFloat(el("n-soc").value) || 0, el("n-soc").dataset.touched === "1");
}
el("cas-selesai").addEventListener("click", function(){
  var v = parseFloat(el("cas-ke").value);
  if (!(v >= 1 && v <= 100)){ el("hari-status").textContent = "Isi dulu berapa % setelah ngecas."; el("hari-status").className = "status err"; return; }
  Baterai.jangkar(jamSekarangTepat(), Math.round(v), "ngecas");
  el("n-soc").value = Math.round(v); el("n-soc").dataset.touched = "";
  el("cas-ke").value = "";
  el("hari-status").textContent = "Dicatat " + Math.round(v) + "% jam " + hhmm(jamSekarangTepat()) + ".";
  el("hari-status").className = "status ok";
  if (!Baterai.tersimpan()){ el("hari-status").textContent = "Dipakai " + Math.round(v) + "% jam " + hhmm(jamSekarangTepat()) + ", tapi GAGAL disimpan di HP ini (penyimpanan penuh?) — hilang kalau aplikasi ditutup."; el("hari-status").className = "status err"; }
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
function simpanMulaiHari(m){ MULAI_HARI = m; try { localStorage.setItem(LSMULAI, JSON.stringify(m)); return true; } catch (e) { return false; } }
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
         "");
  if (ctx.ev) f.push("acara kalender: " + esc(ctx.ev[0]));
  if (ctx.gajian) f.push("musim gajian");
  var sh = el("src-hujan"); if (sh && sh.textContent) f.push("cuaca: " + esc(sh.textContent) + (el("n-hujan").checked ? " (hujan dicentang)" : ""));
  var L0 = currentLok(); f.push("posisi: " + esc(L0.n) + (lokSumber === "auto" ? " (GPS)" : ""));
  var pl = PLAN && PLAN.date === iso(now);
  if (pl) f.push("rencana tersimpan: keluar " + hhmm(PLAN.keluar) + ", pulang " + hhmm(PLAN.pulang) + ", istirahat " + rehatTeks(PLAN.rehat));
  el("ci-auto").innerHTML = "Sudah terisi otomatis: " + f.join(" &middot; ") + ".";
}
function bukaCheckin(){
  var now = new Date(), t = Math.round((now.getHours() + now.getMinutes()/60) * 4) / 4;
  var m = MULAI_HARI, pl = (PLAN && PLAN.date === iso(now)) ? PLAN : null;
  el("ci-tgl").textContent = now.toLocaleDateString("id-ID", { weekday:"long", day:"numeric", month:"long" });
  /* Baterai dan "sudah dapat" diambil dari keadaan SEKARANG (kolom tab
     Sekarang, yang sudah mengikuti ngecas/ketikan), bukan isian pagi. */
  /* perkiraan 0% = 1% (dulu 0 dianggap kosong dan terisi 95% pagi tadi,
     jadi mengubah jam pulang saja "mengecas" baterai). Tanpa jangkar hari
     ini angka kolom itu bukan bacaan (65 bawaan / sisa kemarin malam). */
  var socK = parseFloat(el("n-soc").value);
  el("ci-soc").value = (Baterai.terakhir() && isFinite(socK)) ? Math.max(1, Math.round(socK)) : (m ? m.soc : 90);
  el("ci-soc").dataset.awal = el("ci-soc").value;
  var jamNow = now.getHours();
  el("ci-judul").textContent = (m ? "Ubah isian hari ini, Bu." :
    (jamNow < 11 ? "Selamat pagi" : jamNow < 15 ? "Selamat siang" : jamNow < 18 ? "Selamat sore" : "Selamat malam") + ", Bu. Isi dulu keadaan sekarang.");
  if (el("ci-status")){ el("ci-status").textContent = ""; el("ci-status").className = "status"; }
  /* buka ulang (sudah Mulai hari): isian SEKARANG, bukan isian pagi --
     dulu mengganti baterai saja mengembalikan jam pulang & filter pagi */
  el("ci-bat").value = String(m ? parseFloat(el("n-bat").value) : (pl ? pl.bat : parseFloat(el("n-bat").value)));
  /* Jam mulai bawaan menurut hari (Rute 700K): Senin 04:45, Sabtu 07:30, Minggu 07:00, lainnya 05:15 -- kecuali sudah lewat */
  var mulaiHari = jamMulaiBawaan(iso(now));
  el("ci-keluar").value = String(m ? m.keluar : (pl ? pl.keluar : Math.max(3.5, Math.min(23.5, t > mulaiHari + 0.5 ? t : mulaiHari))));
  el("ci-pulang").value = String(m ? parseFloat(el("n-pulang").value) : (pl ? pl.pulang : parseFloat(el("n-pulang").value)));
  el("ci-zona").value = m ? m.zona : (pl ? pl.zona : (currentLok().z === "apt" ? "apt" : currentLok().z === "jkt" ? "jkt" : "tng"));
  el("ci-filter").value = String(m ? parseInt(el("n-filter").value, 10) : (pl ? pl.filter : parseInt(el("n-filter").value, 10)));
  el("ci-dpt").value = parseRp(el("n-dpt").value) || 0;
  el("ci-rumah").checked = el("n-rumah").checked;
  var rh = rehatRange(pl ? pl.rehat : (m ? m.rehat : "none"));
  el("ci-rehat").value = rh ? "custom" : "none";
  if (rh){ el("ci-rehat-dari").value = String(Math.round(rh[0]*4)/4); el("ci-rehat-sampai").value = String(Math.round(rh[1]*4)/4); }
  tampilJedaCI(); isiOtomatisCI();
  el("checkin").hidden = false;
  try { el("ci-soc").focus(); } catch (e) {}
}
/* Mulai hari dibuka sendiri sekali per tanggal: saat dibuka, dan juga kalau
   halaman sudah terbuka sejak semalam / sebelum 03:30 (dulu hanya saat
   dibuka, jadi pagi itu baterai 15% kemarin malam yang dipakai). Tidak
   sesudah 20:30 -- jam segitu Ibu merencanakan besok (dulu "Selamat pagi"
   muncul di atas rencana besok dan Mulai membuat hari setengah jam). */
var checkinOtomatisTgl = null;
function bukaCheckinOtomatis(){
  var t = jamSekarangTepat(), h = iso(new Date());
  if (checkinOtomatisTgl === h || MULAI_HARI || lewatiHariIni() || /tanpa-mulai/.test(location.search) || t < 3.5 || t > 23.5) return;
  if (!el("checkin").hidden) return;
  var pl = (PLAN && PLAN.date === h) ? PLAN : null;
  if (t >= 20.5 && !(pl && t < pl.pulang)) return;
  checkinOtomatisTgl = h;
  bukaCheckin();
}
function tutupCheckin(){ el("checkin").hidden = true; try { el("ci-buka").focus(); } catch (e) {} }
document.addEventListener("keydown", function(e){ if (e.key === "Escape" && !el("checkin").hidden) tutupCheckin(); });
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
  var keluar = Math.max(3.5, Math.min(23, parseFloat(el("ci-keluar").value))), pulang = parseFloat(el("ci-pulang").value);
  /* jam pulang sebelum/sama dengan jam mulai: tolak dengan pesan (dulu
     diam-diam jadi hari setengah jam dengan bersih minus) */
  if (!(pulang > keluar)){
    el("ci-status").textContent = "Jam pulang harus sesudah jam mulai narik."; el("ci-status").className = "status err";
    try { el("ci-pulang").focus(); } catch (e) {}
    return;
  }
  if (!(pulang > jam)) pulang = Math.min(24, Math.round((jam + 0.5) * 4) / 4);
  /* Dibuka ulang: jam & baterai MULAI tetap yang pagi (dulu mengubah jam
     pulang saja menggeser awal rencana ke baterai siang dan "Mulai jam
     12:00"); baterai baru hanya jadi jangkar bila Ibu mengubahnya. */
  var ubah = !!MULAI_HARI, socBeda = String(soc) !== String(Math.round(parseFloat(el("ci-soc").dataset.awal)));
  var m = { date:iso(new Date()), jam:ubah ? MULAI_HARI.jam : jam, soc:ubah ? MULAI_HARI.soc : soc, bat:parseFloat(el("ci-bat").value), keluar:keluar, pulang:pulang,
            zona:el("ci-zona").value, filter:parseInt(el("ci-filter").value, 10), dpt:Math.max(0, parseRp(el("ci-dpt").value) || 0),
            rehat:rehatCI(), rumah:el("ci-rumah").checked };
  var pertama = !MULAI_HARI;
  var mulaiOk = simpanMulaiHari(m);
  /* Isian pertama hari ini = jangkar awal; buka ulang = jangkar baru tanpa
     menghapus jejak ngecas sebelumnya. */
  if (pertama || !Baterai.terakhir()) Baterai.mulai(jam, soc, "mulai hari"); else if (socBeda) Baterai.jangkar(jam, soc, "isi ulang");
  /* proyeksi "awal" hari ini dihitung ulang dari isian Mulai hari */
  try { var mp = JSON.parse(localStorage.getItem(LSPROY) || "{}") || {}; delete mp[iso(new Date())]; localStorage.setItem(LSPROY, JSON.stringify(mp)); } catch (e) {}
  /* Tab Sekarang mengikuti isian ini. */
  el("n-soc").value = soc; el("n-soc").dataset.touched = ""; PULANG_ASLI = null;
  el("n-bat").value = String(m.bat); el("n-pulang").value = String(m.pulang);
  el("n-filter").value = String(m.filter); el("n-rumah").checked = m.rumah; el("n-dpt").value = m.dpt;
  /* Rencana hari ini = isian ini, supaya jeda, jam mulai, dan insentif sehari ikut. */
  /* jam mulai = pilihan Ibu (dulu mulai hari 04:00 dengan pilihan 05:15 menjadi 04:00) */
  var keluarPlan = Math.max(3.5, Math.min(23, keluar));
  savePlan({ date:m.date, keluar:keluarPlan, pulang:Math.max(m.pulang, keluarPlan + 0.5), rehat:m.rehat, zona:m.zona,
             filter:m.filter, bat:m.bat, rumah:m.rumah, hujan:el("n-hujan").checked, acara:el("n-acara").checked });
  ["p-keluar", "p-pulang", "p-zona", "p-filter", "p-bat"].forEach(function(id){
    el(id).value = String({ "p-keluar":PLAN.keluar, "p-pulang":PLAN.pulang, "p-zona":PLAN.zona, "p-filter":PLAN.filter, "p-bat":PLAN.bat }[id]);
  });
  setJedaUI(PLAN.rehat); el("p-rumah").checked = m.rumah; el("p-tgl").value = m.date;
  el("p-hujan").checked = !!PLAN.hujan; el("p-acara").checked = !!PLAN.acara;
  sinkronNanti();
  tutupCheckin();
  setMode("narik", true);   /* hari sudah dimulai: tampilkan Sedang narik */
  var kabar = ubah ? "Diubah jam " + hhmm(jam) + (socBeda ? ", baterai " + soc + "%" : "") + "." : "Mulai jam " + hhmm(jam) + ", baterai " + soc + "%.";
  if (mulaiOk){ el("hari-status").textContent = kabar; el("hari-status").className = "status ok"; }
  else { el("hari-status").textContent = kabar.replace(/\.$/, "") + " — tapi GAGAL disimpan di HP ini (penyimpanan penuh?), bisa hilang kalau aplikasi ditutup."; el("hari-status").className = "status err"; }
  if (el("ci-gps").checked) deteksiLokasi(false);
  simpanFakta(); simpanIsianHari();
  runNow(); runPlan();
});
el("ci-lewati").addEventListener("click", function(){
  try { localStorage.setItem(LSLEWATI, iso(new Date())); } catch (e) {}
  tutupCheckin();
});
el("ci-buka").addEventListener("click", bukaCheckin);

/* ---------------- kunci TomTom ---------------- */
function tomtomStatusTeks(s){
  return s === "ok" ? "Lapisan kemacetan TomTom aktif di peta." :
         s === "error" ? "Kunci TomTom ditolak atau ubinnya gagal dimuat — periksa kunci di dasbor TomTom." :
         s === "cek" ? "Memeriksa lapisan kemacetan TomTom… (tampilkan peta untuk melihatnya)" : "";
}
function tandaiTomTom(){
  var k = Peta.kunciTomTom();
  el("tt-key").placeholder = k ? "tersimpan · ····" + k.slice(-4) : "Kunci TomTom (opsional)";
  el("tt-clear").hidden = !k;
  var teks = "";
  if (k){
    /* Peta baru dibuat sekali tab Sekarang menekan "Tampilkan peta", jadi
       simpan kunci di sini (tab Catatan) belum tentu langsung memasang
       lapisan -- tanpa baris ini layar terlihat diam padahal kuncinya
       sudah tersimpan (dan akan dipasang begitu peta dibuka). */
    teks = Peta.ada() ? tomtomStatusTeks(Peta.statusTomTom())
                       : "Kunci tersimpan. Buka tab Hari ini (Sedang narik), lalu tekan \"Tampilkan peta\" untuk melihat lapisan macetnya.";
  }
  el("tt-status").textContent = teks;
}
Peta.onStatusTomTom(function(){ tandaiTomTom(); });
el("tt-save").addEventListener("click", function(){
  var k = el("tt-key").value.trim();
  if (!k){ el("tt-status").textContent = "Tempel kuncinya dulu."; return; }
  Peta.setKunciTomTom(k); el("tt-key").value = ""; tandaiTomTom();
  /* kunci baru: mulai ukur (paksa = hapus tanda "berhenti" dari kunci lama) */
  if (Lalulintas.aktif()){ ukurMacet(true); segarSpklu(false); }
});
el("tt-clear").addEventListener("click", function(){ Peta.setKunciTomTom(""); tandaiTomTom(); tandaiUkur(); tandaiSpklu(); });

/* ---- Colokan SPKLU dari TomTom (spklu.js): sekali per 30 hari ---- */
function tandaiSpklu(teks){
  var e = el("spklu-status"); if (!e) return;
  if (!Lalulintas.aktif()){ e.textContent = "Colokan SPKLU (cocok untuk Atto 1 atau tidak) butuh kunci TomTom."; return; }
  var s = SpkluTT.status();
  e.innerHTML = (teks ? esc(teks) + " " : "") + (s
    ? "SPKLU dari TomTom: <b>" + s.jumlah + "</b> stasiun &middot; <b>" + s.cepat + "</b> punya CCS2 (cocok cepat untuk Atto 1, maks 30 kW), " +
      s.lambat + " hanya AC, " + s.tidak + " tidak cocok &middot; diperbarui " + iso(new Date(s.at)) + ". Status kosong/terisi tidak tersedia untuk Indonesia."
    : "Colokan SPKLU belum diambil dari TomTom.");
}
function segarSpklu(paksa){
  if (!Lalulintas.aktif()){ tandaiSpklu(); return Promise.resolve(); }
  if (paksa) tandaiSpklu("Mengambil daftar SPKLU…");
  return SpkluTT.segarkan(paksa).then(function(h){
    tandaiSpklu(h.alasan === "selesai" || h.alasan === "masih segar" ? "" : "Pembaruan: " + h.alasan + ".");
    if (h.alasan !== "masih segar" && h.jumlah > 0){ if (Peta.gambarSpkluTT) Peta.gambarSpkluTT(); runNow(); }
  });
}
el("spklu-segar").addEventListener("click", function(){ segarSpklu(true); });
tandaiSpklu();
setTimeout(function(){ if (!document.hidden && Lalulintas.aktif() && SpkluTT.perluSegar()) segarSpklu(false); }, 15000);

/* ---- Ukur macet otomatis (ukurmacet.js) ---- */
function jatahTeks(p){
  var j = Lalulintas.statusJatah(p);
  return j.bulan.toLocaleString("id-ID") + "/" + j.bulanMaks.toLocaleString("id-ID") + " (hari ini " + j.hari + "/" + j.hariMaks +
    (j.tahan === "stop" ? ", berhenti sampai besok: TomTom menolak (429)" : j.tahan === "jeda" ? ", jeda sebentar" : "") + ")";
}
function tandaiUkur(teksLain){
  var e = el("ukur-status"); if (!e) return;
  if (!Lalulintas.aktif()){ e.textContent = "Pengukuran macet rute Ibu butuh kunci TomTom (produk Routing)."; return; }
  var s = UkurMacet.status(), pct = Math.round(s.segar / s.total * 100);
  e.innerHTML = (teksLain ? esc(teksLain) + " " : "") +
    "Pola macet rute Ibu (TomTom): <b>" + s.segar + "/" + s.total + "</b> ukuran (" + pct + "%) &middot; hari ini " + s.hariIni + "/" + s.maksHarian +
    ".<br>Jatah TomTom HP ini bulan ini: rute " + jatahTeks("rute") + " &middot; kejadian jalan " + jatahTeks("insiden") + "." +
    (s.galat ? " <b>" + esc(s.galat) + ".</b>" : "") +
    (s.berhenti ? " Pengukuran berhenti sendiri setelah 3 kali gagal &mdash; periksa produk Routing di kunci TomTom, lalu tekan tombol di bawah." : "");
}
function ukurMacet(paksa){
  if (!Lalulintas.aktif()){ tandaiUkur(); return Promise.resolve(); }
  if (paksa) tandaiUkur("Mengukur…");
  return UkurMacet.jalankan({ paksa:!!paksa }).then(function(h){
    tandaiUkur(!paksa || !h.alasan || h.alasan === "selesai" ? "" :
               h.alasan === "sedang berjalan" ? "Pengukuran sedang berjalan (mungkin di jendela lain)." : "Berhenti: " + h.alasan + ".");
    /* renderAll, bukan runNow: kalibrasi kecepatan ikut memakai angka baru */
    if (h.diukur > 0) renderAll();
  });
}
el("ukur-sekarang").addEventListener("click", function(){ ukurMacet(true); });
window.addEventListener("online", function(){ ukurMacet(false); });
tandaiUkur();
setTimeout(function(){ ukurMacet(false); }, 8000);
tandaiTomTom();

/* Buka halaman Mulai hari sekali sehari, di jam kerja, kecuali dilewati
   atau dibuka dengan ?tanpa-mulai (untuk uji). */
muatMulaiHari();
bukaCheckinOtomatis();
if (MULAI_HARI) renderSocEstSaja();
/* Satu tab "Hari ini": keadaan bawaan + isian kembar diselaraskan sekali. */
(function(){
  /* hanya fakta mobil yang diselaraskan saat dibuka; hujan/acara/jam pulang
     rencana tersimpan TIDAK ditimpa isian bawaan Sedang narik */
  var ubah = false;
  KEMBAR.forEach(function(k){ if (k[2] && salinKembar(k[0], k[1], true, false)) ubah = true; });
  if (ubah) runPlan();
  var m = modeBawaan(), t = jamSekarangTepat();
  /* Dibuka malam untuk merencanakan: yang direncanakan besok, bukan sisa
     hari ini (sisa hari ini ada di Sedang narik) */
  if (m === "rencana") keBesokBilaMalam();
  setMode(m, false);
})();


/* ---------------- peluang rute ----------------
   Kartu urutan tempat per blok jam (Peluang.hitung), di tab Sekarang dari
   posisi & jam sekarang, di tab Rencana dari rumah pada jam keluar. */
function renderPeluang(id, o, L, opsi){
  var box = el(id); if (!box) return null;
  opsi = opsi || {};
  /* jam narik sudah habis (langkah = pulang): tidak ada rute untuk dibandingkan */
  if (!o.stay && o.habisKerja){ box.hidden = true; return { daftar:[], basis:null, habis:true }; }
  /* posisi tanpa koordinat (km diketik): "tetap di sini" tidak bisa dihitung
     per tempat -- dulu tampil sebagai "Tetap di Jakarta CBD" dengan angka lain */
  if (!opsi.rencana && L && L.lat == null){ box.hidden = true; return { daftar:[], basis:null, tanpaKoordinat:true }; }
  var h;
  try { h = Peluang.hitung(o, L, { banyak:3 }); } catch (e) { box.hidden = true; return null; }
  if (!h || !h.daftar.length){ box.hidden = true; return h; }
  box.hidden = false;
  var basis = h.basis;
  var jedaInfo = rehatRange(o.rehat), jamInfo = o.pulang - o.keluar - (jedaInfo ? Math.max(0, Math.min(jedaInfo[1], o.pulang) - Math.max(jedaInfo[0], o.keluar)) : 0);
  el(id + "-info").textContent = (h.awal ? "dari " + h.awal.n : "") + " \u00b7 " + Math.round(jamInfo) + " jam" + (opsi.rencana ? "" : " lagi") + " \u00b7 terbaik \u00b1" + rp(h.daftar[0].net);
  el(id + "-list").innerHTML = h.daftar.map(function(x, i){
    var chips = x.segmen.map(function(sg){
      if (sg.jeda) return '<span class="jeda' + (sg.sesi ? " cas" : "") + '"><b>' + hhmm(sg.s) + "\u2013" + hhmm(sg.e) + "</b>istirahat" + (sg.sesi ? " + ngecas " + pctB(sg.sesi.dari) + "\u2192" + pctB(sg.sesi.ke) + "%" : "") + "</span>";
      return '<span class="' + (sg.sesi ? "cas" : "") + '"><b>' + hhmm(sg.s) + "\u2013" + hhmm(sg.e) + "</b>" + esc(sg.tempat.n) +
        (sg.pindahKm > 0.5 ? " <em style=\"color:var(--muted)\">(" + Math.round(sg.pindahKm) + " km, " + Math.round(sg.pindahJam*60) + " mnt)</em>" : "") +
        "<em style=\"color:var(--muted)\">\u2248 " + Math.round(sg.order) + " order \u00b7 " + rp(sg.gross) + "</em>" +
        (sg.sesiSemua || (sg.sesi ? [sg.sesi] : [])).map(function(ss){ return "<em style=\"color:var(--signal)\">ngecas " + pctB(ss.dari) + "\u2192" + pctB(ss.ke) + "%</em>"; }).join("") + "</span>";
    }).join('<i>\u2192</i>');
    var sel = x.diam ? "kalau tetap di " + esc(h.awal.n) : (x.selisih >= 0 ? "+" : "\u2212") + rp(Math.abs(x.selisih)) + " dibanding tetap di " + esc(h.awal.n);
    var pertama = x.segmen.filter(function(sg){ return !sg.jeda && sg.pindahKm > 0.5; })[0];
    return '<div class="rek-item' + (i === 0 ? " top" : "") + (x.diam ? " here" : "") + '">' +
      '<div class="rek-rank">' + (i + 1) + "</div>" +
      '<div class="rek-body"><b>' + (x.diam ? "Tetap di " + esc(h.awal.n) + (x.diamPulangMalam ? " sampai " + hhmm(x.diamPindahJam != null ? x.diamPindahJam : 20) + ", lalu ke arah rumah" : "") : x.pindahN === 0 ? "Tetap di " + esc(h.awal.n) + " sampai pulang" : "Pindah " + x.pindahN + " kali (" + Math.round(x.kmPindah) + " km)") + "</b>" +
      '<span class="rek-num">\u00b1' + rp(x.net) + " <em>" + (o.stay ? "sisa hari s/d " + hhmm(o.pulang) : (opsi.rencana ? "sampai pulang" : "sisa hari s/d pulang")) + "</em></span>" +
      '<div class="rute">' + chips + "</div>" +
      "<i>\u2248" + Math.round(x.r.trips) + " order \u00b7 " + Math.round(x.r.paidKm) + " km berpenumpang \u00b7 " + (x.r.sessions ? x.r.sessions + "\u00d7 ngecas \u00b7 " : "") +
      (o.stay ? "baterai akhir \u00b1" + Math.round(Math.max(0, x.r.socAkhir)*100) : "sampai rumah \u00b1" + Math.round(Math.max(0, x.r.socTiba)*100)) + "%</i>" +
      '<span class="rek-delta ' + (x.selisih > 0 ? "up" : x.selisih < 0 ? "dn" : "") + '">' + sel + "</span>" +
      (pertama ? '<a class="linkbtn" target="_blank" rel="noopener" href="' + Rekomendasi.tautanArah(pertama.tempat.lat, pertama.tempat.lon) + '">Arahkan ke ' + esc(pertama.tempat.n) + "</a>" : "") +
      "</div></div>";
  }).join("");
  el(id + "-catatan").innerHTML = "Aturan yang dipakai: " + (o.stay ? "Ibu tidak pulang malam ini, jadi aturan jam pulang tidak dipakai" : "lewat 20:00 hanya mendekat ke rumah, keluar Jakarta sebelum 20:00") + ", bandara perlu waktu antre, paling banyak 4 kali pindah. " +
    "Tiap urutan dihitung lengkap: tarif jam &times; daerah &times; ramainya tempat, dikurangi listrik, waktu dan km pindah, ngecas, filter Jakarta, cadangan pulang. Ramainya tempat berasal dari Rute 700K, bukan pengukuran.";
  return h;
}


/* Panel masukan dilipat kalau Mulai hari sudah diisi; baris status membukanya. */
(function(){
  var d = el("masukan"), b = el("statusbar");
  if (d) d.open = !MULAI_HARI;
  if (b && d) b.addEventListener("click", function(){ d.open = !d.open; if (d.open) d.scrollIntoView({ behavior:"smooth", block:"start" }); });
})();
