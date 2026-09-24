/* Screenshot lebar HP untuk pemeriksaan visual: node tests/screenshot.mjs <folder-keluaran> */
import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const APP=new URL("../app/", import.meta.url).pathname, OUT=process.argv[2] || ".";
const MIME={".html":"text/html; charset=utf-8",".css":"text/css",".js":"text/javascript",".webmanifest":"application/manifest+json",".png":"image/png",".svg":"image/svg+xml"};
const srv=http.createServer((q,r)=>{let p=decodeURIComponent(new URL(q.url,"http://x").pathname);if(p.endsWith("/"))p+="index.html";const f=path.join(APP,p);if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);r.end();return;}r.writeHead(200,{"content-type":MIME[path.extname(f)]||"application/octet-stream"});fs.createReadStream(f).pipe(r);});
await new Promise(r=>srv.listen(0,"127.0.0.1",r)); const url=`http://127.0.0.1:${srv.address().port}/`;
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,locale:"id-ID",timezoneId:"Asia/Jakarta"});
const p=await ctx.newPage(); await p.goto(url+"index.html",{waitUntil:"load"}); await p.waitForFunction(()=>document.querySelector("#n-steps .step"));
await p.evaluate(()=>document.getElementById("panduan-tutup").click()); await p.screenshot({path:OUT+"/now.png",fullPage:false});
await p.evaluate(()=>window.scrollTo(0,900)); await p.screenshot({path:OUT+"/now2.png"});
await p.click("#t-tanya"); await p.evaluate(()=>document.getElementById("ai-panel").scrollIntoView()); await p.screenshot({path:OUT+"/tanya.png"});
await p.click("#t-plan"); await p.evaluate(()=>window.scrollTo(0,0)); await p.screenshot({path:OUT+"/plan.png"});
const d=await ctx.newPage(); await d.emulateMedia({colorScheme:"dark"}); await d.goto(url+"index.html",{waitUntil:"load"}); await d.waitForFunction(()=>document.querySelector("#n-steps .step")); await d.evaluate(()=>document.getElementById("panduan-tutup").click()); await d.screenshot({path:OUT+"/dark.png"});
const r=await ctx.newPage(); await r.goto(url+"rute-700k.html",{waitUntil:"load"}); await r.screenshot({path:OUT+"/rute.png"});
await b.close(); srv.close(); console.log("shots ok");
