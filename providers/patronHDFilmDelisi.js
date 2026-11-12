/**
 * patronHDFilmDelisi - hdfilmdelisi.one
 *
 * hdfilmdelisi sayfalarindaki asil oynatma kaynagi vixolity'dir:
 *   sayfadaki  videoUrl: https://pl.vixolity.com/<token>
 *   token = base64(base64(base64(imdbId)))   (3 katman)
 *   temiz tam film: https://ha.vixolity.com/vs/<imdbId>
 *
 * Eski surum sayfadaki kucuk onizleme mp4'unu (/vids/...mp4) donduruyordu;
 * uzerine "kendi sitemizden izleyin" yazisi yakilmis olmasi nedeniyle hem
 * filigran gorunuyordu hem tam film degildi. Artik vixolity temiz stream'i
 * onceliklidir; bulunamazsa TMDB imdb ile /vs/ denenir, o da olmazsa eski
 * mp4 yedege duser.
 */

var TMDB_API_KEY = "500330721680edb6d5f7f12ba7cd9023";
/* ---------- domain cozumleme (bot bakimli domains.json) ---------- */
var DOMAIN_KEY = "patron-hdfilmdelisi";
var DEFAULT_BASE = "https://hdfilmdelisi1.com";
var DOMAINS_URL = "https://raw.githubusercontent.com/smtv62/smtv-plugins/main/domains.json";
var _baseCache = null;
async function resolveBase() {
  if (_baseCache) return _baseCache;
  try {
    var r = await fetch(DOMAINS_URL, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
    if (r.ok) {
      var j = JSON.parse(await r.text());
      var v = j && j[DOMAIN_KEY];
      if (typeof v === "string" && /^https:\/\//.test(v)) {
        _baseCache = v.replace(/\/+$/, "");
        return _baseCache;
      }
    }
  } catch (e) {}
  _baseCache = DEFAULT_BASE;
  return _baseCache;
}
var MAIN_URL = DEFAULT_BASE;
var VIX_REFERER = "https://pl.vixolity.com/";
var TAG = "[PatronHDFilmDelisi]";

var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function slugify(value) {
  return (value || "")
    .toLowerCase()
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalize(value) {
  return (value || "").toLowerCase().replace(/[^a-z0-9çğıöşü]+/gi, " ").trim();
}

async function fetchText(url, extraHeaders) {
  var headers = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8"
  };
  if (extraHeaders) {
    for (var k in extraHeaders) headers[k] = extraHeaders[k];
  }
  var response = await fetch(url, { headers: headers, redirect: "follow" });
  if (!response.ok) throw new Error("HTTP " + response.status + " -> " + url);
  return await response.text();
}

function fixUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return MAIN_URL + url;
  return MAIN_URL + "/" + url;
}

// ---- TMDB baslik ----
async function tmdbJson(tmdbId, mediaType, externalIds) {
  var typePath = mediaType === "movie" ? "movie" : "tv";
  var append = externalIds ? "&append_to_response=external_ids" : "";
  var url = "https://api.themoviedb.org/3/" + typePath + "/" + tmdbId +
            "?api_key=" + TMDB_API_KEY + "&language=tr-TR" + append;
  var res = await fetch(url);
  if (!res.ok) throw new Error("TMDB HTTP " + res.status);
  return await res.json();
}

async function getTitles(tmdbId, mediaType) {
  var d = await tmdbJson(tmdbId, mediaType, true);
  var trTitle = d.title || d.name || "";
  var origTitle = d.original_title || d.original_name || trTitle;
  var year = (d.release_date || d.first_air_date || "").slice(0, 4);
  var imdbId = (d.external_ids && d.external_ids.imdb_id) || "";
  return { trTitle: trTitle, origTitle: origTitle, year: year, imdbId: imdbId };
}

// ---- hdfilmdelisi sayfasi bulma ----
function likelyFilmPage(html) {
  var lower = (html || "").toLowerCase();
  if (!lower) return false;
  if (lower.includes("<title>404") || lower.includes("404 not found")) return false;
  return lower.includes("/film/") || lower.includes("pl.vixolity.com") ||
         lower.includes("/vids/") || lower.includes("film özeti") || lower.includes("oyuncular");
}

function pickBest(results, query) {
  if (!results.length) return null;
  var q = normalize(query);
  var exact = results.find(function (i) { return normalize(i.title) === q; });
  if (exact) return exact;
  var starts = results.find(function (i) { return normalize(i.title).startsWith(q); });
  if (starts) return starts;
  var inc = results.find(function (i) { return normalize(i.title).includes(q); });
  if (inc) return inc;
  return results[0];
}

function candidatesFromHtml(html) {
  var out = [];
  var re = /href="(\/film\/[^"]+)"[^>]*>([\s\S]{0,300}?)<\/a>/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var href = fixUrl(m[1]);
    var title = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (href && title) out.push({ title: title, href: href });
  }
  // href tek basina (title'siz) da dene
  var re2 = /href="(\/film\/[^"]+)"/g;
  var m2;
  while ((m2 = re2.exec(html)) !== null) {
    var h = fixUrl(m2[1]);
    if (!out.some(function (i) { return i.href === h; })) {
      out.push({ title: m2[1].split("/").pop().replace(/-/g, " "), href: h });
    }
  }
  return out;
}

