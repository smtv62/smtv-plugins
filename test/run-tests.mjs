#!/usr/bin/env node
/**
 * smTV Plugins — yerel test (Node 18+; global fetch + atob kullanir).
 *
 *   node test/run-tests.mjs
 *
 * Film:  TMDB 1423191 (Resident Evil, 2026)
 * Dizi:  TMDB 95350 (Lanterns) S1E1
 * Arama: "Resident Evil"
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createContext, runInContext } from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const code = readFileSync(join(root, "providers", "hdfilmcehennemi.js"), "utf8");

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

// Plugin'i QuickJS benzeri bir sandbox icinde calistir.
const sandbox = createContext({
  console,
  fetch,
  atob,
  setTimeout,
  clearTimeout,
  URL,
  TMDB_API_KEY: key,
  module: { exports: {} },
  globalThis: undefined
});
sandbox.globalThis = sandbox;
runInContext(code, sandbox, { filename: "hdfilmcehennemi.js" });
const { getStreams, search } = sandbox.module.exports;

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

console.log("== Film: Resident Evil: Death Island (sitede mevcut, TMDB 1083862) ==");
await check("getStreams movie", async () => {
  const streams = await getStreams("1083862", "movie", null, null, null);
  console.log("  stream:", streams.length);
  for (const s of streams.slice(0, 4)) console.log("   -", s.title, "->", s.url.slice(0, 90));
  return { ok: streams.length > 0 && streams.every((s) => s.url.includes(".m3u8")) };
});

console.log("\n== Dizi: Lanterns S1E1 (TMDB 95350) ==");
await check("getStreams series", async () => {
  const streams = await getStreams("95350", "series", 1, 1, null);
  console.log("  stream:", streams.length);
  for (const s of streams.slice(0, 4)) console.log("   -", s.title, "->", s.url.slice(0, 90));
  return { ok: streams.length > 0 && streams.every((s) => s.url.includes(".m3u8")) };
});

console.log("\n== Arama: 'Resident Evil' ==");
await check("search", async () => {
  const res = await search({ query: "Resident Evil", language: "tr" });
  console.log("  item:", res.items.length);
  for (const it of res.items.slice(0, 4)) console.log("   -", it.type, it.name, it.year || "", "->", (it.url || "").slice(0, 80));
  return { ok: res.items.length > 0 && res.items.every((i) => i.id && i.name && i.type && i.url) };
});

console.log(failed ? `\n${failed} test BASARISIZ` : "\nTum testler GECTI");
process.exit(failed ? 1 : 0);
