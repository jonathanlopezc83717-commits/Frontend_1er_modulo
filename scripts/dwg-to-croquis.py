#!/usr/bin/env python3
"""DWG/DXF -> PNG (croquis de localizacion).

Renderiza una ventana de `size` x `size` cm (unidades del dibujo) anclada en
las coordenadas X,Y del primer punto, y entrega un PNG listo para subir al
slot "Croquis de localizacion" del modulo Formato.

Pipeline:
  DWG --(dwg2dxf de LibreDWG)--> DXF --(ezdxf + matplotlib)--> PNG
  DXF se procesa directo (AutoCAD "Guardar como DXF" tambien sirve).

Uso:
  python scripts/dwg-to-croquis.py --input pl.dxf --x 1042 --y 3318 \
      --size 100 --out croquis.png

Las unidades del DWG ya son cm, asi que `--size 100` = 100x100 cm y `--x/--y`
van en las mismas unidades que trae el modulo de sincronizacion.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import ezdxf
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend

CM_POR_PULGADA = 2.54


def dwg_a_dxf(dwg_path: str) -> str:
    """Convierte DWG->DXF via LibreDWG (dwg2dxf). Aborta con instrucciones
    claras si no esta instalado: ningun parser DWG puro funciona bien."""
    exe = shutil.which("dwg2dxf")
    if not exe:
        sys.exit(
            "ERROR: dwg2dxf (LibreDWG) no esta en PATH.\n"
            "  - Instala LibreDWG: https://www.gnu.org/software/libredwg/\n"
            "  - O exporta el DXF desde AutoCAD (Archivo > Guardar como > DXF)\n"
            "    y pasa el .dxf a --input."
        )
    tmp = tempfile.NamedTemporaryFile(suffix=".dxf", delete=False).name
    subprocess.run([exe, "-y", "-o", tmp, dwg_path], check=True,
                   capture_output=True)
    return tmp


def renderizar(dxf_path: str, x: float, y: float, size: float,
               out: str, dpi: int, anclar_esquina: bool) -> None:
    """Renderiza solo la ventana [x0,x1]x[y0,y1] preservando unidades (cm)."""
    media = size / 2.0
    x0, x1 = (x, x + size) if anclar_esquina else (x - media, x + media)
    y0, y1 = (y, y + size) if anclar_esquina else (y - media, y + media)

    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    lado_pulg = size / CM_POR_PULGADA
    fig = plt.figure(figsize=(lado_pulg, lado_pulg))
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_axis_off()

    Frontend(RenderContext(doc), MatplotlibBackend(ax)).draw_layout(msp)

    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_aspect("equal")
    fig.savefig(out, dpi=dpi)
    plt.close(fig)


def selftest() -> None:
    """Genera un DXF minimo con entidades en coords conocidas, lo renderiza
    y verifica que el PNG no este vacio. Falla si la cadena se rompe."""
    doc = ezdxf.new(setup=True)
    msp = doc.modelspace()
    msp.add_line((90, 90), (110, 110))
    msp.add_circle((100, 100), radius=5)
    doc.layers.add("CROQUIS_TEST")
    tmp = tempfile.NamedTemporaryFile(suffix=".dxf", delete=False).name
    doc.saveas(tmp)
    out = tmp.replace(".dxf", "_selftest.png")
    renderizar(tmp, x=100, y=100, size=10, out=out, dpi=72,
               anclar_esquina=False)
    kb = os.path.getsize(out) / 1024
    assert kb > 0.5, f"PNG vacio ({kb:.1f} KB)"
    os.unlink(tmp)
    os.unlink(out)
    print(f"OK self-test: PNG de {kb:.1f} KB generado correctamente.")


def main() -> None:
    p = argparse.ArgumentParser(description="DWG/DXF -> PNG croquis.")
    p.add_argument("--input", help="Ruta .dxf o .dwg")
    p.add_argument("--x", type=float, help="Coordenada X del punto (cm)")
    p.add_argument("--y", type=float, help="Coordenada Y del punto (cm)")
    p.add_argument("--size", type=float, default=100.0,
                   help="Lado de la ventana en cm (defecto: 100)")
    p.add_argument("--out", default="croquis.png", help="PNG de salida")
    p.add_argument("--dpi", type=int, default=150, help="DPI (defecto: 150)")
    p.add_argument("--esquina", action="store_true",
                   help="Anclar esquina SW en (X,Y) en vez de centrar")
    p.add_argument("--self-test", action="store_true",
                   help="Verifica la cadena de render y sale")
    a = p.parse_args()

    if a.self_test:
        selftest()
        return
    for req, nombre in ((a.input, "--input"), (a.x, "--x"), (a.y, "--y")):
        if req is None:
            sys.exit(f"Falta {nombre}. Usa --self-test para verificar.")
    es_dwg = a.input.lower().endswith(".dwg")
    dxf = dwg_a_dxf(a.input) if es_dwg else a.input
    try:
        renderizar(dxf, a.x, a.y, a.size, a.out, a.dpi, a.esquina)
    finally:
        if es_dwg:
            os.unlink(dxf)
    kb = os.path.getsize(a.out) / 1024
    print(f"OK: {a.out} ({kb:.1f} KB)  ventana {a.size}x{a.size} cm en "
          f"({a.x},{a.y})")


if __name__ == "__main__":
    main()
