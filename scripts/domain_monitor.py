#!/usr/bin/env python3
"""domain-monitor — smtv-plugins domains.json bakim botu.

Akis (kural: redirect > kesif > dis liste):
  1) domains.json'daki her adres healthcheck kuraliyla (domains.rules.json) taranir.
  2) 301/302 zinciri yeni domaine gidiyorsa ve hedef kurali geciyorsa -> GUNCELLE.
  3) Domain oluysa kesif denenir (www varyantlari -> patr0nq siteurl.txt ->
     numarali desen -> TLD rotasyonu); aday her zaman ayni kural + parked
     marker kontrolunden gecer (cikti =200 + <title + uzunluk + parked yok).
  4) Hicbir sey bulunamazsa DEAD raporlanir; eski deger korunur (yanlis
     domain girmek listede kalmaktan kotudur).
  5) domains.json degisti dosyaya yazilir; workflow commit'ler.

Kullanici:
  python scripts/domain_monitor.py              # tara + guncelle
  python scripts/domain_monitor.py --check-only # yazmadan raporla
"""

import json
import os
import re
import sys
import time
from urllib.parse import urlsplit, urlunsplit

from curl_cffi import requests as cr

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOMAINS_PATH = os.path.join(ROOT, "domains.json")
RULES_PATH = os.path.join(ROOT, "domains.rules.json")

PATR0NQ_URL = "https://raw.githubusercontent.com/patr0nq/veriler/refs/heads/main/siteurl.txt"

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36"
)

DEFAULT_TLDS = [
    "com", "net", "org", "app", "xyz", "online", "site", "live", "tv",
    "icu", "cam", "buzz", "rest", "click", "pro", "top", "one", "cc",
    "info", "now", "fun", "monster", "quest", "cool", "sbs", "beauty",
    "tc", "ws", "me", "club", "store", "shop", "autos", "lease",
]

PARKED_MARKERS = [
    "domain is for sale", "buy this domain", "domain for sale",
    "parked", "sedo", "godaddy", "afternic", "dan.com",
    "is parked", "domain parking",
]


def log(msg):
    print(msg, flush=True)


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")


def make_session():
    s = cr.Session(impersonate="chrome124")
    s.max_redirects = 10
    s.headers.update({"User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8"})
    return s


def probe(session, base, rule, timeout=20):
    """(ok, final_origin, status, note). Expect sadece 200'de kontrol edilir."""
    path = rule.get("path", "/")
    url = base.rstrip("/") + (path if path.startswith("/") else "/" + path)
    alive = rule.get("alive", [200])
    expect = rule.get("expect", "<title")
    try:
        r = session.get(url, timeout=timeout, allow_redirects=True)
    except Exception as e:
        return False, None, None, f"ERR {type(e).__name__}"
    parts = urlsplit(r.url)
    origin = urlunsplit((parts.scheme, parts.netloc, "", "", ""))
    if r.status_code not in alive:
        return False, origin, r.status_code, f"HTTP {r.status_code}"
    if r.status_code == 200 and expect and expect not in r.text:
        return False, origin, r.status_code, f"expect miss ({expect!r})"
    return True, origin, r.status_code, "ok"


def strong_check(session, base, rule, timeout=12):
    """Kesif adaylari icin sert dogrulama: 200 + <title + uzun + parked degil."""
    ok, origin, status, note = probe(session, base, rule, timeout=timeout)
    if not ok or status != 200:
        return False, origin, note
    try:
        r = session.get(base.rstrip("/") + rule.get("path", "/"), timeout=timeout)
        text = r.text.lower()
    except Exception as e:
        return False, origin, f"ERR {type(e).__name__}"
    if "<title" not in text:
        return False, origin, "no title"
    if len(text) < 3000:
        return False, origin, "short"
    for m in PARKED_MARKERS:
        if m in text:
            return False, origin, f"parked:{m}"
    return True, origin, "ok"


def split_host(url):
    """https://www.foo.now -> ('https', 'www.foo.now', 'foo', 'now')"""
    p = urlsplit(url)
    host = p.netloc.lower()
    core = host[4:] if host.startswith("www.") else host
    bits = core.split(".")
    sld = ".".join(bits[:-1])
    tld = bits[-1]
    return p.scheme, host, sld, tld


