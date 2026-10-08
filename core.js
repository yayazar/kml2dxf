/* kml2dxf çekirdek: GPX/KML okuma, TUREF TM dönüşümü, DXF/NCN/CSV yazımı.
   Tarayıcıda window.K2D, Node'da module.exports olarak yüklenir. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.K2D = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // TUREF (ITRF96) 3° dilimleri: EPSG kodu -> dilim orta meridyeni
  const DILIMLER = [
    { epsg: 5253, dom: 27 }, { epsg: 5254, dom: 30 }, { epsg: 5255, dom: 33 },
    { epsg: 5256, dom: 36 }, { epsg: 5257, dom: 39 }, { epsg: 5258, dom: 42 },
    { epsg: 5259, dom: 45 },
  ];

  function projTanimi(dom) {
    return `+proj=tmerc +lat_0=0 +lon_0=${dom} +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
  }

  // Ortalama boylama en yakın orta meridyen
  function otomatikDilim(noktalar) {
    const ort = noktalar.reduce((s, p) => s + p.lon, 0) / noktalar.length;
    return DILIMLER.reduce((a, b) => (Math.abs(b.dom - ort) < Math.abs(a.dom - ort) ? b : a));
  }

  function etiketler(el, ad) {
    return Array.from(el.getElementsByTagNameNS("*", ad));
  }
  function cocukMetin(el, ad) {
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === 1 && (c.localName === ad || c.nodeName === ad)) return (c.textContent || "").trim();
    }
    return null;
  }

  // GPX: wpt, trkpt, rtept (ele alanı kot)
  function gpxOku(xml) {
    const sonuc = [];
    for (const tur of ["wpt", "trkpt", "rtept"]) {
      for (const el of etiketler(xml, tur)) {
        const ele = cocukMetin(el, "ele");
        sonuc.push({
          ad: cocukMetin(el, "name") || "",
          lat: parseFloat(el.getAttribute("lat")),
          lon: parseFloat(el.getAttribute("lon")),
          z: ele === null || ele === "" ? null : parseFloat(ele),
        });
      }
    }
    return sonuc;
  }

  // KML: tüm <coordinates> köşeleri (Point, LineString, Polygon); "lon,lat[,alt]"
  function kmlOku(xml) {
    const sonuc = [];
    for (const pm of etiketler(xml, "Placemark")) {
      const ad = cocukMetin(pm, "name") || "";
      const koordlar = etiketler(pm, "coordinates");
      let sira = 0;
      for (const c of koordlar) {
        const parcalar = (c.textContent || "").trim().split(/\s+/).filter(Boolean);
        const tekNokta = koordlar.length === 1 && parcalar.length === 1;
        for (const t of parcalar) {
          const [lon, lat, alt] = t.split(",").map(Number);
          if (!isFinite(lon) || !isFinite(lat)) continue;
          sira++;
          sonuc.push({ ad: tekNokta ? ad : ad ? `${ad}_${sira}` : "", lat, lon, z: isFinite(alt) ? alt : null });
        }
      }
    }
    return sonuc;
  }

  function xmlOku(metin, DOMParserCls) {
    const xml = new DOMParserCls().parseFromString(metin, "application/xml");
    const kok = xml.documentElement;
    if (!kok || kok.nodeName === "parsererror" || etiketler(xml, "parsererror").length) {
      throw new Error("Dosya geçerli bir XML değil.");
    }
    const ad = (kok.localName || kok.nodeName).toLowerCase();
    if (ad === "gpx") return { tur: "GPX", noktalar: gpxOku(xml) };
    if (ad === "kml") return { tur: "KML", noktalar: kmlOku(xml) };
    throw new Error(`Tanınmayan kök etiketi: <${kok.nodeName}>. GPX veya KML bekleniyordu.`);
  }

  // noktalar -> {ad, y(sağa), x(yukarı), z}; proj4 dışarıdan verilir
  function donustur(noktalar, dom, proj4, ayar) {
    const p = proj4("EPSG:4326", projTanimi(dom));
    const onek = ayar.onek || "P";
    const cikti = [];
    let atlanan = 0;
    noktalar.forEach((n, i) => {
      const kotsuz = n.z === null || !isFinite(n.z);
      if (kotsuz && !ayar.kotsuzlariAl) { atlanan++; return; }
      const [y, x] = p.forward([n.lon, n.lat]);
      const ad = ayar.dosyaAdlari && n.ad ? n.ad : `${onek}${i + 1}`;
      cikti.push({ ad, y, x, z: kotsuz ? 0 : n.z, kaynak: kotsuz ? "yok" : n.kaynak || "dosya" });
    });
    return { noktalar: cikti, atlanan };
  }

  // R12 DXF: ASCII dışı karakterler (Türkçe harfler) \U+XXXX olarak yazılır
  function dxfMetin(s) {
    return Array.from(String(s)).map((ch) => {
      const k = ch.codePointAt(0);
      return k < 128 ? ch : "\\U+" + k.toString(16).toUpperCase().padStart(4, "0");
    }).join("");
  }

  const KATMANLAR = [["NOKTA", 1], ["NOKTA_NO", 3], ["KOT", 2]];

  function dxfYaz(noktalar, ayar) {
    const h = ayar.yaziBoyu;
    const L = [];
    const g = (kod, deger) => L.push(String(kod), String(deger));
    const f = (v) => v.toFixed(4);

    g(0, "SECTION"); g(2, "HEADER");
    g(9, "$ACADVER"); g(1, "AC1009");
    g(9, "$DWGCODEPAGE"); g(3, "ANSI_1254");
    g(9, "$PDMODE"); g(70, 3);
    g(9, "$PDSIZE"); g(40, f(h * 0.6));
    if (noktalar.length) {
      const ys = noktalar.map((n) => n.y), xs = noktalar.map((n) => n.x), zs = noktalar.map((n) => n.z);
      g(9, "$EXTMIN"); g(10, f(Math.min(...ys))); g(20, f(Math.min(...xs))); g(30, f(Math.min(...zs)));
      g(9, "$EXTMAX"); g(10, f(Math.max(...ys))); g(20, f(Math.max(...xs))); g(30, f(Math.max(...zs)));
    }
    g(0, "ENDSEC");

    g(0, "SECTION"); g(2, "TABLES");
    g(0, "TABLE"); g(2, "LTYPE"); g(70, 1);
    g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, "0.0");
    g(0, "ENDTAB");
    g(0, "TABLE"); g(2, "LAYER"); g(70, KATMANLAR.length);
    for (const [ad, renk] of KATMANLAR) { g(0, "LAYER"); g(2, ad); g(70, 0); g(62, renk); g(6, "CONTINUOUS"); }
    g(0, "ENDTAB");
    g(0, "ENDSEC");

    g(0, "SECTION"); g(2, "ENTITIES");
    for (const n of noktalar) {
      g(0, "POINT"); g(8, "NOKTA"); g(10, f(n.y)); g(20, f(n.x)); g(30, f(n.z));
      if (ayar.noYaz) {
        g(0, "TEXT"); g(8, "NOKTA_NO"); g(10, f(n.y + h * 0.5)); g(20, f(n.x + h * 0.3)); g(30, f(n.z)); g(40, f(h)); g(1, dxfMetin(n.ad));
      }
      if (ayar.kotYaz) {
        g(0, "TEXT"); g(8, "KOT"); g(10, f(n.y + h * 0.5)); g(20, f(n.x - h * 1.3)); g(30, f(n.z)); g(40, f(h)); g(1, n.z.toFixed(ayar.kotOndalik));
      }
    }
    g(0, "ENDSEC");
    g(0, "EOF");
    return L.join("\r\n") + "\r\n";
  }

  // Netcad NCN: Ad Y X Z (boşluk ayraçlı; addaki boşluklar _ olur)
  function ncnYaz(noktalar) {
    return noktalar.map((n) => `${n.ad.replace(/\s+/g, "_")} ${n.y.toFixed(3)} ${n.x.toFixed(3)} ${n.z.toFixed(3)}`).join("\r\n") + "\r\n";
  }

  // Civil 3D "PENZ (comma delimited)": Nokta, Doğu(Y), Kuzey(X), Z
  function csvYaz(noktalar) {
    return noktalar.map((n) => `${n.ad.replace(/,/g, "_")},${n.y.toFixed(3)},${n.x.toFixed(3)},${n.z.toFixed(3)}`).join("\r\n") + "\r\n";
  }

  // Kot kaynakları. "proxy": OpenTopoData CORS vermediği için /api/kot üzerinden çağrılır.
  const KOT_KAYNAKLARI = {
    srtm30m: { ad: "SRTM 30 m (OpenTopoData)", proxy: true },
    eudem25m: { ad: "EU-DEM 25 m (OpenTopoData)", proxy: true },
    aster30m: { ad: "ASTER 30 m (OpenTopoData)", proxy: true },
    openmeteo: { ad: "Copernicus 90 m (Open-Meteo)", proxy: false },
  };
  const PARTI = 100; // her iki servis de istek başına en çok 100 nokta alır

  // Kotu eksik noktaların sırası: z yoksa, ya da dosyadaki tüm kotlar 0 ise
  // (Google Earth "zemine yapışık" kaydeder) hepsi.
  function eksikKotlar(noktalar) {
    const yok = (n) => n.z === null || !isFinite(n.z);
    if (noktalar.length && noktalar.every((n) => yok(n) || n.z === 0)) return noktalar.map((_, i) => i);
    return noktalar.map((n, i) => (yok(n) ? i : -1)).filter((i) => i >= 0);
  }

  function kotUrl(kaynak, parti, temel) {
    if (kaynak === "openmeteo") {
      const lat = parti.map((n) => n.lat.toFixed(6)).join(",");
      const lon = parti.map((n) => n.lon.toFixed(6)).join(",");
      return `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
    }
    const loc = parti.map((n) => `${n.lat.toFixed(6)},${n.lon.toFixed(6)}`).join("|");
    return `${temel || ""}/api/kot?dataset=${kaynak}&locations=${encodeURIComponent(loc)}`;
  }

  // Eksik kotları servisten doldurur; n.z ve n.kaynak yazılır. getJson(url) -> Promise<json>.
  // Dönüş: doldurulan nokta sayısı. Servisin kapsamadığı (null) noktalar olduğu gibi kalır.
  async function kotCek(noktalar, siralar, kaynak, getJson, ayar) {
    const a = ayar || {};
    if (!KOT_KAYNAKLARI[kaynak]) throw new Error(`Bilinmeyen kot kaynağı: ${kaynak}`);
    const bekle = a.bekleMs !== undefined ? a.bekleMs : KOT_KAYNAKLARI[kaynak].proxy ? 1100 : 0;
    let dolan = 0;
    for (let i = 0; i < siralar.length; i += PARTI) {
      if (i && bekle) await new Promise((r) => setTimeout(r, bekle));
      const parti = siralar.slice(i, i + PARTI).map((s) => noktalar[s]);
      const yanit = await getJson(kotUrl(kaynak, parti, a.temel));
      const kotlar = kaynak === "openmeteo"
        ? yanit.elevation
        : (yanit.results || []).map((r) => r.elevation);
      if (!Array.isArray(kotlar) || kotlar.length !== parti.length) {
        const neden = yanit.reason || (typeof yanit.error === "string" ? yanit.error : null);
        throw new Error(neden || "Kot servisi beklenmeyen yanıt verdi.");
      }
      parti.forEach((n, k) => {
        if (kotlar[k] !== null && isFinite(kotlar[k])) { n.z = Number(kotlar[k]); n.kaynak = kaynak; dolan++; }
      });
      if (a.ilerleme) a.ilerleme(Math.min(i + PARTI, siralar.length), siralar.length);
    }
    return dolan;
  }

  return {
    DILIMLER, KOT_KAYNAKLARI, projTanimi, otomatikDilim, xmlOku, donustur, dxfYaz, ncnYaz, csvYaz,
    eksikKotlar, kotUrl, kotCek,
  };
});
