"""Test end-to-end del launcher: _pickers real (root unico + Toplevel) + COM.
Mockea solo los dialogos nativos y _seleccionar_puntos, deja correr main()."""
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
tkinter.filedialog.askdirectory = lambda **kw: {
    "1/3 Carpeta RAIZ (con el DWG + subcarpetas de puntos)": CARPETA_RAIZ,
    "Carpeta de SALIDA (Cancelar = junto a cada subcarpeta)": "",
}.get(kw.get("title"), CARPETA_RAIZ)
tkinter.messagebox.showerror = lambda *a, **k: None
tkinter.simpledialog.askinteger = lambda *a, **k: 1
ln._seleccionar_puntos = lambda parent, raiz: [
    r"C:\Users\YOGA-01\Documents\Carpeta Raiz\Emma 20_01_2026"]

ln.main()
