"""Prueba de integracion de gui_batch() sin ventanas.

Monkeypatchea askdirectory / _seleccionar_multiple / messagebox.showinfo para
que el flujo corra sin interaccion. Valida todo el camino del modo --batch:
CAD compartido, descubrir subcarpetas, leer B1/C1, render por punto, resumen.
"""
import importlib.util
import pathlib
import tkinter
import tkinter.filedialog
import tkinter.messagebox

RAIZ = pathlib.Path(__file__).resolve().parent
SCRIPTS = RAIZ.parent / "scripts"
spec = importlib.util.spec_from_file_location(
    "dwg_to_croquis", SCRIPTS / "dwg-to-croquis.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

DATOS = RAIZ / "datos_batch"
capturado = []

tkinter.filedialog.askdirectory = lambda **kw: str(DATOS)
tkinter.messagebox.showerror = lambda t, m: capturado.append(("ERR", m))
tkinter.messagebox.showinfo = lambda t, m: capturado.append(("OK", m))
mod._seleccionar_multiple = lambda titulo, opciones, parent: list(range(len(opciones)))

mod.gui_batch()

for tipo, msg in capturado:
    print(f"[{tipo}]")
    print(msg)
    print("---")
