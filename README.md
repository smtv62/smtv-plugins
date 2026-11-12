# smTV Plugins

smTV One icin ozel Nuvio JS eklentileri — tek depoda birden fazla kaynak.

## Eklentiler

| Eklenti | ID | Icerik | Arama | Durum | Kaynak |
|---|---|---|---|---|---|
| HDFilmCehennemi | hdfilmcehennemi | film + dizi | evet | aktif | smTV (ozel yazim) |
| patronDizipal | patron-dizipal | film + dizi | hayir | aktif | @patr0n |
| patronDiziyou | patron-diziyou | dizi | hayir | aktif | @patr0n |
| patronJetFilmizle | patron-jet-filmizle | film | hayir | aktif | @patr0n |
| PatronHDFilmDelisi | patron-hdfilmdelisi | film + dizi | hayir | aktif | @patr0n |
| FilmEkseni | manitux-filmekseni | film + dizi | evet | aktif | manitux |
| DiziBal | manitux-dizibal | film + dizi | evet | aktif | manitux |

Katalog destekli (ev satirlari icin): FilmEkseni, DiziBal.

## Kurulum (smTV One)

Ayarlar → Icerik & Kesfet → Eklentiler → Depolar → **Depo ekle**:

```
https://raw.githubusercontent.com/smtv62/smtv-plugins/main/manifest.json
```

smTV One bu depoyu varsayilan olarak kurar ve silinmesini engeller.

## Menşe (provenance)

Provider dosyalarinin cogu su upstream depolardan alinmis ve smTV test
suite'inden gecmistir (kişisel kullanim):
- `patr0nq/nuvioaddons` — @patr0n'un Nuvio eklentileri (patron-*.js)
- `manitux-app/nuvio-test-plugins` — manitux'un Nuvio eklentileri (filmekseni.js, dizibal.js)

`hdfilmcehennemi.js` smTV tarafindan yazilmistir. U upstream'te LICENSE yok;
tum attribution manifest aciklamalarinda korunur. Yalnizca kisisel kullanim.

Smoke testte elenen upstream kaynaklari (bu depoya ALINMADI):
- patronhdfcehennemi — olu `.nl` domain (403); hdfilmcehennemi'nin kopyasi
- patronFullHDFilmizlesene — Cloudflare 403
- patronAsyaAnimeleri — TMDB HTML 403
- patronFilmMakinesi / manitux filmmakinesi — site icerik bulamiyor
- patron666Film, patronDizify, patronFilmEkseni, patronSetfilm, patronSinemacx — smoke testte basarisiz
- patronSelcukFlix — kararsiz (icerik buluyor, ekstraktor bazen 0 stream donduruyor)

## Kaynaklar (bot bakimli)

Aktif domainler `domains.json` icinde tutulur (duz `{ "anahtar": "https://alanadi" }`
listesi;16 kaynak). GitHub Actions botu (`.github/workflows/domain-monitor.yml`)
6 saatte bir tum listeyi healthcheck ile tarar; olum varsa once redirect zincirini
izler, sonra kesif (www / numarali desen / TLD) ve dis liste (patr0nq siteurl.txt)
ile yeni adayi ayni kuralla dogrular, bulursa `domains.json`'i guncelleyip
commit'ler. Eklenti her calismada kendi anahtariyla listeyi okur, okunamazsa
gobukteki varsayilana duser.

Kurallar (healthcheck path/expect, durum kodlari, dis liste eslesmeleri)
`domains.rules.json` dosyasindadir — bot haricinde kimse okumaz.

Yeni kaynak ekleme:
1. `providers/<dosya>.js` ekle (PluginRuntime API: fetch + cheerio/crypto-js require).
2. `manifest.json`'a scraper kaydi ekle (id benzersiz olmali).
3. `node test/run-tests.mjs` ile smoke testten gecir.

## Gelendirme

```
npm i                                 # test bagimliliklari (cheerio, crypto-js)
node test/run-tests.mjs               # yerel test (Node 18+; film+dizi+arama + tum provider smoke)
node test/check-all.mjs               # kapsamli provider saglik testi (TMDB anahtari gerekir)
python scripts/domain_monitor.py      # domain saglik kontrolu + guncelleme (curl_cffi)
```

Test, eklenti ortamini PluginRuntime.kt'ye sadik taklit eder: `require`
sadece cheerio/crypto-js bilir, fetch'e browser User-Agent eklenir.