async function searchPage(query) {
  var endpoints = [
    MAIN_URL + "/arama?q=" + encodeURIComponent(query),
    MAIN_URL + "/api/search?q=" + encodeURIComponent(query),
    MAIN_URL + "/search?q=" + encodeURIComponent(query)
  ];
  for (var i = 0; i < endpoints.length; i++) {
    try {
      var body = await fetchText(endpoints[i], {
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "*/*",
        "Referer": MAIN_URL
      });
      var found = candidatesFromHtml(body);
      if (found.length) {
        var best = pickBest(found, query);
        if (best) return best.href;
      }
    } catch (e) { /* sonraki dene */ }
  }
  // dogrudan slug dene
  var slug = slugify(query);
  if (!slug) return null;
  var guesses = [MAIN_URL + "/film/" + slug];
  for (var n = 1; n <= 10; n++) guesses.push(MAIN_URL + "/film/" + slug + "-hdizle-" + n);
  for (var g = 0; g < guesses.length; g++) {
    try {
      var html = await fetchText(guesses[g], { "Referer": MAIN_URL });
      if (likelyFilmPage(html)) return guesses[g];
    } catch (e) { /* atla */ }
  }
  return null;
}

// ---- vixolity cozumu ----
function b64decode(s) {
  // QuickJS'te atob global olarak polyfill edilmis
  return atob(s);
}

function decodeVixToken(token) {
  var cur = token;
  for (var i = 0; i < 4; i++) {
    try {
      var pad = cur.length % 4;
      if (pad) cur = cur + "====".slice(0, pad);
      var next = b64decode(cur);
      if (!next) break;
      cur = next;
      if (/^tt\d{5,}$/.test(cur.trim())) return cur.trim();
    } catch (e) { break; }
  }
  var fin = (cur || "").trim();
  return /^tt\d{5,}$/.test(fin) ? fin : null;
}

function extractImdbFromPage(html) {
  var m = html.match(/pl\.vixolity\.com\/([A-Za-z0-9+/=_{-]{15,})/);
  if (m) {
    var imdb = decodeVixToken(m[1]);
    if (imdb) return imdb;
  }
  // sayfada acik imdb id var mi
  var t = (html.match(/tt\d{7,9}/) || [])[0];
  return t || null;
}

function vixStream(imdbId, quality, label) {
  return {
    url: "https://ha.vixolity.com/vs/" + imdbId,
    name: "HDFilmDelisi",
    title: label + " | HDFilmDelisi | Temiz",
    quality: quality || "Auto",
    headers: { "Referer": VIX_REFERER, "User-Agent": UA }
  };
}

// ---- eski mp4 yedegi (filigranli, son care) ----
function legacyMp4Streams(html, movieUrl) {
  var out = [];
  var seen = {};
  var re = /https?:\/\/[^\s"'<>\\]+(?:\.m3u8|\.mp4)[^\s"'<>\\]*/gi;
  var m;
  while ((m = re.exec(html)) !== null) {
    var url = m[0];
    if (url === movieUrl || seen[url]) continue;
    seen[url] = true;
    out.push({
      url: url,
      name: "HDFilmDelisi",
      title: "HDFilmDelisi (Onizleme)",
      quality: "Auto",
      headers: { "Referer": movieUrl, "Origin": MAIN_URL }
    });
  }
  return out;
}

async function extractStreams(tmdbId, mediaType) {
  var info = await getTitles(tmdbId, mediaType);
  console.log(TAG + " TMDB:" + tmdbId + " TR:" + info.trTitle + " imdb:" + info.imdbId);
  if (!info.trTitle && !info.origTitle) return [];

  var movieUrl = null;
  if (info.trTitle) movieUrl = await searchPage(info.trTitle);
  if (!movieUrl && info.origTitle && info.origTitle !== info.trTitle) {
    movieUrl = await searchPage(info.origTitle);
  }

  var label = (info.trTitle || info.origTitle || "Film") + (info.year ? " (" + info.year + ")" : "");

  // 1) sayfadaki vixolity token'ini coz (en dogru - hdfilmdelisi'nin kendi kaynagi)
  if (movieUrl) {
    try {
      var html = await fetchText(movieUrl, { "Referer": MAIN_URL });
      var imdb = extractImdbFromPage(html);
      if (imdb) {
        console.log(TAG + " vixolity imdb:" + imdb + " -> /vs/");
        return [vixStream(imdb, "Auto", label)];
      }
      // 2) yedek: sayfadaki mp4 (filigranli)
      var legacy = legacyMp4Streams(html, movieUrl);
      if (legacy.length) {
        console.log(TAG + " vixolity yok, mp4 yedek:" + legacy.length);
        return legacy;
      }
    } catch (e) {
      console.warn(TAG + " sayfa hatasi: " + e.message);
    }
  }

  // 3) son yedek: TMDB imdb ile /vs/
  if (info.imdbId && info.imdbId.startsWith("tt")) {
    console.log(TAG + " TMDB imdb ile /vs/: " + info.imdbId);
    return [vixStream(info.imdbId, "Auto", label)];
  }
  return [];
}

async function getStreams(tmdbId, mediaType, season, episode) {
  MAIN_URL = await resolveBase();
  try {
    console.log(TAG + " Istek: " + mediaType + " | TMDB: " + tmdbId + " | S:" + season + " E:" + episode);
    if (mediaType !== "movie") return [];
    return await extractStreams(tmdbId, mediaType);
  } catch (error) {
    console.error(TAG + " Hata: " + error.message);
    return [];
  }
}

module.exports = { getStreams: getStreams };
