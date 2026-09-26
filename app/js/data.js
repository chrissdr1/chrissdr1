/* Data dan teks tetap: tarif blok, wilayah, kalender, peta 183 kecamatan, SPKLU.
   Semua angka berasal dari Rute 700K (rute-700k.html). */
"use strict";

/* ---------------- constants from Rute 700K ---------------- */
var BASE = [
  {s:3.5,  e:5.25, r:50000, n:"Subuh",      km:24},
  {s:5.25, e:9.5,  r:45000, n:"Peak pagi",  km:22},
  {s:9.5,  e:11,   r:26000, n:"Pagi akhir", km:18},
  {s:11,   e:14,   r:24000, n:"Siang",      km:17},
  {s:14,   e:15.25,r:20000, n:"Jam mati",   km:16},
  {s:15.25,e:17,   r:30000, n:"Pra-peak",   km:19},
  {s:17,   e:20,   r:45000, n:"Peak sore",  km:22},
  {s:20,   e:21.5, r:38000, n:"Malam",      km:20},
  {s:21.5, e:23,   r:28000, n:"Larut",      km:18}
];
var SHAPE = {
  6: {"Subuh":26000,"Peak pagi":26000,"Pagi akhir":30000,"Siang":32000,"Jam mati":28000,
      "Pra-peak":34000,"Peak sore":42000,"Malam":45000,"Larut":38000},
  0: {"Subuh":26000,"Peak pagi":28000,"Pagi akhir":30000,"Siang":32000,"Jam mati":28000,
      "Pra-peak":34000,"Peak sore":44000,"Malam":40000,"Larut":26000}
};
/* Pengali hari: ASUMSI (Rute 700K hanya kualitatif: Jumat terbaik, Selasa/Rabu
   terlemah, "libur Minggu Rp100 ribu lebih mahal daripada libur Rabu" -> Minggu
   di atas Rabu). BELUM ada mekanisme yang mengkalibrasi angka ini dari catatan
   harian -- beda dengan rpkm/ins/kmkwh/tripKm/kecepatan di recalibrate()
   (engine.js), yang memang dikalibrasi. Angka di bawah tetap tetap sampai
   diubah tangan. */
var DAYMULT = {1:1.03, 2:0.95, 3:0.95, 4:0.98, 5:1.15, 6:1.02, 0:1.05};
var DAYNAME = {1:"Senin",2:"Selasa",3:"Rabu",4:"Kamis",5:"Jumat",6:"Sabtu",0:"Minggu"};
/* dead = km kosong untuk mencapai pangkalan di awal sif.
   pulang = km khas dari titik terakhir hari itu kembali ke Modernland. */
var ZONA = {
  tng:{peak:1.00, off:1.00, dead:0,    pulang:9,    kmx:1.00, need:0, label:"Tangerang"},
  mix:{peak:1.20, off:1.00, dead:7,    pulang:11,   kmx:1.12, need:1, label:"Tangerang, Jakarta saat peak"},
  jkt:{peak:1.25, off:0.80, dead:14.1, pulang:18.4, kmx:1.20, need:1, label:"Kebanyakan Jakarta"},
  apt:{peak:1.05, off:0.95, dead:18.4, pulang:23.4, kmx:1.18, need:0, label:"Bandara"}
};
/* pergi = km dari Modernland ke tempat itu (home = km balik, yang untuk Jakarta
   dan bandara lebih jauh karena tol/putaran); mnt = menit tempuh lancar dan jam
   sibuk dari tabel "Koridor kerja" Rute 700K (terukur). Tempat tanpa mnt
   memakai kecepatan kalibrasi. */
var LOK = [
  {id:"kota",    n:"Kota Tangerang / Modernland", home:0,    res:18, z:"tng", lat:-6.1973, lon:106.6362},
  {id:"stasiun", n:"Sekitar Stasiun Tangerang",   home:5.4,  res:18, z:"tng", pergi:5.4, mnt:{lancar:8, sibuk:13}, lat:-6.1768, lon:106.632},
  {id:"karawaci",n:"Karawaci",                    home:8.2,  res:19, z:"tng", pergi:8.2, mnt:{lancar:10, sibuk:16}, lat:-6.2273, lon:106.6069},
  {id:"alsut",   n:"Alam Sutera",                 home:9.1,  res:20, z:"tng", pergi:9.1, mnt:{lancar:12, sibuk:19}, lat:-6.2448, lon:106.6531},
  {id:"serpong", n:"Gading Serpong",              home:9.9,  res:20, z:"tng", pergi:9.9, mnt:{lancar:13, sibuk:21}, lat:-6.2407, lon:106.6286},
  {id:"bsd",     n:"BSD",                         home:17.1, res:23, z:"tng", pergi:16.7, mnt:{lancar:21, sibuk:34}, lat:-6.3044, lon:106.6442},
  {id:"bandara", n:"Bandara Soekarno-Hatta",      home:23.4, res:27, z:"apt", pergi:18.4, mnt:{lancar:19, sibuk:30}, lat:-6.1274, lon:106.6522},
  {id:"jakbar",  n:"Jakarta Barat",               home:18.4, res:24, z:"jkt", pergi:14.1, mnt:{lancar:16, sibuk:30}, lat:-6.189, lon:106.7347},
  {id:"cbd",     n:"Jakarta CBD",                 home:29.5, res:30, z:"jkt", pergi:26.0, mnt:{lancar:24, sibuk:46}, lat:-6.2129, lon:106.8197},
  /* wilayah luar inti — jarak balik ke Modernland terukur lewat OSRM */
  {id:"ciledug", n:"Ciledug",                      home:11.8, res:21, z:"tng", luar:1, lat:-6.2411, lon:106.7043},
  {id:"bintaro", n:"Bintaro / Pondok Aren",        home:16.1, res:23, z:"tng", luar:1, lat:-6.2742, lon:106.7001},
  {id:"cikupa",  n:"Cikupa / Tangerang barat",     home:19.9, res:25, z:"tng", luar:1, lat:-6.2181, lon:106.5172},
  {id:"jaksel",  n:"Jakarta Selatan · Blok M",     home:31.6, res:31, z:"jkt", luar:1, lat:-6.2449, lon:106.8009},
  {id:"jaktim",  n:"Jakarta Timur · Cawang",       home:35.3, res:33, z:"jkt", luar:1, jauh:1, lat:-6.2459, lon:106.8712},
  {id:"jakut",   n:"Jakarta Utara · Kelapa Gading",home:36.7, res:33, z:"jkt", luar:1, jauh:1, lat:-6.1599, lon:106.9025},
  {id:"depok",   n:"Depok",                        home:41.5, res:36, z:"jkt", luar:1, jauh:1, lat:-6.4072, lon:106.8158},
  {id:"bekasi",  n:"Bekasi",                       home:52.9, res:41, z:"jkt", luar:1, jauh:1, lat:-6.2362, lon:106.9987},
  /* diukur 15 September 2026, tingkat kawasan */
  {id:"cengkareng",n:"Cengkareng",                 home:16.2, res:23, z:"jkt", luar:1, lat:-6.15, lon:106.73},
  {id:"cisauk",  n:"Cisauk",                       home:27.7, res:29, z:"tng", luar:1, lat:-6.32, lon:106.54},
  {id:"balaraja",n:"Balaraja",                     home:34.6, res:32, z:"tng", luar:1, jauh:1, lat:-6.21, lon:106.42},
  {id:"bogor",   n:"Bogor",                        home:55.5, res:43, z:"jkt", luar:1, jauh:1, lat:-6.59, lon:106.79}
];
var LOKMAP = {}; LOK.forEach(function(l){ LOKMAP[l.id] = l; });
var PEAKS = {"Peak pagi":1,"Peak sore":1,"Subuh":1};
/* Label tampilan blok. Nama di BASE[].n adalah KUNCI data (SHAPE, TRIP_KM,
   STEP*, PEAKS, BOBOT_TEMPAT) dan tidak boleh diubah; yang tampil ke Ibu
   lewat labelBlok(n) di engine.js. */
var LABEL_BLOK = {"Subuh":"Subuh","Peak pagi":"Peak pagi","Pagi akhir":"Lewat peak pagi","Siang":"Siang","Jam mati":"Jam sepi","Pra-peak":"Jelang bubaran","Peak sore":"Peak sore","Malam":"Malam","Larut":"Malam larut"};
var SESSION_FEE = 25000, PARKIR = 15000, TARIF_KWH = 2470;
var BASE_RPKM = 2900, BASE_E = 369;
/* Panjang trip khas per blok (km berbayar per order), ASUMSI dari tabel
   "Mengarahkan orderan" Rute 700K: komuter cluster 15-30 km, kantor BSD/Alsut
   5-15, mal 3-8, stasiun 3-7, bandara 20-40, rumah sakit 3-10. Dikalibrasi
   dari catatan Ibu (km berpenumpang / trip) begitu ada 3 hari. Baseline hari
   dasar Rute 700K: 152 km berbayar / 18 trip = 8,4 km. */
var TRIP_KM = { "Subuh":18, "Peak pagi":12, "Pagi akhir":7, "Siang":6, "Jam mati":6,
                "Pra-peak":8, "Peak sore":10, "Malam":8, "Larut":10 };
/* Bobot per TEMPAT per blok jam = Rp/jam di tempat itu dibagi (tarif blok
   BASE x pengali wilayah ZONA). Tarif blok sudah menggambarkan hasil di
   POSISI YANG DISARANKAN dokumen untuk blok itu, jadi tempat yang disarankan
   bernilai ~1,0 dan yang lain di bawahnya; dari Peringkat rute Rute 700K:
   CBD sore 59.400 = 1,05 x (45.000 x 1,25); kantor BSD/Alsut sore 32.200 =
   0,75 x 45.000; sirkuit stasiun 30.500 = 0,7 x 45.000 (order padat tapi
   3-7 km); sirkuit mal siang 23.900 = 1,0 x 24.000. Yang tidak ada angkanya
   di dokumen adalah asumsi bertanda; 12 tempat luar seluruhnya asumsi.
   Terkalibrasi perlahan oleh catatan harian (CALIB.bobotTempat, dikalikan).
   Dipakai simulate() lewat bobotTempat(). Diperiksa dua pembaca dokumen. */
/* Ruas antar tempat yang TERUKUR di Rute 700K (km jalan; menit lancar bila ada).
   Kunci "a>b"; ruas tanpa arah balik dipakai dua arah. Yang bertibu ~ di
   dokumen (Jakbar-CBD, Bandara-CBD) ikut dimuat sebagai perkiraan. */
