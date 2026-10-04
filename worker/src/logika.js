/* Keputusan server peringatan -- fungsi murni (tanpa jaringan/KV), diuji di
   tests/worker.mjs. Semua waktu dalam milidetik epoch; tanggal & jam
   ditampilkan dalam WIB (UTC+7, Indonesia tidak memakai jam musim panas).

   Rencana (dikirim aplikasi Ibu tiap kali berubah):
     { id, tgl:"YYYY-MM-DD" (WIB), stay, mulaiPulang, batasMulai, pulang,
       menitApp, pos:{lat,lon}, rumah:{lat,lon}, tempat,
       bateraiKritisPada, socKritis, socMin, dikirimHP:["pulang","bat"] }
   Ditambah server: diperbarui, terkirim:{pulang,pulangUntuk,bat,macet},
   cek (jam cek TomTom terakhir), live (menit), mulaiServer, mulaiServerAt. */

export const MENIT = 60e3;
const WIB = 7 * 3600e3;

export function tglWIB(t){ return new Date(t + WIB).toISOString().slice(0, 10); }
export function jamWIB(t){ return new Date(t + WIB).toISOString().slice(11, 16); }

/* jam mulai pulang yang berlaku: rencana HP, atau hasil cek macet server
   yang lebih awal (<= 20 menit lalu) */
export function mulaiEfektif(r, kini){
  let m = r.mulaiPulang;
  if (r.mulaiServer != null && kini - (r.mulaiServerAt || 0) <= 20 * MENIT && (m == null || r.mulaiServer < m)) m = r.mulaiServer;
  return m;
}
function jarakKm(a, b){
  const dLat = (b.lat - a.lat) * 111.2, dLon = (b.lon - a.lon) * 111.2 * Math.cos(a.lat * Math.PI / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/* Gabungkan rencana baru dari HP dengan catatan server untuk hari yang sama. */
export function gabungRencana(lama, baru, kini){
  const r = Object.assign({}, baru, { diperbarui:kini, terkirim:{} });
  if (lama && lama.tgl === baru.tgl){
    r.terkirim = Object.assign({}, lama.terkirim || {});
    ["cek", "live"].forEach(k => { if (lama[k] != null) r[k] = lama[k]; });
    /* jam mulai hasil cek macet hanya berlaku untuk jam pulang yang sama */
    if (lama.pulang === baru.pulang) ["mulaiServer", "mulaiServerAt"].forEach(k => { if (lama[k] != null) r[k] = lama[k]; });
    /* rencana pulang digeser jauh lebih malam sesudah "waktunya pulang" terkirim: dipasang lagi */
    if (r.terkirim.pulang && r.mulaiPulang != null && r.mulaiPulang > (r.terkirim.pulangUntuk || 0) + 10 * MENIT){ delete r.terkirim.pulang; delete r.terkirim.pulangUntuk; }
  }
  /* yang sudah diperingatkan HP sendiri (aplikasi terbuka) tidak dikirim lagi */
  (baru.dikirimHP || []).forEach(k => { if (!r.terkirim[k]) r.terkirim[k] = kini; if (k === "pulang" && r.mulaiPulang != null) r.terkirim.pulangUntuk = r.mulaiPulang; });
  return r;
}

/* Perlu cek jalan pulang ke TomTom sekarang? 90 menit menjelang mulai pulang, tiap 15 menit. */
export function perluCekMacet(r, kini){
  const m = mulaiEfektif(r, kini);
  if (r.stay || m == null || !r.pos || !r.rumah || r.terkirim && r.terkirim.pulang) return false;
  if (jarakKm(r.pos, r.rumah) < 1) return false;
  if (kini < m - 90 * MENIT || kini > m + 5 * MENIT) return false;
  return !r.cek || kini - r.cek >= 15 * MENIT;
}

/* Satu putaran (tiap 5 menit). live = menit jalan pulang sekarang dari TomTom
   (hanya bila perluCekMacet dan berhasil), atau null.
   Hasil: { hapus, kirim:[{tag, judul, isi}], rencana (sesudah diubah) } */
export function putuskan(r0, kini, live){
  const r = JSON.parse(JSON.stringify(r0)); r.terkirim = r.terkirim || {};
  const kirim = [];
  if (r.stay || r.tgl !== tglWIB(kini) || kini - (r.diperbarui || 0) > 18 * 3600e3) return { hapus:true, kirim, rencana:r };

  /* 1) jalan pulang lebih macet dari hitungan aplikasi */
  if (typeof live === "number" && live > 0){
    const lama = mulaiEfektif(r, kini);
    r.cek = kini; r.live = live;
    let baru = r.pulang - (live + 15) * MENIT;
    if (r.batasMulai != null) baru = Math.min(baru, r.batasMulai);
    const lebih = live - (r.menitApp || 0);
    /* tiap cek memperbarui jam mulai server (berlaku 20 menit, cek tiap 15 menit);
       pesan hanya bila jauh lebih macet dan bertambah >= 10 menit sejak pesan terakhir */
    r.mulaiServer = (r.mulaiPulang == null || baru < r.mulaiPulang) ? baru : null; r.mulaiServerAt = kini;
    if (lama != null && lebih >= 10 && baru < lama - 10 * MENIT && lebih - (r.terkirim.macet || 0) >= 10){
      r.terkirim.macet = lebih;
      kirim.push({ tag:"macet", judul:"Jalan pulang macet +" + Math.round(lebih) + " menit",
        isi:baru <= kini ? "Berangkat pulang sekarang, tiba ±" + jamWIB(kini + live * MENIT) + "." : "Mulai pulang jam " + jamWIB(baru) + " (tadi " + jamWIB(lama) + ")." });
    }
  }
  /* 2) waktunya jalan pulang */
  const m = mulaiEfektif(r, kini);
  if (m != null && !r.terkirim.pulang && kini >= m - 2 * MENIT && kini <= r.pulang + 60 * MENIT){
    r.terkirim.pulang = kini; r.terkirim.pulangUntuk = m;
    const segar = r.live && r.cek && kini - r.cek <= 20 * MENIT;
    kirim.push({ tag:"pulang", judul:"Waktunya jalan pulang",
      isi:segar ? "Berangkat sekarang, tiba ±" + jamWIB(kini + r.live * MENIT) + "." : "Mulai jalan pulang sekarang (rencana tiba " + jamWIB(r.pulang) + ")." });
  }
  /* 3) baterai menurut perkiraan habis dan HP belum mengabari lagi (belum dicatat ngecas) */
  if (r.bateraiKritisPada != null && !r.terkirim.bat && kini >= r.bateraiKritisPada && (r.diperbarui || 0) < r.bateraiKritisPada){
    r.terkirim.bat = kini;
    kirim.push({ tag:"bat", judul:"Baterai mungkin tidak cukup sampai rumah",
      isi:"Perkiraan ±" + Math.round(r.socKritis || 0) + "%" + (r.tempat ? " di " + r.tempat : "") + ", pulang butuh ±" + Math.round(r.socMin || 0) + "%. Ngecas dulu; kalau sudah, catat % di aplikasi." });
  }
  return { hapus:false, kirim, rencana:r };
}
