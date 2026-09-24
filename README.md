# chrissdr1

Christopher Delique R /

---

# Hallo Shanti — Buku Setoran & Penunjuk Arah

Aplikasi web (PWA, bisa dipasang di HP) untuk pengemudi GrabCar dengan BYD Atto 1
yang berpangkalan di Modernland, Kota Tangerang. Ini kelanjutan dari dua halaman
yang dibangun di Claude Code: **Rute 700K** (rencana kerja dan rujukan tarif) dan
**Hallo Shanti** (buku setoran, kartu langkah berikutnya, perencana sif). Semua
mesin hitungnya dipindahkan **tanpa mengubah satu angka pun** — tes emas
membandingkan 149 keluaran dengan artifact aslinya.

Isi aplikasi (`app/`):

| Tab | Fungsi |
|---|---|
| **Sekarang** | Posisi (GPS atau pilih sendiri), sisa baterai, sudah dapat berapa → kartu *langkah berikutnya*, urutan sampai pulang, kapan dan di mana ngecas, SPKLU terdekat menurut jarak jalan. |
| **Catatan** | Catat angka harian dari aplikasi Grab (±1 menit). Setelah 3 hari, Rp/km, insentif, dan km/kWh Ibu sendiri menggantikan asumsi bawaan di seluruh aplikasi. Saldo bulanan menuju Rp 13,4 juta. Cadangan lewat salin-tempel ke WhatsApp. |
| **Rencana** | Simulasi satu hari: jam keluar, jam pulang, istirahat, wilayah, filter, baterai → perkiraan bersih, urutan langkah, dan perbandingan 7 pola sif. |
| **Tanya** | Asisten Claude yang tahu isi halaman (catatan, rencana, tarif blok, 183 kecamatan terukur) dan bisa menjalankan mesin hitung yang sama lewat alat. Butuh kunci API, lihat di bawah. |

Uji mandiri di bagian bawah halaman memeriksa 12 aturan pada ribuan kombinasi
(urutan langkah, jarak terhadap 183 titik terukur, ekonomi rencana).

## Menerbitkan (sekali saja)

Aplikasi ini statis: cukup GitHub Pages.

1. Gabungkan branch ini ke `master`.
2. Di GitHub: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Workflow `.github/workflows/pages.yml` menerbitkan folder `app/` setiap ada
   perubahan di `master`. Alamatnya: `https://chrissdr1.github.io/chrissdr1/`.

## Memasang di HP Ibu

1. Buka alamat di atas di Chrome (Android) atau Safari (iPhone).
2. Android: menu ⋮ → **Tambahkan ke layar utama** / **Instal aplikasi**.
   iPhone: tombol Bagikan → **Tambah ke Layar Utama**.
3. Setelah itu aplikasi terbuka tanpa sinyal, dan memperbarui dirinya sendiri saat
   dibuka dengan internet.

Catatan harian tersimpan di HP itu saja (localStorage). Kalau ganti HP, pakai
**Salin catatan** di tab Catatan lalu **Pulihkan dari salinan** di HP baru.

## Menyalakan tab Tanya (opsional)

Tab Tanya, tombol *Analisa catatan*, dan pemetaan nama tempat yang tidak dikenal
memakai Claude lewat SDK resmi `@anthropic-ai/sdk` yang dipanggil langsung dari
browser. Tanpa kunci, semua hitungan lain tetap jalan dan aplikasi mengatakannya
terus terang.

1. Buat kunci di console.anthropic.com. Pakai **workspace tersendiri dengan batas
   belanja bulanan**, supaya kalau HP hilang kuncinya tinggal dicabut.
2. Di aplikasi: tab **Tanya → Sambungan ke Claude → tempel kunci → Simpan**.
   Kunci disimpan di HP itu saja dan hanya dikirim ke `api.anthropic.com`.

Model: tab Tanya dan analisa memakai `claude-opus-5`; pemetaan nama tempat
memakai `claude-haiku-4-5`. Keduanya diatur di satu tempat: `app/js/ai.js`.

## Merawat datanya

Semua yang berubah menurut waktu ada di `app/js/data.js`:

| Variabel | Isi | Terakhir |
|---|---|---|
| `CUACA` | Prakiraan hari ini (`tanggal`, `hujan`, `jam`, `ringkas`). Kalau tanggalnya bukan hari ini, aplikasi bilang begitu dan meminta centang Hujan diisi sendiri. | 2026-09-23 |
| `EVENTS` + `EVENTS_SAMPAI` | Konser dan pameran besar di Jakarta/BSD. | sampai 2026-12-27 |
| `HOLI` + `HOLI_SAMPAI` | Tanggal merah SKB 3 Menteri 2026; 2027 baru tanggal pasti. | sampai 2026-12-25 |
| `TERBIT` | Tanggal terbit versi ini. **Samakan dengan `VERSION` di `app/sw.js`** setiap kali menerbitkan, supaya cache lama dibuang. Tes memeriksanya. | 2026-09-24 |

Rujukan lengkap tarif, koridor, dan aturan baterai: `app/rute-700k.html`.

## Struktur

```
app/
  index.html          markup empat tab
  style.css
  js/data.js          tarif blok, wilayah, kalender, 183 kecamatan, SPKLU, teks langkah
  js/engine.js        simulasi, urutan langkah, nasihat, jarak pulang, uji mandiri
  js/ai.js            sambungan ke Claude (window.claude di claude.ai, atau SDK + kunci API)
  js/app.js           antarmuka dan boot
  vendor/anthropic-sdk.min.js   bundel SDK resmi (npm run build:sdk)
  sw.js, manifest.webmanifest, icons/
  rute-700k.html      dokumen rujukan
tests/run.mjs         uji Chromium: uji mandiri, service worker, adapter AI (fetch tiruan), uji emas
tools/sdk-entry.mjs   titik masuk bundel SDK
```

## Menguji

```
npm install
npx playwright install chromium
npm test                                   # 28 pemeriksaan
ORIG_HTML=/path/artifact-asli.html npm test   # + uji emas terhadap artifact satu-berkas
```

Memperbarui bundel SDK: `npm run build:sdk`.
