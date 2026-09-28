# wa-bot — Auto-reply WhatsApp berbasis kata kunci

Bot sederhana untuk membalas otomatis pesan WhatsApp masuk berdasarkan kata kunci,
memakai [Baileys](https://github.com/WhiskeySockets/Baileys) (library tidak
resmi, bukan API resmi Meta). Ditujukan untuk **skala kecil**, misalnya balasan
otomatis untuk bisnis pribadi.

## ⚠️ Peringatan sebelum pakai

- Ini **melanggar Ketentuan Layanan (ToS) WhatsApp** karena bukan jalur resmi.
  Ada risiko nomor kena **banned/limited**, terutama kalau:
  - dipakai untuk kirim pesan massal / broadcast ke banyak orang tanpa mereka
    memulai duluan,
  - membalas terlalu cepat/terlalu sering seperti spam,
  - dipakai di nomor utama yang penting — **sebaiknya pakai nomor WA terpisah**
    khusus bisnis, bukan nomor pribadi utama.
- Bot ini **harus tetap menyala (proses Node.js jalan terus)** di komputer/HP
  agar auto-reply aktif. Kalau laptop mati/tidur, bot berhenti membalas.
- Sesi login disimpan di folder `auth_info/` (dibuat otomatis saat pertama
  jalan). Folder ini **jangan pernah di-commit ke git** (sudah masuk
  `.gitignore`) karena isinya setara kunci akses akun WhatsApp-mu.

## Cara pakai

```bash
cd wa-bot
npm install
npm start
```

1. Terminal akan menampilkan QR code.
2. Di HP: WhatsApp → Perangkat Tertaut → Tautkan Perangkat → scan QR tersebut.
3. Setelah tersambung, bot otomatis membalas pesan pribadi (bukan grup) sesuai
   kata kunci di `replies.json`.
4. Sesi tersimpan di `auth_info/`, jadi lain kali jalankan `npm start` tidak
   perlu scan ulang (selama tidak logout dari HP).

## Mengubah balasan

Edit `replies.json`. Setiap kategori punya daftar `keywords` (dicocokkan
sebagai substring, tidak peka huruf besar/kecil) dan `reply` (teks balasan).
Kategori `default` dipakai kalau tidak ada kata kunci yang cocok — dibatasi
maksimal sekali per kontak per 4 jam (`DEFAULT_REPLY_COOLDOWN_MS` di
`bot.js`) supaya tidak terkesan spam ke orang yang sama.

Contoh struktur:

```json
{
  "nama_kategori": {
    "keywords": ["kata1", "kata2"],
    "reply": "Teks balasan"
  }
}
```

## Menjalankan terus-menerus (opsional)

Untuk pemakaian sehari-hari, jalankan lewat `pm2` supaya bot restart otomatis
kalau crash, dan tetap jalan di background:

```bash
npm install -g pm2
pm2 start bot.js --name wa-bot
pm2 save
```
