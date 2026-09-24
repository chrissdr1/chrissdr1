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

| Tab | Fungsi |
|---|---|
| **Sekarang** | Posisi (GPS, peta, atau pilih sendiri), sisa baterai, sudah dapat berapa → kartu *langkah berikutnya*, urutan sampai pulang, kapan dan di mana ngecas, SPKLU terdekat menurut jarak jalan. Peta OpenStreetMap dengan posisi Ibu, titik terukur, SPKLU, dan tombol ke Google Maps berlapis kemacetan. |
| **Catatan** | Catat angka harian dari aplikasi Grab (±1 menit). Setelah 3 hari, Rp/km, insentif, dan km/kWh Ibu sendiri menggantikan asumsi bawaan. Saldo bulanan menuju Rp 13,4 juta. Sinkron otomatis ke repo GitHub privat milik anak. |
| **Rencana** | Simulasi satu hari → perkiraan bersih, urutan langkah, perbandingan 7 pola sif. Kalender acara besar: bawaan + hasil pencarian web oleh Claude. |
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

Yang terjadi sendiri setiap kali aplikasi dibuka:

- **Rekomendasi rute** (tab Sekarang): sembilan tempat kerja dibandingkan dari
  posisi Ibu sekarang, memakai mesin yang sama dengan proyeksi: hari, jam, wilayah
  tarif, jarak pindah, baterai setelah pindah, cuaca, acara, jarak pulang. Diurutkan,
  tiap kartu punya tombol arah ke Google Maps. Tempat di wilayah tarif yang sama
  hanya berbeda karena jarak; mesin ini tidak punya data permintaan per tempat.
- **Briefing dari Claude** (kalau tersambung): satu paragraf tiap blok jam berganti,
  disusun dari rekomendasi mesin dan konteks yang sama dengan tab Tanya. Disimpan di
  HP supaya tidak membayar dua kali; bisa dimatikan di tab Tanya.
- **Cuaca** diperbarui, dengan pita peluang hujan per jam; **kalender acara**
  disegarkan tiap minggu (butuh kunci API); **posisi** dibaca dari GPS.

Tanpa kunci apa pun, semua hitungan tetap jalan dan aplikasi mengatakan apa yang
sedang tidak aktif. Tidak ada lapisan kemacetan di dalam aplikasi: tidak ada sumber
gratis untuk itu, dan tombol Google Maps memberi data yang sama tanpa biaya.

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

Tanpa kunci, tombol **Lihat kemacetan di Google Maps** membuka Google Maps dengan lapisan lalu lintas tepat di posisi Ibu. Kalau ingin lapisan kemacetan tampil langsung di peta aplikasi, daftarkan akun pengembang TomTom (developer.tomtom.com), buat kunci API dengan produk *Traffic Flow* / *Map Display*, lalu tempel di kolom **Kunci TomTom** di bawah peta, atau kirim lewat tautan pengaturan `#tomtom=…`.

Catatan jujur: bentuk URL ubin yang dipakai (`…/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=…`) ditulis dari ingatan dokumentasi TomTom Traffic API v4 dan **perlu diverifikasi** saat kunci pertama kali dipakai. Kalau ubinnya tidak muncul, cek dokumentasi *Traffic Flow Tiles* TomTom dan sesuaikan `urlTomTom` di `app/js/peta.js`. Jatah gratis harian TomTom ada, tetapi besarannya berubah-ubah; periksa di dasbor TomTom.

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
kmp, kwh, biaya, mnt, cat, diubah}, … ], "rencana": {…} }`.

## Cara kerja hariannya

1. **Mulai hari.** Saat aplikasi dibuka (sekali sehari, jam 03:30–23:30) muncul halaman *Mulai hari*: baterai sekarang, varian, jam mulai, rencana pulang, wilayah, jatah filter, sudah dapat, jeda, charger di rumah. Hari, jam, tanggal merah, acara, cuaca, dan posisi GPS diisi mesin. Isian ini menjadi rencana hari itu dan jangkar perkiraan baterai. Bisa dilewati; bisa dibuka lagi lewat tombol **Isi keadaan hari ini**.
2. **Baterai diperkirakan sendiri.** Dari jangkar terakhir, mesin mengurangi km yang ditempuh: odometer GPS selama halaman terbuka (bila masuk akal) atau model km per jam tiap blok jam dikurangi jeda. Kolom *Sisa baterai* terisi sendiri sampai Ibu mengetik angka lain; angka yang diketik dan tombol **Selesai ngecas ke %** menjadi jangkar baru. Selalu bertanda "perkiraan" dengan keraguannya.
3. **Rencana dan langkah.** Jeda bebas dari–sampai. Sesi ngecas ditempatkan dengan mencoba semua kombinasi (jeda gratis, blok peak dihindari, lantai 20%/25% boleh ditembus sedikit hanya bila lebih murah daripada satu sesi lagi), diisi secukupnya sampai sesi berikutnya atau sampai pulang dengan cadangan; jeda panjang boleh sampai 100%. Tiap langkah menyebut perkiraan order, km berbayar, Rp/order, dan baterai; baris rekap bertemu angka bersih.
4. **Sebaiknya ke mana sekarang** membandingkan sembilan tempat dari posisi sekarang dengan waktu tempuh koridor terukur (tabel Koridor kerja Rute 700K, jam sibuk vs lancar) dan bobot ramainya tiap tempat per blok jam (`BOBOT_TEMPAT`, diturunkan dari Peringkat rute Rute 700K; asumsi bertanda). **Urutan tempat sampai pulang** (`js/peluang.js`) menyusun 3 urutan tempat per blok jam untuk sisa hari, dinilai lengkap oleh mesin yang sama (pindah, ngecas, filter Jakarta, cadangan pulang), dengan aturan Rute 700K: lewat 20:00 hanya mendekat ke rumah, keluar Jakarta sebelum 20:00, bandara perlu antre. Lapisan TomTom opsional di peta.
5. **Jam nyata.** Tab Sekarang memakai jam sekarang tepat ke menit; pilihan jam manual (untuk "kalau saya keluar jam 15:00?") kedaluwarsa sendiri setelah 20 menit.

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
| `HOLI` + `HOLI_SAMPAI` | Tanggal merah SKB 3 Menteri 2026; 2027 baru tanggal pasti. |
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
  js/rekomendasi.js   rekomendasi rute otomatis dari posisi sekarang (faktor macet jam sibuk)
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
npm test                                      # 48 pemeriksaan
ORIG_HTML=/path/artifact-asli.html npm test   # + uji emas terhadap artifact satu-berkas
```
