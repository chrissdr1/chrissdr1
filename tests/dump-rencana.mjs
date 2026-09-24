/* Cetak urutan langkah tab Rencana untuk beberapa pola jeda, untuk diperiksa mata:
   node tests/dump-rencana.mjs */
import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const APP = new URL("../app/", import.meta.url).pathname;
const MIME = { ".html":"text/html; charset=utf-8", ".css":"text/css", ".js":"text/javascript", ".webmanifest":"application/manifest+json", ".png":"image/png", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  const f = path.join(APP, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise(r => srv.listen(0, "127.0.0.1", r)); const url = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch();
const ctx = await b.newContext({ locale:"id-ID", timezoneId:"Asia/Jakarta" });
await ctx.route("**/api.open-meteo.com/**", r => r.abort());
const p = await ctx.newPage();
await p.goto(url + "index.html", { waitUntil:"load" }); await p.waitForFunction(() => document.querySelector("#n-steps .step"));
async function set(id, v){ await p.evaluate(([id, v]) => { const e = document.getElementById(id); if (e.type === "checkbox") e.checked = !!v; else e.value = String(v); e.dispatchEvent(new Event("change", { bubbles:true })); }, [id, v]); }
const CASES = process.argv.slice(2).length ? JSON.parse(process.argv[2]) : [
  { "p-tgl":"2026-09-24", "p-keluar":5.25, "p-pulang":21.5, "p-rehat":"duapeak", "p-zona":"tng" },
  { "p-tgl":"2026-09-24", "p-keluar":5.25, "p-pulang":21.5, "p-rehat":"full", "p-zona":"tng" },
  { "p-tgl":"2026-09-24", "p-keluar":5.25, "p-pulang":21.5, "p-rehat":"short", "p-zona":"tng" },
  { "p-tgl":"2026-09-24", "p-keluar":5.25, "p-pulang":21.5, "p-rehat":"none", "p-zona":"jkt" },
  { "p-tgl":"2026-09-24", "p-keluar":9.5, "p-pulang":20.5, "p-rehat":"short", "p-zona":"mix", "p-bat":38.88 },
];
for (const c of CASES){
  for (const [k, v] of Object.entries(c)) await set(k, v);
  const out = await p.evaluate(() => {
    const rows = [...document.querySelectorAll("#p-steps .step")].map(s => [
      s.querySelector(".t").innerText.replace(/\n/g, " "), s.querySelector(".a b").innerText, s.querySelector(".a span").innerText,
      s.querySelector(".v").innerText.replace(/\n/g, " | "), s.className.replace("step", "").trim() ].join("  ‖  "));
    return { side: document.getElementById("p-side").innerText.replace(/\n/g, " · "), net: document.getElementById("p-net").innerText,
      vs: document.getElementById("p-vs").innerText, rows, notes: [...document.querySelectorAll("#p-notes .note")].map(n => n.innerText.replace(/\n/g, " ")) };
  });
  console.log("\n=== " + JSON.stringify(c));
  console.log("bersih " + out.net + "  " + out.vs); console.log(out.side);
  out.rows.forEach(r => console.log("  " + r)); out.notes.forEach(n => console.log("  ! " + n));
}
await b.close(); srv.close();