var RUAS_TERUKUR = {
  "alsut>serpong":{km:6.2, mnt:10}, "serpong>bsd":{km:11.4, mnt:14}, "bsd>alsut":{km:9.4},
  "alsut>jakbar":{km:14.6, mnt:16}, "stasiun>bandara":{km:19.0}, "bandara>stasiun":{km:22.9},
  "jakbar>cbd":{km:12, mnt:14, kira:true}, "bandara>cbd":{km:25, kira:true}
};
var BOBOT_TEMPAT = {
  kota:      {"Subuh":1, "Peak pagi":1, "Pagi akhir":1, "Siang":0.9, "Jam mati":0.9, "Pra-peak":0.8, "Peak sore":1, "Malam":1, "Larut":1},   /* cluster (Modernland) + Tangcity·Metropol · keyakinan sedang */
  stasiun:   {"Subuh":0.5, "Peak pagi":0.7, "Pagi akhir":0.7, "Siang":0.6, "Jam mati":0.7, "Pra-peak":0.8, "Peak sore":0.7, "Malam":0.5, "Larut":0.4},   /* stasiun · keyakinan tinggi */
  karawaci:  {"Subuh":0.8, "Peak pagi":1, "Pagi akhir":1, "Siang":1, "Jam mati":1.1, "Pra-peak":1, "Peak sore":0.75, "Malam":1, "Larut":0.9},   /* campuran (Supermal · Siloam RS · UPH · k · keyakinan sedang */
  alsut:     {"Subuh":0.8, "Peak pagi":1, "Pagi akhir":1, "Siang":1, "Jam mati":1, "Pra-peak":1, "Peak sore":0.75, "Malam":1.1, "Larut":1},   /* campuran (kantor Prominence·Synergy · Li · keyakinan sedang */
  serpong:   {"Subuh":0.8, "Peak pagi":0.9, "Pagi akhir":1, "Siang":1, "Jam mati":1, "Pra-peak":1, "Peak sore":0.8, "Malam":1.1, "Larut":1},   /* mal (Summarecon · ruko · Scientia · Beth · keyakinan sedang */
  bsd:       {"Subuh":0.8, "Peak pagi":0.7, "Pagi akhir":1, "Siang":1, "Jam mati":1, "Pra-peak":1, "Peak sore":0.75, "Malam":1, "Larut":1},   /* kantor (GOP · Digital Hub) + stasiun Raw · keyakinan tinggi */
  bandara:   {"Subuh":0.9, "Peak pagi":0.9, "Pagi akhir":1, "Siang":1.1, "Jam mati":0.7, "Pra-peak":1, "Peak sore":1.1, "Malam":1.4, "Larut":1},   /* bandara · keyakinan tinggi */
  jakbar:    {"Subuh":0.8, "Peak pagi":0.75, "Pagi akhir":0.9, "Siang":1, "Jam mati":0.9, "Pra-peak":0.9, "Peak sore":0.75, "Malam":0.9, "Larut":0.8},   /* campuran (kantor Kebon Jeruk·Slipi · mal · keyakinan sedang */
  cbd:       {"Subuh":0.7, "Peak pagi":1, "Pagi akhir":0.9, "Siang":0.7, "Jam mati":0.7, "Pra-peak":1.1, "Peak sore":1.05, "Malam":0.9, "Larut":0.7},   /* kantor (Sudirman · SCBD · Kuningan · Ras · keyakinan tinggi */
  ciledug:   {"Subuh":0.8, "Peak pagi":1, "Pagi akhir":0.8, "Siang":0.8, "Jam mati":0.7, "Pra-peak":0.8, "Peak sore":1, "Malam":0.8, "Larut":0.7},   /* luar (perumahan padat, tng) · keyakinan rendah */
  bintaro:   {"Subuh":0.8, "Peak pagi":1, "Pagi akhir":0.8, "Siang":0.9, "Jam mati":0.7, "Pra-peak":0.9, "Peak sore":1, "Malam":0.9, "Larut":0.7},   /* luar (perumahan + komersial, tng) · keyakinan rendah */
  cikupa:    {"Subuh":0.7, "Peak pagi":0.9, "Pagi akhir":0.7, "Siang":0.7, "Jam mati":0.6, "Pra-peak":0.7, "Peak sore":0.9, "Malam":0.7, "Larut":0.6},   /* luar (industri, tng barat) · keyakinan rendah */
  jaksel:    {"Subuh":0.7, "Peak pagi":1, "Pagi akhir":0.8, "Siang":0.8, "Jam mati":0.7, "Pra-peak":1, "Peak sore":1.1, "Malam":0.9, "Larut":0.8},   /* luar (campuran kantor·komersial Blok M,  · keyakinan rendah */
  jaktim:    {"Subuh":0.7, "Peak pagi":0.9, "Pagi akhir":0.8, "Siang":0.8, "Jam mati":0.7, "Pra-peak":0.9, "Peak sore":0.9, "Malam":0.8, "Larut":0.7},   /* luar (simpul transit Cawang, jkt, jauh) · keyakinan rendah */
  jakut:     {"Subuh":0.7, "Peak pagi":0.9, "Pagi akhir":0.8, "Siang":0.9, "Jam mati":0.7, "Pra-peak":0.9, "Peak sore":0.9, "Malam":0.9, "Larut":0.7},   /* luar (mal Kelapa Gading, jkt, jauh) · keyakinan rendah */
  depok:     {"Subuh":0.7, "Peak pagi":0.9, "Pagi akhir":0.8, "Siang":0.8, "Jam mati":0.7, "Pra-peak":0.8, "Peak sore":0.9, "Malam":0.8, "Larut":0.7},   /* luar (perumahan·kampus, jkt, jauh) · keyakinan rendah */
  bekasi:    {"Subuh":0.7, "Peak pagi":0.9, "Pagi akhir":0.8, "Siang":0.8, "Jam mati":0.7, "Pra-peak":0.8, "Peak sore":0.9, "Malam":0.8, "Larut":0.7},   /* luar (perumahan·industri, jkt, jauh) · keyakinan rendah */
  cengkareng:{"Subuh":0.8, "Peak pagi":0.9, "Pagi akhir":0.8, "Siang":0.8, "Jam mati":0.8, "Pra-peak":0.9, "Peak sore":0.9, "Malam":0.9, "Larut":0.8},   /* luar (perumahan padat dekat bandara, jkt · keyakinan rendah */
  cisauk:    {"Subuh":0.7, "Peak pagi":0.9, "Pagi akhir":0.7, "Siang":0.7, "Jam mati":0.6, "Pra-peak":0.7, "Peak sore":0.9, "Malam":0.7, "Larut":0.6},   /* luar (stasiun Cisauk·Intermoda, tng sela · keyakinan rendah */
  balaraja:  {"Subuh":0.6, "Peak pagi":0.8, "Pagi akhir":0.7, "Siang":0.7, "Jam mati":0.6, "Pra-peak":0.7, "Peak sore":0.8, "Malam":0.7, "Larut":0.6},   /* luar (industri, tng barat jauh) · keyakinan rendah */
  bogor:     {"Subuh":0.7, "Peak pagi":0.8, "Pagi akhir":0.8, "Siang":0.8, "Jam mati":0.7, "Pra-peak":0.8, "Peak sore":0.8, "Malam":0.8, "Larut":0.7},   /* luar (kota satelit, jkt, jauh) · keyakinan rendah */
};

var TRIP_ZONA = { tng:1.0, mix:1.15, jkt:1.5, apt:1.8 };
var BASE_TRIP_KM = 8.4;
var TARGET_DAY = 515000, TARGET_MONTH = 13400000;

/* ---------------- Indonesian red-letter days ----------------
   SKB 3 Menteri 2026: 17 libur nasional + 8 cuti bersama.
   2027 SKB not published — only the fixed-date certainties. */
var HOLI = {
  "2026-01-01":["Tahun Baru Masehi","L"], "2026-01-16":["Isra Mikraj","L"],
  "2026-02-16":["Cuti bersama Imlek","C"], "2026-02-17":["Tahun Baru Imlek","L"],
  "2026-03-18":["Cuti bersama Nyepi","C"], "2026-03-19":["Hari Suci Nyepi","L"],
  "2026-03-20":["Cuti bersama Idulfitri","C"], "2026-03-21":["Idulfitri 1447 H","L"],
  "2026-03-22":["Idulfitri 1447 H","L"], "2026-03-23":["Cuti bersama Idulfitri","C"],
  "2026-03-24":["Cuti bersama Idulfitri","C"], "2026-04-03":["Wafat Yesus Kristus","L"],
  "2026-04-05":["Hari Paskah","L"], "2026-05-01":["Hari Buruh","L"],
  "2026-05-14":["Kenaikan Yesus Kristus","L"], "2026-05-15":["Cuti bersama Kenaikan","C"],
  "2026-05-27":["Iduladha 1447 H","L"], "2026-05-28":["Cuti bersama Iduladha","C"],
  "2026-05-31":["Waisak 2570","L"], "2026-06-01":["Hari Lahir Pancasila","L"],
  "2026-06-16":["Tahun Baru Islam 1448 H","L"],
  "2026-08-17":["Hari Kemerdekaan RI","L"], "2026-08-25":["Maulid Nabi Muhammad SAW","L"],
  "2026-12-24":["Cuti bersama Natal","C"], "2026-12-25":["Hari Raya Natal","L"],
  "2027-01-01":["Tahun Baru Masehi","L"], "2027-08-17":["Hari Kemerdekaan RI","L"],
  "2027-12-25":["Hari Raya Natal","L"]
};
/* Acara besar di sekitar wilayah kerja. Ditanam di sini karena halaman
   tidak mengambil data sendiri. Terakhir diperbarui 9 September 2026 —
   tambah barisnya di sini lalu naikkan EVENTS_SAMPAI. z: "lokal" = ICE BSD / Tangerang,
   "jkt" = Jakarta, butuh strategi Jakarta dan pulang larut. */
var EVENTS = {
  "2026-10-16":["Synchronize Festival","Gambir Expo Kemayoran","jkt"],
  "2026-10-17":["Synchronize Festival · BABYMONSTER","Kemayoran · Indonesia Arena","jkt"],
  "2026-10-18":["Synchronize Festival","Gambir Expo Kemayoran","jkt"],
  "2026-10-23":["The Rose","The Kasablanka","jkt"],
  "2026-10-24":["Kanye West","GBK Senayan","jkt"],
  "2026-10-29":["LANY","Indonesia Arena","jkt"],
  "2026-10-30":["LANY · Ungu","Indonesia Arena · Tennis Indoor","jkt"],
  "2026-10-31":["Comifuro 23","ICE BSD City","lokal"],
  "2026-11-01":["Comifuro 23","ICE BSD City","lokal"],
  "2026-11-21":["Guns N' Roses","GBK Madya","jkt"],
  "2026-11-22":["My Chemical Romance","JIS Jakarta Utara","jkt"],
  "2026-11-27":["Simple Plan","Tennis Indoor Senayan","jkt"],
  "2026-12-26":["BTS World Tour","GBK Senayan","jkt"],
  "2026-12-27":["BTS World Tour","GBK Senayan","jkt"]
};
/* Prakiraan cuaca ditanam di sini dengan mengubah baris CUACA lalu
   menerbitkan ulang aplikasi. Halaman sengaja tidak mengambil prakiraan
   sendiri, jadi inilah satu-satunya jalurnya.

   KOMENTAR INI DULU BERBOHONG. Tertulis "ditanam agen pagi yang menerbitkan
   ulang halaman ini tiap 04:30 WIB" -- dan tidak ada agen seperti itu. Tidak
   ada tugas terjadwal yang menjalankannya; baris di bawah ditanam manual
   sekali lalu berhenti. Komentar yang menjanjikan otomatisasi yang tidak ada
   membuat orang berikutnya (termasuk saya sendiri) percaya fiturnya hidup,
   dan tidak memeriksanya. Sekarang: penanamannya MANUAL, dan kalau tanggal
   di bawah bukan hari ini, kotak cuaca mengatakannya sendiri. Bentuknya:
   {tanggal:"YYYY-MM-DD", hujan:true, jam:"15:00-18:00", ringkas:"...", sumber:"BMKG"} */
var CUACA = {tanggal:"2026-09-23", hujan:true, jam:"12:00-17:00", ringkas:"Hujan ringan siang-sore di sebagian Tangsel; Kota Tangerang cerah berawan", sumber:"BMKG"};

/* ---------------- versi aplikasi ----------------
   Sebagai aplikasi terpasang, versi baru diambil sendiri oleh service
   worker saat dibuka dengan internet. Yang tetap perlu dikatakan halaman:
   sampai kapan tiap kalendernya terisi. Perbarui TERBIT tiap kali
   menerbitkan (samakan dengan VERSION di sw.js; tes memeriksanya). */
