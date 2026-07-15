"""Probar _pickers del launcher con dialogos simulados (sin GUI humana).
Verifica que el root unico + Toplevel + filedialog no cuelga y retorna limpio."""
import importlib.util
import pathlib
import tkinter
import tkinter.filedialog
import tkinter.simpledialog
import tkinter.messagebox

RAIZ = pathlib.Path(r"C:\Users\YOGA-01\Documents\Frontend")
spec = importlib.util.spec_from_file_location(
    "launcher", RAIZ / "server" / "croquis_batch_launcher.py")
ln = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ln)

CARPETA_RAIZ = r"C:\Users\YOGA-01\Documents\Carpeta Raiz"
# Mocks de los dialogos nativos
tkinter.filedialog.askdirectory = lambda **kw: {
    "1/3 Carpeta RAIZ (con el DWG + subcarpetas de puntos)": CARPETA_RAIZ,
    "Carpeta de SALIDA (Cancelar = junto a cada subcarpeta)": "",  # Cancelar = junto al punto
}.get(kw.get("title"), CARPETA_RAIZ)
tkinter.messagebox.showerror = lambda *a, **k: None
tkinter.simpledialog.askinteger = lambda *a, **k: 1  # 1 punto por subcarpeta
# Mock de la seleccion de puntos (Toplevel) -> Emma
ln._seleccionar_puntos = lambda parent, raiz: [
    r"C:\Users\YOGA-01\Documents\Carpeta Raiz\Emma 20_01_2026"]

import time
t0 = time.time()
res = ln._pickers()
print(f"_pickers retorno en {int(time.time()-t0)}s: {res is not None}", flush=True)
if res:
    dwg, refs, puntos, n, salida = res
    print(f"  dwg    = {dwg}", flush=True)
    print(f"  refs   = {refs}", flush=True)
    print(f"  puntos = {puntos}", flush=True)
    print(f"  n      = {n}", flush=True)
    print(f"  salida = {salida}", flush=True)
print("OK: _pickers no colgo (root unico + Toplevel).", flush=True)
