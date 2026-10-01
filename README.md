# chrissdr1

Christopher Delique R /

---

# Hallo Shanti — Buku Setoran & Penunjuk Arah

Aplikasi web (PWA, bisa dipasang di HP) untuk pengemudi GrabCar dengan BYD Atto 1
yang berpangkalan di Modernland, Kota Tangerang. Kelanjutan dari dua halaman yang
dibangun di Claude Code: **Rute 700K** (rencana kerja dan rujukan tarif) dan
**Hallo Shanti** (buku setoran, kartu langkah berikutnya, perencana sif). Mesin
hitungnya dipindahkan **tanpa mengubah satu angka pun**: tes emas membandingkan
keluarannya dengan artifact aslinya.

**Alamat aplikasi:** https://chrissdr1.github.io/chrissdr1/

Tiga tab: **Hari ini**, **Catatan**, **Tanya**. "Hari ini" punya sakelar besar
**Sedang narik / Rencanakan** (dulu dua tab terpisah, Sekarang dan Rencana). Keadaan
bawaan: sudah isi Mulai hari → Sedang narik; malam (≥ 20:30) atau dini hari (< 03:30) →
Rencanakan; pilihan Ibu sendiri diingat untuk hari itu. Isian yang sama cukup diubah
sekali: tipe mobil dan colokan rumah selalu; filter, jam pulang, hujan, acara bila
rencananya untuk hari ini.

| Bagian | Fungsi |
|---|---|
| **Hari ini** → **Sedang narik** | Posisi (GPS, peta, atau pilih sendiri), sisa baterai, sudah dapat berapa → kartu *langkah berikutnya*, urutan sampai pulang, kapan dan di mana ngecas, SPKLU terdekat menurut jarak jalan. Peta OpenStreetMap dengan posisi Ibu, titik terukur, SPKLU, dan tombol ke Google Maps berlapis kemacetan. |
| **Catatan** | Catat angka harian dari aplikasi Grab (±1 menit), opsional **order per blok jam** dan **carter**. Setelah 3 hari, Rp/km, insentif, dan km/kWh Ibu sendiri menggantikan asumsi bawaan; dari order per jam aplikasi belajar jam, hari, dan tempat yang ramai untuk Ibu. Saldo bulanan (termasuk carter) menuju Rp 13,4 juta. Sinkron otomatis ke repo GitHub privat milik anak. |
| **Hari ini** → **Rencanakan** | Simulasi satu hari (hari ini atau besok) → perkiraan bersih, urutan langkah, 8 pola jam kerja yang bisa diketuk untuk dipakai. **Ada tawaran carter?** membandingkan tawaran dengan perkiraan narik di jam yang sama. Kalender acara besar: bawaan + hasil pencarian web oleh Claude. |
| **Tanya** | Asisten Claude yang tahu isi halaman dan bisa menjalankan mesin hitung yang sama lewat alat, plus pencarian web untuk hal yang berubah hari ini. |

Yang diambil dari internet, dan dari mana:

| Data | Sumber | Butuh apa |
|---|---|---|
| Cuaca hari ini | Open-Meteo (titik Modernland), diperbarui tiap 3 jam | tidak ada |
| Peta | Ubin OpenStreetMap | tidak ada |
| Kemacetan langsung | Google Maps (dibuka lewat tombol, di posisi Ibu) | tidak ada |
| Acara besar 90 hari | Claude + pencarian web, disegarkan tiap minggu | kunci API Anthropic |
| Tanya | Claude (`claude-opus-5`) + alat hitung halaman + pencarian web | kunci API Anthropic |
| Catatan Ibu → anak | GitHub Contents API ke repo privat | token GitHub terbatas |
| Macet langsung, garis rute, pola macet jam pulang (opsional) | TomTom Traffic Flow + Routing (`departAt`) | kunci TomTom |
| Pola macet rute Ibu sendiri (opsional, otomatis) | TomTom Routing, pola historis per jam | kunci TomTom (produk Routing) |

Yang terjadi sendiri setiap kali aplikasi dibuka:

- **Rekomendasi rute** (Sedang narik): sembilan tempat kerja dibandingkan dari
  posisi Ibu sekarang, dengan cara yang sama persis dengan kartu *Urutan tempat*:
  hari, jam, wilayah tarif, bobot ramai tiap tempat per jam, waktu pindah dengan
  faktor lalu lintas, baterai setelah pindah (tempat yang tidak terjangkau tidak
  ditawarkan), cuaca, acara, waktu pulang, insentif, aturan "keluar Jakarta jam
  20:00". Tiga teratas diuji "kalau macet parah" (perjalanan 1,5×); yang
  keuntungannya hilang saat macet ditandai **berisiko**.
