import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
/* Sapuan logika menyeluruh (di luar npm test karena lama, ±5-10 menit):
   tanggal x jam tiap 25 menit x 26 posisi (tempat, GPS jauh/dekat, kecamatan
   & km diketik) x baterai/colokan rumah/filter/"tidak pulang"/jam pulang, plus
   8 kartu pola Rencanakan. Aturan = hal yang HARUS selalu benar: tanpa NaN,
   kartu besar = langkah = saran = urutan tempat, aturan Jakarta 20:00, batas
   22:00/20:30, baterai tiba < 8% selalu disertai instruksi ngecas, dst.
   Pakai: npm run sapuan  [tanggal,tanggal,...]  [langkah menit]
   Keluar dengan kode 1 bila ada satu pelanggaran pun. Asal: pemeriksa
   independen putaran ketiga (29-09-2026). */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(ROOT, "app");
const MIME = { ".html":"text/html; charset=utf-8", ".css":"text/css", ".js":"text/javascript", ".json":"application/json", ".webmanifest":"application/manifest+json", ".png":"image/png", ".svg":"image/svg+xml" };
function serve(){
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = path.join(APP, p);
      if (!f.startsWith(APP) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control":"no-store" });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, url:`http://127.0.0.1:${srv.address().port}/` }));
  });
}
async function launch(){ return chromium.launch(); }
async function buka(browser, url, waktu, siapkan){
  const c = await browser.newContext({ locale:"id-ID", timezoneId:"Asia/Jakarta", serviceWorkers:"block" });
  const p = await c.newPage();
  const err = []; p.on("pageerror", e => err.push(e.message));
  await p.clock.setFixedTime(new Date(waktu));
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  if (siapkan){ await p.goto(url + "index.html?tanpa-mulai", { waitUntil:"load" }); await p.evaluate(siapkan); }
  await p.goto(url + "index.html?tanpa-mulai", { waitUntil:"load" });
  await p.waitForFunction(() => document.querySelector("#n-steps .step"));
  return { c, p, err };
}
const { srv, url } = await serve();
const browser = await launch();
const DATES = (process.argv[2] || "2026-10-16,2026-10-18,2027-08-17,2027-02-24,2026-12-23,2027-03-28,2027-08-16").split(",");
const STEP = +(process.argv[3] || 25);
const POS = [
  { lok:"kota" }, { lok:"stasiun" }, { lok:"alsut" }, { lok:"bsd" }, { lok:"bandara" }, { lok:"jakbar" }, { lok:"cbd" }, { lok:"jaksel" },
  { lok:"jaktim" }, { lok:"jakut" }, { lok:"depok" }, { lok:"cisauk" }, { lok:"balaraja" }, { lok:"bogor" }, { lok:"cengkareng" }, { lok:"bintaro" },
  { gps:[-6.285, 107.17], n:"cikarang" }, { gps:[-6.12, 106.15], n:"serang" }, { gps:[-6.215, 106.662], n:"dekat-rumah" }, { gps:[-6.34, 106.73], n:"pamulang" },
  { gps:[-6.175, 106.79], n:"grogol" },
  { ketik:"Kelapa Dua" }, { ketik:"Setu" }, { ketik:"Cikarang Barat" }, { ketik:"Rumah saudara", km:40 }, { ketik:"Toko teman", km:22 }
];
const SOC = [6, 10, 25, 50, 90];
const jobs = [];
DATES.forEach((d, di) => {
  for (let m = 3 * 60 + di * 3; m < 24 * 60; m += STEP){
    const hh = String(Math.floor(m / 60)).padStart(2, "0"), mm = String(m % 60).padStart(2, "0");
    jobs.push({ d, t:hh + ":" + mm, ti:jobs.length });
  }
});
const langgar = []; let dicek = 0;
async function kerja(job){
  const { d, t, ti } = job;
  const jam = +t.slice(0, 2) + +t.slice(3) / 60;
  const pakaiRehat = ti % 4 === 1 && jam > 6 && jam < 21;
  const siapkan = pakaiRehat ? new Function(`localStorage.setItem("buku-setoran-plan", JSON.stringify({ date:"${d}", keluar:5.25, pulang:21.5, rehat:[${Math.floor((jam - 0.5) * 4) / 4}, ${Math.floor((jam + 1) * 4) / 4}], zona:"tng", filter:2, bat:30.08, rumah:false, hujan:false, acara:false }));`) : null;
  let b;
  try { b = await buka(browser, url, d + "T" + t + ":00+07:00", siapkan); }
  catch (e){ langgar.push(d + " " + t + " GAGAL BUKA " + e.message); return; }
  const { c, p, err } = b;
  try {
    const hasil = await p.evaluate(([POS, SOC, ti, rencanaCek]) => {
      const out = [];
      const buruk = /NaN|undefined|Infinity|\bnull\b|\[object/;
      const txt = id => (el(id) && el(id).textContent) || "";
      navigator.geolocation.getCurrentPosition = function(ok){ ok({ coords:{ latitude:window.__la, longitude:window.__lo, accuracy:10 } }); };
      function pilih(pos){
        if (pos.lok){ const s = el("n-lok"); s.value = pos.lok; s.dispatchEvent(new Event("change", { bubbles:true })); }
        else if (pos.gps){ window.__la = pos.gps[0]; window.__lo = pos.gps[1]; gpsTerakhir = 0; deteksiLokasi(false); }
        else if (pos.ketik){ el("ketikwrap").hidden = false; el("n-ketik").value = pos.ketik; el("n-ketikkm").value = pos.km ? String(pos.km) : ""; resolveKetik(); }
      }
      POS.forEach((pos, pi) => {
        const k = ti * 7 + pi;
        const soc = SOC[k % SOC.length], rumah = (k % 3) === 0, filter = (k % 4) === 0 ? 0 : 2, stay = (k % 7) === 3;
        const pulangPilih = [null, 22, 20.5, 23.75][k % 4];
        pilih(pos);
        el("n-soc").value = soc; el("n-soc").dataset.touched = "1";
        el("n-rumah").checked = rumah; el("n-filter").value = String(filter); el("n-tujuan").value = stay ? "stay" : "rumah";
        if (pulangPilih != null && Array.from(el("n-pulang").options).some(x => +x.value === pulangPilih) && pulangPilih > jamSekarangTepat()) el("n-pulang").value = String(pulangPilih);
        runNow();
        const S = SEKARANG, o = S.o, L = S.L, M = [];
        const label = (pos.lok || pos.n || pos.ketik) + " soc" + soc + (rumah ? " rumah" : "") + " f" + filter + (stay ? " STAY" : "") + " pulang" + o.pulang;
        const tn = el("v-now").textContent, mm1 = tn.match(buruk);
        if (mm1) M.push("teks: " + tn.slice(Math.max(0, mm1.index - 70), mm1.index + 20));
        ["n-jam", "n-pulang", "n-lok", "n-bat", "n-filter", "n-tujuan", "p-keluar", "p-pulang", "p-zona", "p-filter", "p-bat", "p-tgl"].forEach(id => { if (el(id).value === "") M.push("kolom kosong " + id); });
        if (!isFinite(S.proyeksi)) M.push("proyeksi " + S.proyeksi);
        const hV = (el("verdict").querySelector("h3") || {}).textContent || "";
        const vt = el("verdict").textContent;
        const lp = S.langkah.find(x => x.dur === "pulang"), mt = lp && String(lp.t).match(/(\d\d):(\d\d)/);
        const jp = mt ? +mt[1] + +mt[2] / 60 : null;
        const batas = (o.ctx.dow === 0 && !o.ctx.holi) ? 20.5 : 22;
        if (jp != null && !o.stay){
          /* sudah lewat batas dan tidak ada jam narik: mulai = sekarang, itu sah */
          if (jp > Math.max(batas, o.keluar) + 0.02) M.push("langkah pulang " + mt[0] + " lewat batas " + batas);
          if (jp < o.keluar - 0.02) M.push("langkah pulang " + mt[0] + " sebelum sekarang");
        }
        const adaKerja = S.r.pieces.some(adaJamNarik);
        const PULANG = /^(Waktunya pulang|Selesai untuk hari ini|Ngecas dulu, lalu pulang|Pulang sekarang)$/;
        const jedaNow = /Menurut rencana, jam ini istirahat/.test(hV);
        if (!o.stay && !adaKerja && !PULANG.test(hV) && !jedaNow) M.push("tanpa narik tapi kartu: " + hV);
        /* langkah kerja tanpa jam narik (hanya pindah) tampil sebagai langkah */
        const kosong = S.r.pieces.filter(q => !q.jeda && !(q.jamJalan > 0.01));
        if (kosong.length && !adaKerja && !o.stay) M.push("langkah kerja kosong saat habis: " + kosong.map(q => hhmm(q.s) + "-" + hhmm(q.e) + "@" + (q.tempat ? q.tempat.id : o.zona)).join(","));
        /* kartu 'berangkat sekarang' vs langkah pulang nanti */
        if (PULANG.test(hV) && /berangkat sekarang/.test(vt) && jp != null && jp > o.keluar + 0.05) M.push("kartu berangkat sekarang, langkah pulang " + mt[0]);
        if (hV === "Pulang sekarang" && jp != null && jp > o.keluar + 0.05) M.push("kartu Pulang sekarang, langkah pulang " + mt[0]);
        /* menit perjalanan kartu vs jarak posisi */
        const pm = vt.match(/Perjalanan pulang ±(\d+) menit/);
        if (pm && L.home > 15 && +pm[1] < L.home * 0.5) M.push("kartu 'perjalanan pulang ±" + pm[1] + " menit' dari " + L.n + " (" + Math.round(L.home) + " km)");
        /* jam mulai pulang di kartu vs langkah */
        const kp = vt.match(/[Mm]ulai pulang jam (\d\d:\d\d)|jam mulai pulang (\d\d:\d\d)/);
        const kpj = kp && (kp[1] || kp[2]);
        if (kpj && mt && kpj !== mt[0]) M.push("kartu mulai pulang " + kpj + " vs langkah " + mt[0]);
        const ls = S.langkah.map(x => (x.i || "") + " " + (x.s || "")).join(" ").match(/Mulai pulang jam (?:<b>)?(\d\d:\d\d)/g) || [];
        const beda = [...new Set(ls.map(x => x.slice(-5)))].filter(x => !mt || x !== mt[0]);
        if (beda.length && !o.stay) M.push("langkah 'Mulai pulang jam " + beda.join("/") + "' vs langkah pulang " + (mt ? mt[0] : "-"));
        /* baterai negatif di teks mana pun; rute kosong di "Mau ke tempat lain?" */
        const neg = tn.match(/±-\d|[^\d\w]-\d+ ?(%|→|&rarr;)|\s-\d+\s?→/);
        if (neg) M.push("baterai negatif: " + tn.slice(Math.max(0, neg.index - 60), neg.index + 20));
        if (!el("peluang").hidden && /Pindah 0 kali/.test(txt("peluang"))) M.push("rute kosong 'Pindah 0 kali'");
        if (S.peluang && S.peluang.daftar && S.peluang.daftar.some(x => !x.segmen.some(g => !g.jeda))) M.push("rute tanpa segmen narik");
        if (S.peluang && S.peluang.daftar) S.peluang.daftar.forEach(x => { if (!x.diam && !o.stay && x.r.socTiba < 0.03) M.push("rute tiba rumah " + Math.round(x.r.socTiba * 100) + "%"); });
        /* Tidak pulang: tidak ada kalimat pulang di kartu, langkah, dan daftar tempat;
           baris "Tidak pulang" sesudah narik terakhir */
        if (o.stay){
          const tks = [vt, txt("rek-list"), el("peluang").hidden ? "" : txt("peluang"), ...S.langkah.filter(x => x.dur !== "pulang").map(x => (x.b || "") + " " + (x.s || "") + " " + (x.i || ""))].join(" ");
          const mp = tks.match(/Waktunya pulang|[Mm]ulai (jalan )?pulang|jalan pulang|pulang istirahat|[Pp]ulang, makan|pulang 20:30|[Kk]eluar Jakarta|(&rarr;|→) ?Modernland|Filter tujuan|arah rumah|ke arah barat|order ke barat|paling telat 2[02]|[Ss]udah malam|[Bb]alik ke|[Pp]ulang sebentar|searah pulang|searah rumah/) || tks.match(/sampai pulang|Pulang \d+ km|sampai rumah|Mulai pulang dari sana/);
          if (mp) M.push("tidak pulang tapi '" + mp[0] + "'");
          const akhirKerja = Math.max(0, ...S.r.pieces.filter(q => !q.jeda).map(q => q.e));
          if (jp != null && jp < akhirKerja - 0.02) M.push("baris Tidak pulang " + mt[0] + " sebelum narik selesai " + hhmm(akhirKerja));
        }
        /* Jakarta lewat 20:00 */
        if (!o.stay && S.r.pieces.some(q => !q.jeda && q.jamJalan > 0.05 && q.e > 20.05 && (q.tempat ? q.tempat.z === "jkt" : (q.zonaT ? q.zonaT === ZONA.jkt : o.zona === "jkt")))) M.push("narik Jakarta lewat 20:00 (" + (S.r.pieces.find(q => !q.jeda && q.e > 20.05 && !q.tempat) ? "tanpa urutan" : "urutan") + ")");
        if (!o.stay && L.z === "jkt" && o.keluar >= 20 && /Order terakhir|Bertahan di Jakarta|Antar orang pulang|Narik dulu di sini/.test(vt)) M.push("kartu Jakarta lewat 20:00: " + hV);
        /* baterai tiba < 0 tanpa ngecas */
        const homeI = lp ? (lp.i || "") : "";
        if (!o.stay && S.r.socTiba < 0.08 && !/ngecas dulu|mampir SPKLU|colok di rumah|ngecas malam ini/.test(homeI)) M.push("tiba " + Math.round(S.r.socTiba * 100) + "% tanpa ngecas di langkah pulang");
        if (!o.stay && S.r.socTiba < 0.08 && !adaKerja && hV === "Waktunya pulang") M.push("kartu 'Waktunya pulang' padahal tiba " + Math.round(S.r.socTiba*100) + "%");
        if (hV === "Selesai untuk hari ini" && /SPKLU terdekat sebelum pulang/.test(homeI)) M.push("kartu Selesai (di rumah) vs langkah 'ngecas dulu di SPKLU sebelum pulang'" + (o.rumah ? " [colokan rumah]" : ""));
        /* sisa jam */
        const side = el("n-side").textContent, sm = side.match(/Sisa(-?[\d.,]+) jam kerja/);
        if (!sm || parseFloat(sm[1].replace(",", ".")) < 0) M.push("Sisa jam aneh: " + side.slice(0, 80));
        /* tetap di sini */
        if (S.rek && S.rek.basis && !o.stay){
          const utama = Math.round(S.r.net - insentifSebelum(o)), rek = Math.round(S.rek.basis.sisa);
          if (Math.abs(utama - rek) > 1) M.push("tetap-di-sini: utama " + utama + " vs saran " + rek);
          const pel = S.peluang && S.peluang.basis && Math.round(S.peluang.basis.net);
          if (pel != null && Math.abs(utama - pel) > 1) M.push("tetap-di-sini: utama " + utama + " vs urutan " + pel);
        }
        if (S.peluang && S.peluang.daftar && S.peluang.daftar.length){
          const kunci = S.peluang.daftar.map(x => x.segmen.map(sg => (sg.tempat ? sg.tempat.id : "-") + sg.s.toFixed(2) + sg.e.toFixed(2)).join("|") + Math.round(x.net));
          if (new Set(kunci).size !== kunci.length) M.push("urutan kembar: " + kunci.join(" || ").slice(0, 200));
          const teks = [...el("peluang-list").querySelectorAll(".rek-item")].map(e => e.textContent.replace(/^\d+/, ""));
          if (new Set(teks).size !== teks.length) M.push("kartu urutan identik");
          if (!o.stay && !adaKerja) M.push("urutan tempat ditawarkan setelah habis");
        }
        if (S.rek && S.rek.daftar){
          const nm = S.rek.daftar.map(x => x.n);
          if (new Set(nm).size !== nm.length) M.push("saran tempat kembar: " + nm.join(","));
          S.rek.daftar.forEach(x => {
            const kerjaX = x.r && x.r.pieces.some(adaJamNarik);
            if (!o.stay && x.r && !kerjaX && x.saran && !PULANG.test(x.saran.h)) M.push("saran " + x.n + ": tanpa narik tapi '" + x.saran.h + "'");
          });
        }
        /* istirahat rencana: kartu istirahat tapi langkah pertama kerja */
        if (jedaNow && S.langkah[0] && S.langkah[0].dur !== "istirahat") M.push("kartu istirahat tapi langkah pertama " + S.langkah[0].b);
        if (M.length) out.push({ label, L:L.n + "/" + L.z + "/" + Math.round(L.home) + (L.lat != null ? "" : "/nocoord"), hV, M });
      });
      /* Rencanakan: 8 pola */
      if (rencanaCek){
        const zona = ["tng", "jkt", "mix", "apt"][ti % 4];
        el("p-zona").value = zona; el("p-filter").value = ti % 2 ? "0" : "2"; runPlan();
        document.querySelectorAll("#cmp .pola").forEach((b, i) => {
          const pb = document.querySelectorAll("#cmp .pola")[i]; pb.click();
          const M = [], tp = el("v-plan").textContent, mb = tp.match(buruk);
          if (mb) M.push("teks rencana: " + tp.slice(Math.max(0, mb.index - 70), mb.index + 20));
          if (document.querySelectorAll("#cmp .pola").length !== 8 || document.querySelectorAll("#cmp .pola.best").length < 1) M.push("kartu pola");
          const st = [...el("p-steps").querySelectorAll(".step")].map(s => s.textContent);
          const home = st.find(s => /Waktunya pulang/.test(s)), hm = home && home.match(/mulai\s*(\d\d):(\d\d)/);
          const ctx = dayCtx(el("p-tgl").value), batas = (ctx.dow === 0 && !ctx.holi) ? 20.5 : 22;
          if (hm && +hm[1] + +hm[2] / 60 > batas + 0.01) M.push("rencana pulang " + hm[0] + " lewat batas");
          if (!/Rp/.test(el("p-net").textContent)) M.push("p-net kosong");
          if (M.length) out.push({ label:"pola " + i + " " + zona + " tgl " + el("p-tgl").value, M });
        });
      }
      return out;
    }, [POS, SOC, ti, ti % 3 === 0]);
    dicek += POS.length;
    hasil.forEach(h => langgar.push({ w:d + " " + t + (pakaiRehat ? " [rehat]" : ""), ...h }));
    err.forEach(e => langgar.push({ w:d + " " + t, M:["pageerror " + e] }));
  } catch (e){ langgar.push({ w:d + " " + t, M:["EVAL " + e.message.slice(0, 300)] }); }
  await c.close();
}
const N = 6; let idx = 0;
await Promise.all(Array.from({ length:N }, async () => { while (idx < jobs.length){ const j = jobs[idx++]; await kerja(j); } }));
if (process.env.SAPUAN_OUT) fs.writeFileSync(process.env.SAPUAN_OUT, JSON.stringify({ dicek, jobs:jobs.length, langgar }, null, 1));
console.log("sapuan: " + dicek + " situasi, " + jobs.length + " pembukaan halaman, " + langgar.length + " pelanggaran");
const ringkas = {};
langgar.forEach(l => (l.M || []).forEach(m => { const k = m.replace(/[\d:.,±%-]+/g, "#").slice(0, 70); ringkas[k] = (ringkas[k] || 0) + 1; }));
Object.entries(ringkas).sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, n]) => console.log("  " + n + "x  " + k));
langgar.slice(0, 20).forEach(l => console.log("  - " + l.w + " " + (l.label || "") + " " + (l.L || "") + " | " + (l.M || []).join("; ")));
await browser.close(); srv.close();
process.exit(langgar.length ? 1 : 0);
