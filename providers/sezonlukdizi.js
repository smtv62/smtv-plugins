/**
 * NUVIO ŞABLON NOTU:
 * Üstte (name): TMDB Dizi İsmi
 * Altta (title): ⌜ SEZONLUKDIZI ⌟ | Kaynak | Dil Bilgisi
 */

/* ---------- domain cozumleme (bot bakimli domains.json) ---------- */
var DOMAIN_KEY = "moon-sezonlukdizi";
var DEFAULT_BASE = "https://sezonlukdizi.cc";
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
var BASE_URL     = DEFAULT_BASE;
var TMDB_API_KEY = '500330721680edb6d5f7f12ba7cd9023';

var HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8',
  'Referer': BASE_URL + '/'
};

// ── Yardımcılar ───────────────────────────────────────────────

function fetchTmdbInfo(tmdbId) {
  return fetch('https://api.themoviedb.org/3/tv/' + tmdbId + '?api_key=' + TMDB_API_KEY + '&language=tr-TR')
    .then(function(r) { return r.json(); })
    .then(function(d) {
      return {
        title: d.name || d.original_name || 'Dizi',
        titleEn: d.original_name || '',
        titleTr: d.name || '',
        year: (d.first_air_date || '').slice(0, 4)
      };
    });
}

function fetchSessionCookie() {
  return fetch(BASE_URL + '/', { headers: HEADERS })
    .then(function(r) {
      var sc = r.headers.get('set-cookie');
      if (!sc) return '';
      return sc.split(',').map(function(c) { return c.trim().split(';')[0]; }).join('; ');
    })
    .catch(function() { return ''; });
}

function fetchAspData() {
  return fetch(BASE_URL + '/js/site.min.js', { headers: HEADERS })
    .then(function(r) { return r.text(); })
    .then(function(js) {
      var altM   = js.match(/dataAlternatif(.*?)\.asp/);
      var embedM = js.match(/dataEmbed(.*?)\.asp/);
      return { alternatif: altM ? altM[1] : '', embed: embedM ? embedM[1] : '' };
    })
    .catch(function() { return { alternatif: '', embed: '' }; });
}

function titleToSlug(t) {
  if(!t) return "";
  return t.toLowerCase()
    .replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ş/g,'s')
    .replace(/ı/g,'i').replace(/İ/g,'i').replace(/ö/g,'o').replace(/ç/g,'c')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function validateShowPage(slug) {
  var url = BASE_URL + '/diziler/' + slug + '.html';
  return fetch(url, { headers: HEADERS })
    .then(function(r) {
      if (r.status === 404) return null;
      return r.text().then(function(html) {
        if (html.indexOf('Sayfa Bulunamad') !== -1 || html.indexOf('Haydaaa') !== -1) return null;
        var m = html.match(/href="\/([^\/]+)\/\d+-sezon-\d+-bolum\.html"/i);
        return m ? m[1] : slug;
      });
    })
    .catch(function() { return null; });
}

function findShowSlug(slugEn, slugTr) {
  var candidates = [slugEn];
  if (slugTr && slugTr !== slugEn) candidates.push(slugTr);
  return new Promise(function(resolve) {
    var settled = false, done = 0;
    candidates.forEach(function(slug) {
      validateShowPage(slug).then(function(result) {
        done++;
        if (settled) return;
        if (result) { settled = true; resolve(result); }
        else if (done === candidates.length) resolve(null);
      });
    });
  });
}

function fetchBid(episodeUrl, cookie) {
  var hdrs = Object.assign({}, HEADERS);
  if (cookie) hdrs['Cookie'] = cookie;
  return fetch(episodeUrl, { headers: hdrs })
    .then(function(r) {
      var sc = r.headers.get('set-cookie'), newCookie = cookie || '';
      if (sc) {
        var extra = sc.split(',').map(function(c) { return c.trim().split(';')[0]; }).join('; ');
        newCookie = newCookie ? newCookie + '; ' + extra : extra;
      }
      return r.text().then(function(html) {
        var m = html.match(/data-id="([^"]+)"/);
        return { bid: m ? m[1] : null, cookies: newCookie };
      });
    });
}