var TERBIT = "2026-09-26";
var EVENTS_SAMPAI = "2026-12-27";
var HOLI_SAMPAI = "2026-12-25";


/* ---------------- steps ---------------- */
var STEP = {
  "Subuh":{b:"Antar penerbangan pertama",s:"Dari komplek &rarr; Bandara",
    i:"Hampir tanpa saingan, order panjang.",
    k:"Penumpang pesawat pertama dijemput 03:00&ndash;04:30, dan ordernya mengalir langsung ke peak pagi."},
  "Peak pagi":{b:"Jemput orang berangkat kerja",s:"Dalam komplek &rarr; Jakarta / Bandara",
    i:"Tunggu di dalam komplek, terima hampir semua order.",
    k:"Order dari dalam komplek pagi-pagi: jarak jemput hampir nol, tujuannya jauh (Jakarta atau bandara). Di jalan raya depannya Ibu bersaing dengan semua orang."},
  /* Stasiun sengaja DIKELUARKAN dari blok ini. Jadwal resmi KRL: di Stasiun
     Tangerang keretanya 12 per jam sampai 09:00, lalu 8 pada 10:00 dan 6
     dari 11:00 -- tepat separuh, persis di jam yang disarankan langkah ini.
     Menyuruh Ibu menunggu di stasiun saat stasiunnya mengosong. */
  "Pagi akhir":{b:"Jam murah &mdash; dekat rumah saja",s:"Tangcity &middot; Siloam Lippo Village &middot; <b>bukan stasiun</b>",
    i:"Jangan kejar order jauh; sarapan dulu, stasiun sudah sepi.",
    k:"Tarif turun tajam lewat 09:30. Jadwal KRL Stasiun Tangerang: 12 kereta per jam sampai 09:00, lalu 8 pada 10:00 dan 6 dari 11:00 &mdash; tinggal separuh."},
  "Siang":{b:"Muter mal&ndash;kantor&ndash;RS",s:"Living World &rarr; Summarecon &rarr; AEON &rarr; Karawaci",
    i:"Order pendek jangan ditolak &mdash; buat insentif.",
    k:"Putar searah supaya tidak bolak-balik kosong. Order pendek siang hari yang mengisi hitungan order untuk insentif."},
  "Jam mati":{b:"Jam sepi &mdash; istirahat",s:"Pulang sebentar atau ngecas sebentar",
    i:"Maksa narik cuma buang baterai.",
    k:"14:00&ndash;15:15 hasilnya paling kecil sehari. Baterai yang dihabiskan di sini lebih berguna untuk peak sore."},
  "Pra-peak":{b:"Siap-siap sebelum bubaran",s:"Green Office Park BSD &middot; Digital Hub &middot; Prominence &amp; Synergy Alam Sutera &middot; Lippo Village",
    i:"Di lobi gedung 20&ndash;30 menit sebelum orang keluar.",
    k:"Mau ke Jakarta? Berangkat sekarang lewat Tol Kunciran&ndash;Serpong, paling telat 15:30 &mdash; lewat itu jalan keluar kota padat dan sampainya kesorean."},
  "Peak sore":{b:"Jemput orang pulang kantor",s:"GOP BSD &middot; Prominence Alam Sutera &middot; Lippo Village &rarr; lalu Stasiun Rawa Buntu &amp; Stasiun Tangerang",
    i:"Setelah 18:30 tolak order ke Cawang, Kelapa Gading, Bekasi, Depok.",
    k:"Dua gelombang: karyawan pulang 17:00&ndash;19:00, lalu penumpang KRL turun 16:00&ndash;20:00. Order ke timur lewat 18:30 pulangnya 35&ndash;53 km kosong."},
  "Malam":{b:"Mal tutup dan kuliner",s:"Summarecon Serpong &middot; AEON &amp; The Breeze BSD &middot; Supermal Karawaci &middot; Tangcity &rarr; lalu Flavor Bliss &amp; Scientia Square",
    i:"Di pintu parkir 15 menit sebelum mal tutup (21:00); bandara 19:00&ndash;22:00 searah pulang.",
    k:"Datang sebelum antrean mobil terbentuk, bukan sesudahnya. Kedatangan bandara 19:00&ndash;22:00 ordernya panjang dan arahnya sama dengan pulang."},
  "Larut":{b:"Sudah malam &mdash; pulang",s:"Hanya order ke arah barat",
    i:"Order jarang, dan besok pagi jadi capek.",
    k:"Tarifnya naik, tapi ordernya jarang; jam ini memakan peak pagi besok yang jauh lebih besar."},
  "Istirahat":{b:"Istirahat di rumah",s:"Pulang, makan, tidur sebentar",
    i:"Jam sepi; istirahat bikin sore lebih kuat.",
    k:"Jam-jam ini hasilnya paling kecil. Sengaja dikosongkan supaya peak sore dijalani segar."}
};
/* Varian teks per wilayah — supaya urutan langkah ikut berubah menurut
   posisi, bukan cuma menurut jam. */
/* Daftar kata yang boleh Ibu pindai di kartu order untuk menilai
   "searah pulang" tanpa membuka peta. */
var KATA_BARAT = "Kembangan &middot; Puri &middot; Kedoya &middot; Cengkareng &middot; Kalideres &middot; Batuceper &middot; " +
                 "Ciledug &middot; Karawaci &middot; Tangerang &middot; Serpong &middot; BSD &middot; Bintaro";

var STEP_JKT = {
  "Subuh":{b:"Antar penerbangan pertama dari Jakarta",s:"Jakarta Barat &rarr; Bandara",
    i:"Order jarang jam ini; ambil apa pun ke arah bandara atau barat.",
    k:"Sepi di jalan. Penumpang pesawat pertama sama berharganya dijemput dari sisi Jakarta maupun dari Tangerang."},
  "Peak pagi":{b:"Narik di Jakarta Barat&ndash;Sudirman",s:"Puri Indah &rarr; Kebon Jeruk (Jl. Panjang) &rarr; Slipi (Jl. S. Parman) &rarr; Sudirman",
    i:"Tarif tertinggi; mobil listrik bebas ganjil-genap di Sudirman, Rasuna Said, Kuningan.",
    k:"Saat pesaing berpelat ganjil/genap tersaring, koridor Sudirman, Rasuna Said, dan Mega Kuningan terbuka untuk Ibu."},
  "Pagi akhir":{b:"Pasang filter, pulang bawa penumpang",s:"Filter tujuan &rarr; Modernland &middot; Tol Jakarta&ndash;Merak",
    i:"Ngecas nanti di Supermal Karawaci atau Auto2000 Kunciran.",
    k:"Ibu tidak punya SPKLU langganan di Jakarta, dan tarif Jakarta lewat 09:30 sudah turun. Filter tujuan membuat perjalanan pulang tetap dibayar."},
  "Siang":{b:"Jakarta sepi &mdash; geser ke barat",s:"Tol Jakarta&ndash;Merak arah Merak, atau Jl. Daan Mogot lewat Kalideres",
    i:"Jalan pulang sambil online; makin dekat Tangerang makin banyak order.",
    k:"Siang di Jakarta lebih sepi daripada di Tangerang. Dua koridor itu yang paling sering memberi order searah pulang."},
  "Jam mati":{b:"Jangan menunggu di Jakarta",s:"Keluar tol di Kebon Jeruk atau Kembangan &rarr; Karawaci",
    i:"Jam paling sepi, jauh dari SPKLU langganan &mdash; jalan pulang sambil online.",
    k:"Bergerak pulang sekalian menyiapkan posisi untuk peak sore di Tangerang."},
  "Pra-peak":{b:"Siap-siap di lobi kantor",s:"SCBD &middot; Mega Kuningan &middot; Rasuna Said &mdash; atau Puri Indah &middot; Central Park",
    i:"Tahan sampai peak sore lebih untung, asal pulangnya bawa penumpang.",
    k:"Berdiri di lobi gedung, bukan di jalan raya. Pulang sekarang berarti 18&ndash;30 km kosong; tiga jam lagi order ke arah Tangerang ramai."},
  "Peak sore":{b:"Antar orang pulang ke Tangerang",s:"SCBD / Kuningan / Slipi &rarr; Tol Jakarta&ndash;Merak arah Tangerang",
    i:"Setelah 18:30 tolak order ke Cawang, Kelapa Gading, Bekasi, Depok &mdash; pulangnya 35&ndash;53 km kosong.",
    k:"Jam terbesar hari ini, dan tiap order ke barat membawa Ibu mendekat ke rumah."},
  "Malam":{b:"Ambil order ke arah rumah saja",s:"Tujuan: "+KATA_BARAT,
    i:"Kalau tujuannya bukan salah satu itu, lewati &mdash; kecuali tarifnya besar sekali.",
    k:"Lihat nama tujuan di kartu order sebelum menerima; tidak perlu buka peta."},
  "Larut":{b:"Sudah malam &mdash; ambil order ke arah rumah saja",s:"Tujuan: "+KATA_BARAT,
    i:"Order jarang, dan besok pagi jadi capek kalau menunggu di Jakarta.",
    k:"Sama seperti Malam: pilih tujuan ke barat saja, atau lewati kalau tidak sepadan dengan besok pagi."}
};
/* Mode campuran: berangkat DARI RUMAH, peak pagi menuju Jakarta,
   lalu sengaja berangkat lagi ke Jakarta sebelum peak sore. */
var STEP_MIX = {
  "Peak pagi":{b:"Jemput orang berangkat ke Jakarta",s:"Dalam komplek Modernland &rarr; Tol Jakarta&ndash;Merak &rarr; Jakarta Barat / CBD",
    i:"Tunggu di dalam komplek; kalau terbawa ke Jakarta, narik di sana sampai 09:00 lalu pulang pakai filter.",
    k:"Order pagi dari dalam komplek: jarak jemput hampir nol, tujuannya Jakarta. Setelah 09:00 tarif Jakarta turun; filter tujuan membuat pulangnya tetap dibayar."},
  "Pra-peak":{b:"Berangkat ke Jakarta sekarang",s:"Tol Kunciran&ndash;Serpong &rarr; JORR &rarr; Jakarta Barat / CBD &middot; <b>batas berangkat 15:30</b>",
    i:"Sore di Jakarta lebih tinggi, asal sampai sebelum 15:30 &mdash; lewat itu, narik sore di Tangerang saja.",
    k:"Inilah langkah yang menentukan pola ini. Lewat 15:30 jalan keluar kota memadat, tibanya kesorean, dan peak sore Jakarta sudah lewat."},
  "Peak sore":{b:"Antar orang pulang ke Tangerang",s:"SCBD &middot; Kuningan &middot; Slipi &rarr; Tol Jakarta&ndash;Merak arah Tangerang",
    i:"Setelah 18:30 tolak order ke Cawang, Kelapa Gading, Bekasi, Depok.",
    k:"Jam terbesar hari ini, dan tiap order ke barat membawa Ibu mendekat ke rumah. Order ke timur lewat 18:30 pulangnya 35&ndash;53 km kosong."}
};

