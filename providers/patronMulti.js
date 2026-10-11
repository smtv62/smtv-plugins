/**
 * patronMulti - Built from src/patronMulti/
 * Generated: 2026-04-29T15:24:03.566Z
 */
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// src/patronMulti/extractor.js
var TMDB_API_KEY = "500330721680edb6d5f7f12ba7cd9023";
var VERSION = "3.1.0";
function inferLanguageFromText(text) {
  var v = (text || "").toLowerCase();
  if (v.includes("dublaj") || v.includes("dubbed"))
    return "TR Dublaj";
  if (v.includes("altyazi") || v.includes("altyaz\u0131") || v.includes("sub"))
    return "TR Altyazi";
  return "TR Altyazi";
}
function buildLabel(sourceName, quality, baseTitle) {
  var lang = inferLanguageFromText(baseTitle);
  var q = quality || "Auto";
  return {
    name: `${sourceName} - ${lang}`,
    title: `${baseTitle} | ${sourceName} | ${lang} | ${q}`
  };
}
function getTmdbInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var typePath = mediaType === "movie" ? "movie" : "tv";
    var tmdbUrl = `https://api.themoviedb.org/3/${typePath}/${tmdbId}?api_key=${TMDB_API_KEY}&language=tr-TR&append_to_response=external_ids`;
    var tmdbRes = yield fetch(tmdbUrl);
    var d = yield tmdbRes.json();
    return {
      imdbId: d.external_ids ? d.external_ids.imdb_id : null,
      title: d.title || d.name || "\u0130\xE7erik",
      year: (d.release_date || d.first_air_date || "").slice(0, 4)
    };
  });
}
function tryVidmody(imdbId, mediaType, season, episode, title, year) {
  return __async(this, null, function* () {
    try {
      var targetUrl = "";
      var displayTitle = title;
      if (mediaType === "movie") {
        targetUrl = `https://vidmody.com/vs/${imdbId}#.m3u8`;
        displayTitle += year ? ` (${year})` : "";
      } else {
        var sStr = "s" + season;
        var eStr = "e" + (episode < 10 ? "0" + episode : episode);
        targetUrl = `https://vidmody.com/vs/${imdbId}/${sStr}/${eStr}#.m3u8`;
        displayTitle += ` - ${sStr.toUpperCase()}${eStr.toUpperCase()}`;
      }
      var checkRes = yield fetch(targetUrl.replace("#.m3u8", ""), { method: "HEAD" });
      if (checkRes.status === 200) {
        console.log(`[PatronMulti V${VERSION}] Vidmody: i\xE7erik bulundu`);
        var meta = buildLabel("Vidmody", "Auto", displayTitle);
        return [{
          url: targetUrl,
          name: meta.name,
          title: meta.title,
          quality: "Auto",
          headers: {
            "Referer": "https://vidmody.com/",
            "User-Agent": "Mozilla/5.0"
          }
        }];
      }
      console.log(`[PatronMulti V${VERSION}] Vidmody: i\xE7erik bulunamad\u0131 (${checkRes.status})`);
      return [];
    } catch (e) {
      console.log(`[PatronMulti V${VERSION}] Vidmody hatas\u0131: ${e.message}`);
      return [];
    }
  });
}
function extractStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      var info = yield getTmdbInfo(tmdbId, mediaType);
      if (!info.imdbId || !info.imdbId.startsWith("tt")) {
        console.log(`[PatronMulti V${VERSION}] IMDB ID bulunamad\u0131, iptal ediliyor.`);
        return [];
      }
      console.log(`[PatronMulti V${VERSION}] Aran\u0131yor: ${info.imdbId} - ${info.title}`);
      var allStreams = [];
      var vidmodyStreams = yield tryVidmody(info.imdbId, mediaType, season, episode, info.title, info.year);
      allStreams = allStreams.concat(vidmodyStreams);
      console.log(`[PatronMulti V${VERSION}] Toplam ${allStreams.length} stream bulundu`);
      return allStreams;
    } catch (e) {
      console.error(`[PatronMulti V${VERSION}] KR\u0130T\u0130K HATA: ${e.message}`);
      return [];
    }
  });
}

// src/patronMulti/index.js
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    try {
      console.log(`[PatronMulti] Request: ${mediaType} ${tmdbId} S${season || "-"}E${episode || "-"}`);
      var streams = yield extractStreams(tmdbId, mediaType, season, episode);
      console.log(`[PatronMulti] Found ${streams.length} stream(s)`);
      return streams;
    } catch (error) {
      console.error(`[PatronMulti] Error: ${error.message}`);
      return [];
    }
  });
}
module.exports = { getStreams };
