#!/usr/bin/env node
/**
 * smTV Plugins — yerel test (Node 18+; global fetch + atob kullanir).
 *
 *   node test/run-tests.mjs
 *
 * Kisim 1 — HDFilmCehennemi detay testleri:
 *   Film:  TMDB 1083862 (Resident Evil: Death Island)
 *   Dizi:  TMDB 95350 (Lanterns) S1E1
 *   Arama: "Resident Evil"
 *
 * Kisim 2 — tum provider smoke testi (PluginRuntime.kt sadig sandbox:
 *   require -> cheerio/crypto-js, fetch -> browser UA).
 *   Gecme kosulu: film veya dizide en az 1 stream.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createContext, runInContext } from "node:vm";
import * as cheerio from "cheerio";
import CryptoJS from "crypto-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// TMDB anahtarini ortam degiskeninden al (local.properties ile ayni).
let key = process.env.TMDB_API_KEY || "";
if (!key) {
  try {
    const lp = readFileSync("C:\\Users\\Pc\\Documents\\NuvioTV-Test\\local.properties", "utf8");
    const m = lp.match(/^TMDB_API_KEY=(.+)$/m);
    if (m) key = m[1].trim();
  } catch (e) {}
}
if (!key) {
  console.error("TMDB_API_KEY bulunamadi (env veya local.properties).");
  process.exit(2);
}

// PluginRuntime.kt sadig require: sadece cheerio/cos-js bilir.
function runtimeRequire(moduleName) {
  if (moduleName === "cheerio" || moduleName === "cheerio-without-node-native" || moduleName === "react-native-cheerio") {
    return cheerio;
  }
  if (moduleName === "crypto-js") {
    return CryptoJS;
  }
  throw new Error(`Module '${moduleName}' is not available`);
}

// PluginRuntime.kt fetch taklidi: provider User-Agent vermemisse browser UA ekle.
const runtimeFetch = async (url, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (!headers["User-Agent"]) {
    headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
  }
  return fetch(url, { ...options, headers });
};

/** Plugin'i QuickJS benzeri bir sandbox icinde calistir. */
function loadProvider(file, { silent = false } = {}) {
  const code = readFileSync(file, "utf8");
  const logs = [];
  const pushLog = (...a) => logs.push(a.map(String).join(" "));
  const sandbox = createContext({
    console: silent
      ? { log: pushLog, info: pushLog, warn: pushLog, error: pushLog, debug: pushLog }
      : console,
    fetch: runtimeFetch,
    atob,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    require: runtimeRequire,
    TMDB_API_KEY: key,
    module: { exports: {} },
    globalThis: undefined
  });
  sandbox.globalThis = sandbox;
  runInContext(code, sandbox, { filename: file, timeout: 10000 });
  return { exports: sandbox.module.exports, logs };
}

let failed = 0;

async function check(label, fn) {
  try {
    const res = await fn();
    const ok = res && res.ok;
    console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failed++;
    return res;
  } catch (e) {
    console.log(`FAIL  ${label} -> ${e.message || e}`);
    failed++;
    return null;
  }
}

/* ================= Kisim 1: HDFilmCehennemi detay ================= */

const hdf = loadProvider(join(root, "providers", "hdfilmcehennemi.js"));
const { getStreams, search } = hdf.exports;

console.log("== [1/2] HDFilmCehennemi detay testleri ==");
console.log("\n== Film: Resident Evil: Death Island (sitede mevcut, TMDB 1083862) ==");
await check("getStreams movie", async () => {
  const streams = await getStreams("1083862", "movie", null, null, null);
  console.log("  stream:", streams.length);
  for (const s of streams.slice(0, 4)) console.log("   -", s.title, "->", s.url.slice(0, 90));
  return { ok: streams.length > 0 && streams.every((s) => s.url.includes(".m3u8")) };
});

console.log("\n== Dizi: Lanterns S1E1 (TMDB 95350) ==");
await check("getStreams series (type=tv, uygulamanin gonderdigi deger)", async () => {
  const streams = await getStreams("95350", "tv", 1, 1, null);
  console.log("  stream:", streams.length);
  for (const s of streams.slice(0, 4)) console.log("   -", s.title, "->", s.url.slice(0, 90));
  return { ok: streams.length > 0 && streams.every((s) => s.url.includes(".m3u8")) };
});

await check("getStreams series (type=series, geriye uyumluluk)", async () => {
  const streams = await getStreams("95350", "series", 1, 1, null);
  return { ok: streams.length > 0 };
});

console.log("\n== Arama: 'Resident Evil' ==");
await check("search", async () => {
  const res = await search({ query: "Resident Evil", language: "tr" });
  console.log("  item:", res.items.length);
  for (const it of res.items.slice(0, 4)) console.log("   -", it.type, it.name, it.year || "", "->", (it.url || "").slice(0, 80));
  return { ok: res.items.length > 0 && res.items.every((i) => i.id && i.name && i.type && i.url) };
});

/* ================= Kisim 2: tum provider smoke ================= */

console.log("\n== [2/2] Tum provider smoke testi ==");

const SMOKE_TESTS = [
  { label: "film-RE", args: ["1083862", "movie", null, null, null] },
  { label: "film-Opp", args: ["872585", "movie", null, null, null] },
  { label: "dizi-Lanterns", args: ["95350", "tv", 1, 1, null] }
];
const CALL_TIMEOUT_MS = 45000;
const withTimeout = (p, ms, label) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms (${label})`)), ms))
  ]);

const providersDir = join(root, "providers");
for (const file of readdirSync(providersDir).filter((f) => f.endsWith(".js"))) {
  let exp;
  let logs = [];
  try {
    ({ exports: exp, logs } = loadProvider(join(providersDir, file), { silent: true }));
  } catch (e) {
    console.log(`FAIL  ${file} -> load: ${e.message}`);
    failed++;
    continue;
  }
  if (typeof exp.getStreams !== "function") {
    console.log(`FAIL  ${file} -> getStreams export yok`);
    failed++;
    continue;
  }
  const results = await Promise.all(
    SMOKE_TESTS.map(async (t) => {
      try {
        const streams = await withTimeout(Promise.resolve(exp.getStreams(...t.args)), CALL_TIMEOUT_MS, t.label);
        return { ...t, n: Array.isArray(streams) ? streams.length : 0, err: null };
      } catch (e) {
        return { ...t, n: 0, err: e.message || String(e) };
      }
    })
  );
  const ok = results.some((r) => !r.err && r.n > 0);
  const detail = results.map((r) => `${r.label}=${r.err ? "ERR" : r.n}`).join(" ");
  console.log(`${ok ? "PASS" : "FAIL"}  ${file}  ${detail}`);
  if (!ok) {
    if (results.some((r) => !r.err)) {
      console.log(`      [son loglar] ${logs.slice(-4).join(" | ").slice(0, 400)}`);
    }
    failed++;
  }
}

console.log(failed ? `\n${failed} test BASARISIZ` : "\nTum testler GECTI");
process.exit(failed ? 1 : 0);
