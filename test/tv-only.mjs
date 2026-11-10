// TV-only provider'lar (moondizim3u, sezonlukdizi) — sadece dizi cagrisi + tam log
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import * as cheerio from "cheerio";
import CryptoJS from "crypto-js";

const key = (() => {
  try {
    const m = readFileSync("C:\\Users\\Pc\\Documents\\NuvioTV-Test\\local.properties", "utf8").match(/^TMDB_API_KEY=(.+)$/m);
    return m ? m[1].trim() : "";
  } catch { return ""; }
})();

const targets = process.argv.slice(2);
for (const name of targets) {
  const file = `C:/Users/Pc/AppData/Local/Temp/opencode/newsrc/smtv-plugins-fresh/providers/${name}`;
  const logs = [];
  const push = (...a) => logs.push(a.map(String).join(" "));
  const loggingFetch = async (url, options = {}) => {
    const u = String(url);
    logs.push(`>> ${(options.method || "GET")} ${u.slice(0, 140)}`);
    try {
      const headers = { ...(options.headers || {}) };
      if (!headers["User-Agent"]) headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
      const r = await fetch(u, { ...options, headers, signal: AbortSignal.timeout(30000) });
      logs.push(`<< ${r.status} ${u.slice(0, 110)}`);
      return r;
    } catch (e) {
      logs.push(`xx ${u.slice(0, 110)} -> ${e.message}`);
      throw e;
    }
  };
  const sandbox = createContext({
    console: { log: push, info: push, warn: push, error: push, debug: push },
    fetch: loggingFetch, atob, setTimeout, clearTimeout, URL, URLSearchParams,
    require: (n) => {
      if (n.includes("cheerio")) return cheerio;
      if (n === "crypto-js") return CryptoJS;
      throw new Error(`Module '${n}' is not available`);
    },
    TMDB_API_KEY: key, module: { exports: {} }, TextEncoder, TextDecoder, Buffer,
    AbortController, AbortSignal, SCRAPER_ID: "t", SCRAPER_SETTINGS: {}, globalThis: undefined
  });
  sandbox.globalThis = sandbox; sandbox.window = sandbox; sandbox.self = sandbox; sandbox.global = sandbox;
  try {
    runInContext(readFileSync(file, "utf8"), sandbox, { filename: file, timeout: 15000 });
  } catch (e) {
    console.log(`\n### ${name} LOAD HATASI: ${e.message}`);
    continue;
  }
  const gs = sandbox.module.exports.getStreams || sandbox.getStreams;
  console.log(`\n### ${name} — TV cagrisi (1396 S1E1)`);
  try {
    const streams = await gs("1396", "tv", 1, 1, null);
    console.log(`  sonuc: ${streams.length} stream`);
    for (const s of streams.slice(0, 3)) console.log(`   - ${s.title || s.name} -> ${String(s.url).slice(0, 90)}`);
  } catch (e) {
    console.log(`  HATA: ${e.message}`);
  }
  console.log(`  log:\n    ${logs.join("\n    ").slice(0, 2500)}`);
}
