/* Sambungan ke Claude untuk tab Tanya, tombol Analisa, dan pemetaan lokasi.

   Tiga keadaan, diurutkan:
     1. Halaman dibuka sebagai artifact di claude.ai  -> window.claude.use("sample")
        (jalur asli; dipertahankan supaya versi artifact tetap jalan).
     2. Kunci API Anthropic tersimpan di HP ini       -> SDK resmi @anthropic-ai/sdk
        (vendor/anthropic-sdk.min.js), dipanggil langsung dari browser.
     3. Tidak ada keduanya                             -> sampler = null, dan setiap
        fitur AI mengatakannya terus terang, bukan diam.

   Antarmuka yang dikembalikan meniru "sample" milik artifact, karena seluruh
   app.js sudah ditulis untuk itu:
     sampler(turnsAtauTeks, {modelTier, tools, onText}) -> Promise<{text}>
     sampler.json(teks, {modelTier})                    -> Promise<objek>
   Galat selalu berbentuk {code:"rate_limited"|"unauthorized"|"offline"|"refusal"|"no_key"|"error"}.

   Kunci disimpan di localStorage HP ini saja dan hanya dikirim ke api.anthropic.com.
   Pakai kunci dari workspace tersendiri dengan batas belanja (lihat README). */
"use strict";

var AI = (function(){
  var LSKEY = "anthropic-api-key";
  /* Tier dari kode asli: quick = pemetaan nama tempat (JSON kecil),
     default = analisa catatan, complex = tab Tanya dengan alat hitung. */
  var MODEL  = { quick:"claude-haiku-4-5", "default":"claude-opus-5", complex:"claude-opus-5" };
  var EFFORT = { quick:null, "default":"medium", complex:"high" };   /* effort tidak berlaku di Haiku 4.5 */
  var MAX_PUTARAN_ALAT = 6;

  function getKey(){ try { return localStorage.getItem(LSKEY) || ""; } catch (e) { return ""; } }
  function setKey(k){
    try { if (k) localStorage.setItem(LSKEY, k.trim()); else localStorage.removeItem(LSKEY); } catch (e) {}
  }
  function sdk(){ return (typeof AnthropicSDK !== "undefined") ? (AnthropicSDK.default || AnthropicSDK.Anthropic) : null; }
  function client(){
    var k = getKey(), C = sdk();
    if (!k || !C) return null;
    return new C({ apiKey:k, dangerouslyAllowBrowser:true, maxRetries:1 });
  }

  /* Galat SDK -> kode pendek yang dipahami app.js. Dicek dari yang paling khusus. */
  function toErr(err){
    var C = sdk();
    if (err && err.code) return err;
    if (C){
      if (err instanceof C.RateLimitError)      return { code:"rate_limited", detail:err.message };
      if (err instanceof C.AuthenticationError) return { code:"unauthorized", detail:err.message };
      if (err instanceof C.PermissionDeniedError) return { code:"unauthorized", detail:err.message };
      if (err instanceof C.APIConnectionError)  return { code:"offline", detail:err.message };
      if (err instanceof C.APIError)            return { code:"error", status:err.status, detail:err.message };
    }
    return { code:"error", detail: err && err.message ? err.message : String(err) };
  }

  function normTurns(input){
    if (typeof input === "string") return [{ role:"user", content:input }];
    return (input || []).map(function(m){ return { role:m.role, content:m.content }; });
  }
  function toolsParam(tools){
    return tools.map(function(t){
      return { name:t.name, description:t.description, input_schema:t.inputSchema };
    });
  }
  function jalankanAlat(tools, u){
    var t = null;
    for (var i = 0; i < tools.length; i++) if (tools[i].name === u.name) t = tools[i];
    try {
      if (!t) throw new Error("alat tidak dikenal: " + u.name);
      var out = t.execute(u.input || {});
      return { type:"tool_result", tool_use_id:u.id, content:JSON.stringify(out) };
    } catch (e) {
      return { type:"tool_result", tool_use_id:u.id, is_error:true, content:String(e && e.message || e) };
    }
  }

  /* Satu percakapan, dengan putaran alat kalau model memintanya. Teks
     di-stream ke onText supaya jawaban muncul sambil ditulis. */
  function run(input, opts){
    opts = opts || {};
    var c = client();
    if (!c) return Promise.reject({ code:"no_key" });
    var tier = MODEL[opts.modelTier] ? opts.modelTier : "default";
    var tools = opts.tools || [];
    var messages = normTurns(input);
    var params = { model:MODEL[tier], max_tokens:4096, messages:messages };
    if (EFFORT[tier]) params.output_config = { effort:EFFORT[tier] };
    if (tools.length) params.tools = toolsParam(tools);
    var teks = "";
    function emit(){ if (opts.onText) opts.onText({ text:teks }); }

    function putaran(n){
      var stream = c.messages.stream(params);
      stream.on("text", function(d){ teks += d; emit(); });
      return stream.finalMessage().then(function(msg){
        if (msg.stop_reason === "refusal"){
          if (!teks) throw { code:"refusal" };
          return { text:teks.trim() };
        }
        var uses = msg.content.filter(function(b){ return b.type === "tool_use"; });
        /* Input alat yang terpotong di max_tokens bisa saja lolos parse -- jangan dijalankan. */
        if (msg.stop_reason !== "tool_use" || !uses.length || n >= MAX_PUTARAN_ALAT) return { text:teks.trim() };
        messages.push({ role:"assistant", content:msg.content });
        messages.push({ role:"user", content:uses.map(function(u){ return jalankanAlat(tools, u); }) });
        if (teks && !/\n$/.test(teks)) teks += "\n\n";
        return putaran(n + 1);
      }, function(err){ throw toErr(err); });
    }
    return putaran(0);
  }

  /* Jawaban berbentuk JSON. Model diminta menjawab JSON saja; kalau ia tetap
     membungkusnya dengan teks, bagian di antara kurung kurawal pertama dan
     terakhir yang diambil. */
  function runJson(prompt, opts){
    opts = opts || {};
    return run(prompt, { modelTier:opts.modelTier || "quick" }).then(function(res){
      var t = String(res.text || "").replace(/```(?:json)?/g, "").trim();
      var a = t.indexOf("{"), b = t.lastIndexOf("}");
      if (a < 0 || b <= a) throw { code:"bad_json", detail:t.slice(0, 120) };
      try { return JSON.parse(t.slice(a, b + 1)); }
      catch (e) { throw { code:"bad_json", detail:t.slice(0, 120) }; }
    });
  }

  function buatSampler(){
    var s = function(input, opts){ return run(input, opts); };
    s.json = runJson;
    s.sumber = "api";
    return s;
  }

  /* Memastikan kunci benar tanpa menghabiskan token: daftar model saja. */
  function uji(){
    var c = client();
    if (!c) return Promise.reject({ code:"no_key" });
    return c.models.list({ limit:1 }).then(function(){ return true; }, function(err){ throw toErr(err); });
  }

  function status(){
    if (window.claude && window.claude.use) return "artifact";
    if (!sdk()) return "no_sdk";
    return getKey() ? "api" : "no_key";
  }

  function connect(){
    if (window.claude && window.claude.use){
      return window.claude.use("sample").then(function(ns){
        if (ns) ns.sumber = "artifact";
        return ns || null;
      }, function(){ return null; });
    }
    if (getKey() && sdk()) return Promise.resolve(buatSampler());
    return Promise.resolve(null);
  }

  return { connect:connect, getKey:getKey, setKey:setKey, uji:uji, status:status, MODEL:MODEL };
})();
