/* Mesin hitung: kalibrasi, simulasi sif, urutan langkah, nasihat, jarak pulang,
   dan uji mandiri. Tidak menggambar apa pun ke layar. */
"use strict";

var el = function(id){ return document.getElementById(id); };

function iso(d){ return d.toLocaleDateString("sv-SE"); }
function addDays(d, n){ var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function isOff(d){ return HOLI[iso(d)] || d.getDay() === 0 || d.getDay() === 6; }

/* ---------------- helpers ---------------- */
function num(v){ var n = parseFloat(v); return isFinite(n) && n >= 0 ? n : 0; }
function rp(v){ return "Rp " + Math.round(v).toLocaleString("id-ID"); }
function dec(v,d){ return v.toLocaleString("id-ID",{minimumFractionDigits:d,maximumFractionDigits:d}); }
function hhmm(h){ var m=Math.round(h*60),H=Math.floor(m/60),M=m%60;
  return String(H).padStart(2,"0")+":"+String(M).padStart(2,"0"); }
function fillTimes(sel, from, to, def){
  var h=""; for (var t=from;t<=to;t+=0.25) h+='<option value="'+t+'">'+hhmm(t)+"</option>";
  sel.innerHTML=h; sel.value=def;
}
function rehatRange(m){
  if (Array.isArray(m)) return m;                 /* jeda khusus dari preset */
  if (m === "duapeak") return [9.5, 16.75];       /* 8 jam: dua peak saja */
  return m==="full" ? [10.5,15] : (m==="short" ? [13,15] : null);
}

/* ---------------- rows + auto calibration ---------------- */
var rows = [], sampler = null;
var LS = "buku-setoran-v1";
function lsRead(){ try{ return JSON.parse(localStorage.getItem(LS)||"[]"); }catch(e){ return []; } }
function lsWrite(l){ try{ localStorage.setItem(LS, JSON.stringify(l)); }catch(e){} }
function sortRows(){ rows.sort(function(a,b){ return a.id<b.id?1:a.id>b.id?-1:0; }); }

function derive(r){
  var kmt=num(r.kmt), kmp=num(r.kmp), jam=num(r.jam), kwh=num(r.kwh);
  var net = num(r.dpt)+num(r.ins)-num(r.biaya);
  return { net:net,
    perjam: jam>0?net/jam:null,
    kmjam: (kmp>0&&jam>0)?kmp/jam:null,
    util: (kmp>0&&kmt>0)?(kmp/kmt)*100:null,
    eff: (kwh>0&&kmt>0)?kmt/kwh:null,
    rpkm: kmp>0?num(r.dpt)/kmp:null,
    ins: num(r.ins) };
}
function avgOf(list, pick){
  var s=0,n=0; list.forEach(function(r){ var v=pick(derive(r));
    if (v!=null && isFinite(v) && v>0){ s+=v; n++; } });
  return n?{v:s/n,n:n}:null;
}
/* Calibration used by the whole engine. Falls back to Rute 700K assumptions. */
/* 26 km/jam itu ANGKA TEBAKAN saya, dan ia menentukan tujuh hal yang paling
   menyangkut keselamatan: berapa lama perjalanan pulang, kapan mulai merapat,
   kapan disebut "waktu mepet". Belum pernah diuji sekali pun.

   Tidak bisa diturunkan dari catatan harian: km tempuh dibagi jam kerja
   mencampur waktu bergerak dengan waktu menunggu order, dan hasilnya
   MEREMEHKAN kecepatan menyetir (245 km / 11 jam = 22 km/jam, padahal kalau
   75% waktunya bergerak, menyetirnya 30 km/jam). Dipakai begitu saja, Ibu
   disuruh pulang terlalu pagi -- kehilangan jam kerja, bukan bertambah aman.

   Satu-satunya yang benar: berapa menit perjalanan pulangnya sungguhan.
   Itu satu angka, dan cuma Ibu yang punya. */
var KEC_BAWAAN = 26;
var CALIB = { rpkm:BASE_RPKM, ins:130000, kmkwh:6.7, kecepatan:KEC_BAWAAN,
              kecUkur:false, kecN:0, live:false, n:0 };
function recalibrate(){
  var recent = rows.slice(0,14);
  var a = avgOf(recent,function(d){return d.rpkm;});
  var b = avgOf(recent,function(d){return d.eff;});
  var c = avgOf(recent,function(d){return d.ins;});
  var enough = recent.length >= 3;
  /* Kecepatan pulang dari hari-hari yang menit pulangnya dicatat. Median,
     bukan rata-rata: satu hari dengan banjir tidak boleh menggeser semuanya.
     Dijepit 12-45 km/jam supaya salah ketik tidak merusak seluruh rencana. */
  var laju = [];
  rows.slice(0, 20).forEach(function(r){
    var m = num(r.mnt), k = num(r.pkm);
    if (m >= 5 && k >= 3){ var v = k / (m/60); if (v >= 12 && v <= 45) laju.push(v); }
  });
  laju.sort(function(x,y){ return x-y; });
  /* Jumlah genap: ambil yang LEBIH LAMBAT, bukan rata-ratanya. Kecepatan yang
     terlalu tinggi membuat Ibu disuruh berangkat pulang terlambat, dan itu
     kesalahan yang mahal; kelebihan waktu cuma merepotkan. */
  var kec = laju.length ? laju[Math.floor((laju.length - 1) / 2)] : KEC_BAWAAN;
  CALIB = {
    rpkm: (enough && a) ? a.v : BASE_RPKM,
    ins:  (enough && c) ? c.v : 130000,
    kmkwh:(enough && b) ? b.v : 6.7,
    kecepatan: kec, kecUkur: laju.length > 0, kecN: laju.length,
    live: enough && !!(a||b||c),
    n: recent.length
  };
  var cm = el("calmode");
  if (cm) cm.textContent = CALIB.live
    ? "Angka Anda · " + CALIB.n + " hari" : "Asumsi bawaan";
}
function blockRate(b, hari){
  var base = (SHAPE[hari] && SHAPE[hari][b.n]) ? SHAPE[hari][b.n] : b.r;
  var u = (base + b.km*BASE_E) / (b.km*BASE_RPKM);
  return Math.max(0, b.km*u*CALIB.rpkm - b.km*(TARIF_KWH/CALIB.kmkwh));
}

/* ---------------- day context (holiday aware) ---------------- */
function dayCtx(dateStr){
  var d = new Date(dateStr + "T00:00:00");
  var dow = d.getDay();
  var h = HOLI[dateStr] || null;
  var eve = !isOff(d) && !!HOLI[iso(addDays(d,1))];
  var runLen = 0;
  if (h || dow===0 || dow===6){ var x=d; while (isOff(x)){ runLen++; x=addDays(x,1); } }
  var evePlus = false;
  if (!h && dow!==0 && dow!==6){
    var x2 = addDays(d,1), c=0; while (isOff(x2) && c<6){ c++; x2=addDays(x2,1); }
    evePlus = c >= 3;
  }
  /* a holiday behaves like Sunday: no commute peak */
  var shapeDay = h ? 0 : dow;
  var mult = DAYMULT[dow];
  if (h) mult = 0.97 * (runLen >= 3 ? 1.05 : 1);
  if (eve) mult *= (evePlus ? 1.18 : 1.08);
  var ev = EVENTS[dateStr] || null;
  if (ev) mult *= (ev[2] === "lokal" ? 1.12 : 1.06);
  return { d:d, dow:dow, holi:h, eve:eve, evePlus:evePlus, runLen:runLen, ev:ev,
           shapeDay:shapeDay, mult:mult, name:DAYNAME[dow] };
}

/* ---------------- simulation ---------------- */
function simulate(o){
  var z = ZONA[o.zona], ctx = o.ctx;
  /* Acara dari kalender sudah masuk di ctx.mult (yang tahu bedanya acara
     lokal dan Jakarta). Centang "acara besar" hanya berlaku untuk acara
     yang Ibu tandai sendiri — kalau tidak, pengalinya terhitung dua kali. */
  var extra = (o.hujan?1.20:1) * ((o.acara && !ctx.ev) ? 1.15 : 1);
  var filterOK = o.filter >= z.need;
  var peakMult = filterOK ? z.peak : (1 + (z.peak-1)*0.35);
  var rehat = rehatRange(o.rehat||"none");
  var segs=[], gross=0, rawHours=0, km=0, murah=Infinity;

  BASE.forEach(function(b){
    var rate = blockRate(b, ctx.shapeDay);
    var s=Math.max(b.s,o.keluar), e=Math.min(b.e,o.pulang);
    var w=Math.max(0,e-s), ro=0;
    if (rehat && w>0) ro = Math.max(0, Math.min(e,rehat[1]) - Math.max(s,rehat[0]));
    var net = Math.max(0,w-ro);
    var mult = (PEAKS[b.n]?peakMult:z.off) * ctx.mult * extra;
    var eff = rate*mult;
    if (net>0){ gross+=eff*net; rawHours+=net; km+=b.km*z.kmx*net;
                if (eff < murah) murah = eff; }
    segs.push({n:b.n,s:b.s,e:b.e,on:net>0,rate:eff});
  });

  var deadKm=z.dead, deadHours=deadKm/CALIB.kecepatan, cap=o.bat;
  /* Pakai sisa baterai yang sebenarnya kalau diberikan (tab Sekarang);
     kalau tidak, anggap berangkat 90% atau penuh bila ada charger rumah. */
  var startSoC = (typeof o.soc === "number" && o.soc > 0)
    ? Math.min(1, o.soc/100) : (o.rumah ? 1.00 : 0.90);
  var initialKm = Math.max(0,(startSoC-0.20))*cap*CALIB.kmkwh;
  var perCharge = 0.70*cap*CALIB.kmkwh;
  var sessions = km<=initialKm ? 0 : Math.ceil((km-initialKm)/perCharge);
  var perSesi = cap>35 ? 0.78 : 0.62;
  var chargeHours = sessions*perSesi;
  /* Ngecas saat istirahat tidak memakan jam kerja sama sekali. */
  var jeda = rehat ? Math.max(0, Math.min(rehat[1],o.pulang) - Math.max(rehat[0],o.keluar)) : 0;
  if (jeda >= perSesi) chargeHours = Math.max(0, chargeHours - Math.min(jeda, chargeHours));
  /* Jam yang hilang karena ngecas dibebankan pada tarif blok TERMURAH yang
     benar-benar dikerjakan -- karena di situlah buildSteps menaruh sesinya,
     dan ia bahkan menghukum blok peak dengan 1e6 supaya tidak terpilih.
     Dulu dipotong merata lewat effHours/rawHours, yang membebankan tarif
     RATA-RATA seluruh sif -- termasuk jam peak -- untuk sesi yang justru
     sengaja dijadwalkan di jam sepi. Dua paruh layar yang sama saling
     bertentangan: angkanya bilang "kamu kehilangan jam bertarif rata-rata",
     daftar langkahnya bilang "kamu ngecas di jam sepi".

     Km kosong di awal sif (deadHours) TETAP dipotong merata: itu memang
     memakan jam apa adanya, bukan jam yang bisa dipilih. */
  var jamSetelahKosong = Math.max(0, rawHours-deadHours);
  var scale = rawHours>0 ? jamSetelahKosong/rawHours : 0;
  var effHours = Math.max(0, jamSetelahKosong-chargeHours);
  var blockNet = Math.max(0, gross*scale - chargeHours*(isFinite(murah)?murah:0));
  var insentif = CALIB.ins * Math.min(1, effHours/10.5) * ctx.mult;
  var feeCharge = sessions*SESSION_FEE;
  var deadCost = deadKm*(TARIF_KWH/CALIB.kmkwh);
  var net = blockNet + insentif - feeCharge - PARKIR - deadCost;

  return { net:net, blockNet:blockNet, insentif:insentif, feeCharge:feeCharge,
    deadKm:deadKm, sessions:sessions, chargeHours:chargeHours, effHours:effHours,
    km:km, kwh:km/CALIB.kmkwh, segs:segs, filterOK:filterOK, zona:z,
    /* Diekspor hanya supaya aturan ke-12 bisa memeriksa bahwa jam ngecas
       dibebankan pada tarif blok TERMURAH, bukan rata-rata. Tidak dipakai
       untuk menampilkan apa pun. */
    gross:gross, scale:scale, murah:(isFinite(murah)?murah:0),
    perHour: effHours>0?net/effHours:0 };
}

function buildSteps(o, r, opts){
  opts = opts||{};
  var z = ZONA[o.zona], ctx = o.ctx;
  var extra = (o.hujan?1.20:1)*(o.acara?1.15:1);
  var peakMult = (o.filter>=z.need) ? z.peak : (1+(z.peak-1)*0.35);
  var rehat = rehatRange(o.rehat||"none");
  var noPagi = !!ctx.holi || ctx.dow===6 || ctx.dow===0;

  var live=[];
  BASE.forEach(function(b){
    var s=Math.max(b.s,o.keluar), e=Math.min(b.e,o.pulang);
    if (e<=s) return;
    /* Potong bagian yang tertutup istirahat, dan pakai rentang yang
       BENAR-BENAR dikerjakan sebagai label jamnya. */
    var ws=s, we=e;
    if (rehat){
      if (rehat[0]<=s && rehat[1]>=e) return;                 // tertutup penuh
      if (rehat[0]<=s && rehat[1]>s)  ws = rehat[1];          // pangkalnya tertutup
      else if (rehat[1]>=e && rehat[0]<e) we = rehat[0];      // ujungnya tertutup
    }
    var w = Math.max(0, we-ws);
    if (w>0.4) live.push({b:b, s:ws, e:we, w:w, rate:blockRate(b,ctx.shapeDay)});
  });

  /* Istirahat itu jendela ngecas terbaik: tidak ada order yang hilang.
     Dimasukkan sebagai blok semu bertarif nol supaya selalu terpilih. */
  if (rehat && rehat[1] > o.keluar && rehat[0] < o.pulang){
    var rs = Math.max(rehat[0], o.keluar), re = Math.min(rehat[1], o.pulang);
    if (re - rs >= 0.8){
      var pos2 = live.length;
      for (var q = 0; q < live.length; q++){ if (live[q].s >= re){ pos2 = q; break; } }
      /* Rentangkan sampai langkah berikutnya benar-benar mulai, supaya
         tidak ada lubang waktu yang tak dijelaskan di daftar. */
      var reTampil = (pos2 < live.length) ? live[pos2].s : re;
      live.splice(pos2, 0, { b:{n:"Istirahat", km:0}, s:rs, e:Math.max(re,reTampil),
                             w:re-rs, rate:0, jeda:true });
    }
  }
  /* Tempatkan sesi ngecas dengan menyimulasikan baterai sepanjang hari:
     isi hanya saat jangkauan memang mau habis, lalu pilih blok termurah
     di antara sesi terakhir dan titik itu. Mencegah dua sesi beruntun. */
  var at = {}, left = r.sessions;
  var soc0 = (typeof o.soc === "number" && o.soc > 0)
    ? Math.min(1, o.soc/100) : (o.rumah ? 1.00 : 0.90);
  var avail = Math.max(0, soc0 - 0.20) * o.bat * CALIB.kmkwh;
  var perCharge = 0.70 * o.bat * CALIB.kmkwh;
  var kms = live.map(function(seg){ return seg.b.km * z.kmx * seg.w; });
  /* Jumlah kumulatif, supaya "sejak sesi terakhir" bisa diukur dari titik
     pengisian itu sendiri — termasuk km yang ditempuh di blok yang sama. */
  var pre=[0], preJ=[0];
  for (var q2=0; q2<live.length; q2++){
    pre.push(pre[q2] + kms[q2]); preJ.push(preJ[q2] + live[q2].w);
  }
  var used = 0, idxLast = -1;
  for (var i = 0; i < live.length; i++){
    if (left > 0 && used + kms[i] > avail){
      /* Kandidat harus sudah menempuh cukup km sejak sesi terakhir,
         supaya tidak muncul dua sesi beruntun di blok bersebelahan. */
      var best = -1, bestScore = Infinity;
      var basis = idxLast < 0 ? 0 : idxLast;   /* diukur dari blok pengisian terakhir */
      for (var j = idxLast + 1; j <= i; j++){
        /* Jarak sejak sesi terakhir diukur dari blok pengisiannya sendiri,
           termasuk km yang ditempuh setelah mencolok di blok itu. Boleh
           lewat km ATAU jam, karena blok istirahat menyumbang 0 km tapi
           memakan waktu. Blok peak dihukum berat. */
        /* Anggap mencolok di tengah blok, jadi hanya separuh km blok itu
           yang terhitung setelah pengisian. */
        var accKm = pre[j] - pre[basis] - (idxLast < 0 ? 0 : kms[idxLast] * 0.5);
        if (live[j].w >= 0.5 && !at[live[j].b.n] &&
            (live[j].jeda || accKm >= 0.45 * perCharge)){
          var score = live[j].rate + (PEAKS[live[j].b.n] ? 1e6 : 0);
          if (score < bestScore){ best = j; bestScore = score; }
        }
      }
      if (best < 0){
        /* Tidak ada blok yang memenuhi syarat. Sesi PERTAMA boleh terpaksa
           (baterai memang sudah tipis sejak berangkat); sesi berikutnya
           tidak — biarkan kebutuhannya bergulir ke blok selanjutnya
           daripada menempel di sebelah sesi sebelumnya. */
        if (idxLast === -1) best = i; else { used += kms[i]; continue; }
      }
      at[live[best].b.n] = true; left--; idxLast = best; used = 0; avail = perCharge;
    }
    used += kms[i];
  }

  var out=[], cum=opts.cum||0;
  out.meta = { avail: Math.max(0, soc0-0.20)*o.bat*CALIB.kmkwh, km0: kms[0]||0 };
  var pos = opts.L, jauh = pos && pos.jauh, diJkt = pos && pos.z === "jkt";
  /* Berapa lama perjalanan pulangnya — setelah itu Anda sudah di wilayah
     inti lagi, jadi langkahnya kembali normal. */
  var jamPulang = jauh ? Math.max(0.75, pos.home / CALIB.kecepatan) : 0;
  var mulaiPulang = o.pulang - jamPulang;   /* dijadwalkan tiba tepat saat jam pulang */
  var sudahSampai = false;
  live.forEach(function(L,idx){
    var def;
    var tengah = (L.s + L.e) / 2;
    var masihPulang = jauh && tengah >= mulaiPulang;
    var sisaKm = masihPulang
      ? Math.max(0, pos.home * (o.pulang - tengah) / jamPulang) : 0;
    if (idx===0 && opts.verdict){
      /* Langkah pertama = keputusan di kartu atas, jadi urutan selalu
         mengikuti posisi Anda yang sebenarnya. */
      def = { b:opts.verdict.h, s:opts.verdict.r, i:opts.verdict.p };
    } else if (masihPulang){
      if (!sudahSampai){
        sudahSampai = true;
        def = { b:"Mulai merapat pulang",
                s:pulangStep(sisaKm, pos.n).s,
                i:"Sampai jam ini Anda bebas kerja di sekitar sana. Mulai sekarang, <b>hanya terima order yang mendekatkan ke Modernland</b> &mdash; sisa "+Math.round(sisaKm)+" km, pas untuk tiba di jam pulang." };
      } else def = pulangStep(sisaKm, pos.n);
    } else if (jauh){
      def = { b:"Kerja di sekitar sini dulu",
              s:"Utamakan order yang mengarah ke barat &middot; belum perlu pulang",
              i:"Waktu masih longgar. Kerjakan order apa adanya, tapi kalau ada dua pilihan ambil yang ke arah barat. Merapat pulang baru dimulai pukul <b>"+hhmm(mulaiPulang)+"</b>." };
    } else if (noPagi && (L.b.n==="Peak pagi"||L.b.n==="Subuh")){
      def = OFFPAGI;
    } else if (ctx.eve && (L.b.n==="Peak sore"||L.b.n==="Malam")){
      def = EVEPETANG;
    } else if (L.jeda){
      def = at[L.b.n]
        ? { b:"Istirahat &mdash; sekalian isi daya",
            s:"Colok di rumah atau SPKLU jangkar &middot; <b>15 &rarr; 90%</b>",
            i:"Inilah waktu terbaik mengisi daya: tidak ada order yang hilang, karena jam-jam ini memang paling sepi." }
        : STEP["Istirahat"];
    } else if (pos && pos.z === "apt" && STEP_APT[L.b.n]){
      def = STEP_APT[L.b.n];
    } else if (opts.rencana && pos && (pos.z==="mix"||pos.z==="jkt") && STEP_MIX[L.b.n]){
      /* RENCANA: perjalanan dimulai dari rumah, jadi Jakarta itu tujuan
         yang harus ditempuh — bukan tempat Ibu sudah berada. */
      def = STEP_MIX[L.b.n];
    } else if (!opts.rencana && diJkt && !jauh && STEP_JKT[L.b.n]){
      /* SEKARANG: Ibu memang sedang berada di Jakarta. */
      def = STEP_JKT[L.b.n];
    } else {
      def = STEP[L.b.n];
    }
    var mult=(PEAKS[L.b.n]?peakMult:z.off)*ctx.mult*extra;
    var val=L.rate*mult*L.w, charge=at[L.b.n];
    if (charge) val*=0.55;
    cum+=val;
    out.push({ t:hhmm(L.s)+"&ndash;"+hhmm(L.e), dur:L.jeda?"jeda":L.w.toFixed(1)+" jam",
      b: (charge && !L.jeda)?def.b+" + isi daya":def.b,
      s: (charge && !L.jeda)?def.s+" &middot; <b>colok 15&rarr;90%</b>":def.s,
      i: def.i, v:rp(val), cum:rp(cum),
      cls: charge?"charge":((idx===0&&opts.markNow)?"now":"") });
  });
  if (!opts.noHome){
    var kmHome = opts.kmHome||0;
    var mulai = o.pulang - Math.max(0.5, kmHome/CALIB.kecepatan+0.25);
    /* Ditulis sebagai "mulai jam sekian", bukan rentang — supaya tidak
       terlihat tumpang tindih dengan blok terakhir di atasnya. */
    out.push({ t:"mulai<br>"+hhmm(Math.max(o.keluar,mulai)), dur:"penutup",
      b: opts.stay?"Berhenti di area kerja":"Protokol pulang",
      s: opts.stay?"Cari SPKLU 24 jam untuk besok pagi"
                  :"Filter Tujuan Saya &rarr; Modernland &middot; "+Math.round(kmHome)+" km",
      i: opts.stay?"Tidak pulang: pastikan daya cukup untuk peak pagi besok, isi malam ini juga."
                  :"Aktifkan filter di jam ini. Kalau jatah habis, hanya terima order ke arah barat. Batas keras 22:00.",
      v:"&mdash;", cum:rp(cum), cls:"home" });
  }
  return out;
}

function note(k,t,x){ return '<div class="note '+k+'"><span class="tag">'+t+"</span><span>"+x+"</span></div>"; }

/* ---------------- advice ---------------- */
function blockAt(t, shapeDay){
  for (var i=0;i<BASE.length;i++) if (t>=BASE[i].s && t<BASE[i].e)
    return { n:BASE[i].n, rate:blockRate(BASE[i],shapeDay) };
  return { n:"Di luar jam", rate:0 };
}
function advise(blk, L, o){
  var ctx=o.ctx, noPagi = !!ctx.holi||ctx.dow===6||ctx.dow===0;
  if (L.jauh){
    var jamPulang = Math.max(0.75, L.home / CALIB.kecepatan);
    var slack = (o.pulang - o.keluar) - jamPulang;
    var mulai = hhmm(o.pulang - jamPulang);
    var dasar = "Jarak pulang dari "+L.n+" <b>"+Math.round(L.home)+" km</b>, sekitar <b>"+
                Math.round(jamPulang*60)+" menit</b>, dan butuh sisa daya minimal <b>"+L.res+"%</b>.";

    if (slack < 1.0) return {k:"bad", h:"Waktu mepet &mdash; pulang sekarang, jangan cari order lagi",
      r:"Rute langsung: JORR arah barat &rarr; keluar Ulujami atau Pondok Aren &rarr; Serpong &rarr; Modernland",
      p:dasar+" Sisa waktu Anda tinggal "+((o.pulang-o.keluar).toFixed(1))+" jam &mdash; <b>habis untuk perjalanan pulang saja</b>. "+
        "Berhenti menerima order kecuali yang benar-benar searah, dan berangkat sekarang."};

    if (slack < 3.5) return {k:"bad", h:"Mulai merapat sekarang, sambil tetap ambil order",
      r:"Pindai tujuan bernama: "+KATA_BARAT,
      p:dasar+" Waktu Anda cukup, tapi tidak longgar. <b>Mulai bergerak ke barat sekarang</b> sambil tetap menerima order &mdash; "+
        "tapi hanya yang mendekatkan Anda. Sasaran berurutan: <b>Ulujami &rarr; Pondok Aren &rarr; Bintaro &rarr; Serpong</b>. "+
        "Kalau 10 menit kosong, jalan sendiri lewat JORR sambil online."};

    return {k:"warn", h:"Masih longgar &mdash; kerja dulu di sini",
      r:"Baru perlu mulai merapat pukul <b>"+mulai+"</b>",
      p:dasar+" Anda punya <b>"+slack.toFixed(1)+" jam kelonggaran</b>, jadi tidak perlu buru-buru pulang. "+
        "<b>Kerjakan order apa adanya di sekitar sini dulu</b> &mdash; tapi kalau ada dua pilihan, ambil yang mengarah ke barat. "+
        "Mulai pukul "+mulai+", barulah beralih ke mode pulang bertahap dan hanya menerima yang mendekatkan Anda ke Modernland."};
  }
  if (L.luar && L.z==="tng" && !PEAKS[blk.n]) return {k:"warn", h:"Di pinggir wilayah &mdash; bergerak ke arah inti",
    r:"Arahkan ke Alam Sutera / Kota Tangerang &middot; "+Math.round(L.home)+" km ke rumah",
    p:"Ini masih wilayah Tangerang, tapi di luar sirkuit inti Anda. Di jam yang bukan peak, permintaannya lebih tipis. <b>Bergerak ke arah Alam Sutera atau Kota Tangerang sambil tetap online</b>, jangan menunggu di sini."};
  if (ctx.eve && (blk.n==="Peak sore"||blk.n==="Malam"||blk.n==="Pra-peak"))
    return {k:"good",h:"Malam sebelum libur &mdash; kejar arus keluar kota",
      r:"Bandara &middot; Stasiun Batu Ceper &middot; Terminal Poris Plawad",
      p:"Besok tanggal merah, dan malam ini orang berangkat. Penumpang berkoper dengan tujuan jauh &mdash; <b>utamakan tiga titik itu di atas sirkuit mal biasa</b>. Ini salah satu malam terkuat dalam sebulan."};
  if (blk.n==="Peak pagi"||blk.n==="Subuh"){
    if (noPagi) return {k:"warn",h: ctx.holi?"Tanggal merah &mdash; peak pagi tidak ada":"Belum ada arus komuter",
      r:"Tetap dekat rumah &middot; jangan buang km",
      p:(ctx.holi?"<b>"+ctx.holi[0]+".</b> ":"")+"Tidak ada arus berangkat kerja hari ini. Permintaan baru naik menjelang siang dan puncaknya sore sampai malam. <b>Jangan berputar mencari order sekarang</b> &mdash; itu km kosong. Isi daya, dan mulai serius jam 10 ke atas."};
    if (L.z==="tng"&&L.home<=10) return {k:"good",h:"Anda di posisi terbaik hari ini",
      r:"Cluster perumahan &rarr; Jakarta / Bandara",
      p:"Tetap di dalam cluster, jangan pindah ke jalan raya. Order yang lahir di sini jam segini adalah <b>komuter ke Jakarta dan penumpang penerbangan pagi</b> &mdash; trip panjang, jarak jemput nyaris nol."};
    if (L.id==="bsd"||L.id==="serpong") return {k:"",h:"Kerjakan kantor dan stasiun",
      r:"Green Office Park &middot; Digital Hub &middot; Stasiun Rawa Buntu",
      p:"Arus berangkat KRL memuncak 06:00&ndash;08:00 di Rawa Buntu. <b>Jangan bergerak ke selatan</b> &mdash; itu menjauhkan Anda dari rumah dan dari arus."};
    if (L.z==="jkt") return {k:"good",h:"Panen koridor Jakarta sekarang",
      r:"Puri &middot; Kebon Jeruk &middot; Slipi &rarr; Sudirman",
      p:"Tarif tertinggi sepanjang hari, dan pelat listrik Anda bebas ganjil&ndash;genap saat pesaing tersaring. <b>Kerja lokal sampai sekitar 09:00</b>, lalu aktifkan filter untuk pulang berbayar."};
    return {k:"warn",h:"Antre bandara, atau keluar sambil online",
      r:"Antre &le; 45 menit &middot; kalau lebih: keluar lewat Batu Ceper",
      p:"Bandara satu-satunya titik yang <b>menjamin</b> order panjang. Tapi pergi kosong berarti 23,4 km hangus &mdash; kalau keluar, <b>tetap online</b> lewat Batu Ceper atau Poris."};
  }
  if (blk.n==="Pagi akhir"){
    if (L.z==="jkt") return {k:"warn",h:"Peak habis &mdash; pulang berbayar sekarang",
      r:"Filter Tujuan Saya &rarr; Tangerang &middot; "+Math.round(L.home)+" km",
      p:"Tarif turun ke sekitar "+rp(blk.rate)+" per jam, dan <b>Anda tidak punya SPKLU jangkar di Jakarta</b>. Pakai jatah filter sekarang supaya perjalanan pulang tetap dibayar, lalu isi daya di Karawaci atau Kunciran."};
    return {k:"warn",h:"Peak habis &mdash; jam termurah hari ini",
      r:"Sirkuit dekat rumah &middot; Tangcity &middot; Siloam Lippo Village",
      p:"Tarif turun ke sekitar "+rp(blk.rate)+" per jam. Jangan mengejar order jauh sekarang &mdash; kerjakan yang dekat saja. "+
        "<b>Jangan menunggu di stasiun jam segini</b> &mdash; menurut jadwal KRL, kereta di Stasiun Tangerang tinggal separuh dibanding jam ramai pagi. "+
        "Kalau hari ini butuh sesi pengisian daya, urutan di bawah sudah menaruhnya di jam yang paling murah."};
  }
  if (blk.n==="Siang"){
    if (L.z==="jkt") return {k:"warn",h:"Jakarta paling sepi siang hari",
      r:"Bergerak balik ke arah barat sambil online",
      p:"Blok siang di Jakarta lebih buruk daripada di Tangerang, dan Anda "+Math.round(L.home)+" km dari rumah. <b>Pulang sambil tetap online</b> &mdash; peluang dapat order naik justru saat Anda mendekati Tangerang."};
    return {k:"",h:"Sirkuit siang, atau pulang istirahat",
      r:"Living World &rarr; Summarecon &rarr; AEON &rarr; Karawaci",
      p:"Blok ini hanya sekitar "+rp(blk.rate)+" per jam. Kalau dekat rumah, <b>pulang istirahat hampir tidak berbiaya</b> dan membuat peak sore jauh lebih baik."};
  }
  if (blk.n==="Jam mati"){
    if (L.z==="jkt") return {k:"bad",h:"Jangan menunggu di Jakarta",
      r:"Balik ke wilayah inti sambil online",
      p:"Jam tersepi dalam sehari, dan Anda jauh dari jangkar SPKLU. <b>Bergerak pulang lebih baik daripada diam menunggu</b> &mdash; sekalian menyiapkan posisi untuk peak sore."};
    return {k:"bad",h:"Blok terburuk. Jangan dipaksa",
      r:"Istirahat &middot; top-up &middot; siapkan posisi sore",
      p:"14:00&ndash;15:15 paling sepi. Memaksa di sini <b>membakar baterai untuk hasil terkecil</b>. Pastikan daya cukup untuk peak sore plus pulang."};
  }
  if (blk.n==="Pra-peak"){
    if (L.z==="tng" && o.filter>=1) return {k:"good",h:"Kalau mau Jakarta, berangkat sekarang",
      r:"Tol &rarr; Jakarta Barat / CBD &middot; batas 15:30",
      p:"Peak sore di Jakarta lebih tinggi daripada di Tangerang &mdash; <b>tapi hanya kalau tiba sebelum arus keluar kota memadat</b>, dan jatah filter masih ada untuk pulang berbayar. Lewat 15:30, batalkan."};
    if (L.z==="tng") return {k:"warn",h:"Ambil posisi di Tangerang",
      r:"Green Office Park &middot; Prominence &middot; Karawaci",
      p:"Jatah filter habis, Jakarta terlalu berisiko &mdash; pulangnya bisa 18&ndash;30 km kosong. <b>Berdiri di kawasan kantor 20 menit sebelum bubaran.</b>"};
    return {k:"good",h:"Bertahan di Jakarta sampai peak sore",
      r:"Pangkal di kawasan kantor &middot; keluar 20:30 dengan filter",
      p:"Anda sudah di zona termahal. Bertahan tiga jam ke depan lebih untung daripada pulang sekarang &mdash; asal keluarnya nanti berpenumpang."};
  }
  if (blk.n==="Peak sore"){
    if (L.z==="jkt") return {k:"good",h:"Panen arus keluar kota",
      r:"Kantor Jakarta &rarr; Tangerang / pinggiran",
      p:"Blok terbesar hari ini. <b>Hindari order ke Jakarta Timur, Utara, atau Bekasi setelah 18:30</b> &mdash; pulangnya jauh dan kosong."};
    return {k:"good",h:"Kantor bubaran, lalu arus pulang KRL",
      r:"Green Office Park / Prominence &rarr; Stasiun &middot; 16:00&ndash;20:00",
      p:"Dua sumber bertumpuk: karyawan pulang, dan penumpang KRL yang butuh antaran terakhir. <b>Stasiun Tangerang dan Rawa Buntu ramai sekarang</b>, jarak jemput kecil."};
  }
  if (blk.n==="Malam") return {k:"",h:"Panen terakhir",
    r:"Mal tutup 21:00 &middot; kuliner &middot; kedatangan bandara",
    p:"Ambil posisi 15 menit sebelum mal tutup. Kedatangan bandara 19:00&ndash;22:00 masih ramai dan <b>searah pulang Anda</b>."};
  return {k:"warn",h:"Waktunya pulang",
    r:"Filter Tujuan Saya &rarr; Modernland",
    p:"Tarif sudah turun dan jam ini merusak peak pagi besok. <b>Aktifkan filter sekarang</b>, atau terima hanya order ke arah barat. Batas keras 22:00."};
}

var WEATHER = null, REGISTRI = {}, lastLok = "kota";

/* Berapa tambahan bersih kalau jam pulang digeser -- dicabut dari runNow
   supaya aturan ke-12 bisa mengujinya dari luar.

   WAJIB memakai hari yang SAMA diperpanjang. Dulu dihitung sebagai sif baru
   yang berdiri sendiri mulai jam pulang; karena soc tidak ikut diteruskan,
   sif itu selalu dianggap berangkat baterai penuh dan tidak pernah
   menanggung sesi ngecas yang justru dipicu km perpanjangan itu sendiri. */
function tambahanJam(o, r, jam){
  var sampai = Math.min(23, o.pulang + jam);
  if (sampai <= o.pulang) return { sampai:sampai, tambah:0 };
  var p = {}; Object.keys(o).forEach(function(k){ p[k] = o[k]; });
  p.pulang = sampai;
  return { sampai:sampai, tambah: simulate(p).net - r.net };
}

/* Selisih yang disebabkan satu faktor, supaya pengaruhnya terlihat angka. */
function dampak(o, ubah){
  var tanpa = {}; Object.keys(o).forEach(function(k){ tanpa[k] = o[k]; });
  Object.keys(ubah).forEach(function(k){ tanpa[k] = ubah[k]; });
  return simulate(o).net - simulate(tanpa).net;
}
/* Cari kecamatan dari teks bebas. Dipakai dua tempat: saat Ibu mengetik
   nama daerah, dan saat memperbarui catatan lama yang dulu angkanya tebakan.
   Mengembalikan null kalau tidak ada yang cocok. */
function cariKecamatan(teks){
  var cari = String(teks || "").toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (cari.length < 3) return null;
  var cocok = [];
  for (var i = 0; i < KEC.length; i++){
    var nk = KEC[i][0].toLowerCase();
    if (nk === cari || (" "+cari+" ").indexOf(" "+nk+" ") >= 0) cocok.push(KEC[i]);
  }
  if (!cocok.length) return null;
  if (cocok.length === 1) return { kec:cocok[0], catatan:"" };

  /* Dua kecamatan bisa bernama sama: Setu ada di Tangerang Selatan (23 km)
     DAN di Kab. Bekasi (63 km) -- salah pilih berarti cadangan baterai
     meleset 40 km. Kalau induknya ikut disebut, itu yang menang. Kalau
     tidak, diambil yang TERJAUH: cadangan berlebih cuma merepotkan,
     cadangan kurang membuat Ibu kehabisan daya di jalan. */
  for (var j = 0; j < cocok.length; j++){
    var ind = INDUK[cocok[j][1]].toLowerCase().replace("kab. ", "").replace("kota ", "");
    if (cari.indexOf(ind) >= 0) return { kec:cocok[j], catatan:"" };
  }
  var jauh = cocok[0];
  for (var k = 1; k < cocok.length; k++) if (cocok[k][4] > jauh[4]) jauh = cocok[k];
  var lain = [];
  for (var m = 0; m < cocok.length; m++) if (cocok[m] !== jauh) lain.push(INDUK[cocok[m][1]] + " " + cocok[m][4] + " km");
  return { kec:jauh, catatan:" · ada juga " + lain.join(", ") + " — kalau itu yang benar, ketik lengkap dengan wilayahnya" };
}
function catatKecamatan(kec){
  var i = KEC.indexOf(kec);
  return { nama: kec[0] + ", " + INDUK[kec[1]], km: kec[4], menit: kec[5], anchor:"kota",
           rmax: (i >= 0 ? RKEC[i] : 0),
           terukur:true, zPaksa: kec[6], v:3, dibuat: iso(new Date()) };
}

/* Tiga SPKLU terdekat menurut jalan, untuk kecamatan yang memuat titik ini. */
function spkluDekat(la, lo, n){
  var d = Infinity, k = -1;
  for (var i = 0; i < KEC.length; i++){
    var q = jarakDatar(la, lo, KEC[i][3], KEC[i][2]);
    if (q < d){ d = q; k = i; }
  }
  var list = (k >= 0 && SPD[k]) ? SPD[k] : [];
  return list.slice(0, n || 3).map(function(x){
    return { nama: SPKLU[x[0]][0], km: x[1] };
  });
}
/* Untuk lokasi yang sedang dipilih, apa pun asalnya. */
function spkluUntuk(L){
  var v = L && L.id;
  if (v && v.indexOf("custom:gps:") === 0){
    var p = v.slice(11).split(",");
    var la = parseFloat(p[0]), lo = parseFloat(p[1]);
    if (isFinite(la) && isFinite(lo)) return spkluDekat(la, lo, 3);
  }
  if (v && v.indexOf("custom:") === 0){
    var r = REGISTRI[v.slice(7)];
    var nm = r && String(r.nama || "").split(",")[0].trim().toLowerCase();
    for (var i = 0; nm && i < KEC.length; i++)
      if (KEC[i][0].toLowerCase() === nm && SPD[i] && SPD[i].length)
        return SPD[i].slice(0,3).map(function(x){ return { nama: SPKLU[x[0]][0], km: x[1] }; });
    return null;
  }
  /* Tempat bernama: pakai ukuran dari titiknya sendiri, bukan pusat kecamatan. */
  if (SPLOK[v]) return SPLOK[v].map(function(x){ return { nama: SPKLU[x[0]][0], km: x[1] }; });
  var l = LOKMAP[v];
  return (l && l.lat != null) ? spkluDekat(l.lat, l.lon, 3) : null;
}
function spkluTeks(list){
  if (!list || !list.length) return "";
  return list.map(function(x){ return "<b>" + x.nama + "</b> " + x.km + " km"; }).join(" &middot; ");
}

/* Watak untuk lokasi yang sedang dipilih. Tiga jalur, karena posisi bisa
   datang dari tiga tempat: titik terukur (punya koordinat), titik GPS
   (koordinatnya ada di kuncinya), dan nama kecamatan yang diketik. */
function watakLok(L){
  var v = L && L.id;
  if (v && v.indexOf("custom:gps:") === 0){
    var p = v.slice(11).split(",");
    var la = parseFloat(p[0]), lo = parseFloat(p[1]);
    if (isFinite(la) && isFinite(lo)) return watakDi(la, lo);
    return null;
  }
  if (v && v.indexOf("custom:") === 0){
    var r = REGISTRI[v.slice(7)];
    var nm = r && String(r.nama || "").split(",")[0].trim().toLowerCase();
    if (!nm) return null;
    for (var i = 0; i < KEC.length; i++)
      if (KEC[i][0].toLowerCase() === nm)
        return { kode: WATAK[i] || "", kec: KEC[i][0], i: i };
    return null;
  }
  var l = LOKMAP[v];
  return (l && l.lat != null) ? watakDi(l.lat, l.lon) : null;
}

/* Watak kecamatan tempat sebuah titik berada -- dipakai tab Sekarang. */
function watakDi(la, lo){
  var d = Infinity, k = -1;
  for (var i = 0; i < KEC.length; i++){
    var q = jarakDatar(la, lo, KEC[i][3], KEC[i][2]);
    if (q < d){ d = q; k = i; }
  }
  /* Indeksnya dikembalikan APA ADANYA, walau wataknya kosong: 13 kecamatan
     di koridor Bekasi-Depok-Bogor punya data stasiun tanpa watak, dan di
     sanalah kalimat lembah tengah hari justru paling berguna -- Ibu sedang
     jauh dari rumah. Pemanggilnya yang memutuskan ada isi atau tidak. */
  return (k >= 0) ? { kode: WATAK[k] || "", kec: KEC[k][0], i: k } : null;
}

/* Jarak datar; cukup teliti untuk seluas Jabodetabek dan jauh lebih ringan
   dari haversine kalau dipanggil 184 kali tiap kali GPS berbunyi. */
function jarakDatar(la, lo, la2, lo2){
  var dx = (lo - lo2) * 0.99406, dy = la - la2;      /* 0,99406 = cos 6,25 derajat */
  return Math.sqrt(dx*dx + dy*dy) * 111.32;
}

/* Perkiraan jarak dan waktu PULANG dari titik mana pun di Jabodetabek.
   Ambil 4 pusat kecamatan terdekat, bobot 1/jarak, lalu tiap pusat dikoreksi
   menurut selisih jarak lurusnya ke rumah (1,35 = kelokan jalan rata-rata,
   0,88 menit tiap km -- keduanya dihitung dari 183 pengukuran itu sendiri).

   Diuji pada 90 titik nyata yang BUKAN pusat kecamatan: meleset median 3,6%,
   p90 9,8%. Rumus lama yang cuma memakai jarak lurus meleset median 10,5%
   dan p90 29,8%, jadi ini tiga kali lebih rapat.

   Angka ini untuk TAMPILAN dan hitungan uang. Cadangan baterai memakai
   angka lain yang selalu lebih besar -- lihat currentLok dan RKEC. Waktunya
   adalah waktu jalan lancar; kemacetan ditangani terpisah lewat blok jam.

   Diuji ulang pada 183 titik acak di dalam poligon kecamatan (UJI, dibuat
   sesudah parameter dikunci): meleset median 3,2%, p90 9,4%. Aturan ke-11
   di uji mandiri memeriksa ini tiap kali tombolnya ditekan. */
function hampiranPulang(la, lo){
  var d = [], i;
  for (i = 0; i < ANCHOR.length; i++) d.push([jarakDatar(la, lo, ANCHOR[i][3], ANCHOR[i][2]), ANCHOR[i]]);
  d.sort(function(p, q){ return p[0] - q[0]; });
  var dr = jarakDatar(la, lo, RUMAH.lat, RUMAH.lon);
  var km = 0, mnt = 0, w = 0;
  for (i = 0; i < 4 && i < d.length; i++){
    var a = d[i][1];
    var rp = dr - jarakDatar(a[3], a[2], RUMAH.lat, RUMAH.lon);
    var b = 1 / Math.max(d[i][0], 0.3);
    km  += (a[4] + 1.35 * rp) * b;
    mnt += (a[5] + 1.19 * rp) * b;
    w += b;
  }
  var n = d[0][1];
  return { km: Math.max(km / w, 1), menit: Math.max(Math.round(mnt / w), 3),
           kec: n[0], induk: INDUK[n[1]], zona: n[6], sifat: n[7], jauhnya: d[0][0] };
}

function jarakLurus(a1,o1,a2,o2){
  var R=6371, dLa=(a2-a1)*Math.PI/180, dLo=(o2-o1)*Math.PI/180;
  var x=Math.sin(dLa/2)*Math.sin(dLa/2)+
        Math.cos(a1*Math.PI/180)*Math.cos(a2*Math.PI/180)*Math.sin(dLo/2)*Math.sin(dLo/2);
  return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

/* ---------------- UJI MANDIRI ----------------
   Aturan yang HARUS selalu benar, diperiksa di ribuan kombinasi tiap kali
   halaman dibuka. Ini menggantikan cara lama: saya menjalankan UI lalu
   melihat hasilnya — yang hanya menangkap apa yang saya ingat dicek. */
var ATURAN = [
  ["teks lengkap", function(s){
    return !s.some(function(x){ return /undefined/.test(x.b+x.s+x.i); }); }],
  /* Ngecas di langkah pertama sah HANYA kalau daya awal memang tak cukup
     menyelesaikan blok itu. Kalau cukup, berarti penempatannya salah. */
  ["ngecas di langkah pertama hanya bila daya memaksa", function(s, k){
    if (!(s.length && s[0].cls==="charge")) return true;
    if (s[0].dur === "jeda") return true;      /* mengisi saat istirahat selalu sah */
    return k.avail < k.km0; }],
  /* Dua sesi berurutan sah kalau salah satunya blok istirahat — jaraknya
     berjam-jam meski berdampingan di daftar. */
  ["tidak ada dua sesi ngecas beruntun", function(s){
    for (var i=0;i<s.length-1;i++)
      if (s[i].cls==="charge" && s[i+1].cls==="charge" &&
          s[i].dur!=="jeda" && s[i+1].dur!=="jeda") return false;
    return true; }],
  /* Ngecas di blok peak salah hanya kalau ada blok non-peak SEBELUMNYA
     yang bisa dipakai — bukan kalau memang tidak ada pilihan. */
  /* Kesalahan yang tak terbantahkan: mengisi di jam panen padahal ada
     blok istirahat di hari itu yang dibiarkan kosong. */
  ["ngecas tidak di blok peak bila ada istirahat kosong sebelumnya", function(s){
    var pk = /Panen |keberangkatan pagi|Kedatangan sore/;
    for (var i=0;i<s.length;i++){
      if (s[i].cls==="charge" && pk.test(s[i].b)){
        for (var j=0;j<i;j++)
          if (s[j].dur==="jeda" && s[j].cls!=="charge") return false;
      }
    }
    return true; }],
  ["kumulatif naik monoton", function(s){
    var prev=-1, ok=true;
    s.forEach(function(x){ var v=parseFloat(String(x.cum).replace(/[^0-9]/g,""))||0;
      if (v+1 < prev) ok=false; prev=Math.max(prev,v); });
    return ok; }],
  ["jarak pulang tidak nol", function(s){
    var h = s[s.length-1];
    return !h || h.cls!=="home" || !/·\s*0\s*km/.test(h.s); }],
  ["langkah penutup ada dan terakhir", function(s){
    return !s.length || s[s.length-1].cls==="home" || s[s.length-1].cls==="charge"; }],
  ["tidak ada potongan di bawah 25 menit", function(s){
    return !s.some(function(x){ var m=/^([\d.]+) jam$/.exec(x.dur);
      return m && parseFloat(m[1]) < 0.4; }); }],
  /* Aturan 9 — instruksi mengisi daya hanya boleh muncul di langkah yang
     memang ditandai sebagai sesi ngecas. */
  ["perintah ngecas hanya di langkah ngecas", function(s){
    /* Diperiksa pada baris rute (perintah), bukan baris penjelasan. */
    return !s.some(function(x){
      return x.cls!=="charge" && /colok|SPKLU|isi daya/i.test(x.s); }); }],
  /* Aturan 10 — tidak boleh ada lubang waktu antar langkah. */
  ["tidak ada lubang waktu antar langkah", function(s){
    var akhir = null, ok = true;
    s.forEach(function(x){
      var m = /^(\d\d):(\d\d)&ndash;(\d\d):(\d\d)$/.exec(x.t) ||
              /^(\d\d):(\d\d)–(\d\d):(\d\d)$/.exec(x.t);
      if (!m) return;
      var mulai = +m[1]+ +m[2]/60, selesai = +m[3]+ +m[4]/60;
      if (akhir !== null && mulai - akhir > 0.02) ok = false;
      akhir = selesai;
    });
    return ok; }]
];

/* Aturan ke-11 -- satu-satunya yang menguji ANGKA, bukan urutan langkah.
   Sepuluh aturan di atas lolos penuh waktu anchor bandara masih membuat
   Batuceper meleset +60%, karena tidak satu pun dari mereka pernah
   membandingkan jarak dengan kenyataan. Yang ini membandingkan.

   Dua jalur diperiksa terpisah, karena keduanya memang berbeda mesinnya:
     a. deteksi GPS      -> hampiranPulang, interpolasi 4 pusat terdekat
     b. ketik nama       -> pusat kecamatan + margin jari-jari (RKEC)

   Ambangnya sengaja dipasang di ATAS nilai sekarang, supaya yang ketahuan
   adalah kemunduran, bukan supaya kotaknya selalu hijau. Nilai pada saat
   aturan ini ditulis: (a) median 3,2% dan terburuk 33,7%; (b) 4 kecamatan
   meremehkan lebih dari 3 km, yang terparah Jasinga 8,6 km. */
function ujiJarak(){
  var langgar = [], err = [], n3 = 0, maks = 0, maksNama = "";
  for (var i = 0; i < UJI.length && i < KEC.length; i++){
    var u = UJI[i];
    var h2 = hampiranPulang(u[1], u[0]);
    err.push(Math.abs(h2.km - u[2]) / u[2] * 100);
    /* Persis perhitungan yang dipakai currentLok untuk cadangan baterai. */
    var kmAman = Math.max(KEC[i][4] * 1.08, KEC[i][4] + 1.35 * RKEC[i]);
    var kurang = u[2] - kmAman;
    if (kurang > 3) n3++;
    if (kurang > maks){ maks = kurang; maksNama = KEC[i][0]; }
  }
  err.sort(function(a, b){ return a - b; });
  var med = err[Math.floor(err.length / 2)], top = err[err.length - 1];
  if (med > 5)   langgar.push("interpolasi meleset median " + med.toFixed(1) + "% (ambang 5%)");
  if (top > 45)  langgar.push("interpolasi meleset terburuk " + top.toFixed(1) + "% (ambang 45%)");
  if (n3 > 6)    langgar.push("ketik-nama meremehkan >3 km di " + n3 + " kecamatan (ambang 6)");
  if (maks > 10) langgar.push("cadangan kurang " + maks.toFixed(1) + " km di " + maksNama + " (ambang 10)");
  return langgar;
}

/* Aturan ke-12 -- menjaga EKONOMI tab Rencana. Aturan 1-10 memeriksa urutan
   langkah, aturan ke-11 memeriksa jarak; tidak satu pun pernah memeriksa
   uang. Dua hal PERNAH salah di sini dan tidak dijaga apa pun:

   a. Nasihat "Kalau mau mengejar" dihitung sebagai sif baru dari jam pulang
      dengan baterai dianggap penuh. Pada 14 dari 60 kasus yang benar-benar
      tampil angkanya lebih dari dua kali terlalu besar, dan beberapa SALAH
      TANDA: halaman menyuruh Ibu narik 1,5 jam lagi untuk sesuatu yang
      justru mengurangi uangnya. Kemunduran itu akan terlihat masuk akal
      saat dibaca -- karena itu aturan ini memeriksanya, bukan mata.

   b. Jam yang hilang karena ngecas dibebankan pada tarif RATA-RATA seluruh
      sif, padahal buildSteps sengaja menaruh sesinya di blok TERMURAH dan
      menghukum blok peak dengan 1e6. Dua paruh layar yang sama saling
      bertentangan.

   Diperiksa pada 312 kombinasi zona/jam. Keduanya hal yang harus SELALU
   benar, bukan ambang yang bisa digeser. */
function ujiEkonomi(){
  var langgar = [], ctx = dayCtx(iso(new Date())), n = 0;
  ["tng","mix","jkt","apt"].forEach(function(z){
    [3.5,5.25,9.5].forEach(function(k){
      for (var p = 15; p <= 21.25; p += 0.25){
        var o = { ctx:ctx, keluar:k, pulang:p, rehat:"none", zona:z, filter:2,
                  bat:30.08, rumah:false, hujan:false, acara:false, soc:65 };
        var r = simulate(o), t = tambahanJam(o, r, 1.5);
        if (t.sampai <= p) continue;
        n++;
        /* (a) harus PERSIS selisih hari yang sama, dihitung ulang di sini
           dengan cara yang tidak boleh berbagi kode dengan tambahanJam. */
        var q = {}; Object.keys(o).forEach(function(x){ q[x] = o[x]; });
        q.pulang = t.sampai;
        if (Math.abs(t.tambah - (simulate(q).net - r.net)) > 1){
          langgar.push("tambahan 1,5 jam bukan selisih hari yang sama ("+z+"/"+hhmm(p)+")");
          return;
        }
        /* (b) ongkos jam ngecas = gross*scale - blockNet. Kalau dihitung
           dengan tarif termurah, ia tidak akan melebihi chargeHours x murah.
           Kalau seseorang mengembalikannya jadi potongan merata, ongkosnya
           melompat ke tarif rata-rata dan pemeriksaan ini merah. */
        if (r.chargeHours > 0 && r.murah > 0 && r.blockNet > 0 &&
            (r.gross*r.scale - r.blockNet) > r.chargeHours*r.murah + 1){
          langgar.push("jam ngecas dibebankan di atas tarif blok termurah ("+z+"/"+hhmm(p)+")");
          return;
        }
      }
    });
  });
  return { langgar:langgar, n:n };
}

function ujiMandiri(){
  var langgar = [], n = 0;
  var zonas = ["tng","mix","jkt","apt"], haris = [1,2,3,4,5,6,0];
  var keluars = [3.5,5.25,9.5,15], rehats = ["none","duapeak","full","short"];
  var bats = [30.08,38.88], socs = [null,30,65,95];

  zonas.forEach(function(z){ haris.forEach(function(hh){
    keluars.forEach(function(k){ rehats.forEach(function(rh){
      bats.forEach(function(bt){ socs.forEach(function(sc){
        var d = new Date(2026, 8, 7 + ((hh+6)%7));
        var ctx = dayCtx(iso(d));
        var o = { ctx:ctx, keluar:k, pulang:21.5, rehat:rh, zona:z, filter:2,
                  bat:bt, rumah:false, hujan:false, acara:false };
        if (sc != null) o.soc = sc;
        var r, s;
        try {
          r = simulate(o);
          s = buildSteps(o, r, { kmHome:ZONA[z].pulang, L:{z:z,jauh:false}, rencana:true });
        } catch (e){ langgar.push("galat: "+e.message); return; }
        n++;
        ATURAN.forEach(function(a){
          if (!a[1](s, s.meta||{})) langgar.push(a[0]+" — "+z+"/"+DAYNAME[hh]+"/"+hhmm(k)+"/"+rh+
                                     "/"+bt+(sc!=null?"/"+sc+"%":""));
        });
      }); }); }); }); }); });

  /* lokasi nyata di tab Sekarang */
  LOK.forEach(function(L){ [5.25,9.5,11,15,19.5].forEach(function(k){ [30,65,95].forEach(function(sc){
    ["none","full","duapeak"].forEach(function(rh){
    var ctx = dayCtx(iso(new Date()));
    var o = { ctx:ctx, keluar:k, pulang:21.5, rehat:rh, zona:L.z, filter:2,
              bat:30.08, rumah:false, hujan:false, acara:false, soc:sc };
    var r, s;
    try {
      r = simulate(o);
      var blk = blockAt(k, ctx.shapeDay);
      s = buildSteps(o, r, { kmHome:Math.max(L.home,6), L:L, verdict:advise(blk,L,o), markNow:true });
    } catch (e){ langgar.push("galat: "+e.message); return; }
    n++;
    ATURAN.forEach(function(a){
      if (!a[1](s, s.meta||{})) langgar.push(a[0]+" — "+L.id+"/"+hhmm(k)+"/"+sc+"%/"+rh);
    });
    }); }); }); });

  ujiJarak().forEach(function(x){
    langgar.push("jarak terhadap nilai terukur — " + x);
  });
  n += UJI.length;

  var ek = ujiEkonomi();
  ek.langgar.forEach(function(x){
    langgar.push("ekonomi rencana — " + x);
  });
  n += ek.n;

  return { n:n, langgar:langgar };
}
