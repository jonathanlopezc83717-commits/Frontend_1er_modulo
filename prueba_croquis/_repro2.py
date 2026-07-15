"""Repro 2: llamar a _procesar_batch_gui (path real del --batch) con valores fijos.
Redirige stderr para ver el progreso real aunque _Tee capture stdout."""
import importlib.util
import pathlib
import sys
import time

RAIZ = pathlib.Path(r"C:\Users\YOGA-01\Documents\Frontend")
SCRIPT = RAIZ / "server" / "croquis_com.py"
spec = importlib.util.spec_from_file_location("croquis_com", SCRIPT)
cc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cc)

# Monkeypatch _Tee.write para que TAMBIEN escriba a stderr (visible siempre)
def _run():
    cc.pythoncom.CoInitialize()
    DWG = r"C:\Users\YOGA-01\Documents\Carpeta Raiz\OIC-PLA-003.dwg"
    REFS = r"C:\Users\YOGA-01\Documents\Carpeta Raiz\Ortomosaico"
    PUNTOS = [r"C:\Users\YOGA-01\Documents\Carpeta Raiz\Emma 20_01_2026"]
    t0 = time.time()
    print(f"[repro2] llamando _procesar_batch_gui (n_por_sub=1)...", file=sys.stderr, flush=True)
    cc._procesar_batch_gui(DWG, REFS, PUNTOS, n_por_sub=1, output_dir=None)
    print(f"[repro2] terminado en {int(time.time()-t0)}s", file=sys.stderr, flush=True)

_run()