var STEP_APT = {
  "Subuh":{b:"Antar penerbangan pertama",s:"Komplek Modernland &rarr; Terminal 1/2/3 &middot; Tol Sedyatmo",
    i:"Penumpang pesawat 05:00&ndash;06:00 dijemput 03:00&ndash;04:30, hampir tanpa saingan."},
  "Peak pagi":{b:"Antar orang ke bandara",s:"Komplek &rarr; Bandara &middot; antre kalau &le; 45 menit",
    i:"Antre lebih dari 45 menit? Keluar lewat Batu Ceper sambil online.",
    k:"Penerbangan 07:00&ndash;09:00. Pulang kosong dari bandara berarti 23 km hangus; keluar lewat Batu Ceper atau Poris sambil online masih bisa dapat order."},
  "Pagi akhir":{b:"Antrean mulai memendek",s:"Pool bandara &middot; atau Batu Ceper / Poris",
    i:"Antrean masih panjang? Keluar, ambil order dari Batu Ceper atau Poris.",
    k:"Keberangkatan pagi sudah lewat, jadi antrean di pool mulai bergerak."},
  "Siang":{b:"Antrean paling pendek hari ini",s:"Pool bandara",
    i:"Kalau mau coba antre di pool, sekarang waktunya."},
  "Jam mati":{b:"Istirahat &mdash; jangan antre sekarang",s:"Batu Ceper &middot; ngecas sebentar &middot; istirahat",
    i:"Antrean tidak jalan; pastikan baterai cukup untuk malam + pulang.",
    k:"Kedatangan sedang jarang. Gelombang besar berikutnya sore dan malam."},
  "Pra-peak":{b:"Masuk pool sebelum sore",s:"Pool bandara &middot; atau Batu Ceper",
    i:"Kedatangan mulai ramai; masuk sekarang supaya tidak kelamaan antre."},
  "Peak sore":{b:"Antar orang dari bandara",s:"Terminal kedatangan &rarr; Tangerang / Jakarta",
    i:"Order dari bandara pasti panjang; pilih yang ke arah Tangerang.",
    k:"Tidak ada orang tiba di bandara lalu memesan 3 km. Tujuan Tangerang searah pulang."},
  "Malam":{b:"Kedatangan malam",s:"Terminal kedatangan 19:00&ndash;22:00 &middot; searah pulang",
    i:"Ramai paling besar hari ini, rumah cuma 23 km &mdash; order penutup terbaik."}
};

/* Pulang dari luar wilayah itu bertahap dan ADA UJUNGNYA — sasarannya
   berubah tiap tahap, dan setelah sampai, kerja kembali normal. */
function pulangStep(sisaKm, dariNama){
  if (sisaKm > 32) return {b:"Pulang tahap 1: keluar Jakarta",
    s:"Ke <b>Ulujami</b> atau <b>Pondok Aren</b> lewat JORR arah barat",
    i:"Ambil order ke: "+KATA_BARAT+".",
    k:"Dari "+dariNama+" belum ada gunanya menunggu order bagus. Kosong 10 menit? Jalan sendiri lewat JORR sambil online &mdash; makin ke barat, makin banyak order yang searah."};
  if (sisaKm > 14) return {b:"Pulang tahap 2: masuk Tangsel",
    s:"<b>Bintaro</b> &rarr; <b>Pondok Aren</b> &rarr; <b>Serpong</b> &rarr; <b>Alam Sutera</b>",
    i:"Sudah setengah jalan; order pendek yang searah boleh diambil.",
    k:"Tidak perlu lagi menunggu order jauh; yang penting tiap order menggeser Ibu ke barat."};
  return {b:"Sudah dekat rumah",
    s:"<b>Alam Sutera</b> atau <b>Kota Tangerang</b> &middot; Jl. Raya Serpong",
    i:"Mulai jam berikutnya narik normal lagi.",
    k:"Ibu sudah kembali ke daerah biasa; tidak perlu lagi memilih hanya order ke arah barat."};
}
var OFFPAGI = {b:"Belum ramai &mdash; santai dulu",s:"Dekat rumah saja, jangan muter",
  i:"Tidak ada peak pagi; ramai baru menjelang siang.",
  k:"Hari libur tidak punya arus berangkat kerja. Muter cari order sekarang cuma km kosong; ngecas dulu kalau perlu, serius mulai jam 10."};
var EVEPETANG = {b:"Kejar orang keluar kota",s:"Bandara &middot; Batu Ceper &middot; Terminal Poris",
  i:"Besok libur: penumpang berkoper, tujuan jauh.",
  k:"Malam sebelum tanggal merah salah satu malam terkuat dalam sebulan. Tiga tempat itu lebih ramai daripada muter mal biasa."};

var RUMAH = { lat:-6.1973, lon:106.6362 };

/* ---------------- peta jarak pulang ----------------
   183 kecamatan Jabodetabek. Untuk tiap pusat kecamatan, jarak dan waktu
   JALAN kembali ke Modernland diukur lewat OSRM pada 15 September 2026 —
   arah pulang diukur terpisah dari arah pergi karena rutenya tidak sama.
   Batas kecamatan: OpenStreetMap (Jakarta) dan GADM 4.1 (Bodetabek).
   Isi: [nama, induk, bujur, lintang, km pulang, menit pulang, zona, sifat]
   sifat: k kantor · i industri · t transit · b belanja · m kampus · a bandara */
