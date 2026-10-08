# kml2dxf

Google Earth / GPS Visualizer kaynaklı **GPX, KML, KMZ** noktalarını **TUREF (ITRF96) 3° TM dilimlerine** (EPSG:5253–5259) çevirip **kotlu** nokta dosyası üreten araç.

Çıktılar:

| Dosya | İçerik |
|---|---|
| `.dxf` | R12 DXF. 3B `POINT` (Z = kot) + `TEXT`. Katmanlar: `NOKTA` (kırmızı), `NOKTA_NO` (yeşil), `KOT` (sarı) |
| `.ncn` | Netcad nokta dosyası: `Ad Y X Z` |
| `.csv` | `Ad,Doğu,Kuzey,Z` → Civil 3D *Import Points* → **PENZ (comma delimited)** |

## Web arayüzü

Vercel'de yayınlanır (`index.html` + `api/kot.js` fonksiyonu). Dönüşüm tarayıcıda yapılır; dosya hiçbir sunucuya yüklenmez.

Canlı: **https://kml2dxf.vercel.app**

- Dosyayı sayfanın herhangi bir yerine sürükleyip bırakın (`.kmz`, `.kml`, `.gpx`).
- Noktalar **uydu / sokak haritası** üzerinde kota göre renklendirilmiş görünür; üzerine gelince ad, Y, X, Z ve kot kaynağı çıkar.
- **Tablo** sekmesinde tüm noktalar, ada göre arama ile.
- **Hepsini indir (.zip)** ile DXF + NCN + CSV tek seferde; ya da koordinatları sekme ayraçlı olarak panoya kopyalayıp Excel / Netcad'e yapıştırın.
- Seçimler (dilim, kot kaynağı, DXF ayarları) tarayıcıda hatırlanır.
- Dilimi seçin veya **Otomatik** bırakın (ortalama boylamdan en yakın orta meridyen).
- Yazı yüksekliği, kot ondalığı, nokta adı öneki, dosyadaki adları kullanma seçenekleri vardır.
- **Eksik kotlar otomatik çekilir** (aşağıya bakın). Çekilemeyen noktalar varsayılan olarak atlanır; isterseniz Z = 0 ile alınır.

Bağımlılıklar CDN'den yüklenir: [proj4js](https://github.com/proj4js/proj4js) 2.9.0, [JSZip](https://stuk.github.io/jszip/) 3.10.1, [Leaflet](https://leafletjs.com/) 1.9.4. Harita altlığı: Esri World Imagery ve OpenStreetMap.

### Okunan veriler

- **GPX:** `wpt`, `trkpt`, `rtept` — kot `<ele>`, ad `<name>`.
- **KML/KMZ:** her `Placemark` içindeki tüm `<coordinates>` köşeleri (Point, LineString, Polygon) — `boylam,enlem,yükseklik`.

## Otomatik kot çekme

Google Earth'ten kaydedilen KML/KMZ'lerde yükseklik 0 yazılır. Kotu olmayan noktalar (ya da dosyadaki **tüm** kotlar 0 ise hepsi) seçilen sayısal yükseklik modelinden doldurulur. Servise yalnızca bu noktaların enlem/boylamı gönderilir; tabloda her noktanın kot kaynağı görünür.

| Kaynak | Çözünürlük | Nasıl çağrılır |
|---|---|---|
| SRTM (varsayılan) | 30 m | [OpenTopoData](https://www.opentopodata.org/) — `api/kot.js` aracılığıyla |
| EU-DEM | 25 m | OpenTopoData — `api/kot.js` aracılığıyla |
| ASTER GDEM | 30 m | OpenTopoData — `api/kot.js` aracılığıyla |
| Copernicus GLO-90 | 90 m | [Open-Meteo](https://open-meteo.com/en/docs/elevation-api) — doğrudan tarayıcıdan |

OpenTopoData tarayıcıya CORS izni vermediği için `api/kot.js` (Vercel fonksiyonu) aracı olarak çalışır: yalnızca bu üç veri setine, istek başına en çok 100 noktaya izin verir. Sayfa `file://` ile ya da fonksiyonu olmayan bir yerde açılırsa Open-Meteo seçilmelidir. OpenTopoData genel servisi saniyede 1 istek / günde 1000 istek sınırlıdır; sayfa 100'lük partileri 1,1 sn arayla gönderir.

Doğu Karadeniz'de 100 noktalık bir denemede GPS Visualizer kotlarına göre fark: SRTM 30 m ort. +3,6 m (std 6,2 m), EU-DEM ort. −2,6 m (std 7,1 m), Copernicus 90 m ort. −13,5 m (std 14,6 m). Engebeli arazide 90 m model belirgin biçimde kötüleşir.

## Python komut satırı

```
pip install -r python/requirements.txt
python python/gpx2dxf.py dosya.gpx [yazi_yuksekligi_m]
```

GPX → EPSG:5258 (TM42) DXF/NCN/CSV üretir; çıktılar GPX'in yanına `_TM42` ekiyle yazılır.

## Yerel çalıştırma

`npx vercel dev` (fonksiyonla birlikte) ya da yalnızca `index.html`'i açıp kot kaynağı olarak Open-Meteo seçin.

## Test

```
npm install
npm test
```

Dönüşüm sonuçları pyproj (EPSG:4326 → EPSG:5256/5258) referans değerleriyle 1 mm toleransla karşılaştırılır; kot çekme ve `api/kot.js` sahte servislerle sınanır.

## Uyarı

Google kaynaklı kotlar birkaç metre hata içerebilir. Ön etüt ve güzergâh denemesi içindir; proje kotu yerine geçmez.
