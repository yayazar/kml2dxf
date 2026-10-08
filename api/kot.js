// Vercel fonksiyonu: OpenTopoData'ya aracı (OpenTopoData tarayıcıya CORS izni vermiyor).
// GET /api/kot?dataset=srtm30m&locations=lat,lon|lat,lon  (en çok 100 nokta)
const IZINLI = new Set(["srtm30m", "eudem25m", "aster30m"]);
const NOKTA = /^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/;

module.exports = async function handler(req, res) {
  const { dataset, locations } = req.query || {};
  if (!IZINLI.has(dataset)) {
    return res.status(400).json({ error: "Geçersiz veri seti." });
  }
  const noktalar = typeof locations === "string" ? locations.split("|") : [];
  if (!noktalar.length || noktalar.length > 100 || !noktalar.every((n) => NOKTA.test(n))) {
    return res.status(400).json({ error: "locations: 1-100 adet 'enlem,boylam' bekleniyor." });
  }
  try {
    const yanit = await fetch(
      `https://api.opentopodata.org/v1/${dataset}?locations=${encodeURIComponent(noktalar.join("|"))}`,
      { headers: { "User-Agent": "kml2dxf (github.com/yayazar/kml2dxf)" } }
    );
    const veri = await yanit.json();
    if (yanit.ok) res.setHeader("Cache-Control", "public, s-maxage=86400");
    return res.status(yanit.status).json(veri);
  } catch (e) {
    return res.status(502).json({ error: "Kot servisine ulaşılamadı." });
  }
};
