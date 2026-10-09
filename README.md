# smTV Plugins

smTV One icin ozel Nuvio JS eklentileri.

## Eklentiler

| Eklenti | Tip | Arama | Durum |
|---|---|---|---|
| HDFilmCehennemi | film + dizi | evet | aktif |

## Kurulum (smTV One)

Ayarlar → Icerik & Kesfet → Eklentiler → Depolar → **Depo ekle**:

```
https://raw.githubusercontent.com/smtv62/smtv-plugins/main/manifest.json
```

## Kaynaklar (bot bakimli)

Aktif domainler `sources.json` icinde tutulur. GitHub Actions botu
(`.github/workflows/update-sources.yml`) 6 saatte bir tum adaylari yoklar;
olu aday varsa `base` guncellenir ve commit atilir. Eklenti her calismada
`sources.json` okur, okunamazsa gobukteki varsayilana duser.

Yeni kaynak ekleme:
1. `sources.json`'a `<kaynak-adi>` altinda `base`, `candidates`, `healthcheck` ekle.
2. `providers/<kaynak-adi>.js` yaz.
3. `manifest.json`'a scraper kaydi ekle.

## Gelendirme

```
npm i -g es yok ; node test/run-tests.mjs     # yerel test (Node 18+)
node scripts/check-sources.mjs                # domain saglik kontrolu
```
