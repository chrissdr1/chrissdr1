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

Tanpa kunci apa pun, semua hitungan tetap jalan dan aplikasi mengatakan apa yang
sedang tidak aktif. Tidak ada lapisan kemacetan di dalam aplikasi: tidak ada sumber
gratis untuk itu, dan tombol Google Maps memberi data yang sama tanpa biaya.

## Pengaturan sekali oleh anak

### 1. Kunci API Anthropic (tab Tanya, kalender acara)

1. Buat kunci di console.anthropic.com. Pakai **workspace tersendiri dengan batas
   belanja bulanan**, supaya kalau HP hilang kuncinya tinggal dicabut.
2. Di aplikasi: tab **Tanya → Sambungan ke Claude → tempel kunci → Simpan**.
   Kunci disimpan di HP itu saja dan hanya dikirim ke `api.anthropic.com`.

### 2. Sinkron catatan ke GitHub (tab Catatan)

1. Buat repo **privat** baru, misalnya `chrissdr1/buku-setoran-data` (kosong saja).
2. Buat token: GitHub → Settings → Developer settings → **Fine-grained tokens** →
   Generate. Repository access: *Only select repositories* → repo tadi.
   Permissions → Repository → **Contents: Read and write**. Masa berlaku sesuai selera.
3. Di aplikasi: tab **Catatan → Terhubung ke anak → isi repo dan token → Simpan**.
   Setiap "Simpan hari ini" menulis `catatan/shanti.json` ke repo itu. Kalau
   ganti HP, atur token di HP baru dan catatannya kembali sendiri.

Membaca datanya: buka berkas itu di GitHub, atau tambahkan repo tersebut ke sesi
Claude Code dan minta analisa. Bentuknya `{ "harian": [ {id, jam, trip, dpt, ins, kmt,
kmp, kwh, biaya, mnt, cat, diubah}, … ], "rencana": {…} }`.

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
  js/app.js           antarmuka dan boot
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
