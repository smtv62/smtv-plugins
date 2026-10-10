# smTV Plugins

smTV One icin ozel Nuvio JS eklentileri — tek depoda birden fazla kaynak.

## Eklentiler

| Eklenti | ID | Icerik | Arama | Durum | Kaynak |
|---|---|---|---|---|---|
| HDFilmCehennemi | hdfilmcehennemi | film + dizi | evet | aktif | smTV (ozel yazim) |
| PatronMulti | patron-multi | film + dizi (coklu ekstraktor) | hayir | aktif | @patr0n |
| Patron4KHDHub | patron-dort-khd | film + dizi | hayir | aktif | @patr0n |
| patronDizipal | patron-dizipal | film + dizi | hayir | aktif | @patr0n |
| patronDiziyou | patron-diziyou | dizi | hayir | aktif | @patr0n |
| patronSineWix | patron-sinewix | film + dizi | evet | aktif | @patr0n |
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

Aktif domainler `sources.json` icinde tutulur (HDFilmCehennemi icin domain
rotasyonu). GitHub Actions botu (`.github/workflows/update-sources.yml`)
6 saatte bir tum adaylari yoklar; olu aday varsa `base` guncellenir ve commit
atilir. Eklenti her calismada `sources.json` okur, okunamazsa gobukteki
varsayilana duser. Diger provider'lar kendi domain listelerini kullanir.

Yeni kaynak ekleme:
1. `providers/<dosya>.js` ekle (PluginRuntime API: fetch + cheerio/crypto-js require).
2. `manifest.json`'a scraper kaydi ekle (id benzersiz olmali).
3. `node test/run-tests.mjs` ile smoke testten gecir.

## Gelendirme

```
npm i                                 # test bagimliliklari (cheerio, crypto-js)
node test/run-tests.mjs               # yerel test (Node 18+; film+dizi+arama + tum provider smoke)
node scripts/check-sources.mjs        # domain saglik kontrolu
```

Test, eklenti ortamini PluginRuntime.kt'ye sadik taklit eder: `require`
sadece cheerio/crypto-js bilir, fetch'e browser User-Agent eklenir.
