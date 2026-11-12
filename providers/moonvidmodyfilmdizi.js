var TMDB_API_KEY = '500330721680edb6d5f7f12ba7cd9023';
var VERSION      = "8.0.0-UNIFIED-VERIFIED";

/* ---------- domain cozumleme (bot bakimli domains.json) ---------- */
var DOMAIN_KEY = "moon-vidmody";
var DEFAULT_BASE = "https://ha.vixolity.com";
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

async function getStreams(tmdbId, mediaType, season, episode) {
    const vix = await resolveBase();
    try {
        // 1. TMDB Verisini Çek (Film veya Dizi fark etmeksizin dış ID'leri al)
        const typePath = (mediaType === 'movie') ? 'movie' : 'tv';
        const tmdbUrl = `https://api.themoviedb.org/3/${typePath}/${tmdbId}?api_key=${TMDB_API_KEY}&language=tr-TR&append_to_response=external_ids`;
        
        const tmdbRes = await fetch(tmdbUrl);
        const d = await tmdbRes.json();
        
        const imdbId = d.external_ids ? d.external_ids.imdb_id : null;
        const title = d.title || d.name || "İçerik";
        
        if (!imdbId || !imdbId.startsWith('tt')) return [];

        // 2. URL Formatını Belirle
        let targetUrl = "";
        let displayTitle = title;

        if (mediaType === 'movie') {
            // Film Formatı: https://ha.vixolity.com/vs/tt123456
            targetUrl = `${vix}/vs/${imdbId}`;
            const releaseYear = (d.release_date || '').slice(0, 4);
            displayTitle += releaseYear ? ` (${releaseYear})` : "";
        } else {
            // Dizi Formatı: https://ha.vixolity.com/vs/tt123456/s1/e01
            let sStr = "s" + season;
            let eStr = "e" + (episode < 10 ? "0" + episode : episode);
            targetUrl = `${vix}/vs/${imdbId}/${sStr}/${eStr}`;
            displayTitle += ` - ${sStr.toUpperCase()}${eStr.toUpperCase()}`;
        }

        // 3. Link Doğrulama (Gerçekten var mı kontrolü)
        // HEAD isteği ile sadece linkin aktif olup olmadığına bakıyoruz (Hızlıdır)
        try {
            const checkRes = await fetch(targetUrl, { method: 'HEAD' });
            
            if (checkRes.status === 200) {
                return [{
                    url: targetUrl,
                    name: `Vidmody`,
                    title: displayTitle,
                    quality: "Auto",
                    headers: {
                        'Referer': vix + '/',
                        'User-Agent': 'Mozilla/5.0'
                    }
                }];
            }
        } catch (linkErr) {
            // Bağlantı hatası veya CORS varsa linki riske atmayıp göstermiyoruz
            return [];
        }

        return [];

    } catch (e) {
        console.error(`[V${VERSION}] HATA: ${e.message}`);
        return [];
    }
}

if (typeof module !== 'undefined') module.exports = { getStreams };
