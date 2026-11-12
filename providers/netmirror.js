console.log("[NetMirror] Initializing NetMirror provider (embed)");

// ---------------------------------------------------------------------------
// NetMirror (net77 tabanli) — TMDB embed API uzerinden dogrudan MP4 kaynaklari.
//
// Eski net22/net52 search + cookie + playlist akisi kaldirildi: yeni site
// /api/embed-tmdb/{tmdbId} ile TMDB kimligine gore stream donduruyor.
//   film : GET {base}/api/embed-tmdb/{tmdbId}
//   dizi : GET {base}/api/embed-tmdb/{tmdbId}?type=tv&se={sezon}&ep={bolum}
// Donen MP4'lerin hepsi belli Referer/UA kombinasyonu istiyor (asagida).
// ---------------------------------------------------------------------------
const NETMIRROR_BASES = ["https://net79.cc", "https://net27.cc"];
/* ---------- domain cozumleme (bot bakimli domains.json) ---------- */
var DOMAIN_KEY = "moon-netmirror";
var DEFAULT_BASE = "https://net79.cc";
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

// hakunaymatata MP4 CDN'i bu Referer olmadan HTTP 429 dondurur.
const STREAM_REFERER = "https://videodownloader.site/";
// Ayni CDN tarayici disi (ExoPlayer/varsayilan) UA ile HTTP 428 dondurur.
const STREAM_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function isEpisodic(mediaType) {
  const t = String(mediaType || "").toLowerCase();
  return t === "tv" || t === "series" || t === "show";
}

function buildEmbedPath(tmdbId, mediaType, season, episode) {
  let path = "/api/embed-tmdb/" + encodeURIComponent(String(tmdbId));
  if (isEpisodic(mediaType)) {
    path += "?type=tv";
    if (season !== undefined && season !== null && String(season) !== "") {
      path += "&se=" + encodeURIComponent(String(season));
    }
    if (episode !== undefined && episode !== null && String(episode) !== "") {
      path += "&ep=" + encodeURIComponent(String(episode));
    }
  }
  return path;
}

async function fetchEmbed(base, path) {
  const response = await fetch(base + path, {
    method: "GET",
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Referer": base + "/",
      "User-Agent": STREAM_UA
    }
  });
  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }
  return await response.json();
}

function formatSize(bytes) {
  const n = Number(bytes);
  if (!n || n <= 0 || isNaN(n)) return null;
  const gb = n / 1073741824;
  if (gb >= 1) return (Math.round(gb * 10) / 10) + " GB";
  const mb = n / 1048576;
  if (mb >= 1) return Math.round(mb) + " MB";
  return Math.round(n / 1024) + " KB";
}

function qualityLabel(resolution) {
  const n = Number(resolution);
  if (!n || isNaN(n)) return null;
  return n + "p";
}

function qualityRank(label) {
  const m = /(\d{3,4})/.exec(String(label || ""));
  return m ? parseInt(m[1], 10) : 0;
}

// Embed yanitindaki altyazilar /api/proxy/video?url=... ile geliyor ve o proxy
// Cloudflare 429 veriyor. Icindeki URL imzali haliyle cacdn CDN'inden dogrudan
// aciliyor (200 + SRT dogrulandi) — proxy'yi cozup dogrudan kullan.
function resolveCaptionUrl(raw) {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const marker = "/api/proxy/video?url=";
  if (raw.indexOf(marker) === 0) {
    try {
      const direct = decodeURIComponent(raw.substring(marker.length));
      return direct.indexOf("http") === 0 ? direct : null;
    } catch (e) {
      return null;
    }
  }
  return raw.indexOf("http") === 0 ? raw : null;
}