var INDUK = ["Jakarta Pusat", "Jakarta Utara", "Jakarta Barat", "Jakarta Selatan", "Jakarta Timur", "Kota Bogor", "Kab. Bogor", "Kota Depok", "Kota Tangerang", "Kab. Tangerang", "Tangerang Selatan", "Kota Bekasi", "Kab. Bekasi"];
var KEC = [
  ["Tangerang",8,106.6446,-6.1891,2.2,4,"tng",""],
  ["Pinang",8,106.6686,-6.2113,4.8,7,"tng","k"],
  ["Cibodas",8,106.6089,-6.207,5.9,8,"tng",""],
  ["Karawaci",8,106.6176,-6.1838,5.9,7,"tng",""],
  ["Cipondoh",8,106.6789,-6.1853,7.7,9,"tng",""],
  ["Batuceper",8,106.6738,-6.1679,8.7,11,"tng",""],
  ["Periuk",8,106.5921,-6.1726,10.0,12,"tng",""],
  ["Neglasari",8,106.6288,-6.1334,10.2,12,"tng",""],
  ["Jatiuwung",8,106.5733,-6.1962,10.4,11,"tng","i"],
  ["Kelapa Dua",9,106.6073,-6.2409,10.5,14,"tng","m"],
  ["Serpong Utara",10,106.6698,-6.257,11.3,15,"tng",""],
  ["Ciledug",8,106.7006,-6.2388,12.0,17,"tng",""],
  ["Karang Tengah",8,106.7068,-6.211,12.3,14,"tng",""],
  ["Larangan",8,106.7334,-6.2378,13.9,17,"tng",""],
  ["Pasar Kemis",9,106.5569,-6.1619,14.1,16,"tng",""],
  ["Cengkareng",2,106.7316,-6.1549,14.3,12,"jkt","tm"],
  ["Kalideres",2,106.7049,-6.1351,14.4,15,"jkt",""],
  ["Pondok Aren",10,106.7145,-6.268,15.7,21,"tng","kb"],
  ["Sepatan",9,106.582,-6.1217,15.9,17,"tng",""],
  ["Curug",9,106.5656,-6.2382,16.1,15,"tng",""],
  ["Kembangan",2,106.7433,-6.1942,16.2,18,"jkt","b"],
  ["Sepatan Timur",9,106.6105,-6.1178,16.2,22,"tng",""],
  ["Pagedangan",9,106.6136,-6.3008,16.9,20,"tng","b"],
  ["Benda",8,106.6758,-6.1268,16.9,17,"apt","ta"],
  ["Kosambi",9,106.6758,-6.0818,18.6,23,"tng",""],
  ["Serpong",10,106.6834,-6.316,19.6,21,"tng","b"],
  ["Teluknaga",9,106.6587,-6.0567,19.9,24,"tng",""],
  ["Cikupa",9,106.5086,-6.2191,20.2,17,"tng","i"],
  ["Pesanggrahan",3,106.7595,-6.2532,21.0,24,"jkt",""],
  ["Sindang Jaya",9,106.4835,-6.1653,21.2,29,"tng",""],
  ["Kebon Jeruk",2,106.7673,-6.1932,21.9,19,"jkt","m"],
  ["Grogol Petamburan",2,106.7857,-6.1637,22.2,19,"jkt","bm"],
  ["Kebayoran Lama",3,106.7788,-6.25,22.3,25,"jkt","kbm"],
  ["Cisauk",9,106.6275,-6.3364,22.5,25,"tng","k"],
  ["Pakuhaji",9,106.6108,-6.0665,23.0,28,"tng",""],
  ["Setu",10,106.6807,-6.3452,23.2,24,"tng",""],
  ["Rajeg",9,106.5091,-6.1191,23.3,26,"tng",""],
  ["Ciputat",10,106.725,-6.309,23.7,25,"tng",""],
  ["Legok",9,106.5593,-6.3043,24.0,24,"apt","a"],
  ["Sukadiri",9,106.5564,-6.0666,24.2,28,"tng",""],
  ["Panongan",9,106.5157,-6.2748,24.3,23,"tng",""],
  ["Kebayoran Baru",3,106.801,-6.2481,24.7,27,"jkt","tbm"],
  ["Ciputat Timur",10,106.759,-6.2976,24.8,26,"tng","m"],
  ["Mauk",9,106.5284,-6.057,25.1,25,"tng",""],
  ["Palmerah",2,106.7961,-6.1938,25.2,21,"jkt","k"],
  ["Gambir",0,106.8196,-6.1715,25.4,22,"jkt","kt"],
  ["Cilandak",3,106.7921,-6.2892,25.8,28,"jkt","t"],
  ["Tambora",2,106.8054,-6.1479,26.1,22,"jkt",""],
  ["Parung Panjang",6,106.5572,-6.3627,26.7,30,"jkt",""],
  ["Tigaraksa",9,106.4746,-6.2576,26.7,27,"tng",""],
  ["Tanah Abang",0,106.8092,-6.2041,26.8,22,"jkt","ktb"],
  ["Pamulang",10,106.7399,-6.3356,27.2,28,"apt","a"],
  ["Sawah Besar",0,106.8334,-6.1579,27.8,25,"jkt","tb"],
  ["Taman Sari",2,106.8176,-6.1469,28.0,24,"jkt","tb"],
  ["Balaraja",9,106.4424,-6.2022,28.9,26,"tng",""],
  ["Menteng",0,106.8396,-6.1957,29.6,26,"jkt","tbm"],
  ["Pasar Minggu",3,106.8332,-6.2881,29.6,31,"jkt","km"],
  ["Penjaringan",1,106.772,-6.1123,29.6,26,"jkt","b"],
  ["Limo",7,106.7743,-6.367,29.6,30,"jkt",""],
  ["Senen",0,106.8437,-6.183,29.8,26,"jkt","m"],
  ["Cinere",7,106.7873,-6.3345,30.6,32,"jkt",""],
  ["Gunung Sindur",6,106.7006,-6.3907,30.8,33,"jkt",""],
  ["Jambe",9,106.5081,-6.3227,31.1,33,"tng",""],
  ["Kemayoran",0,106.8548,-6.1613,31.3,28,"jkt","b"],
  ["Setiabudi",3,106.831,-6.2204,31.4,28,"jkt","ktbm"],
  ["Johar Baru",0,106.8545,-6.1815,31.8,29,"jkt",""],
  ["Sukamulya",9,106.4434,-6.1579,32.0,29,"tng",""],
  ["Cempaka Putih",0,106.8677,-6.1827,32.3,31,"jkt","t"],
  ["Jagakarsa",3,106.8259,-6.3303,32.4,33,"jkt","tm"],
  ["Mampang Prapatan",3,106.8206,-6.2523,32.5,27,"jkt",""],
  ["Sawangan",7,106.7673,-6.3937,32.9,34,"jkt",""],
  ["Pademangan",1,106.8566,-6.1212,33.3,27,"jkt","ktb"],
  ["Matraman",4,106.8604,-6.2042,33.6,30,"jkt",""],
  ["Pancoran",3,106.8453,-6.2565,33.8,27,"jkt","kt"],
  ["Bojongsari",7,106.7344,-6.3985,34.5,35,"jkt",""],
  ["Kemiri",9,106.4626,-6.0976,34.7,36,"tng",""],
  ["Tebet",3,106.8544,-6.2265,35.2,29,"jkt","tm"],
  ["Kresek",9,106.4017,-6.1477,35.7,33,"tng",""],
  ["Parung",6,106.7132,-6.4366,36.0,36,"jkt",""],
  ["Pancoran Mas",7,106.7981,-6.3975,36.0,35,"jkt","b"],
  ["Pulogadung",4,106.8884,-6.1911,36.1,32,"jkt","tm"],
  ["Tanjung Priok",1,106.8714,-6.1341,36.2,32,"jkt",""],
  ["Kelapa Gading",1,106.9039,-6.1596,36.8,34,"jkt","ktb"],
  ["Jayanti",9,106.3938,-6.2084,36.8,31,"tng",""],
  ["Cisoka",9,106.4104,-6.2592,37.2,35,"tng",""],
  ["Rumpin",6,106.6296,-6.461,38.3,46,"jkt",""],
  ["Jatinegara",4,106.8728,-6.2266,38.8,31,"jkt","m"],
  ["Ciseeng",6,106.6817,-6.4622,38.8,43,"jkt",""],
  ["Tenjo",6,106.4802,-6.3823,39.0,61,"jkt",""],
  ["Sukma Jaya",7,106.8406,-6.395,39.0,38,"jkt",""],
  ["Kramat Jati",4,106.8636,-6.2781,39.4,33,"jkt","m"],
  ["Koja",1,106.9075,-6.1246,41.1,36,"jkt",""],
  ["Cakung",4,106.9463,-6.1835,41.4,37,"jkt","it"],
  ["Kronjo",9,106.428,-6.0828,41.5,38,"tng",""],
  ["Solear",9,106.4243,-6.3045,41.6,40,"tng",""],
  ["Cimanggis",7,106.8669,-6.3643,42.4,39,"jkt",""],
  ["Gunung Kaler",9,106.3716,-6.094,43.4,45,"tng",""],
  ["Duren Sawit",4,106.9199,-6.2344,43.5,36,"jkt","b"],
  ["Tajur Halang",6,106.7577,-6.473,43.5,41,"jkt",""],
  ["Pondokgede",11,106.9305,-6.2672,43.9,38,"jkt",""],
  ["Kemang",6,106.7348,-6.5015,44.0,44,"jkt",""],
  ["Mekarbaru",9,106.3882,-6.0631,44.2,47,"tng",""],
  ["Cilodong",7,106.8323,-6.437,44.4,45,"jkt",""],
  ["Cipayung",7,106.8049,-6.4315,44.4,43,"jkt",""],
  ["Beji",7,106.8243,-6.3721,44.7,51,"jkt",""],
  ["Pasar Rebo",4,106.8565,-6.3224,45.6,36,"jkt",""],
  ["Cilincing",1,106.9393,-6.1299,46.0,38,"jkt","i"],
  ["Makasar",4,106.8958,-6.2689,46.1,43,"apt","a"],
  ["Jasinga",6,106.4563,-6.4682,46.7,58,"jkt",""],
  ["Tapos",7,106.8902,-6.4219,46.7,44,"jkt",""],
  ["Medan Satria",11,106.9843,-6.2065,47.2,43,"jkt",""],
  ["Pondokmelati",11,106.9239,-6.3099,47.2,38,"jkt",""],
  ["Ciracas",4,106.8765,-6.3328,47.4,37,"jkt",""],
  ["Bojong Gede",6,106.7892,-6.4808,47.7,46,"jkt",""],
  ["Cipayung",4,106.9073,-6.3235,48.1,40,"jkt","t"],
  ["Ranca Bungur",6,106.7122,-6.5219,48.5,53,"jkt",""],
  ["Bekasi Utara",11,107.008,-6.2085,48.7,44,"jkt",""],
  ["Bekasi Barat",11,106.964,-6.2308,48.8,41,"jkt",""],
  ["Jatisampurna",11,106.9272,-6.3672,49.2,47,"jkt",""],
  ["Gunung Putri",6,106.9328,-6.3919,50.3,50,"jkt","i"],
  ["Bekasi Selatan",11,106.9785,-6.2624,51.7,42,"jkt","b"],
  ["Tarumajaya",12,107.0075,-6.1153,52.0,43,"jkt",""],
  ["Tanah Sereal",5,106.7861,-6.5461,52.6,51,"jkt",""],
  ["Jatiasih",11,106.9571,-6.3102,53.3,44,"jkt",""],
  ["Rawalumbu",11,106.9883,-6.2814,53.3,43,"jkt",""],
  ["Bekasi Timur",11,107.0169,-6.2385,53.9,45,"jkt","b"],
  ["Bogor Barat",5,106.7667,-6.576,54.0,51,"jkt",""],
  ["Tambun Utara",12,107.057,-6.2047,55.2,54,"jkt",""],
  ["Cibinong",6,106.8315,-6.4865,55.2,49,"jkt","kb"],
  ["Babelan",12,107.0356,-6.1182,56.0,48,"jkt",""],
  ["Bogor Utara",5,106.8169,-6.5684,56.3,53,"jkt",""],
  ["Dramaga",6,106.7316,-6.5826,57.5,54,"jkt",""],
  ["Bogor Tengah",5,106.7959,-6.5949,58.8,54,"jkt",""],
  ["Mustikajaya",11,107.0196,-6.3068,59.0,48,"jkt",""],
  ["Ciomas",6,106.7623,-6.6109,59.2,56,"jkt",""],
  ["Tambun Selatan",12,107.0567,-6.2532,59.6,47,"jkt",""],
  ["Bantargebang",11,106.9883,-6.3425,60.4,52,"jkt",""],
  ["Cileungsi",6,107.0074,-6.4095,60.6,54,"jkt",""],
  ["Setu",12,107.0433,-6.3661,62.7,58,"jkt",""],
  ["Bogor Timur",5,106.8284,-6.6225,62.7,59,"jkt",""],
  ["Kelapa Nunggal",6,106.9589,-6.4761,62.8,69,"jkt",""],
  ["Ciampea",6,106.6991,-6.5754,63.4,61,"jkt",""],
  ["Bogor Selatan",5,106.8059,-6.6406,63.4,62,"jkt",""],
  ["Citeureup",6,106.8917,-6.5208,63.5,67,"jkt",""],
  ["Sukawangi",12,107.0846,-6.1185,63.7,57,"jkt",""],
  ["Tamansari",6,106.7489,-6.6496,64.1,63,"jkt",""],
  ["Sukaraja",6,106.844,-6.5736,64.3,69,"jkt",""],
  ["Cikarang Barat",12,107.0983,-6.3018,64.4,53,"jkt","i"],
  ["Cibitung",12,107.0924,-6.2516,64.5,52,"jkt",""],
  ["Leuwisadeng",6,106.5832,-6.5746,65.7,68,"jkt",""],
  ["Babakan Madang",6,106.886,-6.5714,67.3,60,"jkt",""],
  ["Cigudeg",6,106.5489,-6.5003,68.3,83,"jkt",""],
  ["Tenjolaya",6,106.7059,-6.6396,69.0,64,"jkt",""],
  ["Cijeruk",6,106.7939,-6.6813,69.4,71,"jkt",""],
  ["Cikarang Selatan",12,107.1213,-6.3358,72.3,57,"jkt","i"],
  ["Cikarang Utara",12,107.1469,-6.2804,72.3,60,"jkt","i"],
  ["Pamijahan",6,106.649,-6.6805,72.3,80,"jkt",""],
  ["Sukajaya",6,106.4784,-6.6261,72.8,76,"jkt",""],
  ["Ciawi",6,106.8792,-6.6961,72.9,71,"jkt",""],
  ["Cibungbulang",6,106.6621,-6.5779,73.0,66,"jkt",""],
  ["Nanggung",6,106.5376,-6.6522,73.8,75,"jkt",""],
  ["Cibarusah",12,107.1072,-6.4322,74.4,71,"jkt",""],
  ["Jonggol",6,107.0548,-6.4933,74.7,70,"jkt",""],
  ["Cikarang Pusat",12,107.1858,-6.3556,75.8,60,"jkt",""],
  ["Leuwiliang",6,106.6199,-6.6156,75.8,76,"jkt",""],
  ["Tambelang",12,107.1281,-6.175,76.2,63,"jkt",""],
  ["Cabangbungin",12,107.1422,-6.0706,76.5,67,"jkt",""],
  ["Sukatani",12,107.1565,-6.2061,76.8,65,"jkt",""],
  ["Sukamakmur",6,107.0142,-6.5772,76.9,74,"jkt",""],
  ["Karangbahagia",12,107.1997,-6.2278,78.1,67,"jkt",""],
  ["Muara Gembong",12,107.0506,-6.0099,78.5,88,"jkt",""],
  ["Caringin",6,106.8543,-6.7324,78.6,81,"jkt",""],
  ["Serang Baru",12,107.1046,-6.3947,78.9,63,"jkt",""],
  ["Cigombong",6,106.8232,-6.7473,79.0,74,"jkt",""],
  ["Megamendung",6,106.9075,-6.664,81.0,70,"jkt",""],
  ["Cariu",6,107.1329,-6.5126,82.5,76,"jkt",""],
  ["Cikarang Timur",12,107.2216,-6.2919,82.6,69,"jkt",""],
  ["Kedungwaringin",12,107.2468,-6.2558,83.1,68,"jkt",""],
  ["Sukakarya",12,107.1752,-6.1455,84.0,70,"jkt",""],
  ["Cisarua",6,106.9486,-6.6954,86.4,73,"jkt",""],
  ["Bojongmangu",12,107.1793,-6.4379,87.9,78,"jkt",""],
  ["Pebayuran",12,107.2667,-6.1592,90.9,86,"jkt",""],
  ["Tanjungsari",6,107.1314,-6.6236,97.5,94,"jkt",""]
];

/* Jari-jari tiap kecamatan: jarak lurus dari pusatnya ke sudut poligon
   TERJAUH, urutannya sama persis dengan KEC. Dipakai HANYA untuk cadangan
   baterai, tidak untuk tampilan.

   Alasannya: pusat kecamatan itu SATU titik, tapi Ibu bisa berdiri di mana
   saja di dalamnya. Teluknaga pusatnya 19,9 km dari rumah, tapi titik uji
   acak di dalam wilayah yang sama terukur 35,0 km -- 15 km lebih jauh.
   Dulu jalur "ketik nama daerah" menyajikan angka pusat itu tanpa margin
   sama sekali, karena ditandai terukur:true. Memang terukur -- tapi terukur
   di pusatnya, bukan di tempat Ibu berdiri. Dari 183 kecamatan, 36 di
   antaranya meremehkan lebih dari 3 km, terburuk Jasinga 22,3 km.

   Sekarang cadangan memakai pusat + 1,35 x jari-jari (1,35 = faktor kelokan
   jalan yang sama dengan hampiranPulang). Peremehan >3 km turun 36 -> 4,
   terburuk 22,3 -> 8,6 km, dengan ongkos sekitar 3 poin baterai. */
