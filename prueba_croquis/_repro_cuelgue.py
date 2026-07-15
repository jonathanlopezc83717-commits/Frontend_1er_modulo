"""Reproducir el cuelgue del --batch: Tkinter vivo durante COM."""
import importlib.util
import pathlib
import time

RAIZ = pathlib.Path(r"C:\Users\YOGA-01\Documents\Frontend")
SCRIPT = RAIZ / "server" / "croquis_com.py"
spec = importlib.util.spec_from_file_location("croquis_com", SCRIPT)
cc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cc)

cc.pythoncom.CoInitialize()
print("[1] CoInitialize OK", flush=True)

# Simular lo que hace _batch_gui: crear tk.Tk() para pickers y destruirlo
import tkinter as tk
root = tk.Tk(); root.withdraw()
print("[2] Primer tk.Tk() creado y withdraw (como _batch_gui)", flush=True)
root.destroy()
print("[3] root.destroy() OK", flush=True)

# Simular lo que hace _procesar_batch_gui: crear SEGUNDO tk.Tk() vivo
top = tk.Tk()
top.withdraw()
print("[4] Segundo tk.Tk() creado (como _procesar_batch_gui, queda vivo)", flush=True)

t0 = time.time()
print("[5] Llamando conectar_autocad() con tk.Tk() vivo...", flush=True)
try:
    acad = cc.conectar_autocad()
    print(f"[6] conectar_autocad OK en {int(time.time()-t0)}s: {acad.Version}", flush=True)
except Exception as e:
    print(f"[6] FAIL en {int(time.time()-t0)}s: {e}", flush=True)
top.destroy()
