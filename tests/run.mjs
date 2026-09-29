/* Uji aplikasi di Chromium nyata (Playwright).
   Jalankan:  npm test
   (Uji emas terhadap artifact asli dihapus sejak tahap 5: mesin sengaja
    berubah -- jeda bebas, penempatan sesi ngecas, estimasi order.)

   Yang diperiksa:
     1. halaman terbuka tanpa galat konsol, semua tab ada, kartu langkah terisi
     2. "Uji mandiri" bawaan halaman hijau (ribuan kombinasi mesin hitung)
     3. TERBIT (js/data.js) == VERSION (sw.js), manifest sah, service worker aktif dan cache terisi
     4. adapter AI: putaran alat, streaming teks, JSON, dan pemetaan galat -- dengan fetch tiruan
     5. logika rencana tahap 5: jeda bebas persis, estimasi order per langkah, rekap = bersih,
        sesi ngecas (jembatan + jeda), jam nyata sampai ke menit
     6. halaman Mulai hari, perkiraan baterai (model + odometer GPS), jangkar ngecas,
        lapisan kemacetan TomTom, faktor macet di rekomendasi */
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP = path.join(ROOT, "app");
const MIME = { ".html":"text/html; charset=utf-8", ".css":"text/css", ".js":"text/javascript", ".mjs":"text/javascript",
  ".json":"application/json", ".webmanifest":"application/manifest+json", ".png":"image/png", ".svg":"image/svg+xml" };

function serve(dir){
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = path.join(dir, p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()){ res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream", "cache-control":"no-store" });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve({ srv, url:`http://127.0.0.1:${srv.address().port}/` }));
  });
}