var RKEC = [
  3.7,4.5,3.2,3.4,4.2,3.4,3.6,4.3,3.6,4.1,4.7,2.7,2.9,2.1,4.9,5.1,4.8,4.7,4.5,4.6,4.4,4.0,
  6.9,5.4,5.8,4.8,6.5,5.8,4.1,6.0,4.0,2.4,4.9,5.7,7.7,4.5,6.5,5.1,5.6,5.3,5.8,3.4,4.7,5.3,
  2.5,2.6,3.4,2.0,8.0,9.0,3.2,4.5,2.7,2.1,5.8,2.3,3.8,6.8,3.0,2.2,3.3,6.5,4.8,3.0,2.3,1.3,
  4.4,2.2,5.2,2.8,5.5,6.0,2.1,2.8,4.9,6.8,2.7,5.1,5.5,4.1,3.1,3.6,3.3,4.4,5.5,12.1,3.0,
  6.3,8.9,3.7,3.9,2.5,6.0,6.8,6.1,5.3,5.2,3.9,4.3,3.5,6.1,5.4,5.4,2.8,3.5,3.9,5.2,3.9,
  10.1,5.4,4.1,3.3,5.1,5.5,5.5,4.2,4.2,3.1,4.6,10.9,3.8,7.5,4.2,5.3,3.9,3.1,5.7,6.6,6.1,
  9.8,4.2,6.2,2.6,4.4,4.3,6.8,4.5,7.9,6.9,4.2,8.5,6.3,6.1,6.7,6.8,7.5,10.3,7.8,7.8,4.5,
  12.6,11.9,9.0,6.8,6.7,6.7,9.9,12.2,10.6,6.9,13.5,6.7,10.5,6.8,14.6,5.6,7.0,7.4,11.8,6.5,
  11.0,9.8,8.8,10.9,9.3,9.9,7.0,4.5,8.7,8.5,7.1,10.8,10.9
];

/* Titik uji lepas: satu titik acak di dalam tiap poligon kecamatan, urutan
   sama dengan KEC, isinya [bujur, lintang, km pulang terukur]. Diukur lewat
   OSRM 15 September 2026, dan dibuat SESUDAH parameter hampiranPulang
   dikunci -- jadi ini bahan uji, bukan bahan setelan.

   Ditanam di halaman supaya aturan ke-11 bisa membandingkan angka yang
   dihitung halaman dengan angka yang benar-benar diukur. Sepuluh aturan
   lainnya hanya memeriksa urutan langkah, dan semuanya lolos mulus waktu
   anchor bandara masih membuat Batuceper meleset +60%. */
var UJI = [
  [106.6409,-6.1863,3.25],[106.6664,-6.2146,4.63],[106.6274,-6.2233,6.94],
  [106.6262,-6.1589,7.43],[106.6661,-6.1947,5.58],[106.6601,-6.1547,7.56],
  [106.5716,-6.1766,11.38],[106.6174,-6.1349,10.63],[106.5760,-6.2006,9.89],
  [106.6167,-6.2414,10.54],[106.6754,-6.2714,13.27],[106.7163,-6.2372,12.93],
  [106.7066,-6.2248,10.55],[106.7354,-6.2413,15.26],[106.5439,-6.1431,17.77],
  [106.7516,-6.1360,19.33],[106.7056,-6.1673,17.68],[106.6959,-6.2520,13.47],
  [106.5739,-6.1148,16.76],[106.5849,-6.2421,13.61],[106.7610,-6.1972,19.08],
  [106.6093,-6.1260,14.41],[106.6438,-6.2621,11.74],[106.6889,-6.1234,13.32],
  [106.7151,-6.0912,21.18],[106.6926,-6.3060,18.72],[106.7082,-6.0362,34.96],
  [106.5098,-6.2191,20.30],[106.7637,-6.2693,20.76],[106.4914,-6.1843,27.28],
  [106.7701,-6.2070,24.27],[106.7969,-6.1737,23.67],[106.7653,-6.2384,19.15],
  [106.6482,-6.3343,22.16],[106.6101,-6.0900,19.84],[106.6726,-6.3425,21.69],
  [106.4641,-6.1372,28.59],[106.7196,-6.2905,20.02],[106.5487,-6.3180,24.20],
  [106.5549,-6.0405,31.39],[106.5206,-6.2613,21.91],[106.7950,-6.2377,23.03],
  [106.7690,-6.3085,26.10],[106.5402,-6.0356,32.53],[106.7867,-6.2001,25.53],
  [106.8230,-6.1655,25.85],[106.7972,-6.2945,25.09],[106.8032,-6.1521,24.09],
  [106.5576,-6.3873,29.10],[106.4890,-6.2622,25.96],[106.8165,-6.2146,29.31],
  [106.7258,-6.3586,28.74],[106.8379,-6.1718,28.08],[106.8222,-6.1469,28.47],
  [106.4341,-6.2247,30.79],[106.8296,-6.2009,30.50],[106.8107,-6.2888,27.93],
  [106.7331,-6.1140,24.22],[106.7922,-6.3823,33.54],[106.8445,-6.1775,29.36],
  [106.7899,-6.3259,29.95],[106.6734,-6.3817,28.68],[106.5076,-6.3397,33.22],
  [106.8522,-6.1740,29.72],[106.8322,-6.2106,30.75],[106.8479,-6.1766,29.86],
  [106.4142,-6.1677,34.58],[106.8669,-6.1835,32.42],[106.8136,-6.3509,36.29],
  [106.8249,-6.2603,33.21],[106.7606,-6.4206,36.47],[106.8440,-6.1425,30.64],
  [106.8594,-6.2108,32.74],[106.8428,-6.2522,34.41],[106.7345,-6.4143,33.72],
  [106.4632,-6.0637,33.44],[106.8613,-6.2331,37.32],[106.4319,-6.1259,37.00],
  [106.7144,-6.4451,37.57],[106.8174,-6.3914,36.25],[106.8890,-6.2053,37.30],
  [106.8780,-6.1231,35.21],[106.8985,-6.1560,36.88],[106.3927,-6.2060,36.93],
  [106.3886,-6.2456,42.05],[106.6748,-6.5222,48.36],[106.8882,-6.2158,41.08],
  [106.6894,-6.4425,35.34],[106.4323,-6.3728,41.17],[106.8382,-6.4212,42.39],
  [106.8636,-6.2439,34.48],[106.9118,-6.1353,40.03],[106.9556,-6.1622,45.31],
  [106.4511,-6.0509,38.05],[106.3916,-6.2808,43.39],[106.8842,-6.3829,42.08],
  [106.3558,-6.0975,45.71],[106.9326,-6.2472,45.43],[106.7393,-6.4573,38.35],
  [106.9440,-6.2545,44.84],[106.7454,-6.5164,45.26],[106.4021,-6.0905,42.41],
  [106.8512,-6.4315,46.46],[106.8113,-6.4373,44.42],[106.8020,-6.3820,36.45],
  [106.8541,-6.3166,44.81],[106.9394,-6.1116,48.28],[106.8818,-6.2622,39.84],
  [106.4498,-6.5498,68.97],[106.8987,-6.4100,45.92],[106.9739,-6.2012,45.37],
  [106.9395,-6.3244,50.99],[106.8702,-6.3281,46.46],[106.7704,-6.4976,45.20],
  [106.9179,-6.3205,48.01],[106.7324,-6.5266,50.53],[107.0251,-6.2215,52.65],
  [106.9669,-6.2216,49.92],[106.9339,-6.3523,52.62],[106.9707,-6.3281,56.26],
  [106.9771,-6.2773,53.08],[107.0229,-6.1188,55.28],[106.7932,-6.5658,53.16],
  [106.9628,-6.2908,51.90],[106.9808,-6.2929,55.81],[107.0228,-6.2559,53.93],
  [106.7364,-6.5585,57.44],[107.0858,-6.1857,69.58],[106.8364,-6.4813,52.64],
  [107.0392,-6.0883,66.95],[106.8048,-6.5786,56.55],[106.7215,-6.6078,62.40],
  [106.8074,-6.5916,57.73],[107.0235,-6.3084,59.81],[106.7553,-6.5804,55.21],
  [107.0744,-6.2443,62.18],[106.9878,-6.3399,59.80],[106.9984,-6.4384,65.34],
  [107.0519,-6.3899,66.88],[106.8145,-6.6083,61.19],[106.9458,-6.4917,61.16],
  [106.7039,-6.5889,64.46],[106.7950,-6.6094,58.32],[106.9020,-6.4963,57.08],
  [107.1330,-6.1388,78.09],[106.7415,-6.6425,63.42],[106.7971,-6.5241,52.41],
  [107.1028,-6.2696,64.74],[107.0969,-6.1989,72.19],[106.5945,-6.5934,71.82],
  [106.8461,-6.5161,58.16],[106.5313,-6.5186,66.47],[106.7311,-6.7057,74.78],
  [106.8140,-6.6658,71.14],[107.0814,-6.3498,70.81],[107.1455,-6.2719,70.20],
  [106.6718,-6.6737,68.25],[106.5008,-6.5967,67.97],[106.8893,-6.6960,73.90],
  [106.6757,-6.5326,52.31],[106.5245,-6.6535,75.82],[107.0820,-6.4352,71.68],
  [107.0928,-6.4787,76.64],[107.2137,-6.3348,81.71],[106.6249,-6.5815,71.06],
  [107.1456,-6.1357,79.36],[107.1562,-6.0885,76.85],[107.1379,-6.2110,76.37],
  [107.0416,-6.5262,79.14],[107.2307,-6.2199,85.22],[107.0575,-6.0428,74.86],
  [106.8543,-6.7625,81.03],[107.1167,-6.3933,80.28],[106.8118,-6.7629,81.96],
  [106.9135,-6.7063,77.01],[107.1891,-6.5673,94.48],[107.2350,-6.2756,80.87],
  [107.2663,-6.2457,87.52],[107.1624,-6.1361,76.63],[106.9321,-6.6762,83.92],
  [107.1611,-6.4198,87.35],[107.2350,-6.1826,88.21],[107.1137,-6.6468,100.08]
];

/* Bandara TIDAK dimasukkan ke daftar anchor, dan ini hasil percobaan yang
   gagal dulu: jalan ke terminal 23,4 km sedangkan pusat kecamatan Benda cuma
   16,9 km, jadi mula-mula bandara saya tambahkan sebagai anchor supaya
   angkanya benar. Akibatnya tetangganya ikut terseret naik -- Batuceper yang
   sebenarnya 7,6 km jadi ditebak 12,1 km (+60%), Benda +34%, Neglasari +23%.

   Setelah diukur melingkar, hukumannya ternyata sangat sempit: 23,4 km tepat
   di terminal, tapi sudah turun ke median 13,7 km hanya 2 km dari situ.
   Jadi bandara ditangani sebagai titik terukur biasa dengan radius 2 km
   (lihat deteksiLokasi), bukan sebagai anchor. Membuang anchor itu menurunkan
   kesalahan terburuk pada uji lepas dari 60,3% ke 33,7%. */
var ANCHOR = KEC;

