/* Uji server peringatan (worker/): enkripsi Web Push, VAPID, logika
   keputusan, endpoint, dan satu putaran cron dengan KV + jaringan tiruan.
   Jalankan: node tests/worker.mjs */
import crypto from "node:crypto";
import { enkripsi, headerVapid, b64u, dariB64u, kirimPush } from "../worker/src/webpush.js";
import { gabungRencana, perluCekMacet, putuskan, tglWIB, jamWIB, MENIT } from "../worker/src/logika.js";
import { tanganiPermintaan, putaran } from "../worker/src/index.js";

let lolos = 0, gagal = 0;
function ok(c, pesan, extra){ if (c){ lolos++; console.log("  ok   " + pesan); } else { gagal++; console.log("  FAIL " + pesan + (extra ? "\n       " + extra : "")); } }

/* Pembuka pesan sisi browser, ditulis ulang dengan crypto Node (bukan kode server) */
function buka(sandi, ua, auth){
  const b = Buffer.from(sandi), salt = b.subarray(0, 16), idlen = b[20], asPub = b.subarray(21, 21 + idlen), isi = b.subarray(21 + idlen);
  const ecdh = ua.computeSecret(asPub);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", ecdh, auth, Buffer.concat([Buffer.from("WebPush: info\0"), ua.getPublicKey(), asPub]), 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce); d.setAuthTag(isi.subarray(isi.length - 16));
  const polos = Buffer.concat([d.update(isi.subarray(0, isi.length - 16)), d.final()]);
  if (polos[polos.length - 1] !== 2) throw new Error("pembatas rekaman salah");
  return polos.subarray(0, polos.length - 1).toString();
}
async function kunciVapid(){
  const kp = await crypto.webcrypto.subtle.generateKey({ name:"ECDSA", namedCurve:"P-256" }, true, ["sign"]);
  const pub = new Uint8Array(await crypto.webcrypto.subtle.exportKey("raw", kp.publicKey));
  return { publik:b64u(pub), privat:(await crypto.webcrypto.subtle.exportKey("jwk", kp.privateKey)).d, subject:"mailto:uji@contoh.id" };
}

console.log("1. Web Push: enkripsi aes128gcm (RFC 8291) dan VAPID (RFC 8292)");
const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
const auth = crypto.randomBytes(16);
{
  const teks = JSON.stringify({ judul:"Waktunya jalan pulang", isi:"Berangkat sekarang, tiba ±21:20." });
  const s = await enkripsi(teks, new Uint8Array(ua.getPublicKey()), new Uint8Array(auth));
  let balik = null; try { balik = buka(s, ua, auth); } catch (e) { balik = "galat: " + e.message; }
  ok(balik === teks && new DataView(s.buffer).getUint32(16) === 4096 && s[20] === 65, "pesan terenkripsi bisa dibuka browser (pembuka independen), rs 4096, keyid 65 byte", balik);
  const s2 = await enkripsi(teks, new Uint8Array(ua.getPublicKey()), new Uint8Array(auth));
  ok(Buffer.compare(Buffer.from(s.slice(0, 16)), Buffer.from(s2.slice(0, 16))) !== 0, "salt acak tiap pesan");
  const v = await kunciVapid();
  const h = await headerVapid("https://fcm.googleapis.com/fcm/send/xyz", v, 1800000000);
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h);
  const pub = dariB64u(v.publik), kp = crypto.createPublicKey({ key:{ kty:"EC", crv:"P-256", x:b64u(pub.slice(1, 33)), y:b64u(pub.slice(33, 65)) }, format:"jwk" });
  const sah = m && crypto.verify("sha256", Buffer.from(m[1] + "." + m[2]), { key:kp, dsaEncoding:"ieee-p1363" }, Buffer.from(dariB64u(m[3])));
  const klaim = m && JSON.parse(Buffer.from(dariB64u(m[2])).toString());
  ok(sah && klaim.aud === "https://fcm.googleapis.com" && klaim.exp === 1800000000 + 43200 && klaim.sub === v.subject && m[4] === v.publik,
     "JWT VAPID sah (ES256), aud = origin layanan push, berlaku 12 jam, k = kunci publik", JSON.stringify(klaim));
}

