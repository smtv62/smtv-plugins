// Parametreli provider tam loglayici: node test/provider-debug.mjs <ad> [tmdbId] [tip] [sezon] [bolum]
// Ornek: node test/provider-debug.mjs patronDizipal 27205 movie
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import CryptoJS from "crypto-js";

const name = process.argv[2];
const tmdbId = process.argv[3] || "27205";
const mediaType = process.argv[4] || "movie";
const season = process.argv[5] ?? null;
const episode = process.argv[6] ?? null;
if (!name) { console.error("kullanim: provider-debug.mjs <ad> [tmdbId] [tip] [sezon] [bolum]"); process.exit(2); }

const key = readFileSync("C:\\Users\\Pc\\Documents\\NuvioTV-Test\\local.properties", "utf8").match(/^TMDB_API_KEY=(.+)$/m)?.[1]?.trim() || "";
globalThis.TMDB_API_KEY = key;

const file = `C:/Users/Pc/AppData/Local/Temp/opencode/newsrc/smtv-plugins-fresh/providers/${name}.js`;
const code = readFileSync(file, "utf8");
const mod = { exports: {} };
const runtimeRequire = (n) => {
  if (["cheerio", "cheerio-without-node-native", "react-native-cheerio"].includes(n)) return cheerio;
  if (n === "crypto-js") return CryptoJS;
  throw new Error("no mod " + n);
};
const factory = new Function(
  "require", "fetch", "module", "console",
  "atob", "btoa", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "URL", "URLSearchParams", "TextEncoder", "TextDecoder", "Buffer",
  "AbortController", "AbortSignal", "SCRAPER_ID", "SCRAPER_SETTINGS",
  "window", "self", "globalThis", "global",
  code + "\nreturn module.exports;"
);
const g = globalThis;
const p = factory(runtimeRequire, fetch, mod, console,
  atob, (s) => Buffer.from(s, "binary").toString("base64"),
  setTimeout, clearTimeout, setInterval, clearInterval,
  URL, URLSearchParams, TextEncoder, TextDecoder, Buffer,
  AbortController, AbortSignal, "test-scraper", {}, g, g, g, g) || mod.exports;

const started = Date.now();
try {
  const streams = await p.getStreams(tmdbId, mediaType, season, episode, null);
  console.log(`SONUC: ${streams.length} stream (${Date.now() - started} ms)`);
  for (const s of streams.slice(0, 6)) console.log(" -", s.title || s.provider, "->", String(s.url).slice(0, 130));
} catch (e) {
  console.log("THROW:", e && e.stack ? e.stack.slice(0, 700) : e);
}
