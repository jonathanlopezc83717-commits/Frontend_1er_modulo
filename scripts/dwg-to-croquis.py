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


def gui() -> None:
    """Modo interactivo: dialogo para carpeta raiz + coords X,Y.

    Espera en la carpeta raiz un unico .dwg o .dxf. El ortomosaico de fotos
    (si existe como subcarpeta) se ignora: el croquis sale del CAD, no de las
    fotos. size fijo en 100x100 cm; para otro tamano usar el modo CLI.
    """
    import pathlib
    import tkinter as tk
    from tkinter import filedialog, simpledialog, messagebox

    root = tk.Tk()
    root.withdraw()

    carpeta = filedialog.askdirectory(
        title="Seleccione la carpeta raiz (con el .dwg/.dxf)")
    if not carpeta:
        return

    cad = sorted(pathlib.Path(carpeta).glob("*.dwg")) \
        + sorted(pathlib.Path(carpeta).glob("*.dxf"))
    if not cad:
        messagebox.showerror("Croquis", f"No hay .dwg/.dxf en:\n{carpeta}")
        return
    if len(cad) > 1:
        messagebox.showerror(
            "Croquis",
            f"Hay {len(cad)} archivos CAD en la raiz. Deje solo uno:\n{carpeta}")
        return
    archivo = str(cad[0])

    x = simpledialog.askfloat("Croquis", "Coordenada X del punto (cm):",
                              parent=root)
    if x is None:
        return
    y = simpledialog.askfloat("Croquis", "Coordenada Y del punto (cm):",
                              parent=root)
    if y is None:
        return

    # ponytail: size 100 fijo (usuario pidio 100x100). Para otro tamano, modo CLI --size.
    SIZE_GUI = 100.0
    es_dwg = archivo.lower().endswith(".dwg")
    dxf = dwg_a_dxf(archivo) if es_dwg else archivo
    try:
        out = os.path.splitext(archivo)[0] + "_croquis.png"
        renderizar(dxf, x, y, SIZE_GUI, out, dpi=150, anclar_esquina=False)
    except Exception as e:
        messagebox.showerror("Croquis", f"Error al renderizar:\n{e}")
        return
    finally:
        if es_dwg:
            os.unlink(dxf)
    kb = os.path.getsize(out) / 1024
    messagebox.showinfo(
        "Croquis",
        f"OK: {os.path.basename(out)}\n{kb:.1f} KB - "
        f"ventana 100x100 cm en ({x},{y})\nGuardado en:\n{out}")


def _seleccionar_multiple(titulo, opciones, parent):
    """Dialogo multiselect. Devuelve lista de indices elegidos, o [] si cancela."""
    import tkinter as tk
    top = tk.Toplevel(parent)
    top.title(titulo)
    top.transient(parent)
    lb = tk.Listbox(top, selectmode="multiple",
                    height=min(25, len(opciones)), width=72)
    for op in opciones:
        lb.insert("end", op)
    lb.pack(fill="both", expand=True, padx=8, pady=8)
    sel = []

    def ok():
        sel.extend(lb.curselection())
        top.destroy()
    fr = tk.Frame(top)
    fr.pack(pady=4)
    tk.Button(fr, text="Procesar", command=ok).pack(side="left", padx=8)
    tk.Button(fr, text="Cancelar", command=top.destroy).pack(side="left", padx=8)
    top.grab_set()
    parent.wait_window(top)
    return sel


def gui_batch() -> None:
    """Modo batch: croquis para varios puntos leyendo X,Y de Excels.

    Carpeta raiz: 1 CAD (.dwg/.dxf) + subcarpetas de puntos. Cada subcarpeta:
    1 Excel con nombre ^\\d+_.+_.+\\.xlsx$. Del Excel: B1=X, C1=Y. PNG 100x100
    junto al Excel. Sin limite de puntos (cuello: ~1s/PNG + 1 carga de CAD).
    """
    import re
    from tkinter import filedialog, messagebox
    import openpyxl

    PATRON = re.compile(r'^\d+_.+_.+\.xlsx$', re.IGNORECASE)
    import pathlib
    import tkinter as tk

    root = tk.Tk()
    root.withdraw()

    carpeta = filedialog.askdirectory(
        title="Carpeta raiz (CAD + subcarpetas de puntos)")
    if not carpeta:
        return

    cad = sorted(pathlib.Path(carpeta).glob("*.dwg")) \
        + sorted(pathlib.Path(carpeta).glob("*.dxf"))
    if not cad:
        messagebox.showerror("Croquis batch", f"No hay .dwg/.dxf en:\n{carpeta}")
        return
    if len(cad) > 1:
        messagebox.showerror(
            "Croquis batch",
            f"Hay {len(cad)} CAD en la raiz. Deje solo uno.")
        return
    archivo_cad = str(cad[0])

    candidatos = []
    for sub in sorted(p for p in pathlib.Path(carpeta).iterdir() if p.is_dir()):
        xl = sorted(f for f in sub.iterdir() if PATRON.match(f.name))
        if xl:
            candidatos.append((sub, xl[0]))
    if not candidatos:
        messagebox.showerror(
            "Croquis batch",
            "No hay subcarpetas con Excel con el formato #_Nombre_fecha.xlsx")
        return

    etiquetas = [f"{s.name}  <-  {x.name}" for s, x in candidatos]
    idx = _seleccionar_multiple(
        f"Subcarpetas a procesar ({len(candidatos)} con Excel valido)",
        etiquetas, root)
    if not idx:
        return
    elegidos = [candidatos[i] for i in idx]

    SIZE = 100.0
    es_dwg = archivo_cad.lower().endswith(".dwg")
    dxf = dwg_a_dxf(archivo_cad) if es_dwg else archivo_cad
    ok_list, fallos = [], []
    try:
        for sub, xl in elegidos:
            try:
                wb = openpyxl.load_workbook(str(xl), data_only=True,
                                            read_only=True)
                ws = wb.active
                bx, cy = ws['B1'].value, ws['C1'].value
                wb.close()
                if not isinstance(bx, (int, float)) or not isinstance(cy, (int, float)):
                    fallos.append(f"{sub.name}: B1/C1 no numerico ({bx!r},{cy!r})")
                    continue
                out = str(sub / (sub.name + "_croquis.png"))
                renderizar(dxf, bx, cy, SIZE, out, dpi=150,
                           anclar_esquina=False)
                kb = pathlib.Path(out).stat().st_size / 1024
                ok_list.append(f"{sub.name}: {kb:.1f}KB en ({bx},{cy})")
            except Exception as e:
                fallos.append(f"{sub.name}: {e}")
    finally:
        if es_dwg:
            os.unlink(dxf)

    resumen = f"OK {len(ok_list)}/{len(elegidos)}\n\n" + "\n".join(ok_list)
    if fallos:
        resumen += "\n\nFALLOS:\n" + "\n".join(fallos)
    messagebox.showinfo("Croquis batch", resumen)


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
    p.add_argument("--gui", action="store_true",
                   help="Modo interactivo: dialogo para carpeta raiz + coords X,Y")
    p.add_argument("--batch", action="store_true",
                   help="Modo batch: lee X,Y de Excels en subcarpetas (B1,C1)")
    a = p.parse_args()

    if len(sys.argv) == 1:
        gui()
        return
    if a.self_test:
        selftest()
        return
    if a.gui:
        gui()
        return
    if a.batch:
        gui_batch()
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