function fetchAlternatifler(bid, dil, aspData, cookies, referer) {
  var hdrs = Object.assign({}, HEADERS, {
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Origin': BASE_URL,
    'Referer': referer || BASE_URL + '/'
  });
  if (cookies) hdrs['Cookie'] = cookies;
  return fetch(BASE_URL + '/ajax/dataAlternatif' + aspData.alternatif + '.asp', {
    method: 'POST',
    headers: hdrs,
    body: 'bid=' + encodeURIComponent(bid) + '&dil=' + dil
  })
  .then(function(r) { return r.text(); })
  .then(function(text) {
    try {
      var j = JSON.parse(text);
      return (j.status === 'success' && Array.isArray(j.data)) ? j.data : (Array.isArray(j) ? j : []);
    } catch(e) { return []; }
  }).catch(function() { return []; });
}

function fetchEmbedIframe(embedId, aspData) {
  return fetch(BASE_URL + '/ajax/dataEmbed' + aspData.embed + '.asp', {
    method: 'POST',
    headers: Object.assign({}, HEADERS, { 'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/x-www-form-urlencoded' }),
    body: 'id=' + embedId
  })
  .then(function(r) { return r.text(); })
  .then(function(html) {
    var m = html.match(/<iframe[^>]+src="([^"]+)"/i);
    return m ? m[1] : null;
  }).catch(function() { return null; });
}

// ── Byse (Filemoon aynasi) embed zinciri ──────────────────────
// adim: details -> captcha (PoW) -> verify -> playback (AES-256-GCM) -> coz
var BYSE_EMBED = 'https://bysejikuar.com';

function byseB64d(s) {
    var t = String(s).replace(/-/g, '+').replace(/_/g, '/');
    var pad = t.length % 4 === 0 ? 0 : 4 - (t.length % 4);
    var bin = atob(t + '===='.substring(0, pad));
    var a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
}

