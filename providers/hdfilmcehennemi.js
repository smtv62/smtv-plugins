/**
 * smTV Plugins — HDFilmCehennemi
 *
 * Kaynak site: hdfilmcehennemi (Laravel + Alpine.js tema, ".biz" aynası).
 * Zincir:
 *   1) TMDB -> baslik (tr-TR), orijinal baslik, yil, imdb
 *   2) {base}/api/search?q=<baslik>  ->  { data: [ { id, title, slug, contentableType, releaseYear, posterUrl } ] }
 *   3) Detay/bolum sayfasi HTML -> videoPlayerData(JSON.parse('...')) kaynaklari
 *   4) Her kaynak: base64 template -> iframe data-src ( {url}/{slug} placeholder )
 *   5) Player sayfasi -> file: "<m3u8>"
 *
 * Aktif domain sources.json (bot bakimli) icinden okunur; okunamazsa
 * DEFAULT_BASE kullanilir.
 */

var DEFAULT_BASE = "https://www.hdfilmcehennemi2.biz";
var SOURCES_URL = "https://raw.githubusercontent.com/smtv62/smtv-plugins/main/sources.json";
var PROVIDER = "HDFilmCehennemi";
var MAX_PLAYERS = 6;
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

function log() {
  try {
    console.log.apply(console, ["[" + PROVIDER + "]"].concat([].slice.call(arguments)));
  } catch (e) {}
}

/* ---------- domain cozumleme (bot bakimli sources.json) ---------- */

var _baseCache = null;

async function resolveBase() {
  if (_baseCache) return _baseCache;
  try {
    var r = await fetch(SOURCES_URL, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (r.ok) {
      var j = JSON.parse(await r.text());
      if (j && j.hdfilmcehennemi && j.hdfilmcehennemi.base) {
        _baseCache = String(j.hdfilmcehennemi.base).replace(/\/+$/, "");
        log("domain sources.json ->", _baseCache);
        return _baseCache;
      }
    }
  } catch (e) {
    log("sources.json okunamadi:", e.message || e);
  }
  _baseCache = DEFAULT_BASE;
  return _baseCache;
}

/* ---------- yardimcilar ---------- */

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/ı/g, "i").replace(/İ/g, "i")
    .replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleScore(a, b) {
  var na = normalize(a), nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  var ta = na.split(" "), tb = nb.split(" "), hit = 0;
  for (var i = 0; i < ta.length; i++) {
    if (tb.indexOf(ta[i]) >= 0) hit++;
  }
  // "Resident Evil Damnation" > "Resident Evil" gibi uzun adaylara hafif ceza
  var extra = Math.abs(ta.length - tb.length);
  return hit / Math.max(ta.length, tb.length) - extra * 0.05;
}

function b64decode(s) {
  try {
    return atob(String(s || ""));
  } catch (e) {
    return "";
  }
}

/* ---------- TMDB ---------- */

async function tmdbLookup(tmdbId, mediaType) {
  var key = "";
  try { key = TMDB_API_KEY || ""; } catch (e) {}
  if (!key) {
    log("TMDB_API_KEY yok!");
    return null;
  }
  var path = mediaType === "series" ? "tv" : "movie";
  var url = "https://api.themoviedb.org/3/" + path + "/" + encodeURIComponent(tmdbId) +
    "?api_key=" + encodeURIComponent(key) + "&language=tr-TR&append_to_response=external_ids";
  try {
    var r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (!r.ok) { log("TMDB http", r.status); return null; }
    var j = JSON.parse(await r.text());
    var date = j.release_date || j.first_air_date || "";
    return {
      title: j.title || j.name || "",
      original: j.original_title || j.original_name || "",
      year: date ? parseInt(date.slice(0, 4), 10) : 0,
      imdb: (j.external_ids && j.external_ids.imdb_id) || ""
    };
  } catch (e) {
    log("TMDB hata:", e.message || e);
    return null;
  }
}

/* ---------- site arama + eslestirme ---------- */

async function siteSearch(base, query) {
  var url = base + "/api/search?q=" + encodeURIComponent(query);
  try {
    var r = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (!r.ok) { log("search http", r.status, query); return []; }
    var j = JSON.parse(await r.text());
    return (j && j.data) || [];
  } catch (e) {
    log("search hata:", e.message || e);
    return [];
  }
}

