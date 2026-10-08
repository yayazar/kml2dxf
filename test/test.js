// node test/test.js  — çekirdek mantığı pyproj referans değerlerine karşı sınar
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const proj4 = require("proj4");
const { DOMParser } = require("@xmldom/xmldom");
const K2D = require("../core.js");

const ayar = { yaziBoyu: 1, kotOndalik: 2, onek: "P", dosyaAdlari: false, noYaz: true, kotYaz: true, kotsuzlariAl: false };
const yakin = (a, b, tol = 0.001) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);

// 1) GPX: trkpt + wpt, ele; referans pyproj EPSG:4326 -> EPSG:5258
const gpx = fs.readFileSync(path.join(__dirname, "ornek.gpx"), "utf8");
const g = K2D.xmlOku(gpx, DOMParser);
assert.strictEqual(g.tur, "GPX");
assert.strictEqual(g.noktalar.length, 3);
assert.strictEqual(K2D.otomatikDilim(g.noktalar).epsg, 5258);
const r = K2D.donustur(g.noktalar, 42, proj4, ayar);
assert.strictEqual(r.atlanan, 1); // kotsuz nokta atlanır
// sıra: önce wpt, sonra trkpt
yakin(r.noktalar[0].y, 525543.2800); yakin(r.noktalar[0].x, 4451779.5046); yakin(r.noktalar[0].z, 1500);
yakin(r.noktalar[1].y, 457932.3320); yakin(r.noktalar[1].x, 4540693.7156); yakin(r.noktalar[1].z, 2100.748);
assert.strictEqual(K2D.donustur(g.noktalar, 42, proj4, { ...ayar, kotsuzlariAl: true }).noktalar.length, 3);
assert.strictEqual(K2D.donustur(g.noktalar, 42, proj4, { ...ayar, dosyaAdlari: true }).noktalar[0].ad, "Kırmızı Tepe");

// 2) KML: Point + LineString, lon,lat,alt; EPSG:5256 referansı
const kml = fs.readFileSync(path.join(__dirname, "ornek.kml"), "utf8");
const k = K2D.xmlOku(kml, DOMParser);
assert.strictEqual(k.tur, "KML");
assert.strictEqual(k.noktalar.length, 3);
assert.strictEqual(k.noktalar[0].ad, "Nokta1");
assert.strictEqual(k.noktalar[2].ad, "Hat_2");
const rk = K2D.donustur(k.noktalar, 36, proj4, ayar);
yakin(rk.noktalar[0].y, 517779.0037); yakin(rk.noktalar[0].x, 4107627.5504); yakin(rk.noktalar[0].z, 950.5);

// 3) Çıktılar
const adli = K2D.donustur(g.noktalar, 42, proj4, { ...ayar, dosyaAdlari: true }).noktalar;
const dxf = K2D.dxfYaz(adli, ayar);
fs.mkdirSync(path.join(__dirname, "cikti"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "cikti", "test.dxf"), dxf);
assert.ok(dxf.includes("\\U+0131")); // "Kırmızı" -> \U+0131
const ncn = K2D.ncnYaz(r.noktalar).split("\r\n")[0];
assert.strictEqual(ncn, "P1 525543.280 4451779.505 1500.000");
assert.strictEqual(K2D.csvYaz(r.noktalar).split("\r\n")[0], "P1,525543.280,4451779.505,1500.000");

assert.throws(() => K2D.xmlOku("<foo/>", DOMParser), /Tanınmayan/);
// 4) Eksik kot tespiti ve otomatik kot çekme (sahte servis)
assert.deepStrictEqual(K2D.eksikKotlar(g.noktalar), [2]); // yalnızca kotsuz trkpt
const sifir = [{ lat: 41, lon: 41, z: 0 }, { lat: 41.1, lon: 41.1, z: 0 }];
assert.deepStrictEqual(K2D.eksikKotlar(sifir), [0, 1]); // hepsi 0 -> Google Earth, hepsi eksik
assert.deepStrictEqual(K2D.eksikKotlar([{ z: 0 }, { z: 12 }]), []); // tek 0 gerçek kot sayılır

(async () => {
  // OpenTopoData biçimi, 250 nokta -> 3 parti (100/100/50), bir nokta kapsam dışı
  const cok = Array.from({ length: 250 }, (_, i) => ({ lat: 40 + i / 1000, lon: 41, z: null }));
  const urller = [];
  const dolan = await K2D.kotCek(cok, cok.map((_, i) => i), "srtm30m", async (url) => {
    urller.push(url);
    const loc = decodeURIComponent(url.split("locations=")[1]).split("|");
    return { results: loc.map((l, k) => ({ elevation: urller.length === 1 && k === 0 ? null : 1000 + k })) };
  }, { bekleMs: 0 });
  assert.strictEqual(urller.length, 3);
  assert.ok(urller[0].startsWith("/api/kot?dataset=srtm30m&locations="));
  assert.strictEqual(dolan, 249);
  assert.strictEqual(cok[0].z, null);
  assert.strictEqual(cok[1].z, 1001); assert.strictEqual(cok[1].kaynak, "srtm30m");
  assert.strictEqual(cok[249].z, 1049);

  // Open-Meteo biçimi
  const om = sifir.map((n) => ({ ...n }));
  await K2D.kotCek(om, [0, 1], "openmeteo", async (url) => {
    assert.ok(url.startsWith("https://api.open-meteo.com/v1/elevation?latitude=41.000000,41.100000&longitude="));
    return { elevation: [2081, 2119] };
  });
  assert.deepStrictEqual(om.map((n) => n.z), [2081, 2119]);
  const ro = K2D.donustur(om, 42, proj4, ayar).noktalar;
  assert.strictEqual(ro[0].kaynak, "openmeteo");

  // Servis hatası yukarı iletilir
  await assert.rejects(K2D.kotCek(om, [0], "openmeteo", async () => ({ error: true, reason: "limit" })), /limit/);

  // 5) Vercel aracı fonksiyonu
  const handler = require("../api/kot.js");
  const cagir = async (query, sahteFetch) => {
    const eski = global.fetch; global.fetch = sahteFetch;
    const res = { kod: 0, govde: null, basliklar: {}, status(k) { this.kod = k; return this; }, json(v) { this.govde = v; return this; }, setHeader(k, v) { this.basliklar[k] = v; } };
    try { await handler({ query }, res); } finally { global.fetch = eski; }
    return res;
  };
  let r1 = await cagir({ dataset: "kotu", locations: "41,41" });
  assert.strictEqual(r1.kod, 400);
  r1 = await cagir({ dataset: "srtm30m", locations: "41,41|abc" });
  assert.strictEqual(r1.kod, 400);
  r1 = await cagir({ dataset: "srtm30m", locations: Array(101).fill("41,41").join("|") });
  assert.strictEqual(r1.kod, 400);
  let giden = null;
  r1 = await cagir({ dataset: "eudem25m", locations: "41.1,41.2|41.3,41.4" }, async (url) => {
    giden = url; return { ok: true, status: 200, json: async () => ({ results: [{ elevation: 1 }, { elevation: 2 }] }) };
  });
  assert.strictEqual(r1.kod, 200);
  assert.strictEqual(giden, "https://api.opentopodata.org/v1/eudem25m?locations=41.1%2C41.2%7C41.3%2C41.4");
  r1 = await cagir({ dataset: "srtm30m", locations: "41,41" }, async () => { throw new Error("ağ"); });
  assert.strictEqual(r1.kod, 502);

  console.log("Tüm testler geçti.");
})().catch((e) => { console.error(e); process.exit(1); });
