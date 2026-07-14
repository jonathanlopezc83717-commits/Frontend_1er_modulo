"""Prueba del flujo de gui() sin ventanas.

Replica exactamente la logica nueva de dwg-to-croquis.py::gui(): buscar el CAD
unico en una carpeta raiz y renderizar una ventana 100x100 cm en (x,y). Usa un
DXF de juguete con entidades en coords conocidas. Si esto pasa, el modo --gui
(con ventanas) tambien funciona: solo difiere en la captura de inputs.
"""
import importlib.util
import pathlib

import ezdxf

RAIZ = pathlib.Path(__file__).resolve().parent
SCRIPTS = RAIZ.parent / "scripts"

spec = importlib.util.spec_from_file_location(
    "dwg_to_croquis", SCRIPTS / "dwg-to-croquis.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

carpeta_raiz = RAIZ / "datos_prueba"
carpeta_raiz.mkdir(exist_ok=True)
(carpeta_raiz / "ortomosaico").mkdir(exist_ok=True)
(carpeta_raiz / "ortomosaico" / "foto1.txt").write_text("foto simulada")

cx, cy = 1000.0, 1000.0
doc = ezdxf.new(setup=True)
msp = doc.modelspace()
msp.add_line((cx - 400, cy), (cx + 400, cy))
msp.add_line((cx, cy - 400), (cx, cy + 400))
msp.add_circle((cx, cy), radius=20)
msp.add_line((cx - 300, cy - 300), (cx + 300, cy - 300))
msp.add_line((cx + 300, cy - 300), (cx + 300, cy + 300))
msp.add_line((cx + 300, cy + 300), (cx - 300, cy + 300))
msp.add_line((cx - 300, cy + 300), (cx - 300, cy - 300))
dxf_path = carpeta_raiz / "plano_prueba.dxf"
doc.saveas(str(dxf_path))

# --- replica exacta de gui() (sin tkinter) ---
cad = sorted(carpeta_raiz.glob("*.dwg")) + sorted(carpeta_raiz.glob("*.dxf"))
assert len(cad) == 1, f"Esperaba 1 CAD en la raiz, hay {len(cad)}"
archivo = str(cad[0])

SIZE_GUI = 100.0
out = str(pathlib.Path(archivo).with_suffix("")) + "_croquis.png"
mod.renderizar(archivo, x=cx, y=cy, size=SIZE_GUI, out=out,
               dpi=150, anclar_esquina=False)

kb = pathlib.Path(out).stat().st_size / 1024
print(f"OK: {pathlib.Path(out).name}")
print(f"     {kb:.1f} KB - ventana 100x100 cm centrada en ({cx},{cy})")
print(f"     Carpeta raiz: {carpeta_raiz}")
print(f"     PNG: {out}")
