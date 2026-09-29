/* Peta di tab Sekarang: posisi Ibu (GPS), rumah, 21 titik terukur, dan 19
   SPKLU, di atas peta OpenStreetMap lewat Leaflet (vendor/leaflet).

   Lapisan kemacetan langsung: tanpa kunci tidak ada (Google, TomTom, HERE
   semuanya butuh kunci), jadi ada tombol yang membuka Google Maps dengan
   lapisan lalu lintas menyala tepat di posisi Ibu. Dengan kunci TomTom
   (jatah gratis harian ada; anak yang mendaftar) ubin "traffic flow" TomTom
   ditumpangkan langsung di peta ini.

   Ubin peta diambil dari internet saat dilihat; tanpa sinyal, penibu tetap
   tampil di atas latar kosong.

   Garis rute ke tempat yang disarankan (ikut bentuk jalan sungguhan, bukan
   garis lurus) juga muncul kalau kunci TomTom ada -- lewat gambarRute(),
   dipanggil app.js dari data yang sama dengan pengali macet (lalulintas.js),
   jadi tidak ada permintaan TomTom tambahan khusus untuk garis ini. */
"use strict";

var Peta = (function(){
  var map = null, posMarker = null, posCircle = null, sudahFokusPosisi = false;
  var LS_TT = "tomtom-key", lapisanTT = null, lapisanInsiden = null, garisRute = null, lapisanPulang = null, lapisanKejadian = null;
  var statusTT = "belum", statusTTCb = null;   /* belum | cek | ok | error */
  function laporStatusTT(s){ statusTT = s; if (statusTTCb) statusTTCb(s); }

  /* Kunci TomTom (opsional): dengan kunci ini ubin "traffic flow" TomTom
     ditumpangkan di peta. Bentuk URL ini SUDAH diverifikasi lewat dokumentasi
     resmi TomTom Traffic API v4 (Raster Flow Tiles) -- host tunggal
     api.tomtom.com (TomTom TIDAK memakai subdomain a/b/c/d bergaya OSM;
     versi awal salah menyangka begitu dan ubinnya gagal dimuat), gaya
     "relative" (kecepatan relatif terhadap arus bebas -- nilai enum yang
     sah: absolute, relative, relative-delay, reduced-sensitivity; "relative0"
     yang dipakai versi awal bukan nilai yang sah). */
  function kunciTomTom(){ try { return localStorage.getItem(LS_TT) || ""; } catch (e) { return ""; } }
  function setKunciTomTom(k){ try { if (k) localStorage.setItem(LS_TT, k); else localStorage.removeItem(LS_TT); } catch (e) {} pasangTomTom(); }
  function urlTomTom(k){ return "https://api.tomtom.com/traffic/map/4/tile/flow/relative/{z}/{x}/{y}.png?key=" + encodeURIComponent(k); }
  /* Ubin kejadian (Raster Incident Tiles v4, gaya s0 yang disarankan
     dokumentasi): garis dan ikon kecelakaan/penutupan di atas lapisan macet.
     Termasuk jatah ubin (200.000/bulan), bukan jatah permintaan biasa. */
  function urlInsiden(k){ return "https://api.tomtom.com/traffic/map/4/tile/incidents/s0/{z}/{x}/{y}.png?key=" + encodeURIComponent(k); }
  function pasangTomTom(){
    if (!map) return;
    var k = kunciTomTom();
    if (lapisanTT){ map.removeLayer(lapisanTT); lapisanTT = null; }
    if (lapisanInsiden){ map.removeLayer(lapisanInsiden); lapisanInsiden = null; }
    if (!k){ laporStatusTT("belum"); return; }
    laporStatusTT("cek");
    lapisanTT = L.tileLayer(urlTomTom(k), { maxZoom:19, opacity:.85, attribution:"Lalu lintas &copy; TomTom" }).addTo(map);
    lapisanInsiden = L.tileLayer(urlInsiden(k), { maxZoom:19, opacity:.95 }).addTo(map);
    var pernahOk = false;
    lapisanTT.on("tileload", function(){ pernahOk = true; laporStatusTT("ok"); });
    /* Ubin kosong di tepi cakupan wajar; hanya lapor gagal kalau belum pernah
       satu ubin pun berhasil dimuat (kunci salah/kedaluwarsa/limit harian). */
    lapisanTT.on("tileerror", function(){ if (!pernahOk) laporStatusTT("error"); });
  }
  var WARNA = { tng:"#00713C", jkt:"#9E2A1E", apt:"#9C6206", rumah:"#12211B" };

  function ikon(warna, ukuran){
    return L.divIcon({ className:"pin", html:'<span style="background:' + warna + '"></span>',
                       iconSize:[ukuran, ukuran], iconAnchor:[ukuran / 2, ukuran / 2], popupAnchor:[0, -ukuran / 2] });
  }
  function esc(s){ return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  function init(node, onPilih){
    if (map || typeof L === "undefined") return map;
    map = L.map(node, { zoomControl:true, attributionControl:true, tap:true }).setView([RUMAH.lat, RUMAH.lon], 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom:19, attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);

    L.marker([RUMAH.lat, RUMAH.lon], { icon:ikon(WARNA.rumah, 16), title:"Rumah" }).addTo(map)
      .bindPopup("<b>Rumah</b> &middot; Modernland");

    LOK.forEach(function(l){
      if (l.lat == null) return;
      L.marker([l.lat, l.lon], { icon:ikon(WARNA[l.z] || WARNA.tng, l.luar ? 11 : 14), title:l.n }).addTo(map)
        .bindPopup("<b>" + esc(l.n) + "</b><br>pulang " + Math.round(l.home) + " km &middot; daya min " + l.res + "%<br>" +
                   '<button type="button" class="linkbtn" data-lok="' + esc(l.id) + '">Saya di sini</button>');
    });
    SPKLU.forEach(function(s){
      /* isi popup dibuat saat dibuka: colokan dari TomTom bisa datang belakangan */
      L.circleMarker([s[2], s[1]], { radius:5, color:"#9C6206", fillColor:"#E5B160", fillOpacity:.95, weight:1.5 })
        .addTo(map).bindPopup(function(){
          var t = (typeof SpkluTT !== "undefined") ? SpkluTT.untukNama(s[0]) : null;
          return "<b>SPKLU</b> " + esc(s[0]) + (t ? "<br>" + esc(SpkluTT.ringkasColokan(t)) + "<br><b>" + SpkluTT.teksCocok(t) + "</b>"
            : '<br><span style="opacity:.75">jenis colokan belum tercatat' + (kunciTomTom() ? "" : " (perlu kunci TomTom)") + "</span>");
        });
    });
    gambarSpkluTT();
    pasangTomTom();
    map.on("popupopen", function(e){
      var b = e.popup.getElement() && e.popup.getElement().querySelector("[data-lok]");
      if (b) b.addEventListener("click", function(){ if (onPilih) onPilih(b.getAttribute("data-lok")); map.closePopup(); });
    });
    return map;
  }

  /* Posisi GPS Ibu. Dipanggil tiap deteksi berhasil; peta ikut ke sana sekali. */
  function posisi(lat, lon, akurasi){
    if (!map) return;
    if (!posMarker){
      posMarker = L.circleMarker([lat, lon], { radius:8, color:"#fff", fillColor:"#1E6BD6", fillOpacity:1, weight:2.5 })
        .addTo(map).bindPopup("<b>Posisi Ibu</b> (GPS)");
      posCircle = L.circle([lat, lon], { radius:Math.max(30, akurasi || 0), color:"#1E6BD6", weight:1, fillOpacity:.08 }).addTo(map);
    } else {
      posMarker.setLatLng([lat, lon]); posCircle.setLatLng([lat, lon]); posCircle.setRadius(Math.max(30, akurasi || 0));
    }
    if (!sudahFokusPosisi){ map.setView([lat, lon], 13); sudahFokusPosisi = true; }
  }
  function fokus(lat, lon, zoom){ if (map) map.setView([lat, lon], zoom || 13); }
  function refresh(){ if (map) setTimeout(function(){ map.invalidateSize(); }, 60); }

  /* Google Maps dengan lapisan lalu lintas menyala, dipusatkan di titik itu. */
  function tautanMacet(lat, lon){
    return "https://www.google.com/maps/@" + lat.toFixed(5) + "," + lon.toFixed(5) + ",14z/data=!5m1!1e1";
  }

  /* Garis rute (ikut bentuk jalan sungguhan, dari TomTom Routing lewat
     Lalulintas.poinCache -- tidak memanggil TomTom sendiri) dari posisi Ibu
     ke tempat yang direkomendasikan. poin null/kosong menghapus garisnya. */
  function gambarRute(poin){
    if (!map) return;
    if (garisRute){ map.removeLayer(garisRute); garisRute = null; }
    if (poin && poin.length >= 2){
      garisRute = L.polyline(poin, { color:"#1A56C4", weight:4, opacity:.7 }).addTo(map);
    }
  }

  /* Jalan pulang sekarang: garis rute ke rumah (abu gelap) dan potongan
     yang macet (merah, tebal) dari Lalulintas.pulangSekarang. null = hapus. */
  /* Digambar ulang HANYA bila isinya berubah: menghapus lapisan menutup
     popup yang sedang dibuka Ibu, dan runNow berjalan tiap 30 detik. */
  var tandaPulang = null, tandaKejadian = null;
  function gambarPulang(h){
    if (!map) return;
    var t = h && h.poin ? String(h.at) : "";
    if (t === tandaPulang && (!!lapisanPulang === !!t)) return;
    tandaPulang = t;
    if (lapisanPulang){ map.removeLayer(lapisanPulang); lapisanPulang = null; }
    if (!h || !h.poin || h.poin.length < 2) return;
    lapisanPulang = L.layerGroup().addTo(map);
    L.polyline(h.poin, { color:"#12211B", weight:3, opacity:.55, dashArray:"6 6" }).addTo(lapisanPulang);
    (h.macet || []).forEach(function(m){
      if (m.garis && m.garis.length >= 2)
        L.polyline(m.garis, { color:m.tingkat >= 3 ? "#AB0000" : "#EB4C13", weight:6, opacity:.9 }).addTo(lapisanPulang)
          .bindPopup("<b>Macet +" + Math.round(m.tunda) + " menit</b>" + (m.kmj ? "<br>&plusmn;" + Math.round(m.kmj) + " km/jam" : ""));
    });
  }
  /* SPKLU tambahan dari TomTom (yang tidak ada di daftar aplikasi):
     hijau = CCS2 (cocok cepat untuk Atto 1), kuning = hanya AC, abu =
     tidak cocok. Digambar ulang setelah daftar TomTom diperbarui. */
  var lapisanSpkluTT = null;
  function gambarSpkluTT(){
    if (!map || typeof SpkluTT === "undefined") return;
    if (lapisanSpkluTT){ map.removeLayer(lapisanSpkluTT); lapisanSpkluTT = null; }
    var daftar = SpkluTT.semua(); if (!daftar.length) return;
    var dekatDaftar = function(t){ return SPKLU.some(function(s){ var dLat = (s[2] - t.lat) * 111.2, dLon = (s[1] - t.lon) * 110.6; return dLat * dLat + dLon * dLon <= 0.04; }); };
    lapisanSpkluTT = L.layerGroup().addTo(map);
    daftar.forEach(function(t){
      if (dekatDaftar(t)) return;
      var c = SpkluTT.cocok(t), warna = c.jenis === "cepat" ? "#00713C" : c.jenis === "lambat" ? "#C9A227" : "#8A8F8C";
      L.circleMarker([t.lat, t.lon], { radius:4, color:"#fff", weight:1, fillColor:warna, fillOpacity:.95 }).addTo(lapisanSpkluTT)
        .bindPopup("<b>" + esc(t.n) + "</b>" + (t.alamat ? '<br><span style="opacity:.75">' + esc(t.alamat) + "</span>" : "") +
                   "<br>" + esc(SpkluTT.ringkasColokan(t)) + "<br><b>" + SpkluTT.teksCocok(t) + "</b><br>" +
                   '<span style="opacity:.75">dari TomTom &middot; status kosong/terisi tidak tersedia</span>');
    });
  }

  /* Penanda kejadian di jalan (Kejadian.relevan). */
  function gambarKejadian(daftar){
    if (!map) return;
    var t = (daftar || []).map(function(k){ return k.id + ":" + k.tunda; }).join("|");
    if (t === tandaKejadian && (!!lapisanKejadian === !!t)) return;
    tandaKejadian = t;
    if (lapisanKejadian){ map.removeLayer(lapisanKejadian); lapisanKejadian = null; }
    if (!daftar || !daftar.length) return;
    lapisanKejadian = L.layerGroup().addTo(map);
    daftar.forEach(function(k){
      var parah = k.kat === 8 || k.kat === 11 || k.kat === 1;
      L.circleMarker(k.titik, { radius:parah ? 8 : 6, color:"#fff", weight:2, fillColor:parah ? "#AB0000" : "#EB8A13", fillOpacity:1 })
        .addTo(lapisanKejadian)
        .bindPopup("<b>" + esc(k.jenis) + "</b>" + (k.ket ? "<br>" + esc(k.ket) : "") +
                   (k.dari || k.ke ? "<br>" + esc(k.dari) + (k.ke ? " &rarr; " + esc(k.ke) : "") : "") +
                   (k.tunda ? "<br>tertahan &plusmn;" + k.tunda + " menit" : ""));
    });
  }

  return { init:init, gambarSpkluTT:gambarSpkluTT, gambarPulang:gambarPulang, gambarKejadian:gambarKejadian, urlInsiden:urlInsiden, posisi:posisi, fokus:fokus, refresh:refresh, tautanMacet:tautanMacet,
           kunciTomTom:kunciTomTom, setKunciTomTom:setKunciTomTom, urlTomTom:urlTomTom,
           adaTomTom:function(){ return !!lapisanTT; },
           statusTomTom:function(){ return statusTT; },
           onStatusTomTom:function(fn){ statusTTCb = fn; },
           gambarRute:gambarRute, adaRute:function(){ return !!garisRute; },
           ada:function(){ return !!map; } };
})();