function byseUtf8(bytes) {
    var out = '', i = 0;
    while (i < bytes.length) {
        var c = bytes[i++];
        if (c < 0x80) out += String.fromCharCode(c);
        else if (c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (bytes[i++] & 0x3f));
        else if (c < 0xf0) {
            var c2 = bytes[i++], c3 = bytes[i++];
            out += String.fromCharCode(((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f));
        } else {
            var d2 = bytes[i++], d3 = bytes[i++], d4 = bytes[i++];
            var cp = (((c & 0x07) << 18) | ((d2 & 0x3f) << 12) | ((d3 & 0x3f) << 6) | (d4 & 0x3f)) - 0x10000;
            out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
        }
    }
    return out;
}

// PoW: site icindeki ozel 512-kelimelik hash (pow.js ile birebir)
function byseRot(t, e) { return ((t << e) | (t >>> (32 - e))) >>> 0; }
function byseImul(t, e) { return Math.imul(t, e) >>> 0; }
function byseYe(t) {
    t[0] = (t[0] + t[1]) >>> 0; t[3] = byseRot(t[3] ^ t[0], 16);
    t[2] = (t[2] + t[3]) >>> 0; t[1] = byseRot(t[1] ^ t[2], 12);
    t[0] = (t[0] + t[1]) >>> 0; t[3] = byseRot(t[3] ^ t[0], 8);
    t[2] = (t[2] + t[3]) >>> 0; t[1] = byseRot(t[1] ^ t[2], 7);
}
function byseGr(b) {
    var be = 512, lt = 511, dr = 2, lr = 2654435761, hr = 2246822519;
    var e = Uint32Array.from([1779033703, 3144134277, 1013904242, 2773480762]);
    for (var i = 0; i < b.length; i++) { e[0] = (e[0] + b[i]) >>> 0; e[0] = byseRot(e[0], 7); byseYe(e); }
    for (i = 0; i < 8; i++) byseYe(e);
    var r = new Uint32Array(be);
    for (i = 0; i < be; i++) { byseYe(e); r[i] = (e[0] ^ e[2]) >>> 0; }
    for (var k = 0; k < dr; k++) {
        for (var s = 0; s < be; s++) {
            var a = r[s] & lt;
            var c = (r[s] + r[a]) >>> 0;
            c = byseRot(c, 13);
            c = (c ^ byseImul(r[(s + 1) & lt], lr)) >>> 0;
            r[s] = c;
            e[0] = (e[0] ^ c) >>> 0;
            byseYe(e);
        }
    }
    var n = new Uint32Array(8), o = be / 8;
    for (i = 0; i < 8; i++) {
        byseYe(e);
        var acc = e[0];
        var base = i * o;
        for (var j = 0; j < o; j++) {
            var d = r[base + j];
            acc = (acc + d) >>> 0;
            acc = byseRot(acc, 5);
            acc = (acc ^ byseImul(d, hr)) >>> 0;
        }
        n[i] = (acc ^ e[2]) >>> 0;
    }
    return n;
}
function byseZbits(t) {
    var bits = 0;
    for (var i = 0; i < t.length; i++) {
        var w = t[i];
        if (w === 0) { bits += 32; continue; }
        return bits + Math.clz32(w);
    }
    return bits;
}
function byseMine(nonce, difficulty, budgetMs) {
    if (difficulty <= 0) return '0';
    var prefix = [], i;
    for (i = 0; i < nonce.length; i++) prefix.push(nonce.charCodeAt(i));
    prefix.push(58); // ':'
    var start = Date.now();
    budgetMs = budgetMs || 30000;
    for (var s = 0; s < 40000000; s++) {
        var str = String(s), bytes = prefix.slice();
        for (i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
        if (byseZbits(byseGr(bytes)) >= difficulty) return String(s);
        if (s % 8192 === 0 && Date.now() - start > budgetMs) return null;
    }
    return null;
}

// byte[] -> crypto-js WordArray (crypto-js create() byte array'i kelime olarak yanlis yorumlar)
function byseBytesToWA(bytes) {
    var CryptoJS = require('crypto-js');
    var words = [];
    for (var i = 0; i < bytes.length; i++) {
        words[i >> 2] = (words[i >> 2] || 0) | (bytes[i] << (24 - 8 * (i & 3)));
    }
    return CryptoJS.lib.WordArray.create(words, bytes.length);
}

// AES-256-GCM cozme: CTR keystream crypto-js AES-256-ECB ile uretilir
function byseDecryptPlayback(enc) {
    var CryptoJS = require('crypto-js');
    var parts = Array.isArray(enc.key_parts) ? enc.key_parts : [];
    // version -> indis eslemesi (bundle Qa/Ea/ws)
    var sel = [];
    var v = (typeof enc.version === 'string' ? enc.version : '').trim();
    var n = parseInt(v, 10);
    if (/^\d+$/.test(v) && n >= 1 && n <= 20) {
        var ia = n, ib = 31 - n;
        if (ia >= 1 && ib >= 1 && ia <= parts.length && ib <= parts.length) sel = [parts[ia - 1], parts[ib - 1]];
    }
    if (sel.length === 0) sel = parts;
    // key: secilen parcalarin base64 decoder birlesimi
    var keyArr = [];
    for (var i = 0; i < sel.length; i++) {
        if (typeof sel[i] !== 'string' || !sel[i]) continue;
        var kb = byseB64d(sel[i]);
        for (var q = 0; q < kb.length; q++) keyArr.push(kb[q]);
    }
    var keyWA = byseBytesToWA(keyArr);
    var iv = byseB64d(enc.iv);
    var ct = byseB64d(enc.payload);
    // GCM: J0 = IV||00000001, CTR ilk sayac = IV||00000002
    var ctr = [];
    for (i = 0; i < 16; i++) ctr.push(i < 12 ? iv[i] : 0);
    ctr[15] = 2;
    var out = new Uint8Array(ct.length);
    var blocks = Math.ceil(ct.length / 16);
    for (var bi = 0; bi < blocks; bi++) {
        var ks = CryptoJS.AES.encrypt(byseBytesToWA(ctr), keyWA, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.NoPadding
        }).ciphertext;
        for (var j = 0; j < 16; j++) {
            var idx = bi * 16 + j;
            if (idx >= ct.length) break;
            var kw = ks.words[j >> 2];
            var kb2 = (kw >>> (24 - 8 * (j & 3))) & 0xff;
            out[idx] = ct[idx] ^ kb2;
        }
        // sayac artir (son 4 byte, buyuk uctan)
        for (var p = 15; p >= 12; p--) { ctr[p]++; if (ctr[p] !== 0) break; }
    }
    // GCM auth tag'i son 16 byte (cozumde gereksiz — subtle.decrypt otomatik cikarir)
    return byseUtf8(out.subarray(0, out.length - 16));
}

function byseResolve(code, baseHost) {
    var embedOrigin = String(BASE_URL).replace(/^https?:\/\//, '');
    var detailsUrl = BYSE_EMBED + '/api/videos/' + encodeURIComponent(code) + '/embed/details';
    return fetch(detailsUrl, {
        headers: Object.assign({}, HEADERS, {
            'Referer': BASE_URL + '/',
            'Origin': BASE_URL,
            'Accept': 'application/json, text/plain, */*'
        })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
        var frame = d && d.embed_frame_url;
        if (!frame) return null;
        var m = frame.match(/^(https?:\/\/[^/]+)/);
        var frameOrigin = m ? m[1] : '';
        var ehdr = {
            'User-Agent': HEADERS['User-Agent'],
            'Accept': 'application/json, text/plain, */*',
            'Referer': frame,
            'Origin': frameOrigin,
            'X-Embed-Origin': embedOrigin,
            'X-Embed-Parent': BYSE_EMBED + '/e/' + code,
            'X-Embed-Referer': BASE_URL + '/'
        };
        var apiBase = frameOrigin + '/api/videos/' + encodeURIComponent(code) + '/embed';
        return fetch(apiBase + '/captcha', {
            method: 'POST',
            headers: Object.assign({}, ehdr, { 'Content-Type': 'application/json' }),
            body: '{}'
        })
        .then(function(r) { return r.json(); })
        .then(function(j1) {
            if (!j1 || !j1.pow_token) return null;
            var sol = byseMine(j1.pow_nonce, j1.pow_difficulty);
            if (sol === null) return null;
            return fetch(apiBase + '/captcha/verify', {
                method: 'POST',
                headers: Object.assign({}, ehdr, { 'Content-Type': 'application/json' }),
                body: JSON.stringify({ pow_token: j1.pow_token, solution: sol })
            })
            .then(function(r) { return r.json(); })
            .then(function(j3) {
                if (!j3 || j3.status !== 'ok' || !j3.token) return null;
                return fetch(apiBase + '/playback', {
                    method: 'POST',
                    headers: Object.assign({}, ehdr, {
                        'Content-Type': 'application/json',
                        'X-Captcha-Token': j3.token
                    }),
                    body: JSON.stringify({ fingerprint: {} })
                })
                .then(function(r) { return r.json(); })
                .then(function(j4) {
                    if (!j4 || !j4.playback) return null;
                    var cfg = JSON.parse(byseDecryptPlayback(j4.playback));
                    var src = (cfg.sources || [])[0];
                    if (!src || !src.url) return null;
                    return {
                        url: src.url,
                        headers: { 'Referer': frame + '/', 'User-Agent': HEADERS['User-Agent'] }
                    };
                });
            });
        });
    })
    .catch(function() { return null; });
}

function processVeri(veri, dilTag, aspData) {
  var name = (veri.baslik || '').toLowerCase();
  if (name === 'pixel' || name === 'netu') return Promise.resolve(null);

  return fetchEmbedIframe(veri.id, aspData).then(function(src) {
    if (!src) return null;
    var provider = "Video";
    if (src.indexOf('sibnet.ru') !== -1) provider = "Sibnet";
    if (src.indexOf('vidmoly') !== -1) provider = "VidMoly";
    if (src.indexOf('bysejikuar.com') !== -1) provider = "Byse";

    var streamData = { provider: provider, dil: dilTag, url: src, type: 'hls', headers: { 'Referer': src } };

    if (provider === "Byse") {
      var bcode = src.split('/e/')[1].split(/[?#]/)[0];
      return byseResolve(bcode).then(function(r) {
        if (!r) return null;
        streamData.url = r.url;
        streamData.headers = r.headers;
        return streamData;
      });
    }

    if (provider === "Sibnet") {
        var id = (src.match(/videoid=(\d+)/) || src.match(/video(\d+)/) || [])[1];
        if (!id) return null;
        var shell = 'https://video.sibnet.ru/shell.php?videoid=' + id;
        return fetch(shell, { headers: Object.assign({}, HEADERS, { 'Referer': 'https://video.sibnet.ru/' }) })
            .then(function(r) { return r.text(); })
            .then(function(html) {
                var m = html.match(/src\s*:\s*"(\/v\/[^"]+\.mp4[^"]*)"/i);
                if (!m) return null;
                streamData.url = 'https://video.sibnet.ru' + m[1];
                streamData.type = 'direct';
                streamData.headers = { 'Referer': shell };
                return streamData;
            });
    }

    if (provider === "VidMoly") {
        var full = src.startsWith('//') ? 'https:' + src : src;
        return fetch(full, { headers: Object.assign({}, HEADERS, { 'Referer': BASE_URL + '/' }) })
            .then(function(r) { return r.text(); })
            .then(function(html) {
                var m = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
                if (!m) return null;
                streamData.url = m[1];
                streamData.headers = { 'Referer': full };
                return streamData;
            });
    }
    return null;
  }).catch(function() { return null; });
}

async function getStreams(tmdbId, mediaType, season, episode) {
  BASE_URL = await resolveBase();
  HEADERS.Referer = BASE_URL + '/';
  if (mediaType !== 'tv') return Promise.resolve([]);

  return Promise.all([fetchTmdbInfo(tmdbId), fetchSessionCookie(), fetchAspData()])
    .then(function(init) {
      var info = init[0], cookie = init[1], aspData = init[2];
      return findShowSlug(titleToSlug(info.titleEn), titleToSlug(info.titleTr)).then(function(slug) {
        if (!slug) throw new Error('Dizi bulunamadı');
        var epUrl = BASE_URL + '/' + slug + '/' + season + '-sezon-' + episode + '-bolum.html';
        return fetchBid(epUrl, cookie).then(function(bd) {
            return Promise.all([
                fetchAlternatifler(bd.bid, '0', aspData, bd.cookies, epUrl),
                fetchAlternatifler(bd.bid, '1', aspData, bd.cookies, epUrl)
            ]).then(function(lists) {
                var prom = [];
                lists[0].forEach(function(v) { prom.push(processVeri(v, '🇹🇷 TR Dublaj', aspData)); });
                lists[1].forEach(function(v) { prom.push(processVeri(v, '🌐 TR Altyazı', aspData)); });
                return Promise.all(prom).then(function(results) {
                    return results.filter(Boolean).map(function(s) {
                        return {
                            name: info.title,
                            title: '⌜ SEZONLUKDIZI ⌟ | ' + s.provider + ' | ' + s.dil,
                            url: s.url,
                            quality: '1080p',
                            type: s.type,
                            headers: s.headers
                        };
                    });
                });
            });
        });
      });
    }).catch(function() { return []; });
}

module.exports = { getStreams: getStreams };
