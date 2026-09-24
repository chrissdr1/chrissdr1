/* Peta di tab Sekarang: posisi Ibu (GPS), rumah, 21 titik terukur, dan 19
   SPKLU, di atas peta OpenStreetMap lewat Leaflet (vendor/leaflet).

   Yang TIDAK ada di sini: lapisan kemacetan langsung. Tidak ada sumber
   gratis untuk itu di Jabodetabek; Google, TomTom, dan HERE semuanya butuh
   kunci berbayar. Jalan keluarnya satu tombol yang membuka Google Maps
   dengan lapisan lalu lintas menyala tepat di posisi Ibu -- itu data yang
   sama yang dipakai semua orang, gratis, dan selalu terbaru.

   Ubin peta diambil dari internet saat dilihat; tanpa sinyal, penanda tetap
   tampil di atas latar kosong. */
"use strict";

var Peta = (function(){
  var map = null, posMarker = null, posCircle = null, sudahFokusPosisi = false;
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
           ada:function(){ return !!map; } };
})();
