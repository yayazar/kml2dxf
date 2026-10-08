"""GPX (trkpt/wpt + ele) -> EPSG:5258 (TUREF/TM42) kotlu nokta dosyalari: DXF, NCN, CSV."""
import sys
import math
import xml.etree.ElementTree as ET
from pathlib import Path

import ezdxf
from pyproj import Transformer

src = Path(sys.argv[1])
out = src.with_name(src.stem + "_TM42")
yazi_h = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0

ns = {"g": "http://www.topografix.com/GPX/1/1"}
root = ET.parse(src).getroot()
pts = root.findall(".//g:trkpt", ns) + root.findall(".//g:wpt", ns) + root.findall(".//g:rtept", ns)

tr = Transformer.from_crs("EPSG:4326", "EPSG:5258", always_xy=True)
rows = []
for i, p in enumerate(pts, 1):
    lat, lon = float(p.get("lat")), float(p.get("lon"))
    ele = p.find("g:ele", ns)
    if ele is None:
        continue
    e, n = tr.transform(lon, lat)
    rows.append((f"P{i}", e, n, float(ele.text)))

doc = ezdxf.new("R2010", setup=True)
doc.header["$PDMODE"] = 3
doc.header["$PDSIZE"] = yazi_h * 0.6
doc.header["$INSUNITS"] = 6  # metre
for ad, renk in (("NOKTA", 1), ("NOKTA_NO", 3), ("KOT", 2)):
    doc.layers.add(ad, color=renk)
msp = doc.modelspace()
for ad, e, n, z in rows:
    msp.add_point((e, n, z), dxfattribs={"layer": "NOKTA"})
    msp.add_text(ad, height=yazi_h, dxfattribs={"layer": "NOKTA_NO"}).set_placement((e + yazi_h * 0.5, n + yazi_h * 0.3, z))
    msp.add_text(f"{z:.2f}", height=yazi_h, dxfattribs={"layer": "KOT"}).set_placement((e + yazi_h * 0.5, n - yazi_h * 1.3, z))
doc.saveas(out.with_suffix(".dxf"))

# Netcad NCN: Ad Y(saga) X(yukari) Z
with open(out.with_suffix(".ncn"), "w", encoding="utf-8") as f:
    for ad, e, n, z in rows:
        f.write(f"{ad} {e:.3f} {n:.3f} {z:.3f}\n")
# Civil 3D / genel CSV: Nokta, Saga(E), Yukari(N), Z -> Civil 3D'de "PENZ (comma delimited)"
with open(out.with_suffix(".csv"), "w", encoding="utf-8") as f:
    for ad, e, n, z in rows:
        f.write(f"{ad},{e:.3f},{n:.3f},{z:.3f}\n")

es, ns_, zs = [r[1] for r in rows], [r[2] for r in rows], [r[3] for r in rows]
dmin = min(math.dist(rows[k][1:3], rows[k + 1][1:3]) for k in range(len(rows) - 1)) if len(rows) > 1 else 0
print(f"{len(rows)} nokta / {len(pts)} GPX noktasi")
print(f"Y(saga) {min(es):.2f} .. {max(es):.2f}")
print(f"X(yukari) {min(ns_):.2f} .. {max(ns_):.2f}")
print(f"Z {min(zs):.2f} .. {max(zs):.2f}")
print(f"ardisik en kisa aralik {dmin:.2f} m")
print("ilk nokta:", rows[0])
print("cikti:", out.with_suffix(".dxf"))
