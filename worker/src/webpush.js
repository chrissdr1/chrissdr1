/* Web Push tanpa library, hanya WebCrypto (ada di Cloudflare Workers dan
   Node 18+):
   - isi pesan dienkripsi menurut RFC 8291 ("aes128gcm", RFC 8188), dan
   - permintaan ditandatangani VAPID (RFC 8292, JWT ES256).
   Diuji dengan pembanding independen (paket http_ece / web-push) di
   tests/worker.mjs. */

const te = new TextEncoder();

export function b64u(bytes){
  let s = ""; const b = new Uint8Array(bytes);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function dariB64u(str){
  const s = String(str).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function gabung(...bagian){
  const n = bagian.reduce((a, b) => a + b.length, 0), out = new Uint8Array(n);
  let o = 0; for (const b of bagian){ out.set(b, o); o += b.length; }
  return out;
}
async function hkdf(salt, ikm, info, panjang){
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name:"HKDF", hash:"SHA-256", salt, info }, k, panjang * 8));
}

/* Enkripsi isi untuk satu langganan (RFC 8291 bagian 3-4).
   uaPublic: kunci p256dh browser (65 byte), auth: 16 byte.
   uji: { asKeyPair, salt } hanya untuk tes dengan nilai tetap. */
export async function enkripsi(teks, uaPublic, auth, uji){
  const as = (uji && uji.asKeyPair) || await crypto.subtle.generateKey({ name:"ECDH", namedCurve:"P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", as.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name:"ECDH", namedCurve:"P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name:"ECDH", public:uaKey }, as.privateKey, 256));
  const keyInfo = gabung(te.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(auth, ecdh, keyInfo, 32);
  const salt = (uji && uji.salt) || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const isi = gabung(te.encode(teks), new Uint8Array([2]));   /* satu rekaman = rekaman terakhir: pembatas 0x02 */
  const kunci = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sandi = new Uint8Array(await crypto.subtle.encrypt({ name:"AES-GCM", iv:nonce }, kunci, isi));
  const rs = 4096, kepala = new Uint8Array(16 + 4 + 1 + asPublic.length);
  kepala.set(salt, 0);
  new DataView(kepala.buffer).setUint32(16, rs);
  kepala[20] = asPublic.length; kepala.set(asPublic, 21);
  return gabung(kepala, sandi);
}

/* Kunci privat VAPID (d, 32 byte) + publik (65 byte) -> CryptoKey ES256 */
async function kunciVapid(publik, privat){
  const pub = dariB64u(publik), d = dariB64u(privat);
  return crypto.subtle.importKey("jwk", { kty:"EC", crv:"P-256", x:b64u(pub.slice(1, 33)), y:b64u(pub.slice(33, 65)), d:b64u(d), ext:true },
    { name:"ECDSA", namedCurve:"P-256" }, false, ["sign"]);
}
/* Header Authorization VAPID (RFC 8292): "vapid t=<JWT>, k=<kunci publik>" */
export async function headerVapid(endpoint, vapid, kiniDetik){
  const aud = new URL(endpoint).origin;
  const exp = (kiniDetik || Math.floor(Date.now() / 1000)) + 12 * 3600;
  const kepala = b64u(te.encode(JSON.stringify({ typ:"JWT", alg:"ES256" })));
  const klaim = b64u(te.encode(JSON.stringify({ aud, exp, sub:vapid.subject })));
  const kunci = await kunciVapid(vapid.publik, vapid.privat);
  const ttd = new Uint8Array(await crypto.subtle.sign({ name:"ECDSA", hash:"SHA-256" }, kunci, te.encode(kepala + "." + klaim)));
  return "vapid t=" + kepala + "." + klaim + "." + b64u(ttd) + ", k=" + vapid.publik;
}

/* Kirim satu notifikasi. langganan = PushSubscription.toJSON() dari browser.
   Hasil: { ok, status, hapus } -- hapus=true bila langganan sudah tidak berlaku (404/410). */
export async function kirimPush(langganan, pesan, vapid, opsi){
  opsi = opsi || {};
  const badan = await enkripsi(JSON.stringify(pesan), dariB64u(langganan.keys.p256dh), dariB64u(langganan.keys.auth));
  const r = await (opsi.fetch || fetch)(langganan.endpoint, {
    method:"POST",
    headers:{ "Content-Encoding":"aes128gcm", "Content-Type":"application/octet-stream", "TTL":String(opsi.ttl || 1800),
              "Urgency":"high", "Authorization":await headerVapid(langganan.endpoint, vapid) },
    body:badan });
  return { ok:r.status >= 200 && r.status < 300, status:r.status, hapus:r.status === 404 || r.status === 410 };
}
