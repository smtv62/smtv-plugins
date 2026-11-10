#!/usr/bin/env node
/**
 * Kapsamli kaynak kontrolu v2 — fetch loglamasi + PluginRuntime global paritesi.
 *
 *   node test/check-all.mjs                # tum provider'lar
 *   node test/check-all.mjs rectv sinemacx # sadece secilenler (alt string)
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as cheerio from "cheerio";
import CryptoJS from "crypto-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const only = process.argv.slice(2);

let key = process.env.TMDB_API_KEY || "";
if (!key) {
  try {
    const lp = readFileSync("C:\\Users\\Pc\\Documents\\NuvioTV-Test\\local.properties", "utf8");
    const m = lp.match(/^TMDB_API_KEY=(.+)$/m);
    if (m) key = m[1].trim();
  } catch (e) {}
}
if (!key) { console.error("TMDB_API_KEY yok"); process.exit(2); }
// Tum test boyunca global'de kalsin — finally'de silinirse getStreams cagrisinda kaybolur
globalThis.TMDB_API_KEY = key;

function runtimeRequire(name) {
  if (name === "cheerio" || name === "cheerio-without-node-native" || name === "react-native-cheerio") return cheerio;
  if (name === "crypto-js") return CryptoJS;
  throw new Error(`Module '${name}' is not available`);
}

function loadProvider(file) {
  const code = readFileSync(file, "utf8");
  const logs = [];
  const push = (...a) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));

  // fetch taklidi: her istegi logla (susmasin diye)
  const loggingFetch = async (url, options = {}) => {
    const u = String(url);
    const method = (options.method || "GET").toUpperCase();
    logs.push(`>> ${method} ${u.slice(0, 130)}`);
    try {
      const headers = { ...(options.headers || {}) };
      if (!headers["User-Agent"]) headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
      const r = await fetch(u, { ...options, headers, signal: AbortSignal.timeout(30000) });
      logs.push(`<< ${r.status} ${u.slice(0, 100)}`);
      return r;
    } catch (e) {
      logs.push(`xx ${u.slice(0, 100)} -> ${(e && e.message) || e}`);
      throw e;
    }
  };

  const fakeConsole = { log: push, info: push, warn: push, error: push, debug: push };
  const mod = { exports: {} };

  // Main context'te calistir: vm sandbox'inda fonksiyon cagrilarinda buyuk overhead
  // var (PoW mining butcesine sigmiyor). window/self/globalThis esitligi korunur.
  const factory = new Function(
    "require", "fetch", "module", "console",
    "atob", "btoa", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
    "URL", "URLSearchParams", "TextEncoder", "TextDecoder", "Buffer",
    "AbortController", "AbortSignal", "SCRAPER_ID", "SCRAPER_SETTINGS",
    "window", "self", "globalThis", "global",
    code + "\nreturn module.exports;"
  );
  const globalRef = globalThis;
  const exp = factory(
    runtimeRequire, loggingFetch, mod, fakeConsole,
    atob, (s) => Buffer.from(s, "binary").toString("base64"),
    setTimeout, clearTimeout, setInterval, clearInterval,
    URL, URLSearchParams, TextEncoder, TextDecoder, Buffer,
    AbortController, AbortSignal, "test-scraper", {},
    globalRef, globalRef, globalRef, globalRef
  ) || mod.exports;
  return { exports: exp, logs };
}

const withTimeout = (p, ms, label) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout ${ms}ms (${label})`)), ms))]);

const MATRIX = [
  { label: "Inception", args: ["27205", "movie", null, null, null] },
  { label: "Oppenheimer", args: ["872585", "movie", null, null, null] },
  { label: "BB-S1E1", args: ["1396", "tv", 1, 1, null] }
];

async function validateStream(s) {
  const url = s && s.url;
  if (!url || typeof url !== "string" || !url.startsWith("http")) return "skip";
  const headers = { ...(s.headers || {}) };
  const isM3u = /\.m3u8(\?|$)/i.test(url) || ["mpegurl", "hls"].includes((s.type || "").toLowerCase());
  try {
    if (isM3u) {
      const r = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
      const txt = (await r.text()).slice(0, 20);
      return r.ok && txt.includes("#EXTM3U") ? `200-m3u8` : `m3u8:${r.status}`;
    }
    const r = await fetch(url, { headers: { ...headers, Range: "bytes=0-64" }, signal: AbortSignal.timeout(20000) });
    const b = Buffer.from(await r.arrayBuffer());
    if (r.status === 429) return "429-referer?";
    if ([403, 404, 410].includes(r.status)) return String(r.status);
    if (b.length >= 8 && b.readUInt32BE(4) === 0x66747970) return `${r.status}-mp4`;
    if (b[0] === 0x47) return `${r.status}-ts`;
    if (b.slice(0, 7).toString().includes("#EXTM3U")) return `${r.status}-m3u8`;
    return `${r.status}-?(${b.slice(0, 8).toString("hex")})`;
  } catch (e) {
    return `ERR:${(e && e.message) || e}`.slice(0, 40);
  }
}

let files = readdirSync(join(root, "providers")).filter((f) => f.endsWith(".js")).sort();
if (only.length) files = files.filter((f) => only.some((o) => f.toLowerCase().includes(o.toLowerCase())));

const results = [];
async function runOne(file) {
  const rec = { file, calls: [], loadError: null, streams: null, validate: null, logs: [] };
  let exp;
  try {
    ({ exports: exp, logs: rec.logs } = loadProvider(join(root, "providers", file)));
  } catch (e) {
    rec.loadError = e.message;
    return rec;
  }
  if (typeof exp.getStreams !== "function") { rec.loadError = "getStreams export yok"; return rec; }

  for (const t of MATRIX) {
    const before = rec.logs.length;
    try {
      const streams = await withTimeout(Promise.resolve(exp.getStreams(...t.args)), 40000, t.label);
      const n = Array.isArray(streams) ? streams.length : 0;
      rec.calls.push(`${t.label}=${n}`);
      if (n > 0 && !rec.streams) rec.streams = streams;
    } catch (e) {
      rec.calls.push(`${t.label}=ERR`);
      rec.logs.push(`[harness] ${t.label}: ${e.message}`);
    }
    rec[`logs_${t.label}`] = rec.logs.slice(before);
  }
  if (rec.streams && rec.streams.length) rec.validate = await validateStream(rec.streams[0]);
  return rec;
}

const queue = [...files];
await Promise.all(Array.from({ length: 4 }, async () => {
  while (queue.length) results.push(await runOne(queue.shift()));
}));

results.sort((a, b) => a.file.localeCompare(b.file));

let pass = 0, fail = 0;
console.log("DURUM  PROVIDER                     TESTLER                          STREAM URL");
for (const r of results) {
  const ok = !r.loadError && r.streams && r.streams.length > 0;
  if (ok) pass++; else fail++;
  const status = r.loadError ? "LOAD!" : ok ? "PASS" : "FAIL";
  const calls = r.loadError ? r.loadError : r.calls.join(" ");
  console.log(`${status.padEnd(6)} ${r.file.padEnd(28)} ${calls.padEnd(32)} ${r.validate || (ok ? "n/a" : "-")}`);
  if (!ok) {
    // ilk basarisiz cagrinin fetch akisi + son loglar
    const firstFail = MATRIX.find((t) => (r[`logs_${t.label}`] || []).length >= 0 && r.calls.some((c) => c.startsWith(t.label + "=0") || c.startsWith(t.label + "=ERR")));
    const lg = (firstFail && r[`logs_${firstFail.label}`]) || r.logs;
    const txt = (lg || []).join(" | ").replace(/\s+/g, " ");
    if (txt) console.log(`       [${firstFail ? firstFail.label : "log"}] ${txt.slice(0, 700)}`);
  }
}
console.log(`\nPASS ${pass} / FAIL ${fail} / TOPLAM ${results.length}`);
