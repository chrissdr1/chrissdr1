/* Membuat sepasang kunci VAPID untuk server peringatan (sekali saja).
   Jalankan: node worker/vapid.mjs
   Simpan hasilnya sebagai rahasia Worker (lihat worker/README.md) --
   JANGAN dimasukkan ke repo. */
const kp = await crypto.subtle.generateKey({ name:"ECDSA", namedCurve:"P-256" }, true, ["sign", "verify"]);
const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
const b64u = b => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
console.log("VAPID_PUBLIC  = " + b64u(pub));
console.log("VAPID_PRIVATE = " + jwk.d);
console.log("\nMasukkan dengan:\n  npx wrangler secret put VAPID_PUBLIC\n  npx wrangler secret put VAPID_PRIVATE");