function pickMatch(results, meta, wantSeries) {
  var cands = [];
  for (var i = 0; i < results.length; i++) {
    var it = results[i];
    var isSeries = String(it.contentableType || "").indexOf("TVSeries") >= 0;
    if (isSeries !== wantSeries) continue;
    var sc = Math.max(
      titleScore(it.title, meta.title),
      titleScore(it.title, meta.original)
    );
    // IMDb ID ile birebir eslesme (site imdb indeksliyorsa)
    if (meta.imdb && it.imdbId && String(it.imdbId) === String(meta.imdb)) sc = 2;
    if (sc < 0.4) continue;
    var iy = it.releaseYear ? parseInt(it.releaseYear, 10) : 0;
    var yearExact = meta.year && iy && Math.abs(iy - meta.year) <= 1;
    // Once tam yil eslesmesi; ayni yil yoksa en yuksek title skoru
    cands.push({ it: it, sc: sc, yearExact: yearExact ? 1 : 0 });
  }
  if (!cands.length) return null;
  cands.sort(function (a, b) {
    if (a.yearExact !== b.yearExact) return b.yearExact - a.yearExact;
    return b.sc - a.sc;
  });
  var top = cands[0];
  // Yil yakinsa (±6) her kosulda al; cok uzaksa sadece guclu baslik skoruyla al
  // (suzme yanlisi olmasin: site bazi yeni yapimlari icermeyebilir).
  var iy = top.it.releaseYear ? parseInt(top.it.releaseYear, 10) : 0;
  var nearYear = meta.year && iy && Math.abs(iy - meta.year) <= 6;
  if (!top.yearExact && !nearYear && top.sc < 0.7) return null;
  return top.it;
}

/* ---------- sayfa -> player kaynaklari ---------- */

