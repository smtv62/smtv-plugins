#!/usr/bin/env node
/**
 * smTV Plugins — kaynak saglik kontrolu (bot).
 *
 * sources.json icindeki her kaynagin "candidates" listesini sırayla yoklar,
 * healthcheck sartina uyan ilk calisan adayi "base" olarak yazar.
 * Degisiklik olursa sources.json guncellenir ve cikis kodu 0 (commit tetiklenir).
 *
 * Kullanici:  node scripts/check-sources.mjs
 * CI:         .github/workflows/update-sources.yml (6 saatte bir + manuel)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcesPath = join(root, "sources.json");
const sources = JSON.parse(readFileSync(sourcesPath, "utf8"));

const UA = "smTV-PluginBot/1.0 (+https://github.com/smtv62/smtv-plugins)";
const TIMEOUT_MS = 15000;

async function probe(base, health) {
  const url = base.replace(/\/+$/, "") + (health?.path || "/");
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json,text/html" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    if (!r.ok) return { ok: false, reason: `HTTP ${r.status}` };
    const body = await r.text();
    if (health?.expect && !body.includes(health.expect)) {
      return { ok: false, reason: `beklenen icerik yok (${health.expect})` };
    }
    return { ok: true, reason: `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, reason: e?.message || String(e) };
  }
}

let changed = false;
let failures = 0;

for (const [name, cfg] of Object.entries(sources)) {
  const candidates = cfg.candidates || [];
  let alive = null;

  for (const cand of candidates) {
    const res = await probe(cand, cfg.healthcheck);
    console.log(`[${name}] ${cand} -> ${res.ok ? "OK" : "OLU (" + res.reason + ")"}`);
    if (res.ok) { alive = cand.replace(/\/+$/, ""); break; }
  }

  if (!alive) {
    console.error(`[${name}] HICBIR aday calismiyor!`);
    failures++;
    continue;
  }

  if (alive !== cfg.base) {
    console.log(`[${name}] base guncellendi: ${cfg.base} -> ${alive}`);
    cfg.base = alive;
    cfg.updatedAt = new Date().toISOString();
    changed = true;
  }
}

if (changed) {
  writeFileSync(sourcesPath, JSON.stringify(sources, null, 2) + "\n");
  console.log("sources.json yazildi.");
} else {
  console.log("Degisiklik yok.");
}

process.exit(failures > 0 ? 1 : 0);
