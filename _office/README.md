# Kantor (Office AI)

Satu tempat untuk semua proyek, dengan konteks yang dipisah per domain supaya
setiap sesi hanya memuat yang dibutuhkan.

> **Repo ini publik.** Jangan taruh di sini: angka strategi atau performa trading,
> saldo dan angka keuangan bisnis, data pelanggan, data pribadi, atau kredensial
> (API key, token, password). Detailnya harus ada di repo privat (lihat bagian
> "Belum dibuat").

## Struktur

| Lokasi | Isi |
|---|---|
| `_office/README.md` | Aturan kerja (file ini) |
| `_office/REGISTRI.md` | Daftar proyek dan sesi, di domain mana, di mana tinggalnya |
| `_office/LOG-TOKEN.md` | Catatan sesi berat, untuk melihat job mana yang paling boros |
| `<domain>/CONTEXT.md` | Status singkat satu domain. Hanya ini yang dibaca saat kerja di domain itu |
| `app/` | Aplikasi Hallo Shanti (GitHub Pages). Tidak diubah oleh struktur kantor ini |

Domain: `trading/`, `digital-produk/`, `grab/`, `bisnis-vanila/`.

## Aturan hemat token

1. **Satu tugas, satu sesi.** Jangan melanjutkan sesi yang sudah besar untuk topik lain.
2. **Mulai dengan konteks kecil.** Baca `CONTEXT.md` domain yang relevan, bukan semua file.
3. **Hitungan dan pengolahan data dikerjakan script.** Model hanya dipakai untuk menafsirkan hasilnya.
4. **Tutup sesi dengan pembaruan.** Perbarui `CONTEXT.md` (status, keputusan, tugas terbuka) sebelum sesi ditutup. Jangan menambah catatan mentah atau transkrip.
5. **Catat sesi berat** di `LOG-TOKEN.md`.
6. **Pilih model menurut tugas.** Model menengah untuk pekerjaan rutin; model besar hanya untuk desain atau masalah yang sulit.

## Belum dibuat (perlu keputusan)

- **Repo privat `kantor-data`** untuk isi `CONTEXT.md` yang sensitif (performa trading, angka bisnis). Belum dibuat karena membuat repo adalah tindakan yang sulit dibalik; perlu persetujuan Anda.
- **Sesi Cowork bisnis vanila** tidak bisa dibaca dari sesi ini. Perlu diekspor manual ke `bisnis-vanila/CONTEXT.md` (versi non-sensitif) atau ke repo privat.
- **Skill "tutup sesi"** yang otomatis memperbarui `CONTEXT.md`. Ini tahap berikutnya setelah struktur ini dipakai beberapa hari.
