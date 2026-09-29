/* Jejak zona per blok jam: selama aplikasi terbuka dan GPS menyala, catat
   berapa menit Ibu berada di dekat tiap tempat (LOK) di tiap blok jam hari
   ini. Saat "Simpan hari ini", untuk(tgl) memberi zona dominan per blok --
   pasangan dengan isian order per blok, supaya Belajar bisa menghubungkan
   "order sekian" dengan "di mana".

   Batasan jujur: hanya tercatat saat halaman terbuka (browser menghentikan
   GPS di latar belakang). Jeda antar titik dibatasi 10 menit supaya aplikasi
   yang ditutup satu jam tidak dihitung satu jam di tempat terakhir. Blok
   dengan kurang dari 15 menit jejak tidak dilaporkan -- terlalu sedikit untuk
   disebut "Ibu di sana". Tidak ada yang dikirim ke mana pun. */
"use strict";

var JejakZona = (function(){
  var LS = "jejak-zona";
  var JEDA_MAKS = 10, MIN_BLOK = 15, RADIUS_KM = 8;

  function muat(){ try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { return null; } }
  function simpan(j){ try { localStorage.setItem(LS, JSON.stringify(j)); } catch (e) {} }

  function blokDari(jam){
    for (var i = 0; i < BASE.length; i++) if (jam >= BASE[i].s && jam < BASE[i].e) return BASE[i].n;
    return null;
  }
  function zonaDari(lat, lon){
    var best = null, bestD = Infinity;
    LOK.forEach(function(l){
      if (l.lat == null) return;
      var d = jarakLurus(lat, lon, l.lat, l.lon);
      if (d < bestD){ bestD = d; best = l.id; }
    });
    return bestD <= RADIUS_KM ? best : "lain";
  }

  /* t: milidetik (Date.now()). Menit sejak titik sebelumnya dihitung ke zona
     titik sebelumnya -- di situlah Ibu berada selama selang itu. */
  function catat(lat, lon, t){
    var d = new Date(t), tgl = iso(d);
    var j = muat();
    if (!j || j.tgl !== tgl) j = { tgl:tgl, m:{}, akhir:null };
    var zona = zonaDari(lat, lon);
    if (j.akhir){
      var menit = Math.min(JEDA_MAKS, Math.max(0, (t - j.akhir.t) / 60000));
      var da = new Date(j.akhir.t), blok = blokDari(da.getHours() + da.getMinutes() / 60);
      if (blok && menit > 0){
        var mb = j.m[blok] || (j.m[blok] = {});
        mb[j.akhir.z] = (mb[j.akhir.z] || 0) + menit;
      }
    }
    j.akhir = { t:t, z:zona };
    simpan(j);
  }

  /* {blok: idZona} untuk tanggal itu, atau null kalau tidak ada jejak cukup. */
  function untuk(tgl){
    var j = muat();
    if (!j || j.tgl !== tgl) return null;
    var hasil = {}, ada = false;
    Object.keys(j.m).forEach(function(blok){
      var mb = j.m[blok], total = 0, top = null, topM = 0;
      Object.keys(mb).forEach(function(z){ total += mb[z]; if (mb[z] > topM){ topM = mb[z]; top = z; } });
      if (total >= MIN_BLOK && top){ hasil[blok] = top; ada = true; }
    });
    return ada ? hasil : null;
  }

  return { catat:catat, untuk:untuk, zonaDari:zonaDari };
})();