function buildCaptions(rawList) {
  if (!Array.isArray(rawList)) return [];
  const picked = [];
  const seen = {};
  for (let i = 0; i < rawList.length; i++) {
    const cap = rawList[i];
    if (!cap) continue;
    const url = resolveCaptionUrl(cap.url);
    if (!url || seen[url]) continue;
    seen[url] = true;
    const code = String(cap.lang || cap.language || "").toLowerCase();
    picked.push({
      url: url,
      code: code,
      label: cap.name || cap.lang || code || "Unknown"
    });
  }
  // Turkce ve Ingilizce listeyi basa al.
  const priority = { tr: 0, en: 1 };
  picked.sort(function (a, b) {
    const pa = Object.prototype.hasOwnProperty.call(priority, a.code) ? priority[a.code] : 2;
    const pb = Object.prototype.hasOwnProperty.call(priority, b.code) ? priority[b.code] : 2;
    if (pa !== pb) return pa - pb;
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
  const out = [];
  for (let i = 0; i < picked.length; i++) {
    out.push({ url: picked[i].url, language: picked[i].label, name: "NetMirror" });
  }
  return out;
}

function buildTitle(data, mediaType, season, episode) {
  let title = String(data.title || "").trim();
  if (!title) title = "NetMirror";
  let label = title + (data.year ? " (" + data.year + ")" : "");
  if (isEpisodic(mediaType) || isEpisodic(data.type)) {
    const s = data.currentSeason !== undefined && data.currentSeason !== null ? data.currentSeason : season;
    const e = data.currentEpisode !== undefined && data.currentEpisode !== null ? data.currentEpisode : episode;
    if (s !== undefined && s !== null && String(s) !== "" &&
        e !== undefined && e !== null && String(e) !== "") {
      label += " S" + s + "E" + e;
    }
  }
  return label;
}

async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (tmdbId === undefined || tmdbId === null || String(tmdbId).length === 0) {
      return [];
    }
    const path = buildEmbedPath(tmdbId, mediaType, season, episode);

    const primary = await resolveBase();
    const bases = [primary].concat(NETMIRROR_BASES.filter(function (b) { return b !== primary; }));
    for (let i = 0; i < bases.length; i++) {
      const base = bases[i];
      let data = null;
      try {
        data = await fetchEmbed(base, path);
      } catch (e) {
        console.log("[NetMirror] " + base + " failed: " + (e && e.message));
        continue;
      }
      if (!data || data.ok !== true) continue;

      // Yanit TMDB kimligiyle uyumlu olmali (yanlis eslesme riskine karsi).
      if (data.tmdbId !== undefined && data.tmdbId !== null &&
          String(data.tmdbId) !== String(tmdbId)) {
        console.log("[NetMirror] tmdbId mismatch: " + data.tmdbId + " != " + tmdbId);
        continue;
      }

      const raw = Array.isArray(data.streams) ? data.streams : [];
      const usable = [];
      for (let j = 0; j < raw.length; j++) {
        const s = raw[j];
        if (s && typeof s.url === "string" && s.url.indexOf("http") === 0) {
          usable.push(s);
        }
      }
      if (usable.length === 0) {
        // noSource: icerik yok — diger ayna da ayni backend'den cevap verir.
        if (data.noSource === true) return [];
        continue;
      }

      const title = buildTitle(data, mediaType, season, episode);
      const subtitles = buildCaptions(data.captions);
      const streamHeaders = {
        "User-Agent": STREAM_UA,
        "Referer": STREAM_REFERER,
        "Accept": "*/*"
      };

      const results = usable.map(function (s) {
        const item = {
          name: "NetMirror",
          title: title,
          url: s.url,
          quality: qualityLabel(s.resolution),
          type: "mp4",
          provider: "NetMirror",
          headers: streamHeaders
        };
        const size = formatSize(s.size);
        if (size) item.size = size;
        if (subtitles.length > 0) item.subtitles = subtitles;
        return item;
      });

      results.sort(function (a, b) {
        return qualityRank(b.quality) - qualityRank(a.quality);
      });

      console.log("[NetMirror] " + results.length + " stream(s) for " +
        mediaType + ":" + tmdbId + " via " + base);
      return results;
    }

    console.log("[NetMirror] no source for " + mediaType + ":" + tmdbId);
    return [];
  } catch (e) {
    console.log("[NetMirror] getStreams error: " + (e && e.message));
    return [];
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
