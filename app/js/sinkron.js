/* Sinkronisasi catatan harian ke repo GitHub privat, supaya angka Ibu bisa
   dibaca anaknya (dan Claude) tanpa salin-tempel.

   Cara kerjanya: satu berkas JSON di repo privat (bawaan
   chrissdr1/buku-setoran-data, catatan/shanti.json) dibaca dan ditulis lewat
   GitHub Contents API langsung dari browser, memakai token akses terbatas
   (fine-grained, hanya repo itu, izin Contents: read & write). Token
   disimpan di HP ini saja dan hanya dikirim ke api.github.com.

   Penggabungan: per tanggal (id). Kalau tanggal yang sama ada di dua tempat,
   yang stempel `diubah`-nya lebih baru menang; catatan lama tanpa stempel
   kalah dari yang punya. Tidak ada yang pernah dihapus oleh sinkronisasi. */
"use strict";

var Sinkron = (function(){
  var LS = "sinkron-github";
  var BAWAAN = { repo:"chrissdr1/buku-setoran-data", path:"catatan/shanti.json" };

  function cfg(){ try { return JSON.parse(localStorage.getItem(LS) || "null") || {}; } catch (e) { return {}; } }
  function setCfg(c){ try { if (c && c.token) localStorage.setItem(LS, JSON.stringify(c)); else localStorage.removeItem(LS); } catch (e) {} }
  function aktif(){ var c = cfg(); return !!(c.token && c.repo); }
  function urlIsi(c){ return "https://api.github.com/repos/" + c.repo + "/contents/" + (c.path || BAWAAN.path); }
  function headers(c){
    return { "Authorization":"Bearer " + c.token, "Accept":"application/vnd.github+json",
             "X-GitHub-Api-Version":"2022-11-28", "Content-Type":"application/json" };
  }
  function b64enc(s){ return btoa(unescape(encodeURIComponent(s))); }
  function b64dec(s){ return decodeURIComponent(escape(atob(String(s).replace(/\s/g, "")))); }
  function galat(r){
    return { code: (r.status === 401 || r.status === 403) ? "unauthorized" : r.status === 404 ? "notfound" : "http_" + r.status };
  }

  /* Promise<{data, sha}|null>; null kalau berkasnya belum ada. */
  function tarik(){
    var c = cfg();
    return fetch(urlIsi(c), { headers:headers(c), cache:"no-store" }).then(function(r){
      if (r.status === 404) return null;
      if (!r.ok) throw galat(r);
      return r.json().then(function(j){
        var data = null; try { data = JSON.parse(b64dec(j.content)); } catch (e) { data = null; }
        return { data:data, sha:j.sha };
      });
    });
  }
  function dorong(data, sha){
    var c = cfg();
    var body = { message:"Catatan " + iso(new Date()) + " (" + (data.harian || []).length + " hari)",
                 content:b64enc(JSON.stringify(data, null, 1)) };
    if (sha) body.sha = sha;
    return fetch(urlIsi(c), { method:"PUT", headers:headers(c), body:JSON.stringify(body) }).then(function(r){
      if (!r.ok) throw galat(r);
      return r.json().then(function(j){ return j.content && j.content.sha; });
    });
  }

  function kunciUrut(rows){ return rows.slice().sort(function(a, b){ return a.id < b.id ? 1 : a.id > b.id ? -1 : 0; }); }
  function gabung(lokal, remote){
    var m = {};
    (remote || []).forEach(function(r){ if (r && r.id) m[r.id] = r; });
    (lokal || []).forEach(function(r){
      if (!r || !r.id) return;
      var ada = m[r.id];
      if (!ada) { m[r.id] = r; return; }
      var tl = r.diubah || "", tr = ada.diubah || "";
      if (tl >= tr) m[r.id] = r;          /* seri (keduanya tanpa stempel): lokal menang */
    });
    return kunciUrut(Object.keys(m).map(function(k){ return m[k]; }));
  }

  /* Promise<{rows, status, jumlah}>. Tidak pernah melempar: galat jadi status. */
  function sinkron(rows, plan){
    if (!aktif()) return Promise.resolve({ rows:rows, status:"nonaktif" });
    if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve({ rows:rows, status:"offline" });
    return tarik().then(function(r){
      var remoteRows = (r && r.data && Array.isArray(r.data.harian)) ? r.data.harian : [];
      var gab = gabung(rows, remoteRows);
      var samaDenganRemote = JSON.stringify(gab) === JSON.stringify(kunciUrut(remoteRows));
      if (r && samaDenganRemote) return { rows:gab, status:"tersinkron", jumlah:gab.length };
      var data = { v:1, diperbarui:new Date().toISOString(), harian:gab, rencana:plan || null };
      return dorong(data, r && r.sha).then(function(){ return { rows:gab, status:"tersinkron", jumlah:gab.length, ditulis:true }; },
        function(err){
          /* sha basi: ada yang menulis di antara tarik dan dorong. Coba sekali lagi. */
          if (err && (err.code === "http_409" || err.code === "http_422")) return tarik().then(function(r2){
            var gab2 = gabung(gab, (r2 && r2.data && r2.data.harian) || []);
            return dorong({ v:1, diperbarui:new Date().toISOString(), harian:gab2, rencana:plan || null }, r2 && r2.sha)
              .then(function(){ return { rows:gab2, status:"tersinkron", jumlah:gab2.length, ditulis:true }; });
          });
          throw err;
        });
    })["catch"](function(err){
      return { rows:rows, status:(err && err.code) || "gagal", galat:err };
    });
  }

  /* Memastikan token dan repo: cukup baca metadata reponya. */
  function uji(){
    var c = cfg();
    if (!aktif()) return Promise.reject({ code:"no_token" });
    return fetch("https://api.github.com/repos/" + c.repo, { headers:headers(c), cache:"no-store" }).then(function(r){
      if (!r.ok) throw galat(r);
      return r.json().then(function(j){ return { privat:!!j.private, nama:j.full_name }; });
    });
  }

  return { cfg:cfg, setCfg:setCfg, aktif:aktif, sinkron:sinkron, uji:uji, gabung:gabung, BAWAAN:BAWAAN };
})();