let failed = 0, passed = 0;
function hhmmTes(h){ const m = Math.round(h * 60); return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
function ok(cond, msg, extra){
  if (cond){ passed++; console.log("  ok   " + msg); }
  else { failed++; console.log("  FAIL " + msg + (extra ? "\n       " + String(extra).slice(0, 1500) : "")); }
}

async function setField(page, id, v){
  await page.evaluate(([id, v]) => {
    const e = document.getElementById(id);
    if (!e) throw new Error("no element " + id);
    if (e.type === "checkbox") e.checked = !!v; else e.value = String(v);
    e.dispatchEvent(new Event("change", { bubbles:true }));
    e.dispatchEvent(new Event("input", { bubbles:true }));
  }, [id, v]);
}
async function texts(page, ids){
  return page.evaluate((ids) => Object.fromEntries(ids.map(id => {
    const e = document.getElementById(id);
    return [id, e ? (e.hidden ? "[hidden]" : e.innerText.replace(/\s+/g, " ").trim()) : "[missing]"];
  })), ids);
}
function firstDiff(a, b){
  let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return `...${a.slice(Math.max(0, i - 60), i + 120)}\n       vs ...${b.slice(Math.max(0, i - 60), i + 120)}`;
}

/* "cuaca" sengaja tidak dibandingkan: teks keadaan "belum terambil" memang diganti
   sejak prakiraan diambil dari internet. Angka-angkanya tetap dibandingkan lewat n-notes. */
const NOW_IDS = ["dayflag", "verdict", "plancheck", "batwarn", "n-net", "n-vs", "n-side", "n-steps", "n-notes", "calmode"];
const PLAN_IDS = ["p-net", "p-vs", "p-side", "p-steps", "p-notes", "cmphead", "cmp"];
const LOG_IDS = ["calbasis", "caltiles", "calnote", "mnet", "pace", "histcount", "hist", "pv-net", "pv-jam", "pv-kmj", "pv-util", "pv-eff"];

const NOW_CASES = [
  { "n-jam":9.5,  "n-lok":"kota",    "n-soc":65, "n-dpt":0,      "n-pulang":21.5, "n-filter":2, "n-bat":30.08 },
  { "n-jam":15.25,"n-lok":"cbd",     "n-soc":30, "n-dpt":250000, "n-pulang":21.5, "n-filter":0, "n-hujan":true },
  { "n-jam":11,   "n-lok":"bekasi",  "n-soc":45, "n-dpt":120000, "n-pulang":20,   "n-acara":true },
  { "n-jam":5.25, "n-lok":"bandara", "n-soc":95, "n-dpt":0,      "n-pulang":23,   "n-rumah":true, "n-bat":38.88 },
  { "n-jam":19.5, "n-lok":"bsd",     "n-soc":20, "n-dpt":400000, "n-pulang":22,   "n-tujuan":"stay" },
  { "n-jam":14,   "n-lok":"ciledug", "n-soc":40, "n-dpt":90000,  "n-pulang":21.5, "n-tujuan":"rumah", "n-hujan":false, "n-acara":false, "n-rumah":false },
  { "n-jam":3.5,  "n-lok":"jakbar",  "n-soc":88, "n-dpt":0,      "n-pulang":21.5, "n-filter":1 },
];
const PLAN_CASES = [
  { "p-keluar":5.25, "p-pulang":21.5, "p-rehat":"full",    "p-zona":"tng", "p-filter":2 },
  { "p-keluar":3.5,  "p-pulang":23,   "p-rehat":"none",    "p-zona":"jkt", "p-filter":0 },
  { "p-keluar":15,   "p-pulang":23,   "p-rehat":"none",    "p-zona":"apt", "p-hujan":true },
  { "p-tgl":"2026-10-31", "p-keluar":9.5, "p-pulang":20.5, "p-rehat":"duapeak", "p-zona":"mix", "p-rumah":true, "p-acara":true, "p-bat":38.88 },
  { "p-tgl":"2026-12-24", "p-keluar":5.25, "p-pulang":21.5, "p-rehat":"short", "p-zona":"tng", "p-hujan":false, "p-acara":false, "p-rumah":false, "p-bat":30.08 },
  { "p-tgl":"2026-03-21", "p-keluar":7.5, "p-pulang":22, "p-rehat":"none", "p-zona":"tng" },
];
const LOG_ROWS = [
  { tgl:"2026-09-20", jam:11, trip:18, dpt:440000, ins:130000, kmt:245, kmp:152, kwh:34, biaya:155000, mnt:55, cat:"uji" },
  { tgl:"2026-09-21", jam:10, trip:16, dpt:390000, ins:110000, kmt:230, kmp:140, kwh:33, biaya:150000, mnt:0,  cat:"" },
  { tgl:"2026-09-22", jam:12, trip:21, dpt:510000, ins:150000, kmt:260, kmp:170, kwh:36, biaya:160000, mnt:48, cat:"hujan" },
];

async function driveAll(page){
  const out = {};
  for (let i = 0; i < NOW_CASES.length; i++){
    for (const [k, v] of Object.entries(NOW_CASES[i])) await setField(page, k, v);
    out["now" + i] = await texts(page, NOW_IDS);
  }
  for (let i = 0; i < PLAN_CASES.length; i++){
    for (const [k, v] of Object.entries(PLAN_CASES[i])) await setField(page, k, v);
    out["plan" + i] = await texts(page, PLAN_IDS);
  }
  for (const r of LOG_ROWS){
    for (const [k, v] of Object.entries(r)) await setField(page, k, v);
    await page.evaluate(() => document.getElementById("save").click());   /* tab Catatan boleh tersembunyi */
  }
  out.log = await texts(page, LOG_IDS);
  /* setelah 3 hari tercatat, kalibrasi hidup -> ulangi dua kasus */
  for (const [k, v] of Object.entries(NOW_CASES[0])) await setField(page, k, v);
  out.nowCal0 = await texts(page, NOW_IDS);
  for (const [k, v] of Object.entries(PLAN_CASES[1])) await setField(page, k, v);
  out.planCal1 = await texts(page, PLAN_IDS);
  return out;
}

/* fetch tiruan yang berbicara SSE persis seperti api.anthropic.com */
const FAKE_FETCH = `
window.__calls = [];
function sse(events){
  const enc = new TextEncoder();
  const body = events.map(e => "event: " + e.type + "\\ndata: " + JSON.stringify(e) + "\\n\\n").join("");
  return new Response(new ReadableStream({ start(c){ c.enqueue(enc.encode(body)); c.close(); } }),
    { status:200, headers:{ "content-type":"text/event-stream", "request-id":"req_x" } });
}
function msgStart(){ return { type:"message_start", message:{ id:"msg_1", type:"message", role:"assistant", model:"m", content:[], stop_reason:null, stop_sequence:null, usage:{ input_tokens:10, output_tokens:1 } } }; }
function textStream(t){
  const parts = t.match(/.{1,6}/g) || [""];
  return sse([msgStart(), { type:"content_block_start", index:0, content_block:{ type:"text", text:"" } },
    ...parts.map(p => ({ type:"content_block_delta", index:0, delta:{ type:"text_delta", text:p } })),
    { type:"content_block_stop", index:0 },
    { type:"message_delta", delta:{ stop_reason:"end_turn", stop_sequence:null }, usage:{ output_tokens:5 } },
    { type:"message_stop" }]);
}
function toolStream(name, input){
  const j = JSON.stringify(input);
  return sse([msgStart(),
    { type:"content_block_start", index:0, content_block:{ type:"text", text:"" } },
    { type:"content_block_delta", index:0, delta:{ type:"text_delta", text:"Sebentar, saya hitung." } },
    { type:"content_block_stop", index:0 },
    { type:"content_block_start", index:1, content_block:{ type:"tool_use", id:"toolu_1", name:name, input:{} } },
    { type:"content_block_delta", index:1, delta:{ type:"input_json_delta", partial_json:j.slice(0, 8) } },
    { type:"content_block_delta", index:1, delta:{ type:"input_json_delta", partial_json:j.slice(8) } },
    { type:"content_block_stop", index:1 },
    { type:"message_delta", delta:{ stop_reason:"tool_use", stop_sequence:null }, usage:{ output_tokens:9 } },
    { type:"message_stop" }]);
}
function json(o, status){ return new Response(JSON.stringify(o), { status:status || 200, headers:{ "content-type":"application/json" } }); }
/* GitHub Contents API tiruan: satu berkas, sha berganti tiap PUT. */
window.__gh = { sha:null, content:null, puts:[] };
function github(u, init){
  const m = (init && init.method) || "GET";
  if (/\\/repos\\/[^/]+\\/[^/]+$/.test(u)) return json({ full_name:"x/y", private:true });
  if (u.includes("/contents/")){
    if (m === "GET") return window.__gh.content == null ? new Response("nf", { status:404 })
      : json({ content: btoa(unescape(encodeURIComponent(window.__gh.content))), sha: window.__gh.sha });
    if (m === "PUT"){
      const b = JSON.parse(init.body);
      if (window.__gh.sha && b.sha !== window.__gh.sha) return json({ message:"sha mismatch" }, 409);
      window.__gh.puts.push(b);
      window.__gh.content = decodeURIComponent(escape(atob(b.content)));
      window.__gh.sha = "sha" + window.__gh.puts.length;
      return json({ content:{ sha: window.__gh.sha } });
    }
  }
  return new Response("?", { status:500 });
}
window.__mode = "tool"; window.__paused = false;
window.fetch = async function(url, init){
  const u = String(url);
  const body = init && init.body && String(init.body)[0] === "{" ? JSON.parse(init.body) : null;
  window.__calls.push({ url:u, method:(init && init.method) || "GET", headers:Object.fromEntries(new Headers(init && init.headers || {}).entries()), body });
  if (u.includes("api.github.com")) return github(u, init);
  if (window.__mode === "briefing") return textStream(window.__briefingTeks || "Briefing uji.");
  if (window.__mode === "acara") return textStream("Ini hasilnya:\\n" + JSON.stringify({ acara:[
    { tanggal:"2099-01-05", nama:"Konser Uji", tempat:"ICE BSD", zona:"lokal" },
    { tanggal:"2099-01-06", nama:"Expo Uji", tempat:"JIExpo Kemayoran", zona:"jkt" },
    { tanggal:"2000-01-01", nama:"Sudah lewat", tempat:"", zona:"jkt" },
    { tanggal:"bukan-tanggal", nama:"Rusak", tempat:"", zona:"jkt" } ] }));
  if (window.__mode === "pause"){
    if (!window.__paused){
      window.__paused = true;
      return sse([msgStart(),
        { type:"content_block_start", index:0, content_block:{ type:"server_tool_use", id:"srvtoolu_1", name:"web_search", input:{} } },
        { type:"content_block_delta", index:0, delta:{ type:"input_json_delta", partial_json:"{\\"query\\":\\"macet\\"}" } },
        { type:"content_block_stop", index:0 },
        { type:"message_delta", delta:{ stop_reason:"pause_turn", stop_sequence:null }, usage:{ output_tokens:3 } },
        { type:"message_stop" }]);
    }
    return textStream("Lanjut setelah jeda.");
  }
  if (u.includes("/v1/models")) return new Response(JSON.stringify({ data:[{ id:"claude-opus-5", type:"model" }], has_more:false }), { status:200, headers:{ "content-type":"application/json" } });
  if (window.__mode === "429") return new Response(JSON.stringify({ type:"error", error:{ type:"rate_limit_error", message:"slow down" } }), { status:429, headers:{ "content-type":"application/json" } });
  if (window.__mode === "401") return new Response(JSON.stringify({ type:"error", error:{ type:"authentication_error", message:"bad key" } }), { status:401, headers:{ "content-type":"application/json" } });
  if (window.__mode === "json") return textStream("Tentu, ini hasilnya:\\n\`\`\`json\\n{\\"anchor\\":\\"bsd\\",\\"km\\":18.2,\\"nama\\":\\"Rawa Buntu\\",\\"catatan\\":\\"dekat stasiun\\"}\\n\`\`\`");
  const last = body.messages[body.messages.length - 1];
  const hasResult = Array.isArray(last.content) && last.content.some(b => b.type === "tool_result");
  if (body.tools && !hasResult) return toolStream("hitung_skenario", { keluar:5.25, pulang:21.5, zona:"tng" });
  return textStream("Jawaban akhir setelah alat.");
};
`;

async function main(){
  const { srv, url } = await serve(APP);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale:"id-ID", timezoneId:"Asia/Jakarta", serviceWorkers:"allow" });
  /* Internet luar dimatikan supaya hasilnya pasti: cuaca jatuh ke cadangan, ubin peta kosong. */
  /* Halaman "Mulai hari" terbuka sendiri sekali sehari; bagian 1-11 tidak mengujinya,
     jadi ditandai "dilewati" sebelum halaman dimuat -- kecuali halaman uji bagian 12. */
  await ctx.addInitScript(() => {
    try { if (!/checkin/.test(location.search)) localStorage.setItem("mulai-hari-lewati", new Date().toLocaleDateString("sv-SE")); } catch (e) {}
  });
  await ctx.route("**/api.open-meteo.com/**", r => r.abort());
  await ctx.route("**/tile.openstreetmap.org/**", r => r.abort());
  await ctx.route("**/api.anthropic.com/**", r => r.abort());
  await ctx.route("**/api.github.com/**", r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  console.log("1. halaman terbuka");
  await page.goto(url + "index.html", { waitUntil:"load" });
  await page.waitForFunction(() => document.querySelector("#n-steps .step"));
  /* Font Google diambil lewat internet; di sandbox tanpa CA proxy Chromium menolak sertifikatnya. Bukan galat aplikasi. */
  /* ERR_FAILED / ERR_BLOCKED_BY_CLIENT: permintaan ke Open-Meteo dan ubin peta yang sengaja diputus lewat route() di atas. */
  const fontErr = e => /fonts\.g(oogleapis|static)\.com|ERR_CERT_AUTHORITY_INVALID|ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_FAILED|ERR_BLOCKED_BY_CLIENT/.test(e);
  ok(errors.filter(e => !fontErr(e)).length === 0, "tanpa galat konsol", errors.join("\n"));
  const tabs = await page.$$eval(".tabs .tab", t => t.map(x => x.textContent.trim()));
  ok(tabs.join(",") === "Sekarang,Catatan,Rencana,Tanya", "empat tab", tabs);
  const v = await texts(page, ["verdict", "n-net", "aistat", "tanyastatus"]);
  ok(/Sekarang · \d\d:\d\d/i.test(v.verdict), "kartu langkah terisi", v.verdict);
  ok(/^Rp/.test(v["n-net"]), "proyeksi terisi", v["n-net"]);
  const aistat0 = await page.$eval("#aistat", e => e.textContent);
  ok(aistat0 === "Belum ada kunci", "status AI jujur tanpa kunci", aistat0);
  await page.click("#t-plan");
  ok(await page.$eval("#v-plan", e => !e.hidden), "tab Rencana tampil");
  ok((await page.$$("#cmp tr")).length === 8, "tabel bandingkan sif: 8 pola");
  await page.click("#t-now");

  console.log("2. uji mandiri bawaan");
  await page.evaluate(() => { document.getElementById("pengaturan-anak").open = true; });
  await page.click("#ujijalan");
  await page.waitForFunction(() => /kombinasi/.test(document.getElementById("ujihasil").textContent), null, { timeout:120000 });
  const uji = await texts(page, ["ujihasil"]);
  const ujiCls = await page.$eval("#ujihasil", e => e.className);
  ok(ujiCls === "uji ok", "semua aturan terpenuhi", uji.ujihasil);
  ok(/semua aturan terpenuhi/.test(uji.ujihasil), "teks hasil uji", uji.ujihasil);

  console.log("3. versi, manifest, service worker");
  const terbit = /TERBIT = "([^"]+)"/.exec(fs.readFileSync(path.join(APP, "js/data.js"), "utf8"))[1];
  const swv = /VERSION = "([^"]+)"/.exec(fs.readFileSync(path.join(APP, "sw.js"), "utf8"))[1];
  ok(swv.startsWith(terbit), `sw VERSION (${swv}) diawali TERBIT (${terbit})`);
  const man = JSON.parse(fs.readFileSync(path.join(APP, "manifest.webmanifest"), "utf8"));
  ok(man.icons.every(i => fs.existsSync(path.join(APP, i.src))), "semua ikon manifest ada");
  const swAssets = /ASSETS = \[([\s\S]*?)\];/.exec(fs.readFileSync(path.join(APP, "sw.js"), "utf8"))[1].match(/"[^"]+"/g).map(s => s.slice(1, -1));
  const missingAssets = swAssets.filter(a => a !== "./" && !fs.existsSync(path.join(APP, a)));
  ok(missingAssets.length === 0, "semua aset sw.js ada", missingAssets.join(","));
  const swState = await page.evaluate(async () => {
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("service worker tidak pernah siap (install gagal?)")), 15000));
    const reg = await Promise.race([navigator.serviceWorker.ready, timeout]);
    for (let i = 0; i < 50 && !(await caches.keys()).length; i++) await new Promise(r => setTimeout(r, 100));
    const keys = await caches.keys();
    const c = await caches.open(keys[0]);
    const n = (await c.keys()).length;
    return { active: !!reg.active, keys, n };
  }).catch(e => ({ active:false, keys:[], n:0, err:e.message }));
  ok(swState.active && swState.keys[0] === "shanti-" + swv, "service worker aktif, cache " + swState.keys.join(","));
  ok(swState.n >= swAssets.length - 1, "cache terisi " + swState.n + " berkas");

  console.log("4. adapter AI dengan fetch tiruan");
  await page.evaluate(FAKE_FETCH);
  const ai = await page.evaluate(async () => {
    const out = {};
    AI.setKey("sk-ant-test");
    out.status = AI.status();
    out.uji = await AI.uji().then(() => true, e => e);
    const s = await AI.connect();
    out.sumber = s && s.sumber;
    const seen = [];
    const r = await s([{ role:"user", content:"kalau mulai 05:15?" }], { modelTier:"complex", tools:alatTanya(), onText:e => seen.push(e.text) });
    out.text = r.text; out.seen = seen.length; out.calls = window.__calls.length;
    /* __calls[0] = /v1/models dari AI.uji(); [1] = putaran pertama; [2] = putaran kedua dengan hasil alat */
    const c1 = window.__calls[2].body;
    out.model = c1.model; out.effort = c1.output_config && c1.output_config.effort;
    out.toolNames = (c1.tools || []).map(t => t.name);
    const res = c1.messages[c1.messages.length - 1].content[0];
    out.toolResult = JSON.parse(res.content);
    out.assistantEcho = c1.messages[c1.messages.length - 2].content.map(b => b.type).join(",");
    out.headers = window.__calls[1].headers;
    window.__mode = "json";
    out.json = await s.json("petakan Rawa Buntu", { modelTier:"quick" });
    out.jsonModel = window.__calls[window.__calls.length - 1].body.model;
    out.jsonEffort = "output_config" in window.__calls[window.__calls.length - 1].body;
    window.__mode = "429"; out.e429 = await s("x").then(() => null, e => e.code);
    window.__mode = "401"; out.e401 = await s("x").then(() => null, e => e.code);
    AI.setKey(""); out.after = AI.status(); out.noKey = await AI.connect();
    return out;
  });
  ok(ai.status === "api" && ai.uji === true && ai.sumber === "api", "kunci tersimpan -> sampler lewat SDK", JSON.stringify(ai));
  ok(ai.text === "Sebentar, saya hitung.\n\nJawaban akhir setelah alat.", "putaran alat: teks kedua putaran digabung", ai.text);
  ok(ai.seen > 2 && ai.calls === 3, "teks di-stream ke onText, 2 panggilan messages + 1 models", `${ai.seen} ${ai.calls}`);
  ok(ai.model === "claude-opus-5" && ai.effort === "high", "tier complex -> claude-opus-5, effort high", `${ai.model} ${ai.effort}`);
  ok(ai.toolNames.join(",") === "hitung_skenario,cari_daerah", "kedua alat dikirim", ai.toolNames);
  ok(typeof ai.toolResult.bersih_rp === "number" && ai.toolResult.jam === "05:15-21:30", "alat benar-benar dijalankan mesin halaman", JSON.stringify(ai.toolResult));
  ok(ai.assistantEcho === "text,tool_use", "blok assistant dikembalikan utuh", ai.assistantEcho);
  ok(ai.headers["x-api-key"] === "sk-ant-test" && ai.headers["anthropic-dangerous-direct-browser-access"] === "true", "header kunci dan izin browser", JSON.stringify(ai.headers));
  ok(ai.json && ai.json.anchor === "bsd" && ai.json.km === 18.2, "sampler.json membersihkan pagar kode", JSON.stringify(ai.json));
  ok(ai.jsonModel === "claude-haiku-4-5" && ai.jsonEffort === false, "tier quick -> claude-haiku-4-5 tanpa effort", `${ai.jsonModel} ${ai.jsonEffort}`);
  ok(ai.e429 === "rate_limited" && ai.e401 === "unauthorized", "galat 429/401 dipetakan", `${ai.e429} ${ai.e401}`);
  ok(ai.after === "no_key" && ai.noKey === null, "hapus kunci -> tidak ada sampler");

  console.log("5. Tanya tanpa kunci menjelaskan diri");
  await page.reload({ waitUntil:"load" });
  await page.click("#t-tanya");
  await page.fill("#chatinput", "sekarang ke mana?");
  await page.click("#chatsend");
  const bubble = await page.$$eval("#chatlog .bubble.ai", b => b.map(x => x.textContent).pop());
  ok(/belum tersambung/i.test(bubble || ""), "jawaban menunjuk ke panel kunci", bubble);

  console.log("6. peta");
  await page.click("#t-now");
  await page.evaluate(() => document.getElementById("peta-toggle").click());
  await page.waitForFunction(() => document.querySelectorAll("#peta .pin").length > 0);
  const peta = await page.evaluate(() => ({
    pins: document.querySelectorAll("#peta .pin").length,
    spklu: document.querySelectorAll("#peta path.leaflet-interactive").length,
    leaflet: !!document.querySelector("#peta.leaflet-container"),
    href: document.getElementById("peta-macet").getAttribute("href"),
    status: document.getElementById("peta-status").textContent,
    toggle: document.getElementById("peta-toggle").textContent,
  }));
  ok(peta.leaflet && peta.pins === 22, "peta Leaflet dengan rumah + 21 titik terukur", JSON.stringify(peta));
  ok(peta.spklu === 19, "19 SPKLU digambar", peta.spklu);
  ok(/google\.com\/maps\/@-6\.\d+,106\.\d+,14z\/data=!5m1!1e1/.test(peta.href), "tautan Google Maps berlapis kemacetan", peta.href);
  await setField(page, "n-lok", "bsd");
  const hrefBsd = await page.$eval("#peta-macet", a => a.getAttribute("href"));
  ok(hrefBsd.includes("-6.30440,106.64420"), "tautan kemacetan ikut posisi terpilih", hrefBsd);
  await page.evaluate(() => { POSISI_GPS = { lat:-6.25, lon:106.70, akurasi:40, at:Date.now() }; petaPosisi(); });
  const hrefGps = await page.$eval("#peta-macet", a => a.getAttribute("href"));
  ok(hrefGps.includes("-6.25000,106.70000"), "posisi GPS mengalahkan posisi terpilih", hrefGps);
  await page.evaluate(() => document.getElementById("peta-toggle").click());
  ok(await page.$eval("#peta", e => e.hidden), "peta bisa disembunyikan");

  console.log("7. cuaca dari Open-Meteo (tiruan)");
  const today = new Date().toLocaleDateString("sv-SE", { timeZone:"Asia/Jakarta" });
  const fixture = { hourly: {
    time: Array.from({ length:24 }, (_, i) => `${today}T${String(i).padStart(2, "0")}:00`),
    precipitation_probability: Array.from({ length:24 }, (_, i) => (i >= 13 && i <= 16) ? 70 : 10),
    precipitation: Array.from({ length:24 }, (_, i) => (i >= 13 && i <= 16) ? 1.2 : 0) } };
  await page.route("**/api.open-meteo.com/**", r => r.fulfill({ status:200, contentType:"application/json", body:JSON.stringify(fixture) }));
  await page.evaluate(() => localStorage.removeItem("cuaca-openmeteo"));
  await page.reload({ waitUntil:"load" });
  await page.waitForFunction(() => /Open-Meteo/.test(document.getElementById("cuaca").textContent), null, { timeout:15000 });
  const cu = await page.evaluate(() => ({ teks: document.getElementById("cuaca").textContent.replace(/\s+/g, " "),
    hujan: document.getElementById("n-hujan").checked, cache: JSON.parse(localStorage.getItem("cuaca-openmeteo")),
    notes: document.getElementById("n-notes").textContent,
    pita: document.querySelectorAll("#cuaca .jamstrip i").length, pitaHujan: document.querySelectorAll("#cuaca .jamstrip i.l3").length }));
  ok(cu.pita === 24 && cu.pitaHujan === 4, "pita 24 jam, 4 jam hujan ditandai", `${cu.pita} ${cu.pitaHujan}`);
  ok(/Hujan sekitar 13:00-17:00/.test(cu.teks) && /70%/.test(cu.teks) && /Open-Meteo/.test(cu.teks), "kotak cuaca dari internet: jam, peluang, sumber", cu.teks);
  ok(cu.hujan === true && /Hujan sudah dihitung/.test(cu.notes), "centang hujan terisi dan masuk hitungan", cu.notes.slice(0, 300));
  ok(cu.cache && cu.cache.tanggal === today && cu.cache.jamHujan.join(",") === "13,14,15,16", "prakiraan disimpan 3 jam di HP", JSON.stringify(cu.cache));
  await page.unroute("**/api.open-meteo.com/**");
  await page.evaluate(() => localStorage.removeItem("cuaca-openmeteo"));

  console.log("8. kalender acara dari web, pause_turn, sinkron GitHub (tiruan)");
  await page.reload({ waitUntil:"load" });
  await page.waitForFunction(() => document.querySelector("#n-steps .step"));
  await page.evaluate(FAKE_FETCH);
  const w = await page.evaluate(async () => {
    const out = {};
    AI.setKey("sk-ant-test");
    const s = await AI.connect();
    window.__mode = "acara";
    out.r = await Acara.segarkan(s);
    const call = window.__calls[window.__calls.length - 1].body;
    out.model = call.model; out.toolTypes = (call.tools || []).map(t => t.type);
    out.ev = EVENTS["2099-01-05"]; out.lama = !!EVENTS["2000-01-01"]; out.rusak = !!EVENTS["bukan-tanggal"];
    out.tersimpan = JSON.parse(localStorage.getItem("acara-web")).daftar.length;
    renderAcara(); renderSegar();
    out.daftar = Acara.mendatang(80).map(x => x.nama + "|" + x.sumber).join(";");
    out.daftarUI = document.querySelectorAll("#acara-daftar .acara-row").length;
    out.segar = document.getElementById("segar").textContent;
    /* pause_turn: alat server berhenti sejenak, adapter melanjutkan sendiri */
    window.__mode = "pause"; window.__paused = false;
    out.pause = (await s("ada macet?", { modelTier:"complex", tools:[{ type:"web_search_20260209", name:"web_search", max_uses:1 }] })).text;
    const c2 = window.__calls[window.__calls.length - 1].body;
    out.pauseEcho = c2.messages.length === 2 && c2.messages[1].role === "assistant" && c2.messages[1].content[0].type === "server_tool_use";
    /* Tanya memakai web_search hanya di jalur API */
    out.alatTanya = (function(){ var a = alatTanya(); return a.map(t => t.name); })();
    /* sinkron GitHub */
    Sinkron.setCfg({ repo:"x/y", path:"catatan/shanti.json", token:"tok-uji" });
    out.uji = await Sinkron.uji();
    const r1 = await Sinkron.sinkron([{ id:"2026-09-22", dpt:100, diubah:"2026-09-22T10:00:00Z" }], null);
    out.r1 = { status:r1.status, n:r1.rows.length, puts:window.__gh.puts.length };
    const remote = JSON.parse(window.__gh.content); remote.harian.push({ id:"2026-09-21", dpt:5 });
    remote.harian[0].dpt = 999; remote.harian[0].diubah = "2026-09-21T00:00:00Z";  /* remote lebih lama */
    window.__gh.content = JSON.stringify(remote); window.__gh.sha = "shaLain";
    const r2 = await Sinkron.sinkron([{ id:"2026-09-22", dpt:200, diubah:"2026-09-23T10:00:00Z" }], { date:"2026-09-24" });
    out.r2 = { status:r2.status, n:r2.rows.length, dpt:r2.rows.find(x => x.id === "2026-09-22").dpt, puts:window.__gh.puts.length,
               rencana:JSON.parse(window.__gh.content).rencana.date };
    const r3 = await Sinkron.sinkron(r2.rows, { date:"2026-09-24" });
    out.r3 = { status:r3.status, puts:window.__gh.puts.length };
    out.auth = window.__calls.find(c => c.url.includes("api.github.com")).headers.authorization;
    tandaiSinkron(); out.stat = document.getElementById("sk-stat").textContent;
    Sinkron.setCfg(null); AI.setKey("");
    return out;
  });
  ok(w.r.total === 2 && w.r.jumlah === 2, "acara dari web: 2 sah dari 4 (lewat dan rusak dibuang)", JSON.stringify(w.r));
  ok(w.model === "claude-opus-5" && w.toolTypes.join() === "web_search_20260209", "pencarian web dikirim sebagai alat server", JSON.stringify({ m:w.model, t:w.toolTypes }));
  ok(w.ev && w.ev[0] === "Konser Uji" && w.ev[2] === "lokal" && w.ev[3] === "web" && !w.lama && !w.rusak, "masuk EVENTS dengan tanda sumber", JSON.stringify(w.ev));
  ok(w.tersimpan === 2 && /Konser Uji\|web/.test(w.daftar) && w.daftarUI === 12, "tersimpan di HP, masuk daftar mendatang, 12 baris tampil", w.daftar.slice(0, 200) + " | " + w.daftarUI);
  ok(/2 acara dari pencarian web/.test(w.segar), "kotak versi menyebut acara dari web", w.segar);
  ok(w.pause === "Lanjut setelah jeda." && w.pauseEcho === true, "pause_turn dilanjutkan dengan mengembalikan blok assistant", JSON.stringify({ p:w.pause, e:w.pauseEcho }));
  ok(w.uji && w.uji.privat === true, "uji token GitHub membaca repo privat", JSON.stringify(w.uji));
  ok(w.r1.status === "tersinkron" && w.r1.n === 1 && w.r1.puts === 1, "sinkron pertama menulis berkas baru", JSON.stringify(w.r1));
  ok(w.r2.status === "tersinkron" && w.r2.n === 2 && w.r2.dpt === 200 && w.r2.puts === 2 && w.r2.rencana === "2026-09-24", "gabung: baris remote masuk, yang lebih baru menang, rencana ikut", JSON.stringify(w.r2));
  ok(w.r3.status === "tersinkron" && w.r3.puts === 2, "tanpa perubahan tidak menulis ulang", JSON.stringify(w.r3));
  ok(w.auth === "Bearer tok-uji" && /Aktif · x\/y/.test(w.stat), "token dikirim sebagai Bearer, status panel", `${w.auth} | ${w.stat}`);

  console.log("9. tautan pengaturan (#kunci=…&repo=…&token=…)");
  /* Query "?tautan" memaksa navigasi penuh: pindah ke URL yang cuma beda pagar (#)
     tidak memuat ulang dokumen, jadi pengaturannya tidak akan terbaca. */
  await page.goto(url + "index.html?tautan#kunci=sk-ant-tautan&repo=anak/data-ibu&token=github_pat_tautan", { waitUntil:"load" });
  await page.waitForFunction(() => document.querySelector("#n-steps .step"));
  const tl = await page.evaluate(() => ({
    kunci: AI.getKey(), cfg: Sinkron.cfg(), hash: location.hash, href: location.href,
    flag: document.getElementById("tautan").hidden ? "" : document.getElementById("tautan").textContent,
    aistat: document.getElementById("aistat").textContent, skstat: document.getElementById("sk-stat").textContent }));
  ok(tl.kunci === "sk-ant-tautan" && tl.cfg.repo === "anak/data-ibu" && tl.cfg.token === "github_pat_tautan", "kunci dan token tersimpan dari tautan", JSON.stringify(tl));
  ok(tl.hash === "" && !/kunci=/.test(tl.href), "tautan dihapus dari alamat", tl.href);
  ok(/kunci Claude, sinkron GitHub \(anak\/data-ibu\)/.test(tl.flag), "kotak pemberitahuan menyebut apa yang tersimpan", tl.flag);
  ok(/Kunci tersimpan/.test(tl.aistat) && /Aktif · anak\/data-ibu/.test(tl.skstat), "panel Tanya dan Catatan langsung memakai pengaturan itu", `${tl.aistat} | ${tl.skstat}`);
  await page.goto(url + "index.html", { waitUntil:"load" });
  await page.waitForFunction(() => document.querySelector("#n-steps .step"));
  const tl2 = await page.evaluate(() => ({ kunci: AI.getKey(), flag: document.getElementById("tautan").hidden }));
  ok(tl2.kunci === "sk-ant-tautan" && tl2.flag === true, "tanpa tautan: pengaturan tetap, kotak tidak muncul lagi");
  await page.evaluate(() => { AI.setKey(""); Sinkron.setCfg(null); });

  console.log("10. tema biru, rekomendasi rute otomatis, briefing Claude (tiruan)");
  await page.goto(url + "index.html?tahap4", { waitUntil:"load" });
  await page.waitForFunction(() => document.querySelector("#n-steps .step"));
  /* jam dibekukan ke 09:30 supaya sisa hari cukup untuk berpindah tempat, jam berapa pun uji ini dijalankan */
  await setField(page, "n-jam", 9.5); await setField(page, "n-pulang", 21.5);
  await page.waitForFunction(() => document.querySelector("#rek-list .rek-item"));
  const tema = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  ok(tema.toUpperCase() === "#1A56C4", "tema terang memakai aksen biru", tema);
  await page.emulateMedia({ colorScheme:"dark" });
  const temaGelap = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  ok(temaGelap.toUpperCase() === "#6FA1FF", "tema gelap memakai aksen biru terang", temaGelap);
  /* Toggle tema manual (#tema-btn): Otomatis -> Terang -> Gelap -> Otomatis,
     harus bisa memaksa keluar dari prefers-color-scheme sistem. */
  await page.click("#tema-btn");   /* otomatis -> terang; sistem masih dark */
  const paksaTerang = await page.evaluate(() => ({ theme:document.documentElement.dataset.theme,
    accent:getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() }));
  ok(paksaTerang.theme === "light" && paksaTerang.accent.toUpperCase() === "#1A56C4",
     "toggle tema: paksa terang walau sistem gelap", JSON.stringify(paksaTerang));
  await page.click("#tema-btn");   /* terang -> gelap */
  await page.emulateMedia({ colorScheme:"light" });   /* sistem terang, tapi dipaksa gelap */
  const paksaGelap = await page.evaluate(() => ({ theme:document.documentElement.dataset.theme,
    accent:getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() }));
  ok(paksaGelap.theme === "dark" && paksaGelap.accent.toUpperCase() === "#6FA1FF",
     "toggle tema: paksa gelap walau sistem terang", JSON.stringify(paksaGelap));
  await page.click("#tema-btn");   /* gelap -> otomatis */
  const kembaliOtomatis = await page.evaluate(() => ({ theme:document.documentElement.dataset.theme || "(kosong)",
    accent:getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() }));
  ok(kembaliOtomatis.theme === "(kosong)" && kembaliOtomatis.accent.toUpperCase() === "#1A56C4",
     "toggle tema: kembali ke otomatis (ikut sistem terang)", JSON.stringify(kembaliOtomatis));
  await page.evaluate(() => { try { localStorage.removeItem("tema-warna"); } catch (e) {} });
  for (const [k, v] of Object.entries({ "n-jam":9.5, "n-lok":"karawaci", "n-soc":65, "n-dpt":0, "n-pulang":21.5, "n-filter":2, "n-bat":30.08, "n-tujuan":"rumah" })) await setField(page, k, v);
  const rk = await page.evaluate(() => {
    const d = SEKARANG.rek.daftar;
    const urut = d.every((x, i) => i === 0 || d[i - 1].sisa >= x.sisa);
    const here = d.find(x => x.diSini);
    const ctx = dayCtx(iso(new Date()));
    const o = { ctx, keluar:9.5, pulang:21.5, rehat:"none", zona:"jkt", filter:2, bat:30.08, rumah:false, hujan:false, acara:false, soc:65 };
    const tanpaDead = simulate(Object.assign({}, o, { deadKm:0 })).net, bawaan = simulate(o).net;
    return { n:d.length, urut, here: here && here.id, hereKm: here && here.kmPindah, basis: SEKARANG.rek.basis && SEKARANG.rek.basis.id,
      tampil: document.querySelectorAll("#rek-list .rek-item").length, top: document.querySelector("#rek-list .rek-item.top .rek-body b").textContent,
      faktor: document.getElementById("rek-catatan").textContent, arah: document.querySelector("#rek-list a.linkbtn") && document.querySelector("#rek-list a.linkbtn").getAttribute("href"),
      deltaHere: here && here.selisih, tanpaDead, bawaan, jkt: d.find(x => x.id === "cbd").kmPindah > 20 };
  });
  ok(rk.n === 9 && rk.urut, "9 tempat dibandingkan, urut dari sisa hari terbesar", JSON.stringify(rk));
  ok(rk.here === "karawaci" && rk.hereKm === 0 && rk.basis === "karawaci" && rk.deltaHere === 0, "posisi sekarang jadi acuan tanpa km pindah", JSON.stringify(rk));
  ok(rk.tampil === 3 && /baterai 65%/.test(rk.faktor) && /jam lewat peak pagi/.test(rk.faktor) && /pulang 21:30/.test(rk.faktor), "3 kartu teratas dan faktor di balik Kenapa?", rk.faktor);
  ok(/google\.com\/maps\/dir\/\?api=1&destination=-6\.\d+,106\.\d+/.test(rk.arah || ""), "tombol arah ke Google Maps", rk.arah);
  ok(rk.tanpaDead >= rk.bawaan && rk.jkt, "deadKm=0 tidak menghitung km kosong dua kali; CBD jauh dari Karawaci", JSON.stringify({ t:rk.tanpaDead, b:rk.bawaan }));
  await page.evaluate(() => document.getElementById("rek-toggle").click());
  ok((await page.$$("#rek-list .rek-item")).length === 9, "lihat semua: 9 kartu");
  await page.evaluate(() => document.getElementById("rek-toggle").click());
  /* briefing: tidak ada sambungan -> tidak ada kotak; dengan sambungan -> satu panggilan per kunci */
  ok(await page.$eval("#briefing", e => e.hidden), "tanpa Claude, kotak briefing tidak muncul");
  await page.evaluate(FAKE_FETCH);
  const br = await page.evaluate(async () => {
    const out = {};
    AI.setKey("sk-ant-test");
    window.__mode = "briefing"; window.__briefingTeks = "Briefing uji: tetap di Karawaci sampai 11:00, lalu ke Alam Sutera.";
    await new Promise(r => { pasangAI(); setTimeout(r, 300); });
    out.terjadwal = !!sampler;
    await jalankanBriefing(false);
    out.teks = document.querySelector("#briefing .ai-out").textContent;
    out.hidden = document.getElementById("briefing").hidden;
    out.calls1 = window.__calls.filter(c => c.url.includes("/v1/messages")).length;
    const body = window.__calls.filter(c => c.url.includes("/v1/messages")).pop().body;
    out.model = body.model; out.effort = body.output_config && body.output_config.effort;
    out.promptAdaRek = /REKOMENDASI MESIN/.test(body.messages[0].content) && /Karawaci/.test(body.messages[0].content);
    out.cache = JSON.parse(localStorage.getItem("briefing-claude"));
    briefingKunci = null; briefingOtomatis(); await new Promise(r => setTimeout(r, 2300));
    out.calls2 = window.__calls.filter(c => c.url.includes("/v1/messages")).length;
    document.getElementById("ai-briefing").checked = false; document.getElementById("ai-briefing").dispatchEvent(new Event("change"));
    out.mati = document.getElementById("briefing").hidden && localStorage.getItem("briefing-otomatis") === "0";
    document.getElementById("ai-briefing").checked = true; document.getElementById("ai-briefing").dispatchEvent(new Event("change"));
    out.hidupLagi = !document.getElementById("briefing").hidden;
    AI.setKey(""); localStorage.removeItem("briefing-claude"); localStorage.removeItem("briefing-otomatis");
    return out;
  });
  ok(br.terjadwal && !br.hidden && /Briefing uji/.test(br.teks), "briefing tampil dari jawaban Claude", JSON.stringify(br));
  ok(br.model === "claude-opus-5" && br.effort === "medium" && br.promptAdaRek, "briefing memakai tier default dan menyertakan rekomendasi mesin", JSON.stringify({ m:br.model, e:br.effort, r:br.promptAdaRek }));
  ok(br.cache && br.cache.kunci && br.calls2 === br.calls1, "disimpan di HP; kunci yang sama tidak memanggil lagi", JSON.stringify({ c1:br.calls1, c2:br.calls2, k:br.cache && br.cache.kunci }));
  ok(br.mati && br.hidupLagi, "saklar briefing mematikan dan menghidupkan kotaknya");

  console.log("11. logika rencana: jeda bebas, estimasi order, rekap, baterai, jam nyata");
  {
    const fresh = await ctx.newPage();
    await fresh.goto(url + "index.html?tahap5", { waitUntil:"load" });
    await fresh.waitForFunction(() => document.querySelector("#n-steps .step"));
    for (const [k, v] of Object.entries({ "p-tgl":"2026-09-24", "p-keluar":5.25, "p-pulang":21.5, "p-zona":"tng", "p-bat":30.08, "p-filter":2 })) await setField(fresh, k, v);
    await setField(fresh, "p-rehat", "custom");
    await setField(fresh, "p-rehat-dari", 12); await setField(fresh, "p-rehat-sampai", 13.5);
    const bebas = await fresh.evaluate(() => {
      const rows = [...document.querySelectorAll("#p-steps .step")].map(s => ({ t:s.querySelector(".t").innerText.replace(/\s+/g, " "), cls:s.className, d:(s.querySelector(".a .dt")||{}).innerText || "", cum:(s.querySelector(".v")||{}).innerText || "" }));
      return { rows, hint:document.getElementById("jedahint").innerText, net:document.getElementById("p-net").innerText, side:document.getElementById("p-side").innerText, rehat:JSON.stringify(rehatDariUI()) };
    });
    const jedaRow = bebas.rows.find(r => /istirahat/.test(r.t));
    ok(jedaRow && /12:00.13:30/.test(jedaRow.t), "jeda bebas 12:00–13:30 tampil persis sebagai satu baris", JSON.stringify(jedaRow));
    ok(bebas.rehat === "[12,13.5]" && /12:00.13:30 \(90 menit\)/.test(bebas.hint), "kolom dari–sampai menjadi rentang [12,13.5] dan keterangannya", bebas.rehat + " | " + bebas.hint);
    const kerja = bebas.rows.filter(r => /jam$/.test(r.t) && !/istirahat/.test(r.t));
    ok(kerja.length > 3 && kerja.every(r => /order .* km berpenumpang .* baterai \d+%→\d+%/.test(r.d)), "tiap langkah kerja memuat ≈ order, km berpenumpang, dan baterai a→b%", JSON.stringify(kerja.map(r => r.d)));
    ok(/≈ Order/.test(bebas.side) && /\/order/.test(bebas.side), "ringkasan memuat perkiraan order dan Rp/order", bebas.side.slice(0, 300));
    const rekap = bebas.rows[bebas.rows.length - 1];
    const cumRekap = (rekap.cum.match(/Rp [\d.]+/g) || []).pop();
    ok(/rekap/.test(rekap.t) && cumRekap === bebas.net, "kumulatif baris rekap bertemu angka bersih", `${cumRekap} vs ${bebas.net}`);

    /* Sesi ngecas: jeda pendek 13:00–15:00 -> paling banyak jembatan kecil + isi di jeda, tak ada sesi 90% di blok kerja disusul sesi jeda */
    /* Pulang 22:00 = narik sampai 21:30 (30 menit terakhir perjalanan pulang,
       lihat jamMulaiPulang) -- jendela kerja yang sama dengan skenario lama
       sebelum perjalanan pulang berhenti dihitung sebagai jam narik. Dengan
       jendela lebih pendek hari ini cukup SATU sesi, dan mesin benar memilih
       satu sesi di siang (hemat Rp25 ribu biaya sesi) -- bukan yang diuji. */
    await setField(fresh, "p-pulang", 22);
    await setField(fresh, "p-rehat", "short");
    const pendek = await fresh.evaluate(() => {
      const rows = [...document.querySelectorAll("#p-steps .step")].map(s => ({ t:s.querySelector(".t").innerText.replace(/\s+/g, " "), cls:s.className, s:s.querySelector(".a span").innerText }));
      const ctx = dayCtx("2026-09-24");
      const r = simulate({ ctx, keluar:5.25, pulang:22, rehat:"short", zona:"tng", filter:2, bat:30.08, rumah:false, hujan:false, acara:false });
      return { rows, sesi:r.sesi.map(x => ({ blok:x.blok, dari:Math.round(x.dari*100), ke:Math.round(x.ke*100), diJeda:x.diJeda })), floor:r.floor, socMinKerja:r.socMinKerja, socTiba:r.socTiba,
               komponen: Math.abs(r.net - (r.blockNet + r.insentif - r.feeCharge - r.parkir)) < 1 };
    });
    const charge = pendek.rows.filter(r => /charge/.test(r.cls));
    ok(charge.length === pendek.sesi.length && charge.length <= 2, "jumlah langkah ngecas = jumlah sesi mesin (≤ 2)", JSON.stringify(pendek.sesi));
    ok(pendek.sesi.some(x => x.diJeda) && pendek.sesi.every(x => x.diJeda || x.ke - x.dari <= 35), "isi penuh di jeda; sesi di blok kerja hanya jembatan kecil", JSON.stringify(pendek.sesi));
    ok(pendek.socMinKerja >= pendek.floor - 0.061 && pendek.socTiba >= 0.10 && pendek.komponen, "baterai tidak jauh di bawah lantai, tiba dengan cadangan, bersih = komponennya", JSON.stringify({ min:pendek.socMinKerja, tiba:pendek.socTiba, floor:pendek.floor }));

    /* Jeda panjang boleh sampai 100% (colok di rumah), jeda pendek tetap 90% */
    const seratus = await fresh.evaluate(() => {
      const ctx = dayCtx("2026-09-24");
      /* pulang 22 = narik sampai 21:30, jendela kerja skenario lama (lihat di atas) */
      const a = simulate({ ctx, keluar:9.5, pulang:22, rehat:"full", zona:"mix", filter:2, bat:30.08, rumah:true, hujan:false, acara:false });
      const b = simulate({ ctx, keluar:5.25, pulang:22, rehat:[12, 13], zona:"mix", filter:2, bat:38.88, rumah:false, hujan:false, acara:false });
      return { a:a.sesi.map(x => [x.blok, Math.round(x.ke*100)]), b:b.sesi.map(x => [x.blok, Math.round(x.ke*100)]) };
    });
    ok(seratus.a.some(x => x[0] === "Istirahat" && x[1] > 90) && seratus.b.every(x => x[1] <= 90), "jeda 4,5 jam dengan charger rumah boleh isi > 90% (AC), jeda 1 jam maksimum 90%", JSON.stringify(seratus));

    /* Jam nyata: kolom jam mengikuti jam sampai ke menit, bukan pembulatan 15 menit */
    const jam = await fresh.evaluate(() => {
      const d = new Date(), t = d.getHours() + d.getMinutes()/60;
      return { t, keluar: jamKeluarSekarang(), manual: jamManual, hidup: document.getElementById("jamhidup").textContent, src: document.getElementById("src-jam").textContent };
    });
    const dalamJam = jam.t >= 3.5 && jam.t <= 23.5;
    ok(!dalamJam || (!jam.manual && Math.abs(jam.keluar - jam.t) < 0.02 && /otomatis/.test(jam.src)), "mesin memakai jam sekarang tepat ke menit", JSON.stringify(jam));
    ok(/^\d\d:\d\d$/.test(jam.hidup), "jam hidup tampil HH:MM", jam.hidup);
    await fresh.close();
  }

  console.log("12. Mulai hari, perkiraan baterai, odometer GPS, lapisan TomTom");
  {
    let ttCalls = 0;
    const ci = await ctx.newPage();
    await ci.route("**/api.tomtom.com/**", r => { ttCalls++; r.abort(); });
    await ci.goto(url + "index.html?checkin", { waitUntil:"load" });
    await ci.evaluate(() => { localStorage.removeItem("mulai-hari-lewati"); localStorage.removeItem("mulai-hari"); localStorage.removeItem("baterai-hari"); localStorage.removeItem("buku-setoran-plan"); });
    await ci.reload({ waitUntil:"load" });
    await ci.waitForFunction(() => document.querySelector("#n-steps .step"));
    const jam = await ci.evaluate(() => jamSekarangTepat());
    const dalamJam = jam >= 3.5 && jam <= 23.5;
    const tampil = await ci.$eval("#checkin", e => !e.hidden);
    ok(!dalamJam || tampil, "halaman Mulai hari terbuka sendiri saat aplikasi dibuka", JSON.stringify({ jam, tampil }));
    if (!tampil) await ci.evaluate(() => bukaCheckin());
    const auto = await ci.$eval("#ci-auto", e => e.innerText);
    ok(/Sudah terisi otomatis/.test(auto) && /posisi:/.test(auto), "halaman menyebut yang sudah diketahui mesin (hari, jam, posisi)", auto);
    await setField(ci, "ci-soc", 72); await setField(ci, "ci-zona", "tng"); await setField(ci, "ci-filter", 1);
    await setField(ci, "ci-rehat", "custom"); await setField(ci, "ci-rehat-dari", 12); await setField(ci, "ci-rehat-sampai", 13.5);
    await setField(ci, "ci-gps", false);
    await ci.click("#ci-mulai");
    const sesudah = await ci.evaluate(() => ({ hidden:document.getElementById("checkin").hidden, soc:document.getElementById("n-soc").value, src:document.getElementById("src-soc").textContent,
      plan:(PLAN && PLAN.date === iso(new Date())) ? { rehat:JSON.stringify(PLAN.rehat), filter:PLAN.filter, zona:PLAN.zona } : null,
      mulai:MULAI_HARI && MULAI_HARI.soc, jangkar:Baterai.terakhir(), est:document.getElementById("socest").innerText, status:document.getElementById("hari-status").innerText }));
    ok(sesudah.hidden && sesudah.soc === "72" && sesudah.mulai === 72, "Mulai hari menutup halaman dan mengisi baterai 72% di tab Sekarang", JSON.stringify(sesudah));
    ok(sesudah.plan && sesudah.plan.rehat === "[12,13.5]" && sesudah.plan.filter === 1 && sesudah.plan.zona === "tng", "isian menjadi rencana hari ini (jeda 12:00–13:30, filter 1, Tangerang)", JSON.stringify(sesudah.plan));
    ok(sesudah.jangkar && sesudah.jangkar.soc === 72 && /perkiraan/.test(sesudah.src) && /Perkiraan/.test(sesudah.est), "jangkar baterai 72% dan keterangan perkiraan", JSON.stringify({ j:sesudah.jangkar, src:sesudah.src, est:sesudah.est }));
    const est2 = await ci.evaluate(() => { const j = Baterai.terakhir(); return Baterai.perkiraan(j.jam + 2, { bat:30.08, zona:"tng", rehat:"none" }); });
    ok(est2 && est2.soc < 72 && est2.soc > 40 && !est2.gps, "dua jam kemudian perkiraan turun menurut model blok jam", JSON.stringify(est2));
    /* titik GPS 10 menit terpisah, akurasi 20 m (laju masuk akal; goyangan < 1,5x akurasi diabaikan) */
    const est3 = await ci.evaluate(() => { const j = Baterai.terakhir(); const t0 = Date.now(); Baterai.catatFix(-6.18, 106.62, t0, 20); Baterai.catatFix(-6.18, 106.70, t0 + 600000, 20); Baterai.catatFix(-6.25, 106.70, t0 + 1200000, 20);
      Baterai.catatFix(-6.2503, 106.70, t0 + 1300000, 300);   /* fix kasar 300 m: diabaikan */
      return { km:Baterai.muat().gpsKm, p:Baterai.perkiraan(j.jam + 0.5, { bat:30.08, zona:"tng", rehat:"none" }) }; });
    ok(est3.km > 15 && est3.p.gps && est3.p.soc < 72, "odometer GPS menjumlahkan jarak antar titik dan dipakai perkiraan", JSON.stringify(est3));
    await setField(ci, "cas-ke", 85); await ci.click("#cas-selesai");
    const cas = await ci.evaluate(() => ({ soc:document.getElementById("n-soc").value, j:Baterai.terakhir(), status:document.getElementById("hari-status").innerText }));
    ok(cas.soc === "85" && cas.j.soc === 85 && cas.j.sumber === "ngecas", "Selesai ngecas ke 85% menjadi jangkar baru", JSON.stringify(cas));
    /* Mengetik: ketikan yang belum selesai ("7") tidak boleh ditimpa perkiraan mesin. */
    const setengah = await ci.evaluate(() => { const e = document.getElementById("n-soc"); e.value = "7"; e.dispatchEvent(new Event("input", { bubbles:true })); return { v:e.value, src:document.getElementById("src-soc").textContent }; });
    ok(setengah.v === "7" && /diketik/.test(setengah.src), "ketikan yang belum selesai tidak ditimpa perkiraan", JSON.stringify(setengah));
    await setField(ci, "n-soc", 60);
    const ketik = await ci.evaluate(() => ({ j:Baterai.terakhir(), src:document.getElementById("src-soc").textContent }));
    ok(ketik.j.soc === 60 && ketik.j.sumber === "diketik", "angka baterai yang diketik sendiri menjadi jangkar", JSON.stringify(ketik));
    await ci.reload({ waitUntil:"load" }); await ci.waitForFunction(() => document.querySelector("#n-steps .step"));
    const ulang = await ci.evaluate(() => ({ hidden:document.getElementById("checkin").hidden, soc:document.getElementById("n-soc").value, mulai:!!MULAI_HARI }));
    ok(ulang.hidden && ulang.mulai && Math.abs(parseFloat(ulang.soc) - 60) <= 3, "dibuka lagi: tidak minta isi ulang, baterai terisi dari perkiraan", JSON.stringify(ulang));
    await ci.evaluate(() => { localStorage.removeItem("mulai-hari"); localStorage.removeItem("mulai-hari-lewati"); });
    await ci.reload({ waitUntil:"load" }); await ci.waitForFunction(() => document.querySelector("#n-steps .step"));
    if (dalamJam) await ci.click("#ci-lewati");
    const lewat = await ci.evaluate(() => ({ hidden:document.getElementById("checkin").hidden, l:localStorage.getItem("mulai-hari-lewati") === iso(new Date()) }));
    ok(lewat.hidden && (!dalamJam || lewat.l), "Lewati menutup halaman dan diingat untuk hari ini", JSON.stringify(lewat));
    await ci.evaluate(() => Peta.setKunciTomTom("kunci-uji"));
    await ci.click("#peta-toggle");
    await ci.waitForTimeout(800);
    const tt = await ci.evaluate(() => ({ ada:Peta.adaTomTom(), url:Peta.urlTomTom("k"), img:!!document.querySelector('img[src*="api.tomtom.com"]') }));
    ok(tt.ada && /api\.tomtom\.com\/traffic\/map\/4\/tile\/flow/.test(tt.url) && (ttCalls > 0 || tt.img), "kunci TomTom memasang lapisan kemacetan di peta", JSON.stringify({ ...tt, ttCalls }));
    await ci.goto(url + "index.html?checkin&tautan2#tomtom=abc123", { waitUntil:"load" });
    /* pengukuran otomatis (ukurmacet.js) diuji terpisah di bagian 17; di sini dimatikan
       supaya tiruan routing di bawah tidak ikut tersimpan sebagai pola terukur */
    await ci.evaluate(() => { window.ukurMacet = () => Promise.resolve(); UkurMacet.hapus(); });
    await ci.waitForFunction(() => document.querySelector("#n-steps .step"));
    const tl = await ci.evaluate(() => ({ k:Peta.kunciTomTom(), hash:location.hash, flag:document.getElementById("tautan").innerText }));
    ok(tl.k === "abc123" && tl.hash === "" && /TomTom/.test(tl.flag), "tautan pengaturan #tomtom= menyimpan kunci", JSON.stringify(tl));
    const CALIB_KECEPATAN = await ci.evaluate(() => CALIB.kecepatan);
    const rek = await ci.evaluate(() => {
      const ctx = dayCtx("2026-09-24"), L = LOKMAP.kota;
      const h = Rekomendasi.hitung({ ctx, keluar:17.25, pulang:21.5, rehat:"none", zona:"tng", filter:2, bat:30.08, rumah:false, hujan:false, acara:false, soc:70, deadKm:0 }, L, 70, false);
      const x = h.daftar.find(y => y.id === "cbd");
      const h2 = Rekomendasi.hitung({ ctx, keluar:11, pulang:21.5, rehat:"none", zona:"tng", filter:2, bat:30.08, rumah:false, hujan:false, acara:false, soc:70, deadKm:0 }, L, 70, false);
      const y = h2.daftar.find(z => z.id === "cbd");
      return x ? { macet:x.macet, menit:Math.round(x.jamPindah*60), km:Math.round(x.kmPindah), menitLancar:y ? Math.round(y.jamPindah*60) : null, macetLancar:y && y.macet } : null;
    });
    /* 24 menit = jalan kosong (OSRM). TomTom Traffic Index 2025 Jakarta: sore 2,2x -> 53; siang biasa 1,5x -> 36. */
    ok(rek && rek.macet === 2.2 && rek.menit === 53 && rek.macetLancar === 1.5 && rek.menitLancar === 36,
       "waktu pindah Modernland -> CBD: 53 menit jam pulang kantor, 36 menit siang (bukan 24 menit jalan kosong)", JSON.stringify(rek));
    /* Waktu tempuh dari tabel Koridor kerja Rute 700K, bukan km/26: CBD 46 mnt sibuk, 24 lancar; antar tempat masuk akal & simetris */
    const tempuh = await ci.evaluate(() => ({
      cbdSibuk: Math.round(jamTempuhRumah(LOKMAP.cbd, 18) * 60), cbdLancar: Math.round(jamTempuhRumah(LOKMAP.cbd, 14) * 60),
      bsdSibuk: Math.round(jamTempuhRumah(LOKMAP.bsd, 17) * 60),
      kmKarSer: Math.round(jarakAntar(LOKMAP.karawaci, LOKMAP.serpong) * 10) / 10, kmSerKar: Math.round(jarakAntar(LOKMAP.serpong, LOKMAP.karawaci) * 10) / 10,
      mntKotaCbd: Math.round(jamTempuhAntar(LOKMAP.kota, LOKMAP.cbd, 18) * 60), kmKotaBsd: jarakAntar(LOKMAP.kota, LOKMAP.bsd) }));
    ok(tempuh.cbdSibuk === 53 && tempuh.cbdLancar === 36 && tempuh.bsdSibuk === 34 && tempuh.mntKotaCbd === 53 && tempuh.kmKotaBsd === 16.7 &&
       tempuh.kmKarSer === tempuh.kmSerKar && tempuh.kmKarSer > 4 && tempuh.kmKarSer < 9,
       "waktu tempuh memakai menit terukur Rute 700K; jarak antar tempat simetris dan masuk akal", JSON.stringify(tempuh));

    /* Peluang.tempatAwal: lokasi ketik-manual (tanpa lat/lon, seperti hasil
       currentLok() untuk kecamatan custom) tidak boleh diam-diam dianggap di
       Modernland (LOKMAP.kota) -- harus tebakan kasar berbasis home terdekat. */
    const awal = await ci.evaluate(() => {
      const L = { id:"custom:test", n:"Uji jauh", home:72, res:50, z:"tng", luar:1, jauh:1, anchor:"kota" };
      const terdekat = Peluang.KANDIDAT.map(id => LOKMAP[id]).reduce((a, b) => Math.abs(b.home - 72) < Math.abs(a.home - 72) ? b : a);
      return { pilihan:Peluang.tempatAwal(L).id, terdekatSeharusnya:terdekat.id };
    });
    ok(awal.pilihan === awal.terdekatSeharusnya && awal.pilihan !== "kota",
       "Peluang.tempatAwal: lokasi manual tanpa koordinat memakai tebakan jarak-ke-rumah, bukan diam-diam Modernland", JSON.stringify(awal));

    /* Lalulintas: angka TomTom langsung menggantikan heuristik statis (opsional,
       kunci sudah terpasang dari tes di atas). Ganti route ubin-abort dengan
       fixture sukses khusus endpoint routing (rute lebih spesifik menang). */
    /* jakbar<->cbd punya menit terukur (RUAS_TERUKUR di data.js) -- pasangan
       inilah yang benar-benar lewat cabang ru.mnt di jamTempuhAntar. */
    /* Angka live hanya berlaku untuk perjalanan dalam 30 menit dari sekarang
       (liveBerlaku). Uji semantiknya dulu, lalu untuk tes berikut anggap jam
       14:00 hari itu = "sekarang" supaya hasilnya tidak bergantung jam mesin uji. */
    const lb = await ci.evaluate(() => {
      const d = new Date(), kini = d.getHours() + d.getMinutes() / 60, besok = new Date(d.getTime() + 864e5);
      return { kini:liveBerlaku(kini, iso(d)), duaJam:liveBerlaku(kini + 2, iso(d)), besok:liveBerlaku(kini, iso(besok)) };
    });
    ok(lb.kini && !lb.duaJam && !lb.besok, "macet TomTom langsung hanya untuk perjalanan sekarang (bukan 2 jam lagi, bukan besok)", JSON.stringify(lb));
    await ci.evaluate(() => { window.liveBerlaku = () => true; });
    const base = await ci.evaluate(() => jamTempuhAntar(LOKMAP.jakbar, LOKMAP.cbd, 14) * 60);
    await ci.route("**/api.tomtom.com/routing/**", r => r.fulfill({ status:200, contentType:"application/json",
      body:JSON.stringify({ routes:[{ summary:{ travelTimeInSeconds:1560, noTrafficTravelTimeInSeconds:1200 } }] }) }));
    const live = await ci.evaluate(async () => {
      await Lalulintas.segarkan([[LOKMAP.jakbar, LOKMAP.cbd]]);
      return { pengali:Lalulintas.pengaliCache(LOKMAP.jakbar, LOKMAP.cbd), menit:jamTempuhAntar(LOKMAP.jakbar, LOKMAP.cbd, 14) * 60 };
    });
    /* base = jalan kosong x faktor siang Jakarta (1,5); live = jalan kosong x 1,3 */
    ok(live.pengali && Math.abs(live.pengali - 1.3) < 0.01 && Math.abs(live.menit - base * 1.3 / 1.5) < 0.05,
       "Lalulintas: pengali TomTom (1,3x) menggantikan heuristik statis untuk pasangan koridor terukur", JSON.stringify({ ...live, base }));
    /* Kota (pangkalan/posisi bawaan) -> tempat inti lewat cabang v() (menit per
       tempat, bukan RUAS_TERUKUR) -- pasangan paling sering dipakai di aplikasi
       nyata, jadi harus ikut memakai angka live juga, bukan cuma pasangan yang
       kebetulan punya ruasTerukur. */
    const baseKota = await ci.evaluate(() => jamTempuhAntar(LOKMAP.kota, LOKMAP.cbd, 14) * 60);
    const liveKota = await ci.evaluate(async () => {
      await Lalulintas.segarkan([[LOKMAP.kota, LOKMAP.cbd]]);
      return { pengali:Lalulintas.pengaliCache(LOKMAP.kota, LOKMAP.cbd), menit:jamTempuhAntar(LOKMAP.kota, LOKMAP.cbd, 14) * 60 };
    });
    ok(liveKota.pengali && Math.abs(liveKota.menit - baseKota * 1.3 / 1.5) < 0.05,
       "Lalulintas: kota (posisi bawaan) -> CBD lewat cabang v() juga memakai angka TomTom", JSON.stringify({ ...liveKota, baseKota }));
    await setField(ci, "n-lok", "jakbar"); await setField(ci, "n-jam", 14);
    await ci.waitForFunction(() => /TomTom langsung/.test(document.getElementById("rek-list").innerText), null, { timeout:5000 });
    const kartuTT = await ci.evaluate(() => document.getElementById("rek-list").innerText);
    ok(/TomTom langsung/.test(kartuTT), "kartu rekomendasi menandai sumber TomTom langsung", kartuTT.slice(0, 300));
    /* Catatan: baseline "tanpa data live -> heuristik statis" sudah dibuktikan oleh
       pemeriksaan "waktu pindah Modernland -> CBD ..." dan "waktu tempuh ..." di atas,
       yang berjalan SEBELUM Lalulintas punya cache apa pun. */

    /* Jumat siang (taksiran jam sholat Jumat): blok "Siang" (11:00-14:00) turun
       di hari Jumat (shapeDay 5) dibanding hari kerja lain, hari libur/Minggu
       (shapeDay 0) tidak ikut turun karena bukan Jumat. */
    const jumat = await ci.evaluate(() => ({
      jumat: blockRate(BASE.find(b => b.n === "Siang"), 5),
      biasa: blockRate(BASE.find(b => b.n === "Siang"), 1),
      minggu: SHAPE[0].Siang
    }));
    ok(jumat.jumat < jumat.biasa && jumat.minggu === 32000,
       "Jumat siang (taksiran sholat Jumat) turun dari hari kerja biasa; Minggu tidak ikut berubah", JSON.stringify(jumat));

    /* Garis rute di peta: dari titik legs[].points respons routing yang SAMA
       dengan yang dipakai untuk pengali macet -- tidak ada permintaan TomTom
       terpisah untuk garisnya. */
    await ci.route("**/api.tomtom.com/routing/**", r => r.fulfill({ status:200, contentType:"application/json",
      body:JSON.stringify({ routes:[{ summary:{ travelTimeInSeconds:1560, noTrafficTravelTimeInSeconds:1200 },
        legs:[{ points:[{ latitude:-6.20, longitude:106.65 }, { latitude:-6.19, longitude:106.70 }, { latitude:-6.18, longitude:106.75 }] }] }] }) }));
    await ci.click("#peta-toggle");
    await ci.waitForTimeout(300);
    /* Pasangan serpong<->karawaci belum pernah lewat Lalulintas.segarkan() di
       tes ini (beda dari jakbar/kota->cbd di atas), supaya mock routing yang
       baru saja dipasang benar-benar dipanggil, bukan kena cache lama. */
    const rute = await ci.evaluate(async () => {
      const L = LOKMAP.serpong, tujuan = Object.assign({ diSini:false }, LOKMAP.karawaci);
      await Lalulintas.segarkan([[L, tujuan]]);
      SEKARANG.L = L; SEKARANG.rek = { daftar:[tujuan] };
      perbaruiRute();
      return { poin:Lalulintas.poinCache(L, tujuan), ada:Peta.adaRute() };
    });
    ok(rute.poin && rute.poin.length >= 2 && rute.ada,
       "garis rute ke tempat teratas digambar dari titik respons routing yang sama dengan pengali macet", JSON.stringify(rute));
    const kosong = await ci.evaluate(() => { Peta.gambarRute(null); return Peta.adaRute(); });
    ok(!kosong, "gambarRute(null) menghapus garis rute", JSON.stringify({ kosong }));
    await ci.close();
  }

  console.log("13. Rating, tingkat penerimaan/penyelesaian: dicatat, ditampilkan, tidak pengaruhi mesin");
  {
    const pf = await ctx.newPage();
    await pf.goto(url + "index.html", { waitUntil:"load" });
    await pf.waitForFunction(() => document.querySelector("#n-steps .step"));
    await pf.evaluate(() => { localStorage.removeItem("buku-setoran-v1"); document.getElementById("t-log").click(); });
    for (const [k, v] of Object.entries({ tgl:"2026-09-25", jam:10, trip:16, dpt:400000, ins:100000, kmt:200, kmp:130, kwh:30, biaya:140000 })) await setField(pf, k, v);
    const semulaRp = await pf.evaluate(() => document.getElementById("pv-net").textContent);
    for (const [k, v] of Object.entries({ rating:4.8, acc:88, comp:97 })) await setField(pf, k, v);
    const setelahRp = await pf.evaluate(() => document.getElementById("pv-net").textContent);
    ok(semulaRp === setelahRp && /Rp/.test(setelahRp), "rating/tingkat penerimaan/penyelesaian tidak mengubah perkiraan bersih", `${semulaRp} vs ${setelahRp}`);
    await pf.click("#save");
    const hasil = await pf.evaluate(() => {
      const baris = JSON.parse(localStorage.getItem("buku-setoran-v1")).find(r => r.id === "2026-09-25");
      return { rating:baris.rating, acc:baris.acc, comp:baris.comp, histText:document.getElementById("hist").innerText };
    });
    ok(hasil.rating === 4.8 && hasil.acc === 88 && hasil.comp === 97, "tersimpan sebagai angka di catatan harian", JSON.stringify(hasil));
    ok(/4[.,]8/.test(hasil.histText) && /88%/.test(hasil.histText) && /97%/.test(hasil.histText),
       "tabel Riwayat menampilkan rating, tingkat penerimaan, dan penyelesaian", hasil.histText.slice(0, 200));
    /* Boleh kosong: hari lain tanpa data ini tidak error dan tampil "—". */
    await setField(pf, "tgl", "2026-09-26");
    for (const [k, v] of Object.entries({ rating:"", acc:"", comp:"" })) await setField(pf, k, v);
    await pf.click("#save");
    const kosong = await pf.evaluate(() => JSON.parse(localStorage.getItem("buku-setoran-v1")).find(r => r.id === "2026-09-26"));
    ok(kosong.rating === 0 && kosong.acc === 0 && kosong.comp === 0, "boleh dikosongkan tanpa galat", JSON.stringify(kosong));
    await pf.evaluate(() => localStorage.removeItem("buku-setoran-v1"));
    await pf.close();
  }

  console.log("14. Order per blok jam + jejak zona GPS");
  {
    const pb = await ctx.newPage();
    await pb.goto(url + "index.html", { waitUntil:"load" });
    await pb.waitForFunction(() => document.querySelector("#n-steps .step"));
    await pb.evaluate(() => { localStorage.removeItem("buku-setoran-v1"); localStorage.removeItem("jejak-zona"); document.getElementById("t-log").click(); });
    const nBlok = await pb.evaluate(() => document.querySelectorAll("#blok-grid input").length);
    const nBase = await pb.evaluate(() => BASE.length);
    ok(nBlok === nBase && nBlok === 9, "satu isian per blok jam", `${nBlok} isian, BASE ${nBase}`);

    /* Kosong vs 0: Peak pagi 5, Siang 0 (narik tapi sepi), Peak sore 7; sisanya kosong. */
    for (const [k, v] of Object.entries({ tgl:"2026-09-24", jam:9, trip:"", dpt:380000, ins:90000, kmt:190, kmp:120, kwh:28, biaya:130000 })) await setField(pb, k, v);
    const idx = await pb.evaluate(() => ({ pp:BASE.findIndex(b => b.n === "Peak pagi"), si:BASE.findIndex(b => b.n === "Siang"), ps:BASE.findIndex(b => b.n === "Peak sore") }));
    await setField(pb, "ob-" + idx.pp, 5); await setField(pb, "ob-" + idx.si, 0); await setField(pb, "ob-" + idx.ps, 7);
    const cekKosong = await pb.evaluate(() => document.getElementById("blok-cek").textContent);
    ok(/12/.test(cekKosong), "jumlah per blok ditampilkan saat Order selesai kosong", cekKosong);

    /* Jejak GPS: 40 menit di Karawaci jam 12:00-12:40 (blok Siang), lalu 5 menit
       di Alsut jam 18:00 (blok Peak sore, di bawah 15 menit: tidak dilaporkan). */
    const jejak = await pb.evaluate(() => {
      const t = (h, m) => new Date("2026-09-24T" + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":00").getTime();
      const K = LOKMAP.karawaci, A = LOKMAP.alsut;
      for (let m = 0; m <= 40; m += 5) JejakZona.catat(K.lat, K.lon, t(12, m));
      JejakZona.catat(A.lat, A.lon, t(18, 0)); JejakZona.catat(A.lat, A.lon, t(18, 5));
      return JejakZona.untuk("2026-09-24");
    });
    ok(jejak && jejak.Siang === "karawaci" && !jejak["Peak sore"], "jejak GPS: zona dominan per blok, blok < 15 menit tidak dilaporkan", JSON.stringify(jejak));

    await pb.click("#save");
    const simpan = await pb.evaluate(() => JSON.parse(localStorage.getItem("buku-setoran-v1")).find(r => r.id === "2026-09-24"));
    ok(simpan.blok && simpan.blok["Peak pagi"] === 5 && simpan.blok.Siang === 0 && simpan.blok["Peak sore"] === 7 &&
       !("Subuh" in simpan.blok) && Object.keys(simpan.blok).length === 3,
       "tersimpan: blok kosong tidak ikut, blok 0 tetap tercatat 0", JSON.stringify(simpan.blok));
    ok(simpan.trip === 12, "Order selesai kosong diisi dari jumlah per blok", String(simpan.trip));
    ok(simpan.blokZona && simpan.blokZona.Siang === "karawaci", "zona per blok dari jejak GPS ikut tersimpan", JSON.stringify(simpan.blokZona));

    /* Tidak cocok dengan Order selesai: diberi tahu, tidak diam-diam. */
    await setField(pb, "trip", 15);
    const cekBeda = await pb.evaluate(() => ({ t:document.getElementById("blok-cek").textContent, c:document.getElementById("blok-cek").className }));
    ok(/12/.test(cekBeda.t) && /15/.test(cekBeda.t) && /err/.test(cekBeda.c), "jumlah per blok beda dari Order selesai: diberi tahu", JSON.stringify(cekBeda));

    /* Tanpa isian per blok: catatan lama tetap bisa disimpan seperti biasa. */
    await pb.evaluate(() => document.querySelectorAll("#blok-grid input").forEach(i => { i.value = ""; }));
    await setField(pb, "tgl", "2026-09-23");
    await pb.click("#save");
    const polos = await pb.evaluate(() => JSON.parse(localStorage.getItem("buku-setoran-v1")).find(r => r.id === "2026-09-23"));
    ok(polos && !("blok" in polos) && !("blokZona" in polos), "tanpa isian per blok: tidak ada field blok, tidak ada jejak tanggal lain", JSON.stringify(polos));
    /* Kalender 2027 (SKB 3 Menteri) + konteks libur sekolah/Ramadan. */
    const kal = await pb.evaluate(() => {
      const n27 = Object.keys(HOLI).filter(k => k.startsWith("2027"));
      return { libur:n27.filter(k => HOLI[k][1] === "L").length, cuti:n27.filter(k => HOLI[k][1] === "C").length,
        lebaran:dayCtx("2027-03-10").holi && dayCtx("2027-03-10").holi[0],
        ram:dayCtx("2027-02-20").ramadan, ramLuar:dayCtx("2027-03-20").ramadan,
        sek:dayCtx("2026-12-28").sekolahLibur, sekMasuk:dayCtx("2026-10-05").sekolahLibur,
        multSama:dayCtx("2027-02-24").mult === DAYMULT[dayCtx("2027-02-24").dow] };
    });
    ok(kal.libur === 18 && kal.cuti === 8 && /Idulfitri/.test(kal.lebaran), "kalender 2027: 18 libur nasional + 8 cuti bersama", JSON.stringify(kal));
    ok(kal.ram && !kal.ramLuar && kal.sek && !kal.sekMasuk, "konteks Ramadan dan libur sekolah terbaca dari tanggal", JSON.stringify(kal));
    ok(kal.multSama, "konteks Ramadan tidak diam-diam mengubah angka perkiraan", JSON.stringify(kal));
    await pb.evaluate(() => { localStorage.removeItem("buku-setoran-v1"); localStorage.removeItem("jejak-zona"); });

    /* Belajar: data buatan dengan pola yang diketahui harus ditemukan kembali. */
    const bel = await pb.evaluate(() => {
      const kosong = Belajar.hitung([]);
      const nol = BASE.every(b => Belajar.pengali(1, b.n) === 1) && Belajar.tempat("karawaci") === 1;
      /* n hari kerja (Selasa-Kamis), 09:30-20:00: Peak sore 2x perkiraan, Siang 0,5x, lainnya pas. */
      /* Order buatan = perkiraan mesin untuk jam BENAR-BENAR menyetir hari itu
         (Belajar.jamPerBlok: istirahat & ngecas dikeluarkan) x faktor pola. */
      function hari(n, faktor, tempat, mulaiTgl, opsi){
        opsi = opsi || {};
        const rows = [], d0 = new Date(mulaiTgl + "T00:00:00");
        for (let i = 0; rows.length < n; i++){
          const d = new Date(d0.getTime() + i * 864e5); if ([2, 3, 4].indexOf(d.getDay()) < 0) continue;
          const tgl = iso(d); if (HOLI[tgl]) continue;
          const ctx = dayCtx(tgl), jd = Object.assign({ keluar:9.5, pulang:20, zona:"tng" }, opsi.jendela || {}), blok = {}, blokZona = {};
          const jamB = Belajar.jamPerBlok({ jendela:jd }, jd, ctx);
          let total = 0;
          BASE.forEach(b => {
            const jam = jamB[b.n] || 0; if (jam < 0.25) return;
            const t = tempat ? LOKMAP[tempat] : null;
            blok[b.n] = Math.round(Belajar.perJam(b, ctx, t, "tng") * jam * (faktor[b.n] || 1) * 10) / 10;
            total += blok[b.n];
            if (t) blokZona[b.n] = tempat;
          });
          rows.push(opsi.totalSaja ? { id:tgl, jendela:jd, trip:total, dpt:1, kmt:1 } : { id:tgl, blok, blokZona, jendela:jd, trip:0, dpt:1, kmt:1 });
        }
        return rows;
      }
      const pola = { "Peak sore":2, "Siang":0.5 };
      const sedikit = Belajar.hitung(hari(1, pola, null, "2026-06-01")) && { ps:Belajar.pengali(2, "Peak sore"), si:Belajar.pengali(2, "Siang") };
      Belajar.hitung(hari(20, pola, null, "2026-06-01"));
      const banyak = { ps:Belajar.pengali(2, "Peak sore"), si:Belajar.pengali(2, "Siang"), pa:Belajar.pengali(2, "Pagi akhir"), pr:Belajar.pengali(2, "Pra-peak") };
      /* dipakai mesin: bersih sore naik dibanding tanpa belajar */
      const o = { ctx:dayCtx("2026-10-06"), keluar:15.25, pulang:21.5, rehat:"none", zona:"tng", filter:2, bat:30.08, rumah:false, hujan:false, acara:false, soc:90 };
      const netBelajar = simulate(o).net;
      Belajar.hitung([]);
      const netAwal = simulate(o).net;
      /* tempat: 12 hari di Karawaci 1,6x perkiraan, 12 hari di BSD pas perkiraan.
         Karawaci harus lebih tinggi dari BSD; tempat tanpa data (Alsut) tetap 1. */
      const semua = ["Pagi akhir", "Siang", "Jam mati", "Pra-peak", "Peak sore", "Malam"];
      const f16 = {}; semua.forEach(n => { f16[n] = 1.6; });
      Belajar.hitung(hari(12, f16, "karawaci", "2026-06-01").concat(hari(12, {}, "bsd", "2026-08-03")));
      const tmp = { f:Belajar.tempat("karawaci"), bsd:Belajar.tempat("bsd"), bobot:bobotTempat("karawaci", "Siang"), lain:Belajar.tempat("alsut") };
      Belajar.hitung([]);
      /* Double check #3: istirahat 10:30-15:00, order PAS perkiraan -> tidak ada yang terbaca sepi */
      const pas = (rows) => { Belajar.hitung(rows); const m = BASE.map(b => Belajar.pengali(2, b.n)); Belajar.hitung([]); return m; };
      const istirahatBlok = pas(hari(20, {}, null, "2026-06-01", { jendela:{ keluar:5.25, pulang:21.5, rehat:[10.5, 15] } }));
      const istirahatTotal = pas(hari(20, {}, null, "2026-06-01", { jendela:{ keluar:5.25, pulang:21.5, rehat:[10.5, 15] }, totalSaja:true }));
      /* salah ketik: 10 hari normal + 1 hari Malam = 40 */
      const normal = hari(10, {}, null, "2026-06-01"), ketik = hari(1, {}, null, "2026-09-01")[0];
      ketik.blok.Malam = 40;
      Belajar.hitung(normal.concat([ketik])); const malam40 = Belajar.pengali(2, "Malam"); Belajar.hitung([]);
      const nolSatu = hari(1, { "Siang":0 }, null, "2026-06-01"); Belajar.hitung(nolSatu); const siang0 = Belajar.pengali(2, "Siang"); Belajar.hitung([]);
      /* regresi A: hasil belajar tidak boleh bergantung pada tebakan baterai / jadwal ngecas mesin */
      const dasarSoc = hari(10, { "Peak sore":1.4 }, null, "2026-06-01");
      const pakaiSoc = (soc) => { Belajar.hitung(dasarSoc.map(r => Object.assign({}, r, { jendela:Object.assign({}, r.jendela, soc ? { soc } : {}) }))); const m = BASE.map(b => Belajar.pengali(2, b.n)); Belajar.hitung([]); return m.join(","); };
      const socSama = pakaiSoc(null) === pakaiSoc(20) && pakaiSoc(20) === pakaiSoc(95);
      return { nol, sedikit, banyak, netBelajar, netAwal, tmp, istirahatBlok, istirahatTotal, malam40, siang0, socSama };
    });
    ok(bel.nol, "tanpa data: semua pengali belajar = 1 (angka awal)", JSON.stringify(bel));
    ok(bel.banyak.ps > 1.6 && bel.banyak.si < 0.65 && Math.abs(bel.banyak.pa - 1) < 0.1 && Math.abs(bel.banyak.pr - 1) < 0.1,
       "20 hari: pola 2x sore / 0,5x siang ditemukan kembali, blok lain tetap ±1", JSON.stringify(bel.banyak));
    ok(bel.sedikit.ps < bel.banyak.ps && bel.sedikit.si > bel.banyak.si && bel.sedikit.ps < 1.6,
       "1 hari saja: masih ditarik ke angka awal (tidak langsung percaya)", JSON.stringify({ sedikit:bel.sedikit, banyak:bel.banyak }));
    ok(bel.istirahatBlok.every(m => Math.abs(m - 1) < 0.08) && bel.istirahatTotal.every(m => Math.abs(m - 1) < 0.08),
       "istirahat 10:30-15:00 dan jam ngecas tidak terbaca 'sepi' (order pas perkiraan -> semua pengali ±1)", JSON.stringify({ blok:bel.istirahatBlok.map(m => +m.toFixed(2)), total:bel.istirahatTotal.map(m => +m.toFixed(2)) }));
    ok(bel.malam40 < 1.2 && bel.siang0 === 1, "salah ketik '40' tidak menjenuhkan pola; satu hari '0' belum dipakai (minimal 3 hari)", JSON.stringify({ malam40:bel.malam40, siang0:bel.siang0 }));
    ok(bel.socSama, "hasil belajar tidak bergantung pada tebakan baterai/jadwal ngecas mesin", String(bel.socSama));
    ok(bel.netBelajar > bel.netAwal, "hasil belajar dipakai perkiraan bersih (sore ramai -> bersih sore naik)", `${Math.round(bel.netAwal)} -> ${Math.round(bel.netBelajar)}`);
    ok(bel.tmp.f > 1.1 && bel.tmp.bsd < 0.95 && bel.tmp.f / bel.tmp.bsd > 1.35 && bel.tmp.lain === 1,
       "tempat yang lebih ramai (zona GPS) terpisah dari yang biasa; tempat tanpa data tetap 1", JSON.stringify(bel.tmp));
    await pb.close();
  }

  console.log("16. Carter: dicatat terpisah, masuk saldo bulan, dibandingkan dengan narik");
  {
    const pc = await ctx.newPage();
    await pc.goto(url + "index.html", { waitUntil:"load" });
    await pc.waitForFunction(() => document.querySelector("#n-steps .step"));
    await pc.evaluate(() => { localStorage.removeItem("buku-setoran-v1"); document.getElementById("t-log").click(); });
    const hariIni = await pc.evaluate(() => iso(new Date()));
    /* hari carter saja: kolom Grab kosong */
    for (const [k, v] of Object.entries({ tgl:hariIni, jam:"", trip:"", dpt:"", ins:"", kmt:"", kmp:"", kwh:"", biaya:"",
                                          "ct-jenis":"setengah", "ct-tarif":400000, "ct-jam":6, "ct-km":100, "ct-biaya":20000 })) await setField(pc, k, v);
    await pc.click("#save");
    const c1 = await pc.evaluate((t) => {
      const r = JSON.parse(localStorage.getItem("buku-setoran-v1")).find(x => x.id === t);
      return { r, net:r && carterBersih(r.carter).net, listrikHarus:100 / CALIB.kmkwh * TARIF_KWH, mnet:document.getElementById("mnet").textContent,
               info:document.getElementById("carter-info").innerText, hidden:document.getElementById("carter-info").hidden, rpkm:CALIB.rpkm, BASE_RPKM };
    }, hariIni);
    ok(c1.r && c1.r.carter && c1.r.carter.tarif === 400000 && c1.r.carter.jenis === "setengah", "hari carter saja bisa disimpan (kolom Grab kosong)", JSON.stringify(c1.r));
    ok(Math.abs(c1.net - (400000 - 20000 - c1.listrikHarus)) < 1, "bersih carter = dibayar - biaya - listrik km carter", `${c1.net}`);
    ok(/Rp/.test(c1.mnet) && !/Rp 0$/.test(c1.mnet) && !c1.hidden && /Setengah hari/.test(c1.info), "saldo bulan memuat carter; ringkasan carter tampil", JSON.stringify({ mnet:c1.mnet, info:c1.info }));
    ok(c1.rpkm === c1.BASE_RPKM, "carter tidak mencemari kalibrasi Grab (Rp/km tetap angka awal)", `${c1.rpkm}`);
    /* kalkulator tawaran */
    await pc.evaluate(() => document.getElementById("t-plan").click());
    const tawaran = async (tarif) => {
      for (const [k, v] of Object.entries({ "tf-tgl":"2026-10-06", "tf-mulai":8, "tf-jam":6, "tf-tarif":tarif, "tf-km":120, "tf-biaya":0 })) await setField(pc, k, v);
      await pc.click("#tf-hitung");
      return pc.evaluate(() => document.getElementById("tf-hasil").innerText);
    };
    const mahal = await tawaran(1500000), murah = await tawaran(50000);
    ok(/Carter lebih untung/.test(mahal) && /Narik lebih untung/.test(murah) && /08:00.14:00/.test(mahal),
       "tawaran carter dibandingkan dengan narik di jam yang sama (08:00–14:00)", `${mahal} | ${murah}`);
    await pc.evaluate(() => localStorage.removeItem("buku-setoran-v1"));
    await pc.close();
  }

  console.log("17. Ukur macet otomatis (TomTom tiruan): jatah, galat, dan pemakaian di mesin");
  {
    const pu = await ctx.newPage();
    let nMinta = 0, nLive = 0, contohUrl = [], mode = "ok";
    /* TomTom tiruan: waktu = jarak lurus x 1,3 / 50 km/jam, dikali faktor jam
       (sore 2,5x, pagi 2,0x, lainnya 1,4x) -- sengaja beda dari asumsi. */
    const tiruan = r => {
      const u = r.request().url();
      if (!/departAt=/.test(u)){ nLive++; return r.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ routes:[{ summary:{ travelTimeInSeconds:1200, noTrafficTravelTimeInSeconds:1000 } }] }) }); }
      nMinta++; if (contohUrl.length < 3) contohUrl.push(u);
      if (mode === "429") return r.fulfill({ status:429, body:"" });
      if (mode === "400") return r.fulfill({ status:400, body:"" });
      if (mode === "putus") return r.abort("failed");
      if (mode === "500") return r.fulfill({ status:503, body:"" });
      if (mode === "html") return r.fulfill({ status:200, contentType:"text/html", body:"<html>Login wifi</html>" });
      if (mode === "kosong") return r.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ routes:[{ summary:{} }] }) });
      const m = u.match(/calculateRoute\/([-\d.]+),([-\d.]+):([-\d.]+),([-\d.]+)\//), d = u.match(/departAt=\d{4}-\d\d-\d\dT(\d\d)%3A(\d\d)/);
      const km = Math.hypot((+m[3] - +m[1]) * 111, (+m[4] - +m[2]) * 110) * 1.3, jam = +d[1] + +d[2] / 60;
      const t0 = km / 50 * 3600, f = (jam >= 16.5 && jam < 20) ? 2.5 : (jam >= 6 && jam < 9) ? 2.0 : 1.4;
      r.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ routes:[{ summary:{ travelTimeInSeconds:t0 * f, noTrafficTravelTimeInSeconds:t0, historicTrafficTravelTimeInSeconds:t0 * f } }] }) });
    };
    await pu.route("**/api.tomtom.com/routing/**", tiruan);
    await pu.goto(url + "index.html", { waitUntil:"load" });
    await pu.waitForFunction(() => document.querySelector("#n-steps .step"));
    /* matikan pengukuran otomatis dan macet-langsung otomatis di halaman uji ini:
       jumlah permintaan di bawah harus bisa dihitung persis */
    await pu.evaluate(() => { window._ukurAsli = ukurMacet; window.ukurMacet = () => Promise.resolve(); window.lalulintasOtomatis = () => {}; UkurMacet.hapus(); localStorage.removeItem("tomtom-jatah"); });
    const dasarN = nMinta + nLive;

    const tanpaKunci = await pu.evaluate(async () => { Peta.setKunciTomTom(""); return UkurMacet.jalankan({ jeda:0 }); });
    ok(tanpaKunci.alasan === "tanpa kunci" && nMinta === 0, "tanpa kunci TomTom: tidak ada permintaan", JSON.stringify({ tanpaKunci, nMinta }));

    const hari1 = await pu.evaluate(async () => { Peta.setKunciTomTom("kunci-uji"); const h = await UkurMacet.jalankan({ jeda:0, perSesi:5000 });
      return { h, s:UkurMacet.status(), batas:UkurMacet.batasHarian(), jh:Lalulintas.jatahHari("rute") }; });
    ok(hari1.batas === Math.min(300, Math.floor(hari1.jh * 0.45)) && hari1.s.hariIni === hari1.batas && hari1.s.segar === hari1.batas && nMinta === hari1.batas && /jatah harian/.test(hari1.h.alasan),
       "satu hari: pengukuran berhenti di min(300, 45% jatah Routing harian), semuanya tersimpan", JSON.stringify({ ...hari1, nMinta }));
    ok(contohUrl.every(u => /departAt=\d{4}-\d\d-\d\dT\d\d%3A\d\d%3A00%2B07%3A00/.test(u) && /computeTravelTimeFor=all/.test(u) && !/routeRepresentation/.test(u)),
       "URL: departAt dengan zona +07:00, computeTravelTimeFor=all, tanpa geometri", contohUrl[0]);
    const tgl = await pu.evaluate(() => ({ hk:UkurMacet.tanggalUntuk("hk"), lb:UkurMacet.tanggalUntuk("lb"), dHk:new Date(UkurMacet.tanggalUntuk("hk") + "T00:00:00").getDay(), dLb:new Date(UkurMacet.tanggalUntuk("lb") + "T00:00:00").getDay() }));
    ok([2, 3].includes(tgl.dHk) && tgl.dLb === 6, "tanggal ukur: Selasa/Rabu untuk hari kerja, Sabtu untuk akhir pekan", JSON.stringify(tgl));

    /* dipakai mesin: rute rumah hari kerja (prioritas pertama) sudah terukur */
    const pakai = await pu.evaluate(() => {
      const hk = "2026-10-06";   /* Selasa */
      const d = JSON.parse(localStorage.getItem("ukur-macet")), m = (k) => d.hasil[k] && d.hasil[k].m;
      const cbd18 = jamTempuhRumah(LOKMAP.cbd, 18, undefined, "hk") * 60, cbd165 = m("cbd>kota|hk|16.5"), cbd18ukur = m("cbd>kota|hk|18");
      const cbd1725 = jamTempuhRumah(LOKMAP.cbd, 17.25, undefined, "hk") * 60;
      const bsd85 = jamTempuhAntar(LOKMAP.kota, LOKMAP.bsd, 8.5, hk) * 60;
      return { cbd18, cbd18ukur, cbd1725, tengah:(cbd165 + cbd18ukur) / 2, bsd85, bsd85ukur:m("kota>bsd|hk|8.5"),
               fTng18:UkurMacet.faktorWilayah(18, false, "hk"), fJkt8:UkurMacet.faktorWilayah(8, true, "hk"), fTng12:faktorLalin(12, false, "hk") };
    });
    ok(Math.abs(pakai.cbd18 - pakai.cbd18ukur) < 0.01 && Math.abs(pakai.cbd1725 - pakai.tengah) < 0.01 && Math.abs(pakai.bsd85 - pakai.bsd85ukur) < 0.01,
       "mesin memakai menit terukur (pulang CBD 18:00, pergi BSD 08:30) dan menginterpolasi di antara jam ukur", JSON.stringify(pakai));
    ok(Math.abs(pakai.fTng18 - 2.5) < 0.01 && Math.abs(pakai.fJkt8 - 2.0) < 0.01 && Math.abs(pakai.fTng12 - 1.4) < 0.05,
       "faktor wilayah dari median rute terukur menggantikan asumsi Tangerang/Jakarta", JSON.stringify(pakai));

    /* hari berikutnya (pengukuran) tapi jatah Routing HP hari ini tetap: berhenti tepat di jatah harian */
    const lanjut = await pu.evaluate(async () => {
      const hasil = [];
      for (let i = 0; i < 4; i++){
        const d = JSON.parse(localStorage.getItem("ukur-macet")); d.hari.tgl = "2000-01-0" + (i + 1); localStorage.setItem("ukur-macet", JSON.stringify(d));
        const h = await UkurMacet.jalankan({ jeda:0, perSesi:5000 }); hasil.push(h.diukur + ":" + h.alasan);
      }
      return { hasil, s:UkurMacet.status(), sisa:Lalulintas.sisaJatah("rute"), st:Lalulintas.statusJatah("rute") };
    });
    /* macet-langsung yang sempat jalan saat halaman dibuka memakai jatah yang SAMA */
    ok(lanjut.sisa === 40 && lanjut.st.hari === lanjut.st.hariMaks - 40 && nMinta + nLive - dasarN === lanjut.st.hariMaks - 40 && lanjut.hasil.some(x => /jatah TomTom/.test(x)),
       "jatah Routing harian HP dihormati lintas sesi pengukuran (pengukuran + macet langsung); 40 terakhir disisakan untuk jalan pulang", JSON.stringify({ ...lanjut, nMinta, nLive, dasarN }));

    /* hari baru untuk TomTom: sisa antrean selesai, lalu kosong */
    const selesai = await pu.evaluate(async () => {
      let hari = 0;
      while (UkurMacet._antrean().length && hari < 20){
        localStorage.removeItem("tomtom-jatah");
        const d = JSON.parse(localStorage.getItem("ukur-macet")); d.hari.tgl = "2000-02-" + String(++hari).padStart(2, "0"); localStorage.setItem("ukur-macet", JSON.stringify(d));
        await UkurMacet.jalankan({ jeda:0, perSesi:5000 });
      }
      const c = await UkurMacet.jalankan({ jeda:0, perSesi:5000 });
      return { hari, c, s:UkurMacet.status(), antre:UkurMacet._antrean().length };
    });
    ok(selesai.s.segar === selesai.s.total && selesai.s.total === 1440 && selesai.antre === 0 && selesai.c.diukur === 0,
       "satu putaran lengkap 1.440 ukuran (72 rute x 10 jam x 2 jenis hari), lalu antrean kosong", JSON.stringify(selesai));

    /* faktor wilayah tidak tergantung urutan panggilan (dulu memo per 15 menit) */
    const urut = await pu.evaluate(() => { UkurMacet.muatUlang(); UkurMacet.faktorWilayah(16.4, false, "hk"); const b = UkurMacet.faktorWilayah(16.6, false, "hk");
      UkurMacet.muatUlang(); return { b, c:UkurMacet.faktorWilayah(16.6, false, "hk") }; });
    ok(urut.b === urut.c, "faktor wilayah jam 16:36 sama, dihitung sesudah 16:24 atau langsung", JSON.stringify(urut));

    /* jawaban tak masuk akal (rute memutar 6 jam) tidak dipakai mesin */
    const aneh = await pu.evaluate(() => {
      const d = JSON.parse(localStorage.getItem("ukur-macet")), k = "kota>bsd|hk|12.5", asli = d.hasil[k];
      d.hasil[k] = { m:360, f:9, at:Date.now() }; localStorage.setItem("ukur-macet", JSON.stringify(d)); UkurMacet.muatUlang();
      const m = UkurMacet.menitRute("kota", "bsd", 12.5, "hk");
      d.hasil[k] = asli; localStorage.setItem("ukur-macet", JSON.stringify(d)); UkurMacet.muatUlang();
      return { m, pulih:UkurMacet.menitRute("kota", "bsd", 12.5, "hk") };
    });
    ok(aneh.m !== 360 && aneh.pulih > 0, "ukuran tak masuk akal (360 menit, 9x) diabaikan; ukuran wajar tetap dipakai", JSON.stringify(aneh));

    /* kartu menyebut sumber macetnya: pola TomTom terukur (bukan asumsi) */
    const sumber = await pu.evaluate(() => {
      const c = dayCtx("2026-10-06"), L = LOKMAP.kota;
      const o = { ctx:c, keluar:10.5, pulang:21.5, rehat:"none", zona:"tng", filter:2, bat:30.08, rumah:false, hujan:false, acara:false, soc:80, deadKm:0, kmHome:L.home };
      const h = Rekomendasi.tujuan(o, L, 80, false, "bsd");
      return { src:h && h.x && h.x.sumberMacet, f:Rekomendasi.faktor(o, 80).join(", ") };
    });
    ok(sumber.src === "terukur" && /pola macet TomTom terukur \(1440 dari 1440/.test(sumber.f),
       "kartu saran/tujuan menyebut sumber macet: pola TomTom terukur", JSON.stringify(sumber));

    /* pembaruan 28 hari dan data > 90 hari tidak dipakai */
    const umur = await pu.evaluate(() => {
      const d = JSON.parse(localStorage.getItem("ukur-macet")), k = "cbd>kota|hk|18";
      d.hasil[k].at = Date.now() - 30 * 864e5; localStorage.setItem("ukur-macet", JSON.stringify(d));
      const antre30 = UkurMacet._antrean().map(x => x.k).includes(k), dipakai30 = UkurMacet.menitRute("cbd", "kota", 18, "hk") != null;
      Object.keys(d.hasil).forEach(x => { d.hasil[x].at = Date.now() - 100 * 864e5; });
      localStorage.setItem("ukur-macet", JSON.stringify(d)); UkurMacet.muatUlang();
      return { antre30, dipakai30, m100:UkurMacet.menitRute("cbd", "kota", 18, "hk"), f100:UkurMacet.faktorWilayah(18, false, "hk"), f:faktorLalin(18, false, "hk") };
    });
    ok(umur.antre30 && umur.dipakai30, "ukuran 28-90 hari: masih dipakai, tapi masuk antrean ukur ulang", JSON.stringify(umur));
    ok(umur.m100 === null && umur.f100 === null && umur.f === 1.6, "ukuran lebih tua dari 90 hari tidak dipakai (kembali ke asumsi)", JSON.stringify(umur));

    /* 429 = terlalu cepat (per detik): jeda 5 menit; 3x 429 tanpa sukses = berhenti sampai besok */
    const sebelum429 = nMinta; mode = "429";
    const s429 = await pu.evaluate(async () => {
      localStorage.removeItem("tomtom-jatah"); UkurMacet.hapus();
      const lewatJeda = () => { const j = JSON.parse(localStorage.getItem("tomtom-jatah")); j.p.rute.jedaSampai = 1; localStorage.setItem("tomtom-jatah", JSON.stringify(j)); };
      const h1 = await UkurMacet.jalankan({ jeda:0 });
      const t1 = Lalulintas.tertahan("rute"), sisa1 = Lalulintas.sisaJatah("rute"), insiden1 = Lalulintas.tertahan("insiden");
      const h1b = await UkurMacet.jalankan({ jeda:0 });            /* masih jeda: tidak ada permintaan */
      await Lalulintas.segarkan([[LOKMAP.kota, LOKMAP.bsd]]);       /* macet langsung juga menunggu */
      lewatJeda(); await UkurMacet.jalankan({ jeda:0 });
      lewatJeda(); const h3 = await UkurMacet.jalankan({ jeda:0 });
      return { h1, t1, sisa1, insiden1, h1b, h3, t3:Lalulintas.tertahan("rute"), boleh:Lalulintas.bolehMinta("rute"), sisa:Lalulintas.sisaJatah("rute"),
               insiden3:Lalulintas.tertahan("insiden"), s:UkurMacet.status() };
    });
    ok(s429.t1 === "jeda" && s429.sisa1 > 100 && s429.insiden1 === null && /jeda/.test(s429.h1.alasan) && s429.h1b.diukur === 0,
       "balasan 429 pertama: jeda 5 menit (bukan langsung habis sehari), semua permintaan menunggu", JSON.stringify(s429));
    ok(nMinta - sebelum429 === 3 && s429.t3 === "stop" && !s429.boleh && s429.sisa === 0 && !s429.s.berhenti && s429.insiden3 === null,
       "3x 429 berturut-turut: Routing berhenti sampai besok (layanan kejadian jalan tidak ikut; pengukuran tidak ditandai rusak)", JSON.stringify({ s429, n:nMinta - sebelum429 }));
    mode = "ok";
    const reset429 = await pu.evaluate(async () => {
      const t = iso(new Date());
      localStorage.setItem("tomtom-jatah", JSON.stringify({ v:2, bln:t.slice(0, 7), p:{ rute:{ bulan:5, tgl:t, hari:5, stop:false, n429:2, jedaSampai:1 } } }));
      await UkurMacet.jalankan({ jeda:0, perSesi:1 });
      return JSON.parse(localStorage.getItem("tomtom-jatah")).p.rute;
    });
    ok(reset429.n429 === 0 && !reset429.stop && reset429.hari === 6 && reset429.bulan === 6, "jawaban sukses menghapus hitungan 429", JSON.stringify(reset429));

    /* sinyal putus / 5xx / halaman login wifi: sesi selesai, TIDAK berhenti selamanya */
    for (const [md, pola] of [["putus", /Tidak tersambung/], ["500", /gangguan/], ["html", /bukan dari TomTom/]]){
      mode = md; const n0 = nMinta;
      const sj = await pu.evaluate(async () => {
        localStorage.removeItem("tomtom-jatah"); UkurMacet.hapus();
        const hs = [];
        for (let i = 0; i < 4; i++) hs.push((await UkurMacet.jalankan({ jeda:0 })).alasan);
        return { hs, s:UkurMacet.status() };
      });
      ok(nMinta - n0 === 4 && !sj.s.berhenti && pola.test(sj.hs[0]) && pola.test(sj.s.galat),
         "gangguan jaringan (" + md + "): tiap sesi berhenti di galat pertama, tapi dicoba lagi sesi berikutnya (tidak mati)", JSON.stringify({ sj, n:nMinta - n0 }));
    }

    /* 400 tiga kali: berhenti sendiri dengan pesan, tidak mencoba lagi tanpa ditekan */
    mode = "400"; const sebelum400 = nMinta;
    const s400 = await pu.evaluate(async () => {
      localStorage.removeItem("tomtom-jatah"); UkurMacet.hapus();
      const h = await UkurMacet.jalankan({ jeda:0 });
      const h2 = await UkurMacet.jalankan({ jeda:0 });
      const s = UkurMacet.status();
      window.ukurMacet = (p) => UkurMacet.jalankan({ paksa:!!p, jeda:0 }).then(() => tandaiUkur());
      tandaiUkur();
      return { h, h2, s, teks:document.getElementById("ukur-status").textContent };
    });
    ok(nMinta - sebelum400 === 3 && s400.s.berhenti && /HTTP 400/.test(s400.s.galat) && s400.h2.alasan === "berhenti" && /berhenti sendiri/.test(s400.teks),
       "ditolak 3x (HTTP 400): berhenti sendiri, pesan terlihat di Pengaturan anak, tidak mencoba lagi diam-diam", JSON.stringify({ s400, n:nMinta - sebelum400 }));

    /* jawaban tanpa angka: dihitung gagal, tidak disimpan */
    mode = "kosong";
    const sKosong = await pu.evaluate(async () => { localStorage.removeItem("tomtom-jatah"); UkurMacet.hapus(); await UkurMacet.jalankan({ jeda:0 }); return UkurMacet.status(); });
    ok(sKosong.segar === 0 && sKosong.berhenti && /tanpa waktu tempuh/.test(sKosong.galat), "jawaban tanpa waktu tempuh: tidak disimpan, berhenti dengan pesan", JSON.stringify(sKosong));

    /* dua tab bersamaan (aplikasi terpasang + browser): tidak dobel */
    mode = "ok";
    const pu2 = await ctx.newPage();
    await pu2.route("**/api.tomtom.com/routing/**", tiruan);
    await pu2.goto(url + "index.html", { waitUntil:"networkidle" });
    await pu2.evaluate(() => { window.ukurMacet = () => Promise.resolve(); window.lalulintasOtomatis = () => {}; });
    await pu.evaluate(() => { localStorage.removeItem("tomtom-jatah"); UkurMacet.hapus(); });
    const n2 = nMinta, urlDua = new Set();
    const catat = req => { if (/departAt=/.test(req.url())) urlDua.add(req.url()); };
    pu.on("request", catat); pu2.on("request", catat);
    const [t1, t2] = await Promise.all([pu.evaluate(() => UkurMacet.jalankan({ jeda:0, perSesi:5000 })), pu2.evaluate(() => UkurMacet.jalankan({ jeda:0, perSesi:5000 }))]);
    const t3 = await pu2.evaluate(() => UkurMacet.jalankan({ jeda:0, perSesi:5000 }));
    pu.off("request", catat); pu2.off("request", catat);
    const sDua = await pu2.evaluate(() => { UkurMacet.muatUlang(); return UkurMacet.status(); });
    ok(nMinta - n2 === sDua.maksHarian && urlDua.size === sDua.maksHarian && [t1.alasan, t2.alasan].includes("sedang berjalan") && sDua.segar === sDua.maksHarian && /jatah harian/.test(t3.alasan),
       "dua tab bersamaan: hanya satu yang mengukur, total tetap sebatas jatah harian, tidak ada ukuran dobel", JSON.stringify({ t1, t2, t3, n:nMinta - n2, unik:urlDua.size, sDua }));

    const nL0 = nLive;
    await pu.evaluate(() => localStorage.removeItem("tomtom-jatah"));
    const lari = u => u.evaluate(async () => { const url = Lalulintas.urlRute(LOKMAP.kota, LOKMAP.bsd, "kunci-uji", {}); let n = 0;
      while (true){ try { await Lalulintas.minta(url); n++; } catch (e) { return n; } } });
    const [a1, a2] = await Promise.all([lari(pu), lari(pu2)]);
    const jh = await pu.evaluate(() => Lalulintas.jatahHari("rute"));
    ok(a1 + a2 === jh - 40 && nLive - nL0 === jh - 40 && jh > 40, "dua tab menguras jatah bersamaan: tepat sebanyak jatah Routing hari ini (tanpa cadangan jalan pulang), tidak lebih", JSON.stringify({ a1, a2, n:nLive - nL0, jh }));
    await pu2.close();

    /* tombol ditekan saat sedang mengukur; Simpan dengan kolom kunci kosong */
    const ui = await pu.evaluate(async () => {
      localStorage.removeItem("tomtom-jatah"); UkurMacet.hapus();
      const jalan = UkurMacet.jalankan({ jeda:30, perSesi:5 });
      await new Promise(r => setTimeout(r, 10));
      await window._ukurAsli(true);
      const teks = document.getElementById("ukur-status").textContent;
      await jalan;
      let n = 0; window.ukurMacet = () => { n++; return Promise.resolve(); };
      document.getElementById("tt-key").value = ""; document.getElementById("tt-save").click();
      const kosong = n;
      document.getElementById("tt-key").value = "kunci-uji"; document.getElementById("tt-save").click();
      return { teks, kosong, isi:n };
    });
    ok(/sedang berjalan/.test(ui.teks) && !/Berhenti/.test(ui.teks) && ui.kosong === 0 && ui.isi === 1,
       "tombol saat sedang mengukur: 'sedang berjalan' (bukan 'Berhenti'); Simpan tanpa kunci tidak memulai pengukuran", JSON.stringify(ui));

    /* tanpa data terukur: mesin kembali ke asumsi */
    const asumsi = await pu.evaluate(() => { UkurMacet.hapus(); return { f:faktorLalin(18, false, "hk"), fj:faktorLalin(18, true, "hk"), m:UkurMacet.menitRute("cbd", "kota", 18, "hk") }; });
    const fAsumsi = await pu.evaluate(() => { const c = dayCtx("2026-10-06"); return Rekomendasi.faktor({ ctx:c, keluar:10.5, pulang:21.5, hujan:false, acara:false, filter:2 }, 80).join(", "); });
    ok(/perkiraan umum/.test(fAsumsi), "tanpa pengukuran: kartu berkata macetnya perkiraan umum", fAsumsi);
    ok(asumsi.f === 1.6 && asumsi.fj === 2.2 && asumsi.m === null, "tanpa pengukuran: kembali ke asumsi (1,6x Tangerang, 2,2x Jakarta sore)", JSON.stringify(asumsi));
    await pu.evaluate(() => { Peta.setKunciTomTom(""); localStorage.removeItem("tomtom-jatah"); });
    await pu.close();
  }

  console.log("18. TomTom langsung: jatah bulanan per layanan, jalan pulang sekarang, kejadian di jalan");
  {
    /* context sendiri: jam tiruan (page.clock) berlaku untuk SELURUH context,
       dan penyimpanan tidak boleh bocor ke bagian lain */
    const ctx18 = await browser.newContext({ locale:"id-ID", timezoneId:"Asia/Jakarta", serviceWorkers:"block" });
    const pj = await ctx18.newPage();
    await pj.clock.setFixedTime(new Date("2026-10-06T18:40:00+07:00"));   /* Selasa, jam pulang kantor */
    const err18 = []; pj.on("pageerror", e => err18.push(e.message));
    await pj.route("**/api.tomtom.com/traffic/map/**", r => r.fulfill({ status:200, contentType:"image/png", body:Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex") }));
    await pj.goto(url + "index.html?tanpa-mulai", { waitUntil:"load" });
    await pj.waitForFunction(() => document.querySelector("#n-steps .step"));
    await pj.evaluate(() => { window.ukurMacet = () => Promise.resolve(); window._llAsli = lalulintasOtomatis; window.lalulintasOtomatis = () => {}; UkurMacet.hapus(); localStorage.removeItem("tomtom-jatah"); });
    const T = await pj.evaluate(() => ({ cbd:[LOKMAP.cbd.lat, LOKMAP.cbd.lon], rumah:[RUMAH.lat, RUMAH.lon] }));
    const garis = (a, b, n) => Array.from({ length:n }, (_, i) => [a[0] + (b[0] - a[0]) * i / (n - 1), a[1] + (b[1] - a[1]) * i / (n - 1)]);
    const ruteCbd = garis(T.cbd, T.rumah, 20);
    let nPulang = 0, nKej = 0, nLain = 0, urlPulang = "", urlKej = "", modePulang = "ok";
    await pj.route("**/api.tomtom.com/routing/**", r => {
      const u = r.request().url();
      if (!/sectionType=traffic/.test(u)){ nLain++; return r.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ routes:[{ summary:{ travelTimeInSeconds:1200, noTrafficTravelTimeInSeconds:1000 } }] }) }); }
      nPulang++; urlPulang = u;
      if (modePulang === "500") return r.fulfill({ status:503, body:"" });
      const m = u.match(/calculateRoute\/([-\d.]+),([-\d.]+):([-\d.]+),([-\d.]+)\//);
      const pts = garis([+m[1], +m[2]], [+m[3], +m[4]], 20).map(([la, lo]) => ({ latitude:la, longitude:lo }));
      r.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ routes:[{
        summary:{ lengthInMeters:21400, travelTimeInSeconds:3600, trafficDelayInSeconds:900, noTrafficTravelTimeInSeconds:1800, historicTrafficTravelTimeInSeconds:2700, liveTrafficIncidentsTravelTimeInSeconds:3500 },
        legs:[{ points:pts }],
        sections:[{ startPointIndex:0, endPointIndex:19, sectionType:"TRAVEL_MODE", travelMode:"car" },
                  { startPointIndex:5, endPointIndex:9, sectionType:"TRAFFIC", simpleCategory:"JAM", effectiveSpeedInKmh:12, delayInSeconds:540, magnitudeOfDelay:3 },
                  { startPointIndex:12, endPointIndex:14, sectionType:"TRAFFIC", simpleCategory:"JAM", effectiveSpeedInKmh:25, delayInSeconds:180, magnitudeOfDelay:1 }] }] }) });
    });
    const titikKe = (i) => ruteCbd[i];
    await pj.route("**/api.tomtom.com/traffic/services/5/incidentDetails**", r => {
      nKej++; urlKej = r.request().url();
      const gj = (pts) => ({ type:"LineString", coordinates:pts.map(([la, lo]) => [lo, la]) });
      r.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ incidents:[
        { type:"Feature", geometry:gj([titikKe(6), titikKe(7)]), properties:{ id:"tutup1", iconCategory:8, magnitudeOfDelay:4, events:[{ description:"Jalan ditutup", code:401, iconCategory:8 }], from:"Grogol", to:"Kalideres", length:1200, delay:720, roadNumbers:["Jl. Daan Mogot"] } },
        { type:"Feature", geometry:{ type:"Point", coordinates:[T.cbd[1] + 0.03, T.cbd[0] - 0.02] }, properties:{ id:"tabrak1", iconCategory:1, magnitudeOfDelay:2, events:[{ description:"Kecelakaan", code:201, iconCategory:1 }], from:"Semanggi", to:"Senayan", delay:300, roadNumbers:[] } },
        { type:"Feature", geometry:{ type:"Point", coordinates:[T.cbd[1] - 0.01, T.cbd[0] + 0.01] }, properties:{ id:"kecil1", iconCategory:9, magnitudeOfDelay:0, events:[{ description:"Perbaikan jalan", code:701, iconCategory:9 }], from:"A", to:"B", delay:0 } },
        { type:"Feature", geometry:{ type:"Point", coordinates:[T.cbd[1] - 0.45, T.cbd[0] + 0.1] }, properties:{ id:"banjirjauh", iconCategory:11, magnitudeOfDelay:4, events:[{ description:"Banjir", code:901, iconCategory:11 }], from:"Jauh", to:"Sekali", delay:900 } }
      ] }) });
    });

    /* Jatah bulanan: hitung ulang tiap bulan, jatah harian = sisa / sisa hari, maks 2x rata-rata */
    const jb = await pj.evaluate(() => {
      const set = (o) => localStorage.setItem("tomtom-jatah", JSON.stringify(o));
      set({ v:2, bln:"2026-09", p:{ rute:{ bulan:9999, tgl:"2026-09-30", hari:500, stop:true, n429:3, jedaSampai:0 } } });
      const ganti = Lalulintas.statusJatah("rute"), batasUkur = UkurMacet.batasHarian();
      set({ v:2, bln:"2026-10", p:{ rute:{ bulan:9000, tgl:"2026-10-06", hari:0, stop:false, n429:0, jedaSampai:0 } } });
      const sisaSedikit = Lalulintas.jatahHari("rute");
      set({ v:2, bln:"2026-10", p:{ rute:{ bulan:10000, tgl:"2026-10-05", hari:40, stop:false, n429:0, jedaSampai:0 } } });
      const habis = Lalulintas.tertahan("rute"), insiden = Lalulintas.statusJatah("insiden");
      localStorage.removeItem("tomtom-jatah");
      return { ganti, batasUkur, sisaSedikit, habis, insiden };
    });
    /* 6 Okt: 31 hari, sisa 26 hari termasuk hari ini */
    ok(jb.ganti.bulan === 0 && jb.ganti.tahan === null && jb.ganti.hariMaks === Math.min(Math.floor(20000 / 31), Math.floor(10000 / 26)) && jb.batasUkur === Math.min(300, Math.floor(jb.ganti.hariMaks * 0.45)),
       "bulan baru: hitungan Routing mulai dari 0, jatah harian = 10.000 / 26 hari sisa (384), pengukuran maks 45% (172)", JSON.stringify(jb));
    ok(jb.sisaSedikit === Math.floor(1000 / 26) && jb.habis === "penuh" && jb.insiden.bulanMaks === 1200 && jb.insiden.hariMaks === Math.min(Math.floor(2400 / 31), Math.floor(1200 / 26)),
       "sisa bulan sedikit: jatah harian ikut kecil; 10.000 terpakai = berhenti sampai bulan depan; kejadian jalan punya jatah sendiri (1.200/bulan)", JSON.stringify(jb));

    /* data jatah format lama (v1) dibawa, bukan dibuang */
    const mig = await pj.evaluate(() => {
      localStorage.setItem("tomtom-jatah", JSON.stringify({ tgl:"2026-10-06", n:700, stop:true, n429:3, jedaSampai:0 }));
      const a = Lalulintas.statusJatah("rute");
      localStorage.setItem("tomtom-jatah", JSON.stringify({ tgl:"2026-10-05", n:900, stop:true, n429:3, jedaSampai:0 }));
      const b = Lalulintas.statusJatah("rute");
      localStorage.removeItem("tomtom-jatah");
      return { a, b };
    });
    ok(mig.a.hari === 700 && mig.a.bulan === 700 && mig.a.tahan === "stop" && mig.b.hari === 0 && mig.b.bulan === 900 && mig.b.tahan === null,
       "data jatah lama: hitungan dan status 429 hari ini dibawa; kemarin masuk hitungan bulan, status berhenti tidak", JSON.stringify(mig));
    /* cadangan jalan pulang: latar belakang berhenti 40 sebelum jatah harian */
    const cad = await pj.evaluate(() => {
      const jh = Lalulintas.jatahHari("rute");
      localStorage.setItem("tomtom-jatah", JSON.stringify({ v:2, bln:"2026-10", p:{ rute:{ bulan:jh - 40, tgl:"2026-10-06", hari:jh - 40, stop:false, n429:0, jedaSampai:0 } } }));
      const r = { jh, latar:Lalulintas.bolehMinta("rute"), prioritas:Lalulintas.bolehMinta("rute", true) };
      localStorage.removeItem("tomtom-jatah");
      return r;
    });
    ok(cad.latar === false && cad.prioritas === true, "cadangan 40 permintaan: macet latar belakang/pengukuran berhenti, jalan pulang masih boleh", JSON.stringify(cad));

    /* Jalan pulang: di CBD jam 18:40 (Jakarta, aturan 20:00) diambil sendiri */
    await pj.evaluate(() => { Peta.setKunciTomTom("kunci-uji"); const s = document.getElementById("n-lok"); s.value = "cbd"; s.dispatchEvent(new Event("change", { bubbles:true }));
      document.getElementById("n-pulang").value = "21.5"; runNow(); });
    await pj.waitForFunction(() => /menit ke rumah/.test(document.getElementById("jalan-pulang").textContent) && /Jalan ditutup/.test(document.getElementById("jalan-kejadian").textContent), null, { timeout:5000 });
    const kartu = await pj.evaluate(() => ({ hidden:document.getElementById("jalan").hidden, p:document.getElementById("jalan-pulang").textContent,
      k:[...document.querySelectorAll("#jalan-kejadian .jl-kej")].map(x => x.textContent),
      est:Math.round(jamTempuhRumah(LOKMAP.cbd, jamSekarangTepat(), LOKMAP.cbd.home, "hk") * 60),
      rute:Lalulintas.statusJatah("rute"), ins:Lalulintas.statusJatah("insiden") }));
    const lebihLama = 60 - kartu.est >= 10;
    ok(!kartu.hidden && /±60 menit ke rumah/.test(kartu.p) && /biasanya jam ini ±45/.test(kartu.p) && /lancar ±30/.test(kartu.p) && /21,4 km/.test(kartu.p) &&
       /Lebih lama/.test(kartu.p) === lebihLama,
       "kartu jalan pulang: 60 menit sekarang, biasanya 45, lancar 30, 21,4 km; peringatan 'lebih lama' hanya bila >= 10 menit di atas hitungan aplikasi", JSON.stringify(kartu));
    ok(/mulai jalan paling lambat ±20:15/.test(kartu.p) && /\+9 menit/.test(kartu.p) && /Jl\. Daan Mogot/.test(kartu.p),
       "jalan pulang: mulai paling lambat 20:15 (21:30 - 60 mnt - 15 mnt), macet terparah +9 menit diberi nama jalan dari kejadian di dekatnya", JSON.stringify(kartu.p));
    ok(kartu.k.length === 2 && /Jalan ditutup/.test(kartu.k[0]) && /di rute pulang/.test(kartu.k[0]) && /tertahan ±12 menit/.test(kartu.k[0]) && /Kecelakaan/.test(kartu.k[1]) && !/di rute pulang/.test(kartu.k[1]),
       "kejadian: jalan ditutup di rute pulang paling atas, kecelakaan di dekat; perbaikan jalan kecil dan banjir 40 km tidak ditampilkan", JSON.stringify(kartu.k));
    const uK = new URL(urlKej), bb = uK.searchParams.get("bbox").split(",").map(Number);
    const luas = (bb[2] - bb[0]) * 111.32 * Math.cos(((bb[1] + bb[3]) / 2) * Math.PI / 180) * (bb[3] - bb[1]) * 110.57;
    ok(luas <= 10000 && uK.searchParams.get("language") === "id-ID" && uK.searchParams.get("categoryFilter") === "1,3,7,8,9,11,14" && uK.searchParams.get("timeValidityFilter") === "present" &&
       /^\{incidents\{type,geometry\{type,coordinates\},properties\{id,iconCategory,magnitudeOfDelay,events\{description,code,iconCategory\}/.test(uK.searchParams.get("fields")) &&
       /traffic=true/.test(urlPulang) && /sectionType=traffic/.test(urlPulang) && /computeTravelTimeFor=all/.test(urlPulang) && !/departAt/.test(urlPulang),
       "permintaan sesuai dokumentasi: kotak kejadian " + Math.round(luas) + " km2 (maks 10.000), id-ID, kategori, fields; rute pulang langsung + potongan macet", JSON.stringify({ urlKej, urlPulang }));
    ok(kartu.ins.hari === 1 && kartu.rute.hari === nPulang + nLain && nPulang === 1,
       "kejadian jalan memakai jatahnya sendiri; rute pulang memakai jatah Routing", JSON.stringify({ ins:kartu.ins, rute:kartu.rute, nPulang, nLain }));
    await pj.evaluate(() => { runNow(); runNow(); runNow(); });
    await pj.waitForTimeout(300);
    ok(nPulang === 1 && nKej === 1, "hitung ulang berkali-kali tidak meminta ulang (disimpan 10/20 menit)", JSON.stringify({ nPulang, nKej }));
    const geser = await pj.evaluate(() => {
      const c = Kejadian.cache({ lat:LOKMAP.cbd.lat, lon:LOKMAP.cbd.lon });
      return { dekat:!!Kejadian.cache({ lat:LOKMAP.cbd.lat + 0.05, lon:LOKMAP.cbd.lon - 0.05 }), jauh:!!Kejadian.cache({ lat:LOKMAP.cbd.lat, lon:LOKMAP.cbd.lon - 0.2 }), ada:!!c };
    });
    ok(geser.ada && geser.dekat && !geser.jauh, "pindah ~7 km: kejadian yang sudah diambil tetap dipakai; pindah ~22 km: diambil ulang", JSON.stringify(geser));

    /* peta: garis merah macet di rute pulang, penanda kejadian, ubin kejadian */
    await pj.click("#peta-toggle"); await pj.waitForTimeout(400);
    await pj.evaluate(() => runNow()); await pj.waitForTimeout(200);
    const peta = await pj.evaluate(() => ({ macet:document.querySelectorAll('#peta path[stroke="#AB0000"]').length, ringan:document.querySelectorAll('#peta path[stroke="#EB4C13"]').length,
      kejadian:document.querySelectorAll('#peta path[fill="#AB0000"]').length, ubin:!!document.querySelector('#peta img[src*="/tile/incidents/s0/"]') }));
    const popup = await pj.evaluate(async () => {
      const m = document.querySelector('#peta path[fill="#AB0000"]'); m.dispatchEvent(new MouseEvent("click", { bubbles:true, clientX:1, clientY:1 }));
      await new Promise(r => setTimeout(r, 100));
      const buka = !!document.querySelector("#peta .leaflet-popup");
      runNow(); runNow(); await new Promise(r => setTimeout(r, 100));
      return { buka, masih:!!document.querySelector("#peta .leaflet-popup") };
    });
    ok(popup.buka && popup.masih, "popup kejadian yang dibuka Ibu tidak tertutup sendiri saat aplikasi menghitung ulang", JSON.stringify(popup));
    ok(peta.macet === 1 && peta.ringan === 1 && peta.kejadian === 2 && peta.ubin, "peta: potongan macet parah dan jalan ditutup digambar merah, ubin kejadian TomTom terpasang", JSON.stringify(peta));

    /* siang di BSD: belum waktunya, tidak diambil; tombol mengambil sekarang */
    await pj.clock.setFixedTime(new Date("2026-10-06T13:00:00+07:00"));
    const n0 = nPulang;
    await pj.evaluate(() => { const s = document.getElementById("n-lok"); s.value = "bsd"; s.dispatchEvent(new Event("change", { bubbles:true })); runNow(); });
    await pj.waitForTimeout(300);
    const siang = await pj.evaluate(() => document.getElementById("jalan-pulang").textContent);
    ok(nPulang === n0 && /muncul sendiri mulai/.test(siang), "siang, jauh dari jam pulang: jalan pulang tidak diambil sendiri (hemat jatah)", JSON.stringify({ siang, n:nPulang - n0 }));
    await pj.click("#jalan-cek");
    await pj.waitForFunction(() => /menit ke rumah/.test(document.getElementById("jalan-pulang").textContent), null, { timeout:5000 });
    ok(nPulang === n0 + 1, "tombol 'Cek jalan pulang sekarang' mengambil saat itu juga", JSON.stringify({ n:nPulang - n0 }));

    /* gagal: tidak dicoba di setiap hitung ulang (paling cepat 3 menit lagi) */
    await pj.clock.setFixedTime(new Date("2026-10-06T19:30:00+07:00"));
    modePulang = "500"; const n1 = nPulang;
    await pj.evaluate(() => { const s = document.getElementById("n-lok"); s.value = "jakbar"; s.dispatchEvent(new Event("change", { bubbles:true })); });
    await pj.waitForTimeout(400);
    await pj.evaluate(() => { for (let i = 0; i < 5; i++) runNow(); });
    await pj.waitForTimeout(300);
    const gagal = await pj.evaluate(() => document.getElementById("jalan-pulang").textContent);
    ok(nPulang === n1 + 1 && /belum bisa diambil/.test(gagal), "TomTom gagal: satu permintaan saja, pesan jelas, dicoba lagi nanti (bukan tiap hitung ulang)", JSON.stringify({ n:nPulang - n1, gagal }));
    await pj.clock.setFixedTime(new Date("2026-10-06T19:34:00+07:00"));
    await pj.evaluate(() => runNow()); await pj.waitForTimeout(300);
    ok(nPulang === n1 + 2, "3 menit kemudian dicoba lagi sekali", JSON.stringify({ n:nPulang - n1 }));
    await pj.clock.setFixedTime(new Date("2026-10-06T19:38:00+07:00"));
    await pj.evaluate(() => runNow()); await pj.waitForTimeout(300);
    const nTunggu = nPulang;
    await pj.clock.setFixedTime(new Date("2026-10-06T19:41:00+07:00"));
    await pj.evaluate(() => runNow()); await pj.waitForTimeout(300);
    ok(nTunggu === n1 + 2 && nPulang === n1 + 3, "gagal lagi: jeda berlipat (6 menit), bukan terus tiap 3 menit", JSON.stringify({ tunggu:nTunggu - n1, n:nPulang - n1 }));
    modePulang = "ok";

    /* lewat tengah malam: jam ditulis 00:xx, bukan 24:xx */
    await pj.clock.setFixedTime(new Date("2026-10-06T23:20:00+07:00"));
    await pj.evaluate(() => { const s = document.getElementById("n-lok"); s.value = "alsut"; s.dispatchEvent(new Event("change", { bubbles:true }));
      document.getElementById("n-pulang").value = "24"; runNow(); });
    await pj.waitForFunction(() => /menit ke rumah/.test(document.getElementById("jalan-pulang").textContent), null, { timeout:5000 });
    const malam = await pj.evaluate(() => document.getElementById("jalan-pulang").textContent);
    ok(/tiba ±00:20/.test(malam) && !/2[45]:\d\d/.test(malam), "lewat tengah malam: 'tiba ±00:20', bukan 24:20", malam);
    /* dibuka 23:20 dengan rencana pulang yang sudah lewat: jadi 24:00, bukan kosong/NaN */
    const larut = await pj.evaluate(() => { el("n-pulang").value = "21.5"; runNow(); const a = { v:el("n-pulang").value, p:SEKARANG.o.pulang };
      el("n-pulang").value = ""; runNow(); return { a, b:{ v:el("n-pulang").value, p:SEKARANG.o.pulang }, nan:/NaN/.test(document.getElementById("v-now").textContent) }; });
    ok(larut.a.v === "24" && larut.a.p === 24 && larut.b.v === "24" && !larut.nan, "dibuka 23:20: rencana pulang jadi 24:00 (kelipatan 15 menit), kolom kosong pulih sendiri, tidak ada NaN", JSON.stringify(larut));

    /* jatah kejadian habis: kartu mengatakannya, tidak kosong diam-diam */
    const habisK = await pj.evaluate(() => {
      Kejadian.hapus();
      localStorage.setItem("tomtom-jatah", JSON.stringify({ v:2, bln:"2026-10", p:{ insiden:{ bulan:1200, tgl:"2026-10-06", hari:40, stop:false, n429:0, jedaSampai:0 } } }));
      runNow(); const t = document.getElementById("jalan-kejadian").textContent;
      localStorage.removeItem("tomtom-jatah"); return t;
    });
    ok(/jatah TomTom hari ini habis/.test(habisK), "jatah kejadian habis: kartu menyebutnya", habisK);

    /* aplikasi tidak sedang dilihat: tidak ada permintaan sama sekali */
    const nSemua = nPulang + nKej + nLain;
    await pj.evaluate(() => { Object.defineProperty(document, "hidden", { get:() => true, configurable:true });
      window.lalulintasOtomatis = window._llAsli || window.lalulintasOtomatis;
      const s = document.getElementById("n-lok"); s.value = "karawaci"; s.dispatchEvent(new Event("change", { bubbles:true })); runNow(); });
    await pj.waitForTimeout(1600);
    ok(nPulang + nKej + nLain === nSemua, "aplikasi di latar belakang: tidak ada permintaan TomTom", JSON.stringify({ n:nPulang + nKej + nLain - nSemua }));

    /* tanpa kunci: kartu tidak tampil */
    const tanpa = await pj.evaluate(() => { Peta.setKunciTomTom(""); runNow(); return document.getElementById("jalan").hidden; });
    ok(tanpa && err18.length === 0, "tanpa kunci TomTom: kartu jalan tidak tampil; tidak ada galat halaman", JSON.stringify({ tanpa, err18 }));
    await pj.close(); await ctx18.close();
  }

  console.log("15. Logika saran tempat (regresi temuan audit)");
  {
    const pr = await ctx.newPage();
    await pr.goto(url + "index.html", { waitUntil:"load" });
    await pr.waitForFunction(() => document.querySelector("#n-steps .step"));
    const a = await pr.evaluate(() => {
      const ctx = dayCtx("2026-10-06");   /* Selasa biasa */
      const dasar = { ctx, rehat:"none", filter:2, bat:30.08, rumah:false, hujan:false, acara:false, soc:80 };
      const o = (x) => Object.assign({}, dasar, x);
      /* #1 narik berhenti saat "Waktunya pulang", bukan saat tiba di rumah */
      const oc = o({ keluar:18, pulang:21.5, zona:"jkt", kmHome:29.5 });
      const r1 = simulate(oc), akhirKerja = Math.max(...r1.pieces.filter(p => !p.jeda).map(p => p.e));
      const mulaiPulang = oc.pulang - jamMulaiPulang(oc, null);
      /* #2 tidak ada rencana (termasuk "tetap di sini") yang di Jakarta >= 20:00 */
      const L = LOKMAP.cbd;
      const h2 = Peluang.hitung(o({ keluar:18, pulang:21.5, zona:"jkt", kmHome:L.home }), L);
      const jktMalam = h2.daftar.some(h => h.r.pieces.some(p => !p.jeda && p.s >= 20 && p.tempat && p.tempat.z === "jkt"));
      const diam = h2.daftar.find(h => h.diam);
      /* #3 posisi GPS di Cikupa: tempat awal dari koordinat, bukan jarak-ke-rumah */
      const Lc = { id:"custom:gps:-6.218,106.517", n:"Cikupa", home:20.5, lat:-6.218, lon:106.517, z:"tng", res:25 };
      const ta = Peluang.tempatAwal(Lc);
      const hc = Rekomendasi.hitung(Object.assign({}, dasar, { keluar:14.5, pulang:21.5, zona:"tng" }), Lc, 80, false);
      const cbdC = hc.daftar.find(x => x.id === "cbd"), siniC = hc.daftar.find(x => x.diSini);
      /* Balaraja diketik (kecamatan terukur): koordinat ikut, CBD bukan "4 km" */
      const kb = KEC.find(k => k[0] === "Balaraja"), rb = catatKecamatan(kb);
      const Lb = { id:"custom:balaraja", n:rb.nama, home:rb.km, lat:rb.lat, lon:rb.lon, z:rb.zPaksa, res:30 };
      const hb = Rekomendasi.hitung(Object.assign({}, dasar, { keluar:14.5, pulang:21.5, zona:"tng" }), Lb, 80, false);
      const cbdB = hb.daftar.find(x => x.id === "cbd");
      const pb = Peluang.hitung(Object.assign({}, dasar, { keluar:14.5, pulang:21.5, zona:"tng" }), Lb);
      const awalGps = { posisi:!!ta.posisi, lat:ta.lat, cbdKm:cbdC && Math.round(cbdC.kmPindah), sini:!!siniC,
                        balLat:rb.lat, cbdBKm:cbdB ? Math.round(cbdB.kmPindah) : null, pelAwal:pb.awal.id, pelAwalPosisi:!!pb.awal.posisi };
      /* #4 baterai 10% di Kota jam 16: tempat yang tidak terjangkau tidak ditawarkan */
      const h4 = Rekomendasi.hitung(o({ keluar:16, pulang:21.5, zona:"tng", soc:10 }), LOKMAP.kota, 10, false);
      const minTiba = Math.min(...h4.daftar.filter(x => !x.diSini).map(x => x.socTiba));
      /* #6 angka "tetap di sini" sama di dua kartu */
      const ok6 = o({ keluar:15.25, pulang:21.5, zona:"tng" });
      const rek = Rekomendasi.hitung(ok6, LOKMAP.kota, 80, false), pel = Peluang.hitung(ok6, LOKMAP.kota);
      /* #7 insentif tidak ikut pengali hari */
      const ins = [2, 5].map(dow => { const t = { 2:"2026-10-06", 5:"2026-10-09" }[dow]; return simulate(o({ ctx:dayCtx(t), keluar:5.25, pulang:21.5, zona:"tng" })).insentif; });
      return { akhirKerja, mulaiPulang, jktMalam, diamLabel:!!(diam && diam.diamPulangMalam), awalGps,
               minTiba, terlewat:h4.terlewat, rekBasis:rek.basis && Math.round(rek.basis.sisa), pelBasis:pel.basis && Math.round(pel.basis.net), ins };
    });
    ok(a.akhirKerja <= a.mulaiPulang + 0.01 && a.mulaiPulang < 21.5 - 0.5, "narik berhenti di jam mulai pulang, perjalanan pulang tidak dihitung sebagai jam narik", JSON.stringify(a));
    ok(!a.jktMalam && a.diamLabel, "tidak ada rencana di Jakarta setelah 20:00; \"tetap di CBD\" jadi \"sampai 20:00 lalu ke arah rumah\"", JSON.stringify(a));
    ok(a.awalGps.posisi && a.awalGps.lat === -6.218 && a.awalGps.sini && a.awalGps.cbdKm > 35,
       "posisi GPS Cikupa = tempat sendiri di koordinatnya; ada pembanding 'tetap di sini'; CBD dihitung jauh", JSON.stringify(a.awalGps));
    ok(a.awalGps.balLat != null && (a.awalGps.cbdBKm == null || a.awalGps.cbdBKm > 40) && a.awalGps.pelAwalPosisi,
       "Balaraja diketik: koordinat kecamatan ikut; CBD tidak lagi '4 km'; Urutan tempat mulai dari Balaraja", JSON.stringify(a.awalGps));
    ok(a.minTiba >= 8 && a.terlewat.length > 0, "baterai 10%: tempat yang tidak terjangkau disaring dan disebutkan", JSON.stringify({ minTiba:a.minTiba, terlewat:a.terlewat }));
    ok(a.rekBasis === a.pelBasis, "\"tetap di sini\": angka sama di kartu ke-mana-sekarang dan urutan tempat", `${a.rekBasis} vs ${a.pelBasis}`);
    ok(Math.abs(a.ins[0] - a.ins[1]) < 1, "insentif Grab sama di Selasa dan Jumat (tidak ikut pengali hari)", JSON.stringify(a.ins));

    /* Double check #1: pulang 20:30-21:30 dari CBD -- kerja berhenti persis di
       jam mulai pulang dari tempat terakhir, dan pulang lebih malam tidak pernah
       tampak lebih rugi (dulu 20:45 > 21:00 karena kerja CBD dibayar sampai 20:15
       dan parkir dikenakan untuk potongan yang isinya cuma perjalanan). */
    const mono = await pr.evaluate(() => {
      const ctx = dayCtx("2026-10-06"), K = LOKMAP.cbd;
      return [20.5, 20.75, 21, 21.25, 21.5].map(pulang => {
        const o = { ctx, keluar:17, pulang, rehat:"none", zona:"jkt", filter:2, bat:30.08, rumah:false, hujan:false, acara:false, soc:80, deadKm:0 };
        o.urutan = Peluang.urutanTinggal(K, o); o.tempatAwal = K;
        const r = simulate(o), kerja = r.pieces.filter(p => !p.jeda);
        const akhir = kerja[kerja.length - 1];
        return { pulang, net:r.net, selesai:akhir.e, mulai:pulang - jamMulaiPulang(o, o.tempatAkhir), jktSetelah20:kerja.some(p => p.jamJalan > 0.05 && p.s >= 20 && p.tempat.z === "jkt") };
      });
    });
    ok(mono.every((x, i) => i === 0 || x.net >= mono[i - 1].net - 1) && mono.every(x => Math.abs(x.selesai - x.mulai) < 0.02 && !x.jktSetelah20),
       "pulang lebih malam tidak pernah lebih rugi; kerja berhenti di jam mulai pulang; tidak narik di Jakarta setelah 20:00",
       JSON.stringify(mono.map(x => ({ p:x.pulang, net:Math.round(x.net), selesai:hhmmTes(x.selesai), mulai:hhmmTes(x.mulai) }))));

    /* Double check #6: kartu utama, "ke mana sekarang", "urutan tempat", dan
       langkah "Waktunya pulang" memakai hitungan yang sama. */
    const sama = [];
    for (const lok of ["bsd", "jakbar", "bandara", "cbd"]){
      await setField(pr, "n-lok", lok); await setField(pr, "n-jam", 17);
      sama.push(await pr.evaluate(() => {
        const S = SEKARANG, ins = insentifSebelum(S.o);
        const pel = S.peluang && S.peluang.basis;
        const kerja = S.r.pieces.filter(p => !p.jeda), akhirKerja = kerja.length ? kerja[kerja.length - 1].e : null;
        const pulangStep = S.langkah.find(x => x.dur === "pulang");
        return { lok:S.L.id, utama:Math.round(S.r.net - ins), rek:S.rek.basis && Math.round(S.rek.basis.sisa), pel:pel && Math.round(pel.net),
                 akhirKerja:akhirKerja && hhmm(akhirKerja), langkahPulang:pulangStep && pulangStep.t.replace(/<br>/, " ") };
      }));
    }
    ok(sama.every(x => x.rek != null && Math.abs(x.utama - x.rek) <= 1 && x.pel != null && Math.abs(x.utama - x.pel) <= 1),
       "angka 'tetap di sini' sama di kartu utama, 'ke mana sekarang', dan 'urutan tempat' (BSD, Jakbar, Bandara, CBD jam 17)", JSON.stringify(sama));
    /* tempat di daftar yang BUKAN tujuan saran (Ciledug, Bintaro, Cikupa): dulu
       tanpa pembanding "tetap di sini", semua selisih tampil +Rp0 */
    const luar = [];
    for (const lok of ["ciledug", "bintaro", "cikupa"]){
      await setField(pr, "n-lok", lok); await setField(pr, "n-jam", 12);
      luar.push(await pr.evaluate(() => { const S = SEKARANG, ins = insentifSebelum(S.o);
        return { lok:S.L.id, utama:Math.round(S.r.net - ins), rek:S.rek.basis && Math.round(S.rek.basis.sisa), basisId:S.rek.basis && S.rek.basis.tempat && S.rek.basis.tempat.id,
                 pel:S.peluang && S.peluang.basis && Math.round(S.peluang.basis.net), bedaSelisih:S.rek.daftar.some(x => Math.abs(x.selisih) > 500) }; }));
    }
    ok(luar.every(x => x.rek != null && x.basisId === x.lok && Math.abs(x.utama - x.rek) <= 1 && x.pel != null && Math.abs(x.utama - x.pel) <= 1 && x.bedaSelisih),
       "Ciledug/Bintaro/Cikupa: ada pembanding 'tetap di sini', angkanya sama di tiga kartu, selisih pindah tidak lagi +Rp0 semua", JSON.stringify(luar));
    ok(sama.every(x => x.langkahPulang && x.langkahPulang.indexOf(x.akhirKerja) >= 0),
       "langkah 'Waktunya pulang' mulai persis saat angka berhenti menghitung narik", JSON.stringify(sama.map(x => [x.lok, x.akhirKerja, x.langkahPulang])));
    await setField(pr, "n-lok", "kota"); await setField(pr, "n-soc", 80);

    const lanjut = await pr.evaluate(() => {
      const K = LOKMAP.cbd, o = { ctx:dayCtx("2026-10-06"), keluar:17, pulang:19.5, rehat:"none", zona:"jkt", filter:2, bat:30.08, rumah:false, hujan:false, acara:false, soc:80, deadKm:0 };
      o.urutan = Peluang.urutanTinggal(K, o); o.tempatAwal = K;
      const r = simulate(o), tj = tambahanJam(o, r, 1.5);
      const p = Object.assign({}, o, { pulang:tj.sampai }); p.urutan = Peluang.urutanTinggal(K, p);
      const r2 = simulate(p);
      return { tambah:Math.round(tj.tambah), harus:Math.round(r2.net - r.net), jkt20:r2.pieces.some(x => !x.jeda && x.jamJalan > 0.05 && x.e > 20.01 && x.tempat.z === "jkt") };
    });
    ok(lanjut.tambah === lanjut.harus && !lanjut.jkt20, "'kalau lanjut 1,5 jam' menyusun ulang urutan tempat (tidak narik di Jakarta lewat 20:00)", JSON.stringify(lanjut));
    const apt = await pr.evaluate(() => BASE.map(b => advise(b, LOKMAP.bandara, { ctx:dayCtx("2026-10-06"), keluar:b.s, pulang:21.5, filter:2 }).h));
    ok(apt.every(h => !/Jakarta/.test(h)), "saran kartu Bandara memakai teks bandara, bukan 'Bertahan di Jakarta'", JSON.stringify(apt));

    /* Double check #4: kalibrasi kecepatan pulang memakai jam berangkat */
    const kal = await pr.evaluate(() => {
      const simpan = rows;
      rows = ["2026-09-21", "2026-09-22", "2026-09-23"].map(id => ({ id, mnt:22, pkm:9, pz:"tng", pjam:21.5 - 22 / 60, dpt:300000, kmt:200, kmp:130, jam:10, kwh:28, trip:15 }));
      recalibrate();
      const ramal = jamTempuhRumah({ home:9, z:"tng" }, 21.5 - 22 / 60, 9) * 60;
      rows = simpan; recalibrate();
      return { ramal, kecSibuk:null };
    });
    ok(Math.abs(kal.ramal - 22) < 1, "perjalanan pulang 9 km yang tercatat 22 menit diramalkan ±22 menit (bukan 17)", JSON.stringify(kal));

    /* Macet: uji "macet parah" dan tujuan pilihan Ibu. */
    const m = await pr.evaluate(() => {
      const ctx = dayCtx("2026-10-06");
      const o = { ctx, keluar:16, pulang:21.5, rehat:"none", zona:"tng", filter:2, bat:30.08, rumah:false, hujan:false, acara:false, soc:80 };
      const h = Rekomendasi.hitung(o, LOKMAP.kota, 80, false);
      const pindah = h.daftar.filter(x => !x.diSini).slice(0, 3);
      const konsisten = pindah.every(x => x.selisihParah === undefined || x.sisaParah == null || (x.sisaParah <= x.sisa + 1 &&
        x.rapuh === (x.selisih > 0 && (x.selisihParah == null || x.selisihParah <= 0))));
      const t = Rekomendasi.tujuan(o, LOKMAP.kota, 80, false, "cbd");
      const lemah = Rekomendasi.tujuan(Object.assign({}, o, { soc:5 }), LOKMAP.kota, 5, false, "bekasi");
      return { konsisten, diuji:pindah.filter(x => x.selisihParah !== undefined).length,
               cbd:{ jam:t.x.jamPindah, sel:t.x.selisih, parah:t.x.sisaParah, sisa:t.x.sisa, mulaiPulang:t.x.mulaiPulang }, lemah:!!(lemah.x && lemah.x.terlewat) };
    });
    ok(m.konsisten && m.diuji >= 1, "uji macet parah: tidak pernah lebih untung dari jalan biasa; tanda 'berisiko' konsisten", JSON.stringify(m));
    ok(m.cbd.jam > 0.3 && m.cbd.parah <= m.cbd.sisa + 1 && m.cbd.mulaiPulang < 21.5 && m.lemah,
       "tujuan pilihan (CBD jam 16): waktu tempuh, hasil macet parah, jam mulai pulang; baterai 5% ke Bekasi: tidak terjangkau", JSON.stringify(m));
    await pr.evaluate(() => { document.getElementById("t-now").click(); document.getElementById("tujuan-wrap").open = true; });
    await setField(pr, "tj-pilih", "cbd");
    const teksTj = await pr.evaluate(() => document.getElementById("tj-hasil").innerText);
    ok(/Ke Jakarta CBD/.test(teksTj) && /macet parah/.test(teksTj) && /(Mulai pulang|Keluar Jakarta jam 20:00)/.test(teksTj), "kotak 'Mau ke tempat lain?' menampilkan waktu, uji macet, dan jam pulang/keluar Jakarta", teksTj.slice(0, 400));
    /* departAt: pola macet TomTom untuk jam pulang (URL dan cache) */
    let urlDepart = null;
    await pr.route("**/api.tomtom.com/routing/**", r => { const u = r.request().url(); if (/departAt=/.test(u)) urlDepart = u;
      r.fulfill({ status:200, contentType:"application/json", body:JSON.stringify({ routes:[{ summary:{ travelTimeInSeconds:3300, noTrafficTravelTimeInSeconds:1800 } }] }) }); });
    const dep = await pr.evaluate(async () => {
      Peta.setKunciTomTom("kunci-uji");
      await Lalulintas.pulangBiasa(LOKMAP.cbd, 19.75, "2026-10-06");
      return Lalulintas.pulangBiasaCache(LOKMAP.cbd, 19.75, "2026-10-06");
    });
    ok(dep === 55 && /departAt=2026-10-06T19%3A45%3A00%2B07%3A00/.test(urlDepart || ""), "pola macet jam pulang: departAt 2026-10-06T19:45:00+07:00, hasil 55 menit", `${dep} | ${urlDepart}`);
    await pr.evaluate(() => Peta.setKunciTomTom(""));
    await pr.close();
  }

  await browser.close(); srv.close();
  console.log(`\n${passed} lolos, ${failed} gagal`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