/* ---------------- SPKLU ----------------
   Titik pengisian dari OpenStreetMap, disaring dan diurutkan dari yang
   terdekat ke rumah. Halaman ini selama ini menyuruh Ibu ngecas tanpa
   pernah menyebut di mana.

   SATU BATAS YANG PENTING: jenis colokan dan dayanya TIDAK tercatat di
   sumber mana pun yang terbuka. Jadi daftar ini menjawab 'di mana',
   bukan 'apakah cocok untuk Atto 1'. Itu harus dicek sekali di aplikasi
   PLN Mobile atau BYD, lalu dicatat di sini.

   NAMA YANG DIPAKAI ULANG SUDAH DIBEDAKAN. Dulu "BYD" menamai tiga titik
   yang terpisah sampai 34,9 km, "Cilandak" dua, "Gambir" dua -- dan halaman
   cuma menampilkan namanya. Akibatnya 145 dari 183 kecamatan punya nama
   ambigu di daftarnya, dan 74 di antaranya menampilkan DUA BARIS BERTULISAN
   SAMA PERSIS, misalnya Kebayoran Lama: "Cilandak 6,3km | Cilandak 8,3km".
   Yang membacanya adalah Ibu saat dayanya kritis.

   Pembedanya: kecamatan tempat titik itu berada, ditentukan lewat uji
   titik-dalam-poligon pada batas yang sama dengan KEC -- bukan pusat
   terdekat. Untuk dua pasang yang kebetulan berada di kecamatan yang sama
   (Cilandak dan Gambir), pembedanya arah mata angin relatif satu sama lain.

   Isi: [nama, bujur, lintang] */
var SPKLU = [
  ["PLN TANGCITY",106.6342,-6.1933],
  ["PLN UID BANTEN",106.6427,-6.1842],
  ["Carzo",106.6538,-6.2209],
  ["HVT KM 14 A TANGERANG",106.6786,-6.2142],
  ["HVT REST AREA KM 13.5 TANGERANG",106.683,-6.2137],
  ["PLN AEROPOLIS",106.6314,-6.1441],
  ["BYD Pagedangan",106.637,-6.2811],
  ["E-CHAS TERMINAL 3 BANDARA SOETTA",106.6714,-6.1169],
  ["MYPERTAMINA BANDARA SOETTA",106.6807,-6.1142],
  ["Serpong",106.707,-6.347],
  ["Cilandak barat daya",106.7781,-6.2996],
  ["Cilandak timur laut",106.8002,-6.2775],
  ["BPPT",106.8218,-6.1843],
  ["Gambir barat",106.8247,-6.1819],
  ["BYD Setiabudi",106.8269,-6.2358],
  ["Gambir timur",106.8328,-6.1803],
  ["BYD Arista Samanhudi",106.8305,-6.1623],
  ["Shell Recharge Soepomo-1",106.8467,-6.231],
  ["BYD Cilincing",106.9294,-6.1645]
];

/* Tiga SPKLU terdekat dari tiap kecamatan, diukur lewat RUTE JALAN (OSRM),
   urutannya sama persis dengan KEC. Isi tiap baris: [nomor SPKLU, km jalan].

   Sempat dihitung garis lurus, dan itu keliru bukan cuma pada angkanya --
   ia memilih SPKLU yang BERBEDA di 54 dari 183 kecamatan. Cengkareng:
   garis lurus menunjuk MyPertamina Bandara 7,2 km, jalannya justru HVT Rest
   Area KM 13,5 sejauh 11,1 km. Gambir: garis lurus menunjuk SPKLU Gambir
   1,3 km, jalannya BYD Arista Samanhudi 3,2 km. Salah urutan 30% -- dan
   yang membacanya adalah Ibu saat dayanya kritis. */
var SPD = [[[1,1.9],[0,3.6],[3,6.5]],[[2,3.4],[3,4.8],[1,7.5]],[[0,5.8],[1,6.3],[2,9.3]],
  [[1,5.0],[0,5.8],[5,6.5]],[[1,5.7],[0,7.3],[4,7.8]],[[1,6.6],[0,8.6],[5,9.4]],
  [[1,8.6],[5,8.7],[0,9.3]],[[5,1.8],[1,8.0],[0,8.7]],[[0,10.3],[1,10.8],[5,12.4]],
  [[2,10.1],[0,10.4],[3,10.9]],[[2,7.1],[6,8.3],[3,9.9]],[[4,9.0],[2,11.5],[3,12.0]],
  [[4,4.3],[2,9.1],[3,10.3]],[[4,9.9],[10,13.4],[3,13.9]],[[0,14.0],[1,14.5],[5,16.1]],
  [[4,11.1],[1,12.1],[8,13.9]],[[8,8.7],[7,11.1],[1,12.2]],[[4,12.7],[2,13.5],[10,14.1]],
  [[5,10.9],[1,12.7],[0,13.4]],[[6,14.4],[0,16.0],[2,16.3]],[[4,9.4],[16,13.2],[12,13.2]],
  [[5,7.9],[8,13.4],[1,14.1]],[[6,5.7],[2,14.5],[9,16.5]],[[8,3.3],[7,6.1],[5,11.8]],
  [[8,7.1],[5,10.3],[7,14.9]],[[9,6.4],[6,9.9],[2,14.6]],[[5,11.5],[8,14.1],[1,17.7]],
  [[0,20.1],[2,20.5],[1,20.6]],[[10,7.6],[11,9.8],[14,12.9]],[[0,21.1],[1,21.6],[5,23.2]],
  [[16,9.5],[12,9.5],[13,10.4]],[[16,8.1],[12,8.1],[13,9.0]],[[11,6.3],[10,8.3],[14,8.8]],
  [[6,8.2],[9,10.5],[2,17.4]],[[5,14.7],[8,17.3],[1,20.9]],[[9,3.5],[6,12.4],[2,18.2]],
  [[5,17.7],[1,19.6],[0,20.3]],[[9,6.6],[10,12.0],[11,14.2]],[[6,13.5],[9,23.1],[0,23.9]],
  [[5,19.2],[1,21.0],[0,21.7]],[[6,19.3],[0,24.2],[2,24.5]],[[11,4.1],[14,5.3],[17,7.9]],
  [[10,6.8],[11,9.0],[9,10.7]],[[5,20.1],[1,21.9],[0,22.7]],[[12,7.7],[16,7.8],[13,8.6]],
  [[16,3.2],[12,3.2],[13,3.3]],[[11,2.7],[10,4.6],[14,11.7]],[[16,5.6],[12,6.3],[13,7.2]],
  [[6,18.0],[9,26.2],[2,26.4]],[[0,26.6],[2,26.9],[1,27.1]],[[14,5.6],[12,5.8],[13,6.6]],
  [[9,4.5],[10,11.5],[11,13.7]],[[16,1.6],[15,4.4],[13,5.7]],[[16,4.2],[13,5.3],[15,5.4]],
  [[2,27.6],[3,28.4],[0,28.8]],[[15,2.9],[13,3.5],[12,4.2]],[[11,5.6],[14,7.5],[17,8.3]],
  [[16,14.3],[12,15.6],[13,16.4]],[[10,8.2],[9,13.5],[11,13.9]],
  [[15,3.0],[13,3.6],[16,4.3]],[[10,4.7],[11,8.8],[9,11.6]],[[9,9.9],[6,20.0],[10,22.7]],
  [[6,25.9],[0,31.0],[2,31.3]],[[16,4.6],[15,5.2],[13,5.9]],[[14,3.6],[17,4.3],[12,5.7]],
  [[15,5.0],[13,5.6],[16,6.3]],[[2,31.4],[0,31.9],[3,32.1]],[[15,6.3],[16,7.0],[13,7.1]],
  [[11,11.0],[10,11.1],[14,12.2]],[[14,3.1],[11,5.3],[17,6.3]],
  [[10,11.5],[11,16.7],[9,17.0]],[[16,9.3],[15,10.3],[13,12.3]],
  [[15,6.9],[17,7.4],[13,7.5]],[[17,3.3],[14,4.4],[11,8.1]],[[9,10.9],[10,16.2],[11,21.9]],
  [[5,29.7],[1,31.6],[0,32.3]],[[17,1.4],[14,5.8],[15,7.9]],[[2,35.1],[0,35.6],[3,35.8]],
  [[9,15.4],[10,20.0],[11,25.6]],[[11,16.5],[10,18.3],[9,19.2]],
  [[18,8.7],[15,9.4],[13,10.0]],[[16,8.6],[18,10.6],[15,10.8]],
  [[18,8.1],[15,10.8],[16,11.4]],[[2,35.6],[3,36.3],[0,36.7]],[[2,35.9],[3,36.6],[0,37.1]],
  [[6,24.0],[9,26.1],[10,32.3]],[[17,4.2],[14,9.3],[15,11.2]],[[9,19.8],[10,26.0],[6,27.9]],
  [[6,30.3],[9,38.4],[2,38.6]],[[10,18.5],[11,19.6],[17,21.0]],
  [[17,9.0],[14,10.0],[15,14.5]],[[18,7.3],[15,13.8],[16,14.4]],
  [[18,5.1],[15,15.4],[16,16.0]],[[5,33.7],[8,37.8],[2,40.9]],[[2,40.3],[3,41.1],[0,41.5]],
  [[11,19.4],[10,19.6],[17,20.8]],[[2,42.8],[0,43.3],[3,43.6]],
  [[18,10.0],[17,10.5],[14,14.0]],[[9,22.9],[10,27.5],[11,33.1]],
  [[17,13.5],[14,14.5],[18,18.3]],[[9,23.4],[10,28.0],[11,33.6]],
  [[5,39.2],[1,41.0],[0,41.7]],[[10,23.9],[11,25.0],[9,28.3]],
  [[11,22.2],[9,23.2],[10,24.0]],[[11,20.9],[10,21.1],[17,21.1]],
  [[11,13.8],[10,14.0],[17,15.2]],[[18,8.1],[16,22.0],[15,22.9]],
  [[17,15.6],[14,16.7],[11,19.1]],[[6,38.0],[2,46.4],[0,46.6]],
  [[17,26.6],[11,27.3],[14,27.6]],[[18,11.0],[17,20.0],[15,21.2]],
  [[17,16.8],[14,17.8],[11,18.2]],[[11,15.5],[10,15.7],[17,16.9]],
  [[11,26.9],[9,27.1],[10,28.7]],[[17,17.6],[11,18.0],[10,18.2]],
  [[9,27.9],[10,32.5],[11,38.1]],[[18,12.6],[15,22.7],[16,23.4]],
  [[18,12.1],[17,14.4],[14,19.4]],[[17,23.8],[14,24.8],[11,24.9]],
  [[17,30.0],[11,30.9],[14,31.0]],[[18,17.9],[17,21.3],[14,22.3]],
  [[18,18.5],[16,28.0],[15,28.9]],[[9,32.0],[10,36.6],[17,40.8]],
  [[18,20.5],[17,22.9],[14,23.9]],[[18,19.4],[17,22.9],[14,23.9]],
  [[18,17.5],[17,23.5],[14,24.5]],[[9,33.4],[10,38.1],[11,43.7]],
  [[18,19.1],[15,29.2],[16,29.9]],[[11,30.6],[9,31.5],[10,32.4]],
  [[18,22.5],[16,32.0],[15,32.9]],[[9,35.7],[10,40.3],[11,46.5]],
  [[9,36.9],[10,41.5],[11,47.2]],[[9,38.2],[10,42.8],[11,48.9]],
  [[18,26.4],[17,28.5],[14,29.5]],[[9,38.6],[10,43.2],[11,48.8]],
  [[18,23.1],[17,29.2],[14,30.2]],[[18,27.5],[17,30.0],[14,31.0]],
  [[18,38.1],[17,40.3],[11,41.1]],[[18,35.0],[17,38.3],[14,39.3]],
  [[9,42.1],[11,49.8],[17,50.0]],[[11,43.4],[10,44.0],[18,44.9]],
  [[9,42.8],[6,43.0],[10,47.4]],[[9,42.8],[10,47.4],[11,53.0]],
  [[11,44.1],[10,44.6],[17,45.8]],[[18,29.9],[16,39.6],[15,40.6]],
  [[9,43.5],[10,48.1],[11,53.8]],[[9,43.7],[11,49.5],[10,50.1]],
  [[18,31.9],[17,34.0],[14,35.0]],[[18,28.0],[17,34.1],[14,35.1]],
  [[6,46.2],[9,48.5],[10,58.3]],[[9,44.9],[11,47.9],[10,48.4]],[[6,59.6],[9,60.4],[2,67.9]],
  [[9,48.4],[10,53.0],[11,58.7]],[[9,48.8],[10,53.4],[11,59.0]],
  [[18,39.8],[17,41.8],[14,42.9]],[[18,35.9],[17,41.9],[14,42.9]],
  [[6,59.4],[9,60.5],[10,65.1]],[[6,64.0],[9,64.8],[2,72.4]],[[9,52.3],[11,60.2],[17,60.4]],
  [[6,44.4],[9,48.8],[10,53.4]],[[6,65.1],[9,65.9],[2,73.5]],
  [[18,51.9],[17,54.1],[11,55.0]],[[18,52.2],[17,54.4],[11,55.3]],
  [[18,43.3],[17,45.3],[14,46.4]],[[6,47.2],[9,47.5],[10,57.3]],
  [[18,39.1],[15,41.2],[16,41.8]],[[18,42.7],[16,52.5],[15,53.4]],
  [[18,41.7],[17,46.4],[14,47.4]],[[11,57.5],[10,58.0],[17,59.2]],
  [[18,41.6],[17,47.7],[14,48.7]],[[18,44.8],[16,54.5],[15,55.5]],
  [[9,58.0],[11,65.7],[17,65.9]],[[18,46.4],[17,48.4],[14,49.5]],
  [[9,58.4],[11,65.8],[17,66.0]],[[9,57.3],[11,61.5],[17,61.8]],
  [[18,60.0],[17,62.2],[11,63.1]],[[18,46.1],[17,52.2],[14,53.2]],
  [[18,46.6],[17,52.6],[14,53.7]],[[18,47.5],[17,53.5],[14,54.5]],
  [[9,62.7],[11,66.9],[17,67.2]],[[18,55.4],[17,57.5],[14,58.5]],
  [[18,54.4],[17,60.4],[14,61.5]],[[18,75.0],[17,77.2],[11,78.1]]
];