- **Mau ke tempat lain?**: tujuan mana pun dari 21 tempat dihitung dulu — waktu
  tempuh, jam tiba, baterai tiba, uji macet parah, jam keluar Jakarta / mulai
  pulang, dan vonis sepadan / berisiko / tidak sepadan dibanding tetap di tempat.
- **Briefing dari Claude** (kalau tersambung): satu paragraf tiap blok jam berganti,
  disusun dari rekomendasi mesin dan konteks yang sama dengan tab Tanya. Disimpan di
  HP supaya tidak membayar dua kali; bisa dimatikan di tab Tanya.
- **Cuaca** diperbarui, dengan pita peluang hujan per jam; **kalender acara**
  disegarkan tiap minggu (butuh kunci API); **posisi** dibaca dari GPS.

Tanpa kunci apa pun, semua hitungan tetap jalan dan aplikasi mengatakan apa yang
sedang tidak aktif. Waktu tempuh tanpa kunci TomTom memakai jarak jalan terukur
(OSRM, jalan kosong) × faktor lalu lintas: Jakarta dari TomTom Traffic Index 2025
(pagi 1,67×, sore 2,2×, siang ±1,5×, malam ±1,15×), Tangerang asumsi (1,6× jam
sibuk, 1,25× siang, 1,1× malam) karena TomTom tidak punya angkanya.

## Pengaturan sekali oleh anak

### 1. Kunci API Anthropic (tab Tanya, kalender acara)

Dibuat di Claude Console: https://platform.claude.com (alamat lama
console.anthropic.com mengarah ke sana).

