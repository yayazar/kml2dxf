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
console.log("Tüm testler geçti.");