/* Untuk 21 tempat yang punya koordinat persis, jarak SPKLU diukur dari
   TITIK ITU SENDIRI, bukan dari pusat kecamatannya. Bedanya besar di
   tempat yang paling sering dipakai: dari rumah, PLN TangCity 0,5 km
   garis lurus, 3,6 km dari pusat kecamatan, dan 4,5 km dari rumahnya
   sendiri. Yang dipakai yang terakhir. */
var SPLOK = {
  "kota":[[1,3.6],[0,4.5],[3,6.2]],"stasiun":[[1,4.0],[5,4.1],[0,4.7]],
  "karawaci":[[2,8.4],[0,8.7],[3,9.2]],"alsut":[[2,3.9],[3,6.7],[6,9.3]],
  "serpong":[[6,7.3],[0,8.7],[1,8.9]],"bsd":[[6,3.8],[9,11.4],[2,12.0]],
  "bandara":[[7,8.7],[8,10.2],[5,18.7]],"jakbar":[[4,8.1],[16,12.8],[12,12.8]],
  "cbd":[[12,4.0],[13,5.1],[15,5.2]],"ciledug":[[4,8.8],[2,11.6],[3,11.8]],
  "bintaro":[[9,11.8],[2,11.9],[6,12.4]],"cikupa":[[2,19.4],[0,19.8],[3,20.1]],
  "jaksel":[[14,5.1],[11,5.8],[17,7.6]],"jaktim":[[17,4.9],[14,5.9],[15,10.3]],
  "jakut":[[18,5.1],[15,10.7],[16,11.4]],"depok":[[11,19.8],[10,21.6],[9,22.5]],
  "bekasi":[[18,14.3],[17,19.0],[14,23.5]],"cengkareng":[[4,11.5],[1,14.0],[16,15.1]],
  "cisauk":[[6,17.1],[9,25.3],[0,27.6]],"balaraja":[[2,33.4],[3,34.1],[0,34.5]],
  "bogor":[[9,34.9],[10,39.5],[11,45.2]]
};

/* ---------------- watak wilayah ----------------
   Untuk 77 dari 183 kecamatan (Jakarta dan Tangerang saja, itu yang datanya
   lengkap): jenis tempat apa yang ADA di sana, jadi Ibu tahu jam berapa
   wilayah itu melahirkan order. Urutannya sama persis dengan KEC.

   h hunian - a apartemen - t hotel - i industri - s pasar
   k kantor - b belanja - r transit

   Dua hal yang sengaja TIDAK dipakai, keduanya karena diuji dan gagal:

   SEKOLAH dibuang. Ia 48% dari seluruh titik yang terkumpul -- bukan karena
   paling menentukan permintaan, tapi karena jenis itu yang paling rajin
   dipetakan di OSM Indonesia. Kalau ikut dihitung ia menenggelamkan sisanya:
   Pulogadung jadi "sekolah 79%" padahal itu kawasan industri terbesar di
   Jakarta, dan Cilincing "sekolah 71%" padahal punya 29 lahan industri.

   JUMLAH MENTAH dibuang, dipakai rasionya. Kerapatan pemetaan berbeda enam
   kali lipat antara Kota Tangerang (2,4 titik/km2) dan Jakarta Pusat (17,6),
   jadi membandingkan jumlah antarwilayah menyesatkan.

   INI STRUKTUR, BUKAN PERMINTAAN TERUKUR. Yang diketahui: apa yang ada di
   sana. Jam-jamnya penalaran dari jenis tempatnya, bukan hasil pengamatan --
   sama statusnya dengan pengali hari, dan harus dianggap begitu. */
var WATAK = ["h","kh","h","","h","ih","","ait","i","h","h","h","h","","ih","har","sh",
  "khb","h","h","hab","h","hb","tr","hi","hb","h","ih","hs","h","ah","atb","kab","kh","",
  "h","h","h","h","","h","tab","h","","kt","kt","har","st","","ih","kta","h","tbr","tbr",
  "i","tbr","kha","ahb","","t","","","h","htb","kta","","","at","hr","ta","","kah","t",
  "kar","","","atr","","","","sir","h","kha","","h","","a","","","","s","s","ihr","","h",
  "","","hsa","","","","","","","","i","ih","r","","","","","i","","h","","","","","","",
  "","","","","","","","","","","","","","","","","","","","","","","","","","","","","",
  "","","","","","","","","","","","","","","","","","","","","","","","","","","","","",
  "","","",""
];

/* ---------------- lembah tengah hari di stasiun ----------------
   Untuk 44 kecamatan yang punya stasiun KRL berjadwal: berapa bagian kereta
   yang tersisa tengah hari (10:00-15:00) dibanding jam puncaknya. Urutannya
   sama persis dengan KEC. 0 berarti tidak ada stasiun berjadwal.

   Dari jadwal resmi commuterline.id, 109 stasiun. Tiga hal SENGAJA dibuang
   karena diuji dan ternyata kosong:

   JUMLAH KERETA -- murni topologi jalur. Setiap stasiun di jalur Bogor persis
   336 kereta, jalur Tangerang persis 120, Merak persis 14. Angka itu cuma
   menghitung berapa jalur lewat, bukan seberapa ramai tempatnya.

   JAM PUNCAK -- puncaknya tidak nyata. Ketajaman (puncak dibagi median jam
   aktif) medianya cuma 1,21x, dan cuma 5 dari 47 yang di atas 1,5x. Di
   Stasiun Tangerang pola per jamnya 10-12-12-12-12 lalu 8-6-6-6-6 lalu
   10-12-12-12-12: "puncak jam 6" itu sekadar yang pertama dari lima jam
   yang nilainya sama. Menyebutkan satu jam sebagai puncak akan mengarang
   ketepatan yang tidak ada di datanya.

   ARAH CONDONG -- 44 dari 47 seimbang. KRL melayani pergi dan pulang hampir
   simetris, jadi tidak ada yang bisa disimpulkan.

   Yang TERSISA dan nyata: dalamnya lembah tengah hari, dan ia berbeda antar
   jalur. Jalur Duri-Tangerang turun ke SEPARUH (Tangerang 0,50, Batuceper
   0,50, Cipondoh 0,55); jalur Serpong cuma ke 0,71-0,75. Itu perbedaan yang
   bisa ditindaklanjuti: di stasiun dekat rumah, tengah hari benar-benar mati.

   Peringatan yang tetap berlaku: ini menghitung KERETA, bukan penumpang.
   Kereta jam 07:00 jauh lebih penuh daripada kereta jam 11:00 dan jadwal
   tidak tahu itu. Jadi arah perubahannya bisa dipercaya, besarannya jangan
   dianggap sebanding lurus dengan jumlah orang. */
var KRLL = [0.5,0,0,0,0.55,0.5,0,0,0,0,0,0,0,0,0,0.5,0.5,0,0,0,0,0,0.75,0,0,0.75,0,0,0,0,
  0,0.5,0.75,0.71,0,0,0,0.75,0,0,0,0,0.75,0,0,0,0,0.79,0,0,0.78,0,0.77,0.73,0,0.83,0.67,0,
  0,0.6,0,0,0.67,0.57,0,0,0,0.57,0.73,0,0,0.93,0.91,0.7,0,0,0.74,0,0,0.67,0,0,0,0,0,0,
  0.93,0,0.58,0,0,0,0.89,0,0.86,0,0,0.84,0,0,0,0,0,0,0.77,0,0,0,0,0,0.95,0,0,0.62,0,0,
  0.93,0,0,0,0,0,0,0,0,0.67,0,0,0,0,0,0,0.55,0,0,0.8,0,0,0,0,0,0,0,0,0,0,0.62,0.8,0.89,0,
  0,0,0,0,0,0.67,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0
];

var WATAK_ARTI = {
  h:["Hunian","Pagi, tunggu <b>di dalam komplek</b> &mdash; jemput dekat, tujuan jauh."],
  a:["Apartemen","Ramai 06:00&ndash;08:30 dan 18:00&ndash;21:00, tunggu di lobi."],
  t:["Hotel","Tamu ke bandara <b>subuh 03:30&ndash;05:00</b>, order panjang."],
  i:["Industri","Ramai saat ganti shift &plusmn;07:00, 15:00, 23:00."],
  s:["Pasar","Hidup <b>04:00&ndash;07:00</b>, order pendek tapi banyak."],
  k:["Kantor","Berdiri di lobi 20&ndash;30 menit sebelum bubaran."],
  b:["Belanja","Di pintu parkir <b>15 menit sebelum mal tutup</b> (21:00)."],
  r:["Transit","Ramai pagi berangkat dan sore pulang."]
};

var PRESETS = [
  {n:"8 jam · dua peak",k:5.25,p:20.5,r:"duapeak"},
  {n:"Split dua peak",k:5.25,p:21.5,r:"duapeak"}, {n:"Pagi + sore, istirahat siang",k:5.25,p:21.5,r:"full"}, {n:"Pagi saja",k:5.25,p:11,r:"none"},
  {n:"Sore–malam",k:15,p:23,r:"none"}, {n:"Penuh tanpa istirahat",k:5.25,p:21.5,r:"none"},
  {n:"Siang–malam",k:11,p:23,r:"none"}, {n:"Subuh + split",k:3.5,p:21.5,r:"full"}
];