**Langganan Claude Pro/Max tidak mencakup API.** API dibayar terpisah, prabayar,
sesuai pemakaian. Ada satu jalur tanpa API: versi pratinjau di claude.ai
(https://claude.ai/artifact/9rMWxjNEbuuVZXJRtruv6g) memakai langganan Claude milik
orang yang membuka halamannya, jadi tab Tanya dan briefing jalan tanpa kunci selama
dibuka dalam keadaan login. Aplikasi yang dipasang dari GitHub Pages tidak bisa
memakai langganan itu; di sana hanya kunci API yang jalan.

1. **Saldo.** Settings → Billing (https://platform.claude.com/settings/billing):
   isi kredit prabayar. Tanpa saldo, kunci ditolak saat dipakai.
2. **Workspace tersendiri.** Settings → Workspaces
   (https://platform.claude.com/settings/workspaces) → buat workspace, misalnya
   "shanti", dan pasang **batas belanja bulanan** di situ. Kalau HP hilang, cabut
   kuncinya dan batas itu menahan kerugian.
3. **Kunci.** Settings → API keys (https://platform.claude.com/settings/keys) →
   Create key di workspace "shanti". Pilih kunci untuk **satu workspace** (bukan
   *multi-workspace*: jenis itu butuh header tambahan yang tidak dikirim aplikasi
   ini) dan masa berlaku yang panjang. Salin kuncinya; hanya tampil sekali.
4. Masukkan ke aplikasi: tab **Tanya → Sambungan ke Claude → tempel → Simpan**,
   atau lewat **tautan pengaturan** (bagian 3 di bawah) supaya tidak mengetik di HP.
   Kunci disimpan di HP itu saja dan hanya dikirim ke `api.anthropic.com`.

Perkiraan biaya (bukan tagihan pasti): satu pertanyaan Tanya sekitar Rp 700–1.000
(model `claude-opus-5`, konteks 6–9 ribu token); penyegaran kalender acara sekitar
Rp 2.000–5.000 sekali seminggu (sampai 6 pencarian web, $10 per 1.000 pencarian,
plus token). Pencarian web harus tidak dimatikan admin di Settings → Privacy.

### 2. Sinkron catatan ke GitHub (tab Catatan)

1. Buat repo **privat** baru, misalnya `chrissdr1/buku-setoran-data` (kosong saja).
2. Buat token: GitHub → Settings → Developer settings → **Fine-grained tokens** →
   Generate. Repository access: *Only select repositories* → repo tadi.
   Permissions → Repository → **Contents: Read and write**. Masa berlaku sesuai selera.
3. Di aplikasi: tab **Catatan → Terhubung ke anak → isi repo dan token → Simpan**.
   Setiap "Simpan hari ini" menulis `catatan/shanti.json` ke repo itu. Kalau
   ganti HP, atur token di HP baru dan catatannya kembali sendiri.

### 2b. Lapisan kemacetan TomTom di peta (opsional)

Tanpa kunci, tombol **Lihat kemacetan di Google Maps** membuka Google Maps dengan lapisan lalu lintas tepat di posisi Ibu. Kalau ingin lapisan kemacetan tampil langsung di peta aplikasi, daftarkan akun pengembang TomTom (developer.tomtom.com), buat kunci API dengan produk *Traffic Flow* / *Map Display*, lalu tempel di tab **Catatan → gulir ke bawah → "Pengaturan anak" (ketuk judulnya untuk membuka) → Lapisan macet TomTom di peta**, atau kirim lewat tautan pengaturan `#tomtom=…`.

**Jatah gratis TomTom** (halaman harga resmi developer.tomtom.com/pricing, dicek
29-09-2026 — bisa berubah, lihat dasbor): dihitung **per bulan, per layanan**, tanpa kartu
kredit: Routing 20.000, Traffic Incident Details 2.500, Traffic Flow Segment 20.000, ubin
peta/lalu lintas 200.000. Lewat batas dijawab **429** (FAQ resmi), bukan ditagih. Karena
kunci bisa dipakai di dua HP (Ibu dan anak), tiap HP memakai paling banyak **separuh**:
Routing 10.000 dan kejadian jalan 1.200 per bulan kalender. Jatah harian = sisa bulan ÷
sisa hari (maks 2× rata-rata), dihitung bersama lintas tab; 40 permintaan Routing terakhir tiap
hari disisakan untuk "jalan pulang sekarang" (macet latar belakang dan pengukuran berhenti sebelumnya). Balasan 429 = jeda 5 menit;
3 kali 429 tanpa sukses di antaranya = layanan itu berhenti sampai besok. Belum
terverifikasi: apakah bulan TomTom = bulan kalender dan kapan persisnya hitungannya
direset. Pemakaian bulan ini tampil di Pengaturan anak.

**Jalan pulang & kejadian di jalan** (Sedang narik, `js/kejadian.js`): mulai 1,5 jam
sebelum jam mulai pulang (di Jakarta mulai 18:00, aturan 20:00), atau saat tombol
"Cek jalan pulang sekarang" ditekan, aplikasi meminta rute langsung posisi → rumah:
menit sekarang, biasanya jam ini, lancar; jam paling lambat mulai jalan agar tiba di jam
pulang; potongan macet terparah (garis merah di peta, diberi nama jalan bila ada kejadian
di situ). Kejadian di jalan (kecelakaan, jalan ditutup, banjir, mogok, lajur ditutup,
perbaikan jalan besar) dalam radius 15 km, bahasa Indonesia, yang di rute pulang paling
atas; ubin kejadian TomTom juga tampil di peta. Semua hanya saat aplikasi sedang
dilihat; kejadian disegarkan tiap 20 menit menjelang pulang, tiap 60 menit di luar itu, dan
tidak diambil ulang selama Ibu masih di kotak yang sama; gagal dicoba lagi setelah 3, 6, 12, 24,
lalu 30 menit. Ketersediaan SPKLU langsung dari TomTom
**tidak** ada untuk Indonesia (dokumen cakupan EV TomTom: Indonesia hanya data statis),
jadi status kosong/terisi tidak ada.

**Colokan SPKLU** (`js/spklu.js`): sekali per 30 hari (atau tombol di Pengaturan anak)
aplikasi mengambil SPKLU di Tangerang–Jakarta dari TomTom Nearby Search (12 lingkaran
9,5 km, `connectorSet` = semua jenis colokan; kode kategori tidak dipakai karena belum
terverifikasi di dokumen resmi). Tiap SPKLU diberi jenis colokan, daya, dan kecocokan untuk
**BYD Atto 1 Dynamic** (brosur BYD: DC **CCS2 maks 30 kW**, AC Type 2 maks 6,6 kW):
"cocok, cepat ±30 kW" / "hanya AC (±3,4 jam 15→90%)" / "tidak cocok" (mis. hanya CHAdeMO
atau GB/T). Tampil di SPKLU terdekat, peringatan baterai (plus SPKLU CCS2 terdekat bila tak
satu pun di daftar cocok), popup peta, SPKLU tambahan di peta (hijau/kuning/abu), dan
konteks Tanya. Jatah: Search 2.500/bulan gratis, aplikasi maks 400/bulan per HP.

**Ukur macet rute Ibu** (`js/ukurmacet.js`): kalau kunci ada, aplikasi sendiri mengukur
waktu tempuh "biasanya" (pola historis TomTom, `departAt`) untuk 72 rute Ibu — rumah ↔
8 tempat inti dua arah dan antar tempat inti — di 10 jam, hari kerja dan akhir pekan:
1.440 ukuran per putaran, dicicil maks 300 per hari dan maks 45% jatah Routing harian (60 per sesi), diulang tiap 28 hari,
diabaikan setelah 90 hari. Hasilnya menggantikan asumsi Tangerang (TomTom Traffic Index
tidak mengukur Tangerang) di semua hitungan: macet langsung > pola terukur > asumsi.
Status dan tombol "Ukur macet rute Ibu sekarang" ada di Pengaturan anak. Format `departAt`
belum diuji dengan kunci sungguhan: kalau TomTom menolak (4xx) 3 kali berturut-turut,
pengukuran berhenti sendiri dan statusnya menyebut galatnya. Sinyal putus, 5xx, atau
halaman login wifi bukan penolakan: sesi itu selesai dan dicoba lagi nanti. Ukuran yang
tak masuk akal (> 4 jam, atau > 5x waktu lancar) tidak dipakai. Kartu saran menyebut
sumber macetnya: TomTom langsung, pola terukur, atau perkiraan umum.

Bentuk URL ubin (`…/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png?key=…`) sudah diverifikasi terhadap dokumentasi resmi TomTom Traffic API v4 (Raster Flow Tiles): host tunggal `api.tomtom.com` (bukan subdomain a/b/c/d gaya OSM), gaya `relative`. Ubin kejadian: `…/traffic/map/4/tile/incidents/s0/{z}/{x}/{y}.png` (gaya s0 yang disarankan dokumentasi).

Kunci yang sama juga dipakai untuk faktor macet langsung di perkiraan (menggantikan patokan jam sibuk statis) dan garis rute ke tempat yang disarankan di peta (ikut bentuk jalan sungguhan, bukan garis lurus) lewat TomTom Routing API — daftarkan produk *Routing* dan *Traffic* (termasuk *Incidents*) juga, bukan cuma *Map Display*, supaya fitur-fitur ini ikut jalan (di dasbor TomTom baru biasanya semua produk sudah aktif untuk satu kunci — belum terverifikasi, cek di dasbor). Kedua pemanggilan itu memakai respons yang sama (satu permintaan per pasangan tempat, disimpan 10 menit), jadi garis rutenya tidak menambah pemakaian jatah. Macet langsung antar tempat disegarkan paling sering tiap 15 menit, hanya saat aplikasi dilihat.

### 3. Tautan pengaturan: tidak perlu mengetik apa pun di HP

Rangkai tautan ini di komputer, lalu kirim ke HP Ibu lewat WhatsApp (pesan
pribadi, dan hapus pesannya setelah dibuka):

```
https://chrissdr1.github.io/chrissdr1/#kunci=sk-ant-…&repo=chrissdr1/buku-setoran-data&token=github_pat_…
```

Bagian mana pun boleh dihilangkan (`#kunci=…` saja, atau `#repo=…&token=…` saja). Kunci TomTom ikut dengan `&tomtom=…`.
Saat tautan dibuka, aplikasi menyimpan isinya di HP itu, menghapusnya dari alamat,
dan menampilkan kotak "Pengaturan: tersimpan dari tautan". Bagian setelah `#`
tidak pernah dikirim ke server mana pun, termasuk ke GitHub Pages dan ke pratinjau
tautan WhatsApp.

Membaca datanya: buka berkas itu di GitHub, atau tambahkan repo tersebut ke sesi
Claude Code dan minta analisa. Bentuknya `{ "harian": [ {id, jam, trip, dpt, ins, kmt,
kmp, kwh, biaya, mnt, rating, acc, comp, cat, diubah}, … ], "rencana": {…} }`. `rating`
(bintang dari menu Performa app Grab), `acc` (tingkat penerimaan %), dan `comp` (tingkat
penyelesaian %) murni catatan — tidak dipakai mesin hitung mana pun, cuma ditampilkan
di tabel Riwayat supaya Ibu bisa lihat sendiri kalau ada polanya.

## Cara kerja hariannya

1. **Mulai hari.** Saat aplikasi dibuka (sekali sehari, jam 03:30–23:30) muncul halaman *Mulai hari*: baterai sekarang, varian, jam mulai, rencana pulang, wilayah, jatah filter, sudah dapat, jeda, charger di rumah. Hari, jam, tanggal merah, acara, cuaca, dan posisi GPS diisi mesin. Isian ini menjadi rencana hari itu dan jangkar perkiraan baterai. Bisa dilewati; bisa dibuka lagi lewat tombol **Isi keadaan hari ini**.
2. **Baterai diperkirakan sendiri.** Dari jangkar terakhir, mesin mengurangi km yang ditempuh: odometer GPS selama halaman terbuka (bila masuk akal) atau model km per jam tiap blok jam dikurangi jeda. Kolom *Sisa baterai* terisi sendiri sampai Ibu mengetik angka lain; angka yang diketik dan tombol **Selesai ngecas ke %** menjadi jangkar baru. Selalu bertanda "perkiraan" dengan keraguannya.
3. **Rencana dan langkah.** Jeda bebas dari–sampai. Sesi ngecas ditempatkan dengan mencoba semua kombinasi (jeda gratis, blok peak dihindari, lantai 20%/25% boleh ditembus sedikit hanya bila lebih murah daripada satu sesi lagi), diisi secukupnya sampai sesi berikutnya atau sampai pulang dengan cadangan; jeda panjang boleh sampai 100%. Tiap langkah menyebut perkiraan order, km berbayar, Rp/order, dan baterai; baris rekap bertemu angka bersih.
4. **Sebaiknya ke mana sekarang** membandingkan sembilan tempat dari posisi sekarang dengan jarak koridor terukur (tabel Koridor kerja Rute 700K) × faktor lalu lintas per jam (lihat di atas) dan bobot ramainya tiap tempat per blok jam (`BOBOT_TEMPAT`, diturunkan dari Peringkat rute Rute 700K; asumsi bertanda). **Urutan tempat sampai pulang** (`js/peluang.js`) menyusun 3 urutan tempat per blok jam untuk sisa hari, dinilai lengkap oleh mesin yang sama (pindah, ngecas, filter Jakarta, cadangan pulang), dengan aturan Rute 700K: lewat 20:00 hanya mendekat ke rumah, keluar Jakarta sebelum 20:00, bandara perlu antre. Lapisan TomTom opsional di peta.
5. **Jam nyata.** Sedang narik memakai jam sekarang tepat ke menit; pilihan jam manual (untuk "kalau saya keluar jam 15:00?") kedaluwarsa sendiri setelah 20 menit.
6. **Jam narik berhenti saat "Waktunya pulang"**, bukan saat tiba di rumah: perjalanan pulang tidak dihitung sebagai pendapatan (order searah lewat Filter Tujuan itu bonus).
7. **Malam: catat.** Selain angka harian, isi *Order per jam* dari riwayat perjalanan Grab (kosong = tidak narik di jam itu, 0 = narik tapi sepi), dan *Carter* kalau hari itu ada sewa. Selama aplikasi terbuka, GPS mencatat zona tiap blok jam (`js/jejak.js`).
8. **Aplikasi belajar** (`js/belajar.js`): order sungguhan dibanding perkiraan per blok jam, per hari × blok, dan per tempat; rasionya ditarik ke angka awal selama datanya sedikit, lalu makin mengikuti Ibu. Hasilnya dipakai perkiraan dan saran tempat, dan diringkas di tab Catatan (*Pola jam dari catatan Ibu*).

## Memasang di HP Ibu

1. Buka alamat aplikasi di Chrome (Android) atau Safari (iPhone).
2. Android: menu ⋮ → **Tambahkan ke layar utama** / **Instal aplikasi**.
   iPhone: tombol Bagikan → **Tambah ke Layar Utama**.
3. Aplikasi terbuka tanpa sinyal, dan memperbarui dirinya sendiri saat dibuka
   dengan internet.

## Menerbitkan

Statis, lewat GitHub Pages. Workflow `.github/workflows/pages.yml` menerbitkan
folder `app/` setiap ada perubahan di `master`, dan mengaktifkan Pages sendiri
saat pertama kali jalan (`enablement: true`).

## Kamus istilah di layar

Sapaan satu: **Ibu**. Ngecas (bukan isi daya/top-up), istirahat (bukan jeda), order (bukan trip), km berpenumpang, komplek, filter tujuan, batas aman (20%/25% Jakarta), SPKLU langganan, Waktunya pulang. Nama blok di kode tetap kunci data (`Peak pagi`, `Jam mati`, …); yang tampil memakai `LABEL_BLOK` (Jam sepi, Jelang bubaran, Lewat peak pagi, Malam larut). Penjelasan panjang selalu di balik tombol "Kenapa?". Pengaturan anak (kunci Claude, sinkron GitHub, TomTom, pemeriksaan) dilipat di bawah halaman.

## Merawat datanya

Yang berubah menurut waktu ada di `app/js/data.js`:

| Variabel | Isi |
|---|---|
| `HOLI` + `HOLI_SAMPAI` | Tanggal merah SKB 3 Menteri 2026 dan 2027 (18 libur + 8 cuti bersama). |
| `LIBUR_SEKOLAH`, `RAMADAN` + `KONTEKS_SAMPAI` | Libur sekolah Banten 2026/2027 dan Ramadan 1448 H (perkiraan, tunggu isbat). Hanya konteks + kartu panduan; tidak mengubah angka — dampaknya dipelajari dari catatan. |
| `EVENTS` + `EVENTS_SAMPAI` | Kalender acara bawaan (disusun tangan). Hasil web ditambahkan di atasnya, tidak menimpa. |
| `CUACA` | Cadangan bila Open-Meteo tidak terjangkau. |
| `TERBIT` | Tanggal terbit versi ini. `VERSION` di `app/sw.js` harus diawali tanggal ini (tes memeriksanya). |

Rujukan lengkap tarif, koridor, dan aturan baterai: `app/rute-700k.html`.

## Struktur

```
app/
  index.html, style.css
  js/data.js          tarif blok, wilayah, kalender, 183 kecamatan, SPKLU, teks langkah
  js/engine.js        simulasi, urutan langkah, nasihat, jarak pulang, uji mandiri
  js/ai.js            sambungan ke Claude (window.claude di claude.ai, atau SDK + kunci API)
  js/cuaca.js         prakiraan dari Open-Meteo
  js/peta.js          peta Leaflet: posisi, titik terukur, SPKLU, tautan kemacetan
  js/acara.js         kalender acara dari pencarian web
  js/sinkron.js       sinkron catatan ke repo GitHub privat
  js/rekomendasi.js   "ke mana sekarang", uji macet parah, tujuan pilihan Ibu
  js/lalulintas.js    macet langsung TomTom (pengali, garis rute, jalan pulang sekarang), jatah bulanan per layanan
  js/kejadian.js      kejadian di jalan TomTom (kecelakaan, jalan ditutup, banjir) di sekitar Ibu
  js/spklu.js         colokan SPKLU dari TomTom dan kecocokan untuk Atto 1
  js/ukurmacet.js     ukur pola macet historis rute Ibu (TomTom departAt), dipakai mesin
  js/jejak.js         zona per blok jam dari GPS
  js/belajar.js       belajar pola jam / hari / tempat dari catatan order per jam
  js/baterai.js       jejak baterai: jangkar (Mulai hari, selesai ngecas), odometer GPS, model km per blok
  js/peluang.js       urutan tempat per blok jam (pencarian berkas + simulate dengan o.urutan)
  js/app.js           antarmuka, halaman Mulai hari, dan boot
  vendor/             anthropic-sdk.min.js (npm run build:sdk), leaflet/
  sw.js, manifest.webmanifest, icons/, rute-700k.html
tests/run.mjs         uji Chromium: uji mandiri, service worker, adapter AI, cuaca, peta,
                      acara, sinkron (semua layanan luar ditiru), uji emas
tools/                sdk-entry.mjs, make-icons.py
```

## Menguji

```
npm install
npx playwright install chromium
npm test                                      # 281 pemeriksaan
npm run sapuan                                # sapuan dalam: 9.204 keadaan (tanggal x jam x posisi x baterai), harus 0 pelanggaran
ORIG_HTML=/path/artifact-asli.html npm test   # + uji emas terhadap artifact satu-berkas
```
