# Server peringatan Hallo Shanti

Aplikasi Ibu adalah halaman statis: saat tertutup ia tidak bisa memberi tahu
apa pun. Server kecil ini (Cloudflare Workers, paket **gratis** cukup) yang
memberi tahu HP Ibu lewat notifikasi push, walau aplikasinya tertutup:

| Peringatan | Kapan |
|---|---|
| **Jalan pulang macet +X menit** | 90 menit menjelang jam mulai pulang, dicek ke TomTom tiap 15 menit; dikirim bila ≥ 10 menit lebih lama dari hitungan aplikasi |
| **Waktunya jalan pulang** | di jam mulai pulang (dimajukan bila macet) |
| **Baterai mungkin tidak cukup sampai rumah** | saat perkiraan baterai turun di bawah batas pulang dan HP belum mengabari lagi (misalnya Ibu belum mencatat ngecas) |

Tiap peringatan dikirim **sekali**. Yang sudah diperingatkan aplikasi yang
sedang terbuka tidak dikirim lagi oleh server.

## Yang dikirim HP ke server

Jam mulai pulang, jam pulang, batas mulai pulang (22:00 / keluar Jakarta
20:00), posisi narik terakhir (dibulatkan ~10 m), titik rumah, nama tempat,
dan perkiraan kapan baterai menipis. Tidak ada catatan setoran. Data
rencana terhapus sendiri setelah 36 jam.

## Pasang lewat GitHub (paling mudah, tanpa komputer)

1. Cloudflare: **My Profile → API Tokens → Create Token** → template
   **"Edit Cloudflare Workers"**. Salin token + **Account ID**.
   (Jangan tempel token di chat/pesan mana pun.)
2. GitHub, repo ini: **Settings → Secrets and variables → Actions → New
   repository secret**, isi: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
   `PERINGATAN_SANDI` (sandi bebas), `PERINGATAN_EMAIL`, `TOMTOM_KEY`
   (opsional).
3. Tab **Actions → Pasang server peringatan → Run workflow**. Ringkasan
   hasilnya menampilkan **alamat server**.
4. Di HP Ibu: Pengaturan anak › Peringatan di HP → alamat + sandi →
   **Sambungkan** → **Kirim tes**.

Workflow yang sama dijalankan lagi untuk memperbarui server (kunci VAPID
dipertahankan, jadi HP tidak perlu menyambung ulang).

## Pasang dari komputer (cara lain, ±15 menit)

Butuh: akun Cloudflare (gratis) dan Node.js di komputer.

```bash
cd worker
npx wrangler login                                # buka browser, masuk akun Cloudflare
npx wrangler kv namespace create PERINGATAN       # salin "id" ke wrangler.toml (ganti GANTI_DENGAN_ID_KV)
node vapid.mjs                                    # buat kunci VAPID (simpan, jangan dimasukkan ke repo)
npx wrangler secret put VAPID_PUBLIC              # tempel VAPID_PUBLIC
npx wrangler secret put VAPID_PRIVATE             # tempel VAPID_PRIVATE
npx wrangler secret put VAPID_SUBJECT             # mailto:alamat-email-anak@contoh.com
npx wrangler secret put SANDI                     # sandi bebas, panjang; diketik juga di aplikasi
npx wrangler secret put TOMTOM_KEY                # opsional: kunci TomTom (untuk cek macet)
npx wrangler deploy                               # hasil: https://hallo-shanti-peringatan.<akun>.workers.dev
```

Lalu di HP Ibu (aplikasi sebaiknya **dipasang ke layar utama** dulu —
di Android Chrome: menu ⋮ › Tambahkan ke layar utama):

1. Buka **Pengaturan anak › Peringatan di HP**.
2. Isi **Alamat server** (hasil `wrangler deploy`) dan **Sandi server**.
3. Tekan **Sambungkan** → izinkan notifikasi.
4. Tekan **Kirim tes** — notifikasi "Peringatan tersambung" harus muncul.

## Biaya & jatah

- Cloudflare Workers paket gratis (angka saat ditulis — cek halaman harga
  Cloudflare sebelum memasang): ±100.000 permintaan/hari, cron, KV ±1.000
  tulis/hari. Satu HP: 288 putaran cron/hari, ±50–100 tulis KV/hari.
- TomTom: ±6 permintaan Routing per hari (hanya 90 menit menjelang pulang,
  tiap 15 menit), dari jatah kunci TomTom yang sama dengan aplikasi.

## Keamanan

- Semua yang mengubah data butuh **SANDI**; tanpa SANDI terpasang server
  menolak semuanya.
- CORS hanya untuk `https://chrissdr1.github.io` (variabel `ASAL` di
  `wrangler.toml`).
- Kunci VAPID privat, SANDI, dan TOMTOM_KEY hanya ada sebagai *secret*
  Cloudflare — tidak pernah di repo.

## Batas

- Push di Android lewat layanan Google (FCM) dan di iPhone hanya untuk
  aplikasi yang dipasang ke layar utama (iOS 16.4+). Mode hemat baterai yang
  agresif di sebagian HP bisa menunda notifikasi.
- Perkiraan baterai di server berasal dari HP saat terakhir terbuka; kalau
  Ibu ngecas tanpa mencatat, peringatan baterai bisa keliru (pesannya
  menyebut itu).
- Macet hanya dicek menjelang pulang (hemat jatah TomTom), tidak sepanjang hari.

## Uji

`node tests/worker.mjs` (dari akar repo) — enkripsi Web Push (RFC 8291),
VAPID (RFC 8292), logika kapan mengirim, endpoint, dan satu putaran cron
dengan TomTom & layanan push tiruan.
