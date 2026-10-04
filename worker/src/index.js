/* Server peringatan Hallo Shanti (Cloudflare Worker).

   Aplikasi Ibu (halaman statis) tidak bisa memberi tahu apa pun saat
   tertutup. Server kecil ini menyimpan "rencana pulang" yang dikirim HP
   dan tiap 5 menit memeriksa: jalan pulang macet (TomTom), waktunya jalan
   pulang, baterai menurut perkiraan habis -- lalu mengirim notifikasi push
   (Web Push) ke HP Ibu. Pasang: lihat worker/README.md.

   Rahasia (wrangler secret): SANDI, VAPID_PUBLIC, VAPID_PRIVATE,
   VAPID_SUBJECT, TOMTOM_KEY (opsional). Variabel: ASAL (origin aplikasi).
   KV: PERINGATAN. */
import { kirimPush } from "./webpush.js";
import { gabungRencana, perluCekMacet, putuskan, MENIT } from "./logika.js";

const ASAL_BAWAAN = "https://chrissdr1.github.io";
const ID_SAH = /^[a-z0-9-]{8,64}$/;

function cors(env){
  return { "Access-Control-Allow-Origin":env.ASAL || ASAL_BAWAAN, "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
           "Access-Control-Allow-Headers":"Content-Type, X-Sandi", "Access-Control-Max-Age":"86400", "Vary":"Origin" };
}
function json(env, data, status){
  return new Response(JSON.stringify(data), { status:status || 200, headers:Object.assign({ "Content-Type":"application/json" }, cors(env)) });
}
function samaAman(a, b){
  a = String(a || ""); b = String(b || "");
  let beda = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) beda |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return beda === 0;
}
function vapid(env){ return { publik:env.VAPID_PUBLIC, privat:env.VAPID_PRIVATE, subject:env.VAPID_SUBJECT || "mailto:admin@example.com" }; }

async function bacaBadan(req){
  const t = await req.text();
  if (t.length > 8192) throw new Error("terlalu besar");
  return JSON.parse(t || "{}");
}

export async function tanganiPermintaan(req, env, kini){
  const url = new URL(req.url), p = url.pathname.replace(/\/+$/, "") || "/";
  if (req.method === "OPTIONS") return new Response(null, { status:204, headers:cors(env) });
  if (req.method === "GET" && p === "/vapid") return env.VAPID_PUBLIC ? json(env, { publik:env.VAPID_PUBLIC }) : json(env, { galat:"VAPID belum dipasang" }, 500);
  if (req.method === "GET" && p === "/") return json(env, { ok:true, nama:"server peringatan Hallo Shanti" });
  if (req.method !== "POST") return json(env, { galat:"tidak dikenal" }, 404);
  /* semua yang mengubah data butuh sandi; tanpa SANDI terpasang = tolak semua */
  if (!env.SANDI || !samaAman(req.headers.get("X-Sandi"), env.SANDI)) return json(env, { galat:"sandi salah" }, 401);
  let b; try { b = await bacaBadan(req); } catch (e) { return json(env, { galat:"isi tidak sah" }, 400); }
  const id = String(b.id || "");
  if (!ID_SAH.test(id)) return json(env, { galat:"id tidak sah" }, 400);
  const KV = env.PERINGATAN;
  if (p === "/langganan"){
    const l = b.langganan;
    if (!l || typeof l.endpoint !== "string" || !/^https:\/\//.test(l.endpoint) || !l.keys || !l.keys.p256dh || !l.keys.auth) return json(env, { galat:"langganan tidak sah" }, 400);
    await KV.put("sub:" + id, JSON.stringify({ endpoint:l.endpoint, keys:{ p256dh:l.keys.p256dh, auth:l.keys.auth }, dibuat:kini }));
    return json(env, { ok:true });
  }
  if (p === "/rencana"){
    const ren = b.rencana;
    if (!ren || typeof ren !== "object" || !/^\d{4}-\d\d-\d\d$/.test(String(ren.tgl))) return json(env, { galat:"rencana tidak sah" }, 400);
    ren.id = id;
    const lama = JSON.parse(await KV.get("ren:" + id) || "null");
    await KV.put("ren:" + id, JSON.stringify(gabungRencana(lama, ren, kini)), { expirationTtl:36 * 3600 });
    return json(env, { ok:true });
  }
  if (p === "/henti"){
    await KV.delete("sub:" + id); await KV.delete("ren:" + id);
    return json(env, { ok:true });
  }
  if (p === "/uji"){
    const sub = JSON.parse(await KV.get("sub:" + id) || "null");
    if (!sub) return json(env, { galat:"HP ini belum berlangganan" }, 404);
    const h = await kirimPush(sub, { judul:"Peringatan tersambung", isi:"Server peringatan Hallo Shanti bisa mengirim ke HP ini.", tag:"uji" }, vapid(env), { ttl:600 });
    if (h.hapus) await KV.delete("sub:" + id);
    return json(env, { ok:h.ok, status:h.status }, h.ok ? 200 : 502);
  }
  return json(env, { galat:"tidak dikenal" }, 404);
}

/* Jalan pulang sekarang dari TomTom (menit), atau null. */
async function menitPulang(env, pos, rumah, f){
  if (!env.TOMTOM_KEY) return null;
  const u = "https://api.tomtom.com/routing/1/calculateRoute/" + pos.lat + "," + pos.lon + ":" + rumah.lat + "," + rumah.lon +
            "/json?traffic=true&travelMode=car&routeType=fastest&key=" + encodeURIComponent(env.TOMTOM_KEY);
  try {
    const r = await (f || fetch)(u); if (!r.ok) return null;
    const j = await r.json(), s = j && j.routes && j.routes[0] && j.routes[0].summary;
    return s && s.travelTimeInSeconds > 0 ? Math.round(s.travelTimeInSeconds / 60) : null;
  } catch (e) { return null; }
}

/* Satu putaran cron. */
export async function putaran(env, kini, f){
  const KV = env.PERINGATAN, hasil = [];
  let cursor;
  do {
    const daftar = await KV.list({ prefix:"ren:", cursor });
    for (const k of daftar.keys){
      const id = k.name.slice(4);
      const r = JSON.parse(await KV.get(k.name) || "null"); if (!r) continue;
      const live = perluCekMacet(r, kini) ? await menitPulang(env, r.pos, r.rumah, f) : null;
      const kep = putuskan(r, kini, live);
      if (kep.hapus){ await KV.delete(k.name); hasil.push({ id, hapus:true }); continue; }
      if (kep.kirim.length){
        const sub = JSON.parse(await KV.get("sub:" + id) || "null");
        for (const pesan of kep.kirim){
          if (!sub) break;
          const h = await kirimPush(sub, pesan, vapid(env), { fetch:f });
          hasil.push({ id, tag:pesan.tag, status:h.status });
          if (h.hapus){ await KV.delete("sub:" + id); break; }
        }
      }
      if (JSON.stringify(kep.rencana) !== JSON.stringify(r)) await KV.put(k.name, JSON.stringify(kep.rencana), { expirationTtl:36 * 3600 });
    }
    cursor = daftar.list_complete ? null : daftar.cursor;
  } while (cursor);
  return hasil;
}

export default {
  fetch(req, env){ return tanganiPermintaan(req, env, Date.now()); },
  scheduled(event, env, ctx){ ctx.waitUntil(putaran(env, Date.now())); }
};
export { MENIT };
