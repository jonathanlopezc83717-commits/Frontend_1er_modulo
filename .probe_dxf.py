"""Probe: ¿qué entidades IMAGE/IMAGEDEF/XREF tiene el DXF exportado del DWG?

Uso:
    python .probe_dxf.py <ruta.dxf>
    python .probe_dxf.py <ruta.dwg>     # convierte via dwg_a_dxf primero
"""
import sys, pathlib
SCRIPTS = pathlib.Path(r'C:\Users\YOGA-01\Documents\Frontend\scripts')
import importlib.util
spec = importlib.util.spec_from_file_location("d", SCRIPTS / "dwg-to-croquis.py")
d = importlib.util.module_from_spec(spec); spec.loader.exec_module(d)

entrada = pathlib.Path(sys.argv[1])
es_dwg = entrada.suffix.lower() == ".dwg"
dxf = d.dwg_a_dxf(str(entrada)) if es_dwg else str(entrada)

import ezdxf
doc = ezdxf.readfile(dxf)
msp = doc.modelspace()

# Conteo de entidades por tipo
from collections import Counter
tipos = Counter(e.dxftype() for e in msp)
print("=== Entidades en modelspace ===")
for t, n in sorted(tipos.items(), key=lambda x: -x[1]):
    print(f"  {t:20s} {n}")

# IMAGE entities (raster embebido en DXF)
imgs = msp.query("IMAGE")
print(f"\n=== IMAGE entities: {len(imgs)} ===")
for img in imgs:
    try:
        imgdef = img.image_def
        fn = imgdef.filename if hasattr(imgdef, "filename") else "(?)"
        print(f"  - {fn}  size={img.dxf.image_size}")
    except Exception as e:
        print(f"  - err: {e}")

# IMAGEDEF_DICT entries (definiciones de imagen, incluso si no insertadas)
rootdict = doc.rootdict
print("\n=== IMAGEDEF_DICT entries ===")
try:
    imgdict = rootdict["ACAD_IMAGE_DICT"]
    count = 0
    for name in imgdict:
        e = imgdict[name]
        fn = e.dxf.get("filename", "(?)") if hasattr(e, "dxf") else "(?)"
        print(f"  - {name}: {fn}")
        count += 1
    if count == 0:
        print("  (vacio)")
except KeyError:
    print("  (no existe ACAD_IMAGE_DICT -> no hay imagenes adjuntas)")

# XREFs (BLOCK records con path externo)
print("\n=== XREF / BLOCK externos ===")
xrefs = []
for b in doc.blocks:
    try:
        # blocks XREF exponen dxf.xref_path en DXF recientes
        xp = b.dxf.get("xref_path", None) or b.dxf.get("name", "")
        if b.dxf.get("is_xref", False) or (xp and xp != b.name and pathlib.Path(xp).suffix):
            xrefs.append((b.name, xp))
    except Exception:
        pass
if xrefs:
    for n, p in xrefs[:20]:
        print(f"  - {n} => {p}")
else:
    print("  (sin XREFs detectados)")

if es_dwg:
    import os; os.unlink(dxf)
