# kml2dxf

Google Earth / GPS Visualizer kaynaklı **GPX, KML, KMZ** noktalarını **TUREF (ITRF96) 3° TM dilimlerine** (EPSG:5253–5259) çevirip **kotlu** nokta dosyası üreten araç.

Çıktılar:

| Dosya | İçerik |
|---|---|
| `.dxf` | R12 DXF. 3B `POINT` (Z = kot) + `TEXT`. Katmanlar: `NOKTA` (kırmızı), `NOKTA_NO` (yeşil), `KOT` (sarı) |
| `.ncn` | Netcad nokta dosyası: `Ad Y X Z` |
| `.csv` | `Ad,Doğu,Kuzey,Z` → Civil 3D *Import Points* → **PENZ (comma delimited)** |

## Web arayüzü

`index.html` dosyasını tarayıcıda açın (veya GitHub Pages ile yayınlayın). Her şey tarayıcıda çalışır, dosya hiçbir sunucuya gönderilmez.

- Dosyayı sürükleyip bırakın (`.gpx`, `.kml`, `.kmz`).
- Dilimi seçin veya **Otomatik** bırakın (ortalama boylamdan en yakın orta meridyen).
- Yazı yüksekliği, kot ondalığı, nokta adı öneki, dosyadaki adları kullanma seçenekleri vardır.
- Kotu olmayan noktalar varsayılan olarak atlanır; isterseniz Z = 0 ile alınır.

Bağımlılıklar CDN'den yüklenir: [proj4js](https://github.com/proj4js/proj4js) 2.9.0, [JSZip](https://stuk.github.io/jszip/) 3.10.1.

### Okunan veriler

- **GPX:** `wpt`, `trkpt`, `rtept` — kot `<ele>`, ad `<name>`.
- **KML/KMZ:** her `Placemark` içindeki tüm `<coordinates>` köşeleri (Point, LineString, Polygon) — `boylam,enlem,yükseklik`.

> Google Earth'ten kaydedilen KMZ'lerde yükseklik çoğunlukla 0'dır. Önce [GPS Visualizer](https://www.gpsvisualizer.com/) ile DEM yüksekliği eklenmiş GPX alın.

## Python komut satırı

```
pip install -r python/requirements.txt
python python/gpx2dxf.py dosya.gpx [yazi_yuksekligi_m]
```

GPX → EPSG:5258 (TM42) DXF/NCN/CSV üretir; çıktılar GPX'in yanına `_TM42` ekiyle yazılır.

## Test

```
npm install
npm test
```

Dönüşüm sonuçları pyproj (EPSG:4326 → EPSG:5256/5258) referans değerleriyle 1 mm toleransla karşılaştırılır.

## Uyarı

Google kaynaklı kotlar birkaç metre hata içerebilir. Ön etüt ve güzergâh denemesi içindir; proje kotu yerine geçmez.