console.log("2. Logika: kapan mengirim");
const T = (j, m) => Date.parse("2026-10-13T" + String(j).padStart(2, "0") + ":" + String(m || 0).padStart(2, "0") + ":00+07:00");
const dasar = () => ({ id:"hp-uji-0001", tgl:"2026-10-13", stay:false, mulaiPulang:T(20, 30), batasMulai:T(22), pulang:T(21, 30), menitApp:45,
  pos:{ lat:-6.17, lon:106.78 }, rumah:{ lat:-6.1973, lon:106.6362 }, tempat:"Jakarta Barat", bateraiKritisPada:null, diperbarui:T(18), terkirim:{} });
{
  ok(tglWIB(T(23, 50)) === "2026-10-13" && jamWIB(T(20, 5)) === "20:05", "tanggal & jam WIB");
  ok(!perluCekMacet(dasar(), T(18, 50)) && perluCekMacet(dasar(), T(19, 0)) && !perluCekMacet(Object.assign(dasar(), { cek:T(18, 55) }), T(19, 5)) && perluCekMacet(Object.assign(dasar(), { cek:T(18, 55) }), T(19, 10)),
     "cek TomTom hanya 90 menit menjelang mulai pulang, paling sering tiap 15 menit");
  ok(!perluCekMacet(Object.assign(dasar(), { pos:{ lat:-6.198, lon:106.637 } }), T(19, 30)), "di rumah (< 1 km): tidak cek macet");
  const a = putuskan(dasar(), T(19, 30), 75);
  ok(a.kirim.length === 1 && a.kirim[0].tag === "macet" && /\+30 menit/.test(a.kirim[0].judul) && /Mulai pulang jam 20:00 \(tadi 20:30\)/.test(a.kirim[0].isi) && a.rencana.mulaiServer === T(20),
     "macet 75 menit (aplikasi 45): kirim 'Jalan pulang macet +30 menit — mulai pulang 20:00 (tadi 20:30)'", JSON.stringify(a.kirim));
  const b = putuskan(a.rencana, T(19, 45), 78);
  ok(b.kirim.length === 0, "macet sedikit bertambah (+3): tidak dikirim lagi", JSON.stringify(b.kirim));
  const c = putuskan(b.rencana, T(19, 58), null);
  ok(c.kirim.length === 1 && c.kirim[0].tag === "pulang" && /tiba ±21:16/.test(c.kirim[0].isi), "19:58: 'Waktunya jalan pulang' memakai jam mulai yang dimajukan macet", JSON.stringify(c.kirim));
  ok(putuskan(c.rencana, T(20, 3), null).kirim.length === 0, "'Waktunya jalan pulang' sekali saja");
  const d = putuskan(dasar(), T(20, 29), null);
  ok(d.kirim.length === 1 && /rencana tiba 21:30/.test(d.kirim[0].isi), "tanpa cek macet: dikirim di jam mulai pulang rencana", JSON.stringify(d.kirim));
  const bat = Object.assign(dasar(), { bateraiKritisPada:T(17), socKritis:18, socMin:24, diperbarui:T(15) });
  const e1 = putuskan(bat, T(17, 5), null), e2 = putuskan(Object.assign({}, bat, { diperbarui:T(17, 2) }), T(17, 5), null);
  ok(e1.kirim.some(k => k.tag === "bat" && /±18%/.test(k.isi) && /±24%/.test(k.isi)) && !e2.kirim.some(k => k.tag === "bat"),
     "baterai: dikirim bila perkiraan habis dan HP belum mengabari sesudahnya; HP sudah mengabari = tidak", JSON.stringify(e1.kirim));
  ok(putuskan(dasar(), Date.parse("2026-10-14T05:00:00+07:00"), null).hapus && putuskan(Object.assign(dasar(), { stay:true }), T(19), null).hapus,
     "besok / Tidak pulang: rencana dihapus, tidak ada kiriman");
  const g = gabungRencana(c.rencana, Object.assign(dasar(), { mulaiPulang:T(21, 15), pulang:T(22, 15) }), T(20, 10));
  const g2 = gabungRencana(b.rencana, dasar(), T(19, 50));
  ok(!g.terkirim.pulang && g.mulaiServer == null && g2.mulaiServer === b.rencana.mulaiServer && g2.mulaiServer != null,
     "Ibu menggeser pulang lebih malam: 'waktunya pulang' dipasang lagi, jam hasil cek macet lama dibuang; jam pulang sama: disimpan", JSON.stringify({ g:g.terkirim, gs:g.mulaiServer, g2:g2.mulaiServer }));
  const h = gabungRencana(null, Object.assign(dasar(), { dikirimHP:["pulang"] }), T(20, 31));
  ok(h.terkirim.pulang === T(20, 31) && putuskan(h, T(20, 32), null).kirim.length === 0, "sudah diperingatkan aplikasi yang terbuka: server tidak mengirim lagi");
}