def numbered_candidates(url):
    """dizipal2148.com -> dizipal2149.com ... (artis + kuculme)."""
    scheme, host, sld, tld = split_host(url)
    m = re.match(r"^(.*?)(\d+)$", sld)
    if not m:
        return []
    stem, num = m.group(1), int(m.group(2))
    out = []
    for n in list(range(num + 1, num + 31)) + list(range(max(1, num - 10), num)):
        out.append(f"{scheme}://{stem}{n}.{tld}")
    return out


def tld_candidates(url):
    scheme, host, sld, tld = split_host(url)
    return [f"{scheme}://{sld}.{t}" for t in DEFAULT_TLDS if t != tld]


def www_candidates(url):
    scheme, host, sld, tld = split_host(url)
    out = []
    if host.startswith("www."):
        out.append(f"{scheme}://{host[4:]}")
    else:
        out.append(f"{scheme}://www.{host}")
    return out


def patr0nq_candidates(rule):
    ext = rule.get("ext") or {}
    key = ext.get("patr0nq")
    if not key:
        return []
    try:
        r = cr.Session(impersonate="chrome124").get(PATR0NQ_URL, timeout=20)
        if r.status_code != 200:
            return []
        for line in r.text.splitlines():
            if line.startswith(key + ":"):
                val = line.split(":", 1)[1].strip().rstrip("/")
                if val.startswith("http"):
                    return [val]
    except Exception as e:
        log(f"    patr0nq okunamadi: {e}")
    return []


def main():
    check_only = "--check-only" in sys.argv
    domains = load_json(DOMAINS_PATH)
    rules = load_json(RULES_PATH)
    rules.pop("_comment", None)

    session = make_session()
    updated = {}
    report = []
    dead = []

    for key, base in domains.items():
        base = base.rstrip("/")
        rule = rules.get(key, {})
        ok, origin, status, note = probe(session, base, rule)

        if ok:
            if origin and origin.rstrip("/") != base:
                log(f"  UPDATED {key}: {base} -> {origin} (redirect)")
                updated[key] = origin.rstrip("/")
                report.append((key, "REDIRECT", origin.rstrip("/")))
            else:
                log(f"  OK {key} ({status})")
                report.append((key, "OK", base))
            continue

        log(f"  DEAD? {key} {base} ({note}) -> kesif")
        if rule.get("discover", True):
            cands = []
            cands += [(c, "www") for c in www_candidates(base)]
            cands += [(c, "ext") for c in patr0nq_candidates(rule)]
            cands += [(c, "num") for c in numbered_candidates(base)]
            cands += [(c, "tld") for c in tld_candidates(base)]
            found = None
            for i, (cand, how) in enumerate(cands[:50]):
                time.sleep(0.2)
                good, origin2, note2 = strong_check(session, cand, rule)
                if good:
                    found = (origin2.rstrip("/"), how)
                    break
            if found:
                log(f"  FOUND {key}: {found[0]} ({found[1]})")
                updated[key] = found[0]
                report.append((key, f"DISC:{found[1]}", found[0]))
                continue

        log(f"  DEAD {key} — manuel bakim gerekli (eski deger korundu)")
        dead.append(key)
        report.append((key, "DEAD", base))

    if updated and not check_only:
        for k, v in updated.items():
            domains[k] = v
        save_json(DOMAINS_PATH, domains)
        log(f"\n{len(updated)} guncelleme domains.json'a yazildi.")
    elif updated:
        log("\n(check-only) yazilmadi.")

    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as f:
            f.write("## domain-monitor raporu\n\n")
            f.write("| key | durum | son adres |\n|---|---|---|\n")
            for k, state, v in report:
                f.write(f"| {k} | {state} | {v} |\n")
            if dead:
                f.write(f"\n**Olu (manuel):** {', '.join(dead)}\n")

    log(f"\nOzet: {len(report)} kaynak | guncellenen {len(updated)} | olu {len(dead)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        log(f"FATAL: {e}")
        sys.exit(1)
