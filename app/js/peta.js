/* Peta di tab Sekarang: posisi Ibu (GPS), rumah, 21 titik terukur, dan 19
   SPKLU, di atas peta OpenStreetMap lewat Leaflet (vendor/leaflet).

   Lapisan kemacetan langsung: tanpa kunci tidak ada (Google, TomTom, HERE
   semuanya butuh kunci), jadi ada tombol yang membuka Google Maps dengan
   lapisan lalu lintas menyala tepat di posisi Ibu. Dengan kunci TomTom
   (jatah gratis harian ada; anak yang mendaftar) ubin "traffic flow" TomTom
   ditumpangkan langsung di peta ini.

   Ubin peta diambil dari internet saat dilihat; tanpa sinyal, penibu tetap
   tampil di atas latar kosong. */
"use strict";

var Peta = (function(){
  var map = null, posMarker = null, posCircle = null, sudahFokusPosisi = false;
  var LS_TT = "tomtom-key", lapisanTT = null;
  var statusTT = "belum", statusTTCb = null;   /* belum | cek | ok | error */
  function laporStatusTT(s){ statusTT = s; if (statusTTCb) statusTTCb(s); }

  /* Kunci TomTom (opsional): dengan kunci ini ubin "traffic flow" TomTom
     ditumpangkan di peta. Bentuk URL ubin dari ingatan dokumentasi TomTom
     Traffic API v4 (flow tiles, gaya relative0) -- PERLU VERIFIKASI saat
     kunci pertama kali dipakai; kalau ubinnya tidak muncul, cek README. */
  function kunciTomTom(){ try { return localStorage.getItem(LS_TT) || ""; } catch (e) { return ""; } }
  function setKunciTomTom(k){ try { if (k) localStorage.setItem(LS_TT, k); else localStorage.removeItem(LS_TT); } catch (e) {} pasangTomTom(); }
  function urlTomTom(k){ return "https://{s}.api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=" + encodeURIComponent(k); }
  function pasangTomTom(){
    if (!map) return;
    var k = kunciTomTom();
    if (lapisanTT){ map.removeLayer(lapisanTT); lapisanTT = null; }
    if (!k){ laporStatusTT("belum"); return; }
    laporStatusTT("cek");
    lapisanTT = L.tileLayer(urlTomTom(k), { subdomains:"abcd", maxZoom:19, opacity:.85, attribution:"Lalu lintas &copy; TomTom" }).addTo(map);
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
      L.circleMarker([s[2], s[1]], { radius:5, color:"#9C6206", fillColor:"#E5B160", fillOpacity:.95, weight:1.5 })
        .addTo(map).bindPopup("<b>SPKLU</b> " + esc(s[0]) + '<br><span style="opacity:.75">jenis colokan belum tercatat</span>');
    });
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

  return { init:init, posisi:posisi, fokus:fokus, refresh:refresh, tautanMacet:tautanMacet,
           kunciTomTom:kunciTomTom, setKunciTomTom:setKunciTomTom, urlTomTom:urlTomTom,
           adaTomTom:function(){ return !!lapisanTT; },
           statusTomTom:function(){ return statusTT; },
           onStatusTomTom:function(fn){ statusTTCb = fn; },
           ada:function(){ return !!map; } };
})();