console.log("3. Endpoint: sandi, CORS, simpan langganan & rencana");
function kvTiruan(){
  const m = new Map();
  return { m, get:async k => m.has(k) ? m.get(k) : null, put:async (k, v) => { m.set(k, v); }, delete:async k => { m.delete(k); },
           list:async ({ prefix }) => ({ keys:[...m.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name })), list_complete:true }) };
}
const v = await kunciVapid();
const env = { SANDI:"sandi-uji-123", VAPID_PUBLIC:v.publik, VAPID_PRIVATE:v.privat, VAPID_SUBJECT:v.subject, TOMTOM_KEY:"tt-uji", PERINGATAN:kvTiruan() };
const minta = (path, body, sandi, method) => tanganiPermintaan(new Request("https://server.contoh" + path, { method:method || "POST",
  headers:Object.assign({ "Content-Type":"application/json" }, sandi === undefined ? { "X-Sandi":env.SANDI } : sandi ? { "X-Sandi":sandi } : {}), body:body ? JSON.stringify(body) : undefined }), env, T(18));
const langg = { endpoint:"https://push.contoh/kirim/abc", keys:{ p256dh:b64u(ua.getPublicKey()), auth:b64u(auth) } };
{
  const r0 = await minta("/vapid", null, null, "GET"), j0 = await r0.json();
  const pre = await minta("/rencana", null, null, "OPTIONS");
  ok(j0.publik === v.publik && pre.status === 204 && pre.headers.get("Access-Control-Allow-Origin") === "https://chrissdr1.github.io" && /X-Sandi/.test(pre.headers.get("Access-Control-Allow-Headers")),
     "GET /vapid memberi kunci publik; CORS hanya untuk aplikasi Ibu (chrissdr1.github.io)");
  const tanpa = await minta("/langganan", { id:"hp-uji-0001", langganan:langg }, null), salah = await minta("/langganan", { id:"hp-uji-0001", langganan:langg }, "salah");
  const tanpaSandiServer = await tanganiPermintaan(new Request("https://s/langganan", { method:"POST", headers:{ "X-Sandi":"" }, body:"{}" }), Object.assign({}, env, { SANDI:"" }), T(18));
  ok(tanpa.status === 401 && salah.status === 401 && tanpaSandiServer.status === 401 && !env.PERINGATAN.m.size, "tanpa / salah sandi: ditolak, tidak ada yang tersimpan (server tanpa SANDI menolak semua)");
  const idJelek = await minta("/langganan", { id:"../x", langganan:langg }), httpJelek = await minta("/langganan", { id:"hp-uji-0001", langganan:{ endpoint:"http://x", keys:langg.keys } });
  ok(idJelek.status === 400 && httpJelek.status === 400, "id / alamat langganan tidak sah ditolak");
  const r1 = await minta("/langganan", { id:"hp-uji-0001", langganan:langg }), r2 = await minta("/rencana", { id:"hp-uji-0001", rencana:dasar() });
  ok(r1.status === 200 && r2.status === 200 && env.PERINGATAN.m.has("sub:hp-uji-0001") && JSON.parse(env.PERINGATAN.m.get("ren:hp-uji-0001")).diperbarui === T(18),
     "langganan & rencana tersimpan", await r2.text());
}

