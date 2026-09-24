/* Uji aplikasi di Chromium nyata (Playwright).
   Jalankan:  npm test
   Opsional:  ORIG_HTML=/path/artifact-asli.html npm test
              -> membandingkan keluaran mesin dengan artifact satu-berkas yang asli
                 (uji emas: pemecahan berkas tidak boleh mengubah satu angka pun).

   Yang diperiksa:
     1. halaman terbuka tanpa galat konsol, semua tab ada, kartu langkah terisi
     2. "Uji mandiri" bawaan halaman hijau (ribuan kombinasi mesin hitung)
     3. TERBIT (js/data.js) == VERSION (sw.js), manifest sah, service worker aktif dan cache terisi
     4. adapter AI: putaran alat, streaming teks, JSON, dan pemetaan galat -- dengan fetch tiruan
     5. (bila ORIG_HTML) keluaran identik dengan artifact asli untuk belasan kombinasi masukan */
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
  ok(/langkah berikutnya/i.test(v.verdict), "kartu langkah terisi", v.verdict);
  ok(/^Rp/.test(v["n-net"]), "proyeksi terisi", v["n-net"]);
  ok(v.aistat === "Belum ada kunci", "status AI jujur tanpa kunci", v.aistat);
  await page.click("#t-plan");
  ok(await page.$eval("#v-plan", e => !e.hidden), "tab Rencana tampil");
  ok((await page.$$("#cmp tr")).length === 7, "tabel bandingkan sif: 7 pola");
  await page.click("#t-now");

  console.log("2. uji mandiri bawaan");
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
  ok(/Diperkirakan hujan sekitar 13:00-17:00/.test(cu.teks) && /70%/.test(cu.teks), "kotak cuaca dari internet: jam dan peluang", cu.teks);
  ok(cu.hujan === true && /Hujan sudah dihitung/.test(cu.notes) && /Open-Meteo/.test(cu.notes), "centang hujan terisi dan masuk hitungan", cu.notes.slice(0, 300));
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
  await page.waitForFunction(() => document.querySelector("#rek-list .rek-item"));
  const tema = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  ok(tema.toUpperCase() === "#1A56C4", "tema terang memakai aksen biru", tema);
  await page.emulateMedia({ colorScheme:"dark" });
  const temaGelap = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  ok(temaGelap.toUpperCase() === "#6FA1FF", "tema gelap memakai aksen biru terang", temaGelap);
  await page.emulateMedia({ colorScheme:"light" });
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
      faktor: document.getElementById("rek-faktor").textContent, arah: document.querySelector("#rek-list a.linkbtn") && document.querySelector("#rek-list a.linkbtn").getAttribute("href"),
      deltaHere: here && here.selisih, tanpaDead, bawaan, jkt: d.find(x => x.id === "cbd").kmPindah > 20 };
  });
  ok(rk.n === 9 && rk.urut, "9 tempat dibandingkan, urut dari sisa hari terbesar", JSON.stringify(rk));
  ok(rk.here === "karawaci" && rk.hereKm === 0 && rk.basis === "karawaci" && rk.deltaHere === 0, "posisi sekarang jadi acuan tanpa km pindah", JSON.stringify(rk));
  ok(rk.tampil === 3 && /baterai 65%/.test(rk.faktor) && /blok pagi akhir/.test(rk.faktor) && /pulang 21:30/.test(rk.faktor), "3 kartu teratas dan baris faktor", rk.faktor);
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

  if (process.env.ORIG_HTML){
    console.log("11. uji emas terhadap artifact asli");
    const orig = await ctx.newPage();
    await orig.goto("file://" + path.resolve(process.env.ORIG_HTML), { waitUntil:"load" });
    await orig.waitForFunction(() => document.querySelector("#n-steps .step"));
    const fresh = await ctx.newPage();
    await fresh.goto(url + "index.html?golden", { waitUntil:"load" });
    await fresh.waitForFunction(() => document.querySelector("#n-steps .step"));
    /* localStorage dari langkah sebelumnya harus kosong dulu supaya setara */
    await fresh.evaluate(() => localStorage.clear()); await fresh.reload({ waitUntil:"load" });
    await fresh.waitForFunction(() => document.querySelector("#n-steps .step"));
    const [a, b] = await Promise.all([driveAll(orig), driveAll(fresh)]);
    let same = 0, diff = 0;
    for (const k of Object.keys(a)) for (const id of Object.keys(a[k])){
      if (a[k][id] === b[k][id]) same++;
      else { diff++; ok(false, `${k}/${id} berbeda`, firstDiff(a[k][id], b[k][id])); }
    }
    ok(diff === 0, `keluaran identik dengan artifact asli (${same} pembanding)`);
    await orig.close(); await fresh.close();
  } else console.log("6. (lewati uji emas: ORIG_HTML tidak diberikan)");

  await browser.close(); srv.close();
  console.log(`\n${passed} lolos, ${failed} gagal`);
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
