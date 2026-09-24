/* Screenshot lebar HP untuk pemeriksaan visual: node tests/screenshot.mjs <folder-keluaran> */
import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const APP = new URL("../app/", import.meta.url).pathname, OUT = process.argv[2] || ".";
const MIME = { ".html":"text/html; charset=utf-8", ".css":"text/css", ".js":"text/javascript", ".webmanifest":"application/manifest+json", ".png":"image/png", ".svg":"image/svg+xml" };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, "http://x").pathname); if (p.endsWith("/")) p += "index.html";
  const f = path.join(APP, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r);
});
await new Promise(r => srv.listen(0, "127.0.0.1", r)); const url = `http://127.0.0.1:${srv.address().port}/`;
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{ width:390, height:844 }, deviceScaleFactor:2, locale:"id-ID", timezoneId:"Asia/Jakarta" });
await ctx.route("**/api.open-meteo.com/**", r => r.abort());
const p = await ctx.newPage();
await p.goto(url + "index.html", { waitUntil:"load" }); await p.waitForFunction(() => document.querySelector("#n-steps .step"));
/* Halaman Mulai hari (dibuka paksa supaya tidak bergantung jam) */
await p.evaluate(() => { document.getElementById("panduan-tutup").click(); bukaCheckin(); });
await p.screenshot({ path:OUT + "/mulai.png" });
await p.evaluate(() => { document.getElementById("ci-soc").value = "78"; document.getElementById("ci-gps").checked = false; document.getElementById("ci-mulai").click(); });
await p.waitForFunction(() => document.getElementById("checkin").hidden);
await p.screenshot({ path:OUT + "/now.png" });
await p.evaluate(() => document.getElementById("peta-toggle").click());
await p.waitForFunction(() => document.querySelectorAll("#peta .pin").length > 0);
await p.evaluate(() => document.getElementById("petabox").scrollIntoView());
await p.screenshot({ path:OUT + "/peta.png" });
await p.evaluate(() => document.getElementById("rek").scrollIntoView()); await p.screenshot({ path:OUT + "/rek.png" });
await p.click("#t-log"); await p.evaluate(() => document.getElementById("sk-panel").scrollIntoView()); await p.screenshot({ path:OUT + "/log.png" });
await p.click("#t-plan"); await p.evaluate(() => document.getElementById("acara-daftar").scrollIntoView({ block:"center" })); await p.screenshot({ path:OUT + "/acara.png" });
await p.click("#t-tanya"); await p.evaluate(() => document.getElementById("ai-panel").scrollIntoView()); await p.screenshot({ path:OUT + "/tanya.png" });
const d = await ctx.newPage(); await d.emulateMedia({ colorScheme:"dark" });
await d.goto(url + "index.html", { waitUntil:"load" }); await d.waitForFunction(() => document.querySelector("#n-steps .step"));
await d.evaluate(() => document.getElementById("panduan-tutup").click()); await d.screenshot({ path:OUT + "/dark.png" });
await b.close(); srv.close(); console.log("shots ok");