console.log("4. Satu putaran cron: TomTom tiruan + layanan push tiruan");
{
  const kiriman = [], tomtom = [];
  const f = async (u, o) => {
    if (/api\.tomtom\.com/.test(u)){ tomtom.push(u); return { ok:true, json:async () => ({ routes:[{ summary:{ travelTimeInSeconds:75 * 60 } }] }) }; }
    kiriman.push(buka(o.body, ua, auth)); return { status:201 };
  };
  const h1 = await putaran(env, T(19, 30), f);
  ok(tomtom.length === 1 && /traffic=true/.test(tomtom[0]) && /-6\.17,106\.78:-6\.1973,106\.6362/.test(tomtom[0]) && kiriman.length === 1 && /macet/.test(JSON.parse(kiriman[0]).judul),
     "19:30: cek TomTom sekali, kirim 'jalan pulang macet' (isi terenkripsi terbuka di HP)", JSON.stringify({ tomtom, kiriman, h1 }));
  await putaran(env, T(19, 35), f);
  ok(tomtom.length === 1, "5 menit kemudian: TomTom tidak diminta lagi (jatah)");
  await putaran(env, T(20, 0), f);
  ok(kiriman.length === 2 && /Waktunya jalan pulang/.test(JSON.parse(kiriman[1]).judul), "20:00: 'Waktunya jalan pulang'", JSON.stringify(kiriman));
  /* langganan kedaluwarsa (410): dihapus */
  await minta("/rencana", { id:"hp-uji-0001", rencana:Object.assign(dasar(), { mulaiPulang:T(21, 40), pulang:T(22, 30) }) });
  const f410 = async (u) => /tomtom/.test(u) ? { ok:true, json:async () => ({ routes:[{ summary:{ travelTimeInSeconds:2700 } }] }) } : { status:410 };
  await putaran(env, T(21, 40), f410);
  ok(!env.PERINGATAN.m.has("sub:hp-uji-0001"), "layanan push menjawab 410 (langganan kedaluwarsa): langganan dihapus");
  const r3 = await minta("/henti", { id:"hp-uji-0001" });
  ok(r3.status === 200 && !env.PERINGATAN.m.has("ren:hp-uji-0001"), "/henti menghapus rencana & langganan");
}

console.log("5. sw.js: pesan push tampil sebagai notifikasi (aplikasi tertutup)");
{
  const { readFileSync } = await import("node:fs");
  const kode = readFileSync(new URL("../app/sw.js", import.meta.url), "utf8");
  const dengar = {}, tampil = [];
  const self = { addEventListener:(n, f) => { dengar[n] = f; }, registration:{ showNotification:async (j, o) => { tampil.push({ j, o }); } },
                 clients:{ matchAll:async () => [], openWindow:async () => null }, skipWaiting(){}, location:{ origin:"https://chrissdr1.github.io" } };
  new Function("self", "caches", "fetch", kode)(self, { open:async () => ({}), keys:async () => [] }, async () => ({}));
  let tunggu = null;
  dengar.push && dengar.push({ data:{ json:() => ({ judul:"Waktunya jalan pulang", isi:"Berangkat sekarang.", tag:"pulang" }) }, waitUntil:p => { tunggu = p; } });
  await tunggu;
  ok(tampil.length === 1 && tampil[0].j === "Waktunya jalan pulang" && tampil[0].o.body === "Berangkat sekarang." && tampil[0].o.tag === "pulang" && tampil[0].o.renotify,
     "push dari server -> notifikasi dengan judul, isi, dan tag yang sama dengan peringatan aplikasi", JSON.stringify(tampil));
}

console.log(`\nserver peringatan: ${lolos} lolos, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