function parsePlayerSources(html) {
  var out = [];
  var re = /videoPlayerData\(JSON\.parse\('([\s\S]*?)'\)/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    try {
      var raw = m[1]
        .replace(/\\u([0-9a-fA-F]{4})/g, function (_, h) {
          return String.fromCharCode(parseInt(h, 16));
        })
        .replace(/\\'/g, "'")
        .replace(/\\\//g, "/")
        .replace(/\\\\/g, "\\");
      // JSON.parse yerine ayirici-temelli cekim (note null/"" farki, slug ters
      // escape gibi format farkliliklarina dayanikli olsun)
      var itemRe = /\{[^{}]*"link":"[^"]+"[^{}]*\}/g;
      var im;
      while ((im = itemRe.exec(raw)) !== null) {
        var blob = im[0];
        var link = (blob.match(/"link":"([^"]*)"/) || [])[1];
        if (!link) continue;
        var svcName = (blob.match(/"service_name":"([^"]*)"/) || [])[1];
        var svcSlug = (blob.match(/"service_slug":"([^"]*)"/) || [])[1];
        var quality = (blob.match(/"quality":"([^"]*)"/) || [])[1];
        var template = (blob.match(/"template":"([^"]*)"/) || [])[1];
        out.push({
          lang: "dual",
          link: link,
          service: svcName || svcSlug || "",
          quality: quality || "",
          template: template || ""
        });
      }
    } catch (e) {
      log("playerData parse hata:", e.message || e);
    }
  }
  return out;
}

async function resolveM3u8(base, src) {
  try {
    var tpl = b64decode(src.template);
    var mm = tpl.match(/data-src=["']([^"']+)["']/) || tpl.match(/src=["']([^"']+)["']/);
    if (!mm) { log("template'de iframe yok:", src.service); return null; }
    var playerUrl = mm[1].replace("{url}", src.link).replace("{slug}", src.service);
    if (playerUrl.indexOf("//") === 0) playerUrl = "https:" + playerUrl;

    var pr = await fetch(playerUrl, { headers: { "User-Agent": UA, "Referer": base + "/" } });
    if (!pr.ok) { log("player http", pr.status, playerUrl); return null; }
    var phtml = await pr.text();

    var fm = phtml.match(/file\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
    if (!fm) fm = phtml.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
    if (!fm) { log("m3u8 bulunamadi:", playerUrl); return null; }

    var origin = "";
    try { origin = new URL(playerUrl).origin + "/"; } catch (e) { origin = base + "/"; }
    return { m3u8: fm[1], referer: origin };
  } catch (e) {
    log("resolveM3u8 hata:", e.message || e);
    return null;
  }
}

/* ---------- getStreams ---------- */

// Dizi ana sayfasini cekip gercek bolum linkini bulur.
// Slug ("lanterns-izle") bolum linkinden farkli olabilir ("lanterns"),
// bu yuzden linki HTML icinden okuruz.
async function resolveEpisodeUrl(base, seriesUrl, season, episode) {
  try {
    var sr = await fetch(seriesUrl, { headers: { "User-Agent": UA, "Referer": base + "/" } });
    if (!sr.ok) { log("dizi sayfasi http", sr.status); return null; }
    var sh = await sr.text();
    var want = "/sezon-" + season + "/bolum-" + episode;
    var linkRe = /href="([^"]*\/sezon-\d+\/bolum-\d+)"/g;
    var lm;
    while ((lm = linkRe.exec(sh)) !== null) {
      var href = lm[1];
      if (href.indexOf(want) >= 0) {
        if (href.indexOf("http") !== 0) href = base + (href.charAt(0) === "/" ? "" : "/") + href;
        return href;
      }
    }
    // birebir yoksa null don (cagiran tmdb bazli slug yoluna duser)
    return null;
  } catch (e) {
    log("resolveEpisodeUrl hata:", e.message || e);
    return null;
  }
}

async function getStreams(tmdbId, mediaType, season, episode, url) {
  log("getStreams tmdbId=" + tmdbId + " type=" + mediaType + " s=" + season + " e=" + episode + " url=" + (url || ""));
  var base = await resolveBase();
  var wantSeries = mediaType === "series";
  var pageUrl = null;

  // Search/click uzerinden dogrudan sayfa URLsi geldiyse onu kullan
  if (url && String(url).indexOf("hdfilmcehennemi") >= 0) {
    pageUrl = String(url);
    if (wantSeries && season && episode && pageUrl.indexOf("/sezon-") < 0) {
      var ep1 = await resolveEpisodeUrl(base, pageUrl.replace(/\/+$/, ""), season, episode);
      if (ep1) { pageUrl = ep1; }
      else {
        pageUrl = pageUrl.replace(/\/+$/, "") + "/sezon-" + season + "/bolum-" + episode;
      }
    }
  } else {
    var meta = await tmdbLookup(tmdbId, mediaType);
    if (!meta) return [];
    log("TMDB:", meta.title, "/", meta.original, meta.year, meta.imdb);

    var queries = [];
    if (meta.original) queries.push(meta.original);
    if (meta.title && normalize(meta.title) !== normalize(meta.original)) queries.push(meta.title);
    // IMDb ID ile arama — tr-TR baslik site aramasinda bos donebilir
    if (meta.imdb) queries.push(meta.imdb);

    var match = null;
    for (var qi = 0; qi < queries.length && !match; qi++) {
      var results = await siteSearch(base, queries[qi]);
      log("arama '" + queries[qi] + "' ->", results.length, "sonuc");
      match = pickMatch(results, meta, wantSeries);
      if (!match) {
        // yil son eki temizle (orn. "Title 2026" -> "Title")
        var stripped = queries[qi].replace(/\s*(19|20)\d{2}$/, "").trim();
        if (stripped && stripped !== queries[qi]) {
          results = await siteSearch(base, stripped);
          match = pickMatch(results, meta, wantSeries);
        }
      }
    }

    if (!match) { log("eslesme bulunamadi:", meta.title, meta.year); return []; }
    log("eslesti:", match.title, "|", match.slug, "|", match.releaseYear);
    pageUrl = base + "/" + String(match.slug).replace(/^\/+/, "");
    if (wantSeries && season && episode) {
      var ep2 = await resolveEpisodeUrl(base, pageUrl.replace(/\/+$/, ""), season, episode);
      if (ep2) { pageUrl = ep2; }
      else {
        pageUrl = pageUrl.replace(/\/+$/, "") + "/sezon-" + season + "/bolum-" + episode;
      }
    }
  }

  log("sayfa:", pageUrl);
  var pr = await fetch(pageUrl, { headers: { "User-Agent": UA, "Referer": base + "/" } });
  if (!pr.ok) { log("sayfa http", pr.status); return []; }
  var html = await pr.text();

  var sources = parsePlayerSources(html);
  log("player kaynagi:", sources.length);
  if (!sources.length) return [];

  var streams = [];
  var seen = {};
  var limit = Math.min(sources.length, MAX_PLAYERS);
  for (var i = 0; i < limit; i++) {
    var src = sources[i];
    var res = await resolveM3u8(base, src);
    if (!res || seen[res.m3u8]) continue;
    seen[res.m3u8] = true;
    streams.push({
      title: PROVIDER + " • " + (src.quality || "?") + " • " + src.service + " (" + src.lang + ")",
      url: res.m3u8,
      quality: src.quality || "",
      provider: PROVIDER,
      language: src.lang,
      headers: { "Referer": res.referer, "User-Agent": UA }
    });
  }
  log("stream sonuc:", streams.length);
  return streams;
}

/* ---------- search ---------- */

async function search(args) {
  var query = (args && args.query) || "";
  if (!query) return { items: [] };
  var base = await resolveBase();
  var results = await siteSearch(base, query);
  var items = [];
  for (var i = 0; i < results.length; i++) {
    var x = results[i];
    if (!x || !x.slug) continue;
    var isSeries = String(x.contentableType || "").indexOf("TVSeries") >= 0;
    var item = {
      id: "hdfc-" + x.id,
      name: x.title || "",
      type: isSeries ? "series" : "movie",
      url: base + "/" + String(x.slug).replace(/^\/+/, "")
    };
    var y = parseInt(x.releaseYear, 10);
    if (y) item.year = y;
    if (x.posterUrl) item.poster = x.posterUrl;
    items.push(item);
  }
  log("search '" + query + "' ->", items.length, "item");
  return { items: items };
}

/* ---------- export ---------- */

if (typeof module !== "undefined" && module.exports) {
  module.exports.getStreams = getStreams;
  module.exports.search = search;
}
if (typeof globalThis !== "undefined") {
  globalThis.getStreams = getStreams;
  globalThis.search = search;
}
