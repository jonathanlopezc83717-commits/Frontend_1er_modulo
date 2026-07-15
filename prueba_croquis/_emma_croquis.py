"""Prueba: captura del croquis de Emma abriendo AutoCAD en frio.

Wrapper sobre server/croquis_com.py. Amplia el budget de _esperar_idle a 15 min
porque el arranque en frio + carga de 1.4 GB de ECW supera los 5 min por defecto.
"""
import os
import sys
import time
import importlib.util
import pathlib

RAIZ = pathlib.Path(r"C:\Users\YOGA-01\Documents\Frontend")
SCRIPT = RAIZ / "server" / "croquis_com.py"

spec = importlib.util.spec_from_file_location("croquis_com", SCRIPT)
cc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cc)

# Ampliar budget de idle: arranque en frio + ECW pesado.
_orig_idle = cc._esperar_idle
def _idle_largo(acad, budget_s=900):
    return _orig_idle(acad, budget_s)
cc._esperar_idle = _idle_largo

DWG = r"C:\Users\YOGA-01\Documents\Carpeta Raiz\OIC-PLA-003.dwg"
REFS = r"C:\Users\YOGA-01\Documents\Carpeta Raiz\Ortomosaico"
PUNTO = r"C:\Users\YOGA-01\Documents\Carpeta Raiz\Emma 20_01_2026"
SALIDA = os.path.join(PUNTO, "Emma 20_01_2026.png")

# Centro del primer punto del CSV (EUR1): B1=561009.175, C1=2090622.274
X, Y = 561009.175, 2090622.274

if __name__ == "__main__":
    cc.pythoncom.CoInitialize()
    os.environ["CROQUIS_KEEP_OPEN"] = "1"  # dejar el DWG abierto tras capturar
    print(f"[emma] DWG      = {DWG}", flush=True)
    print(f"[emma] centro   = ({X}, {Y})", flush=True)
    print(f"[emma] refs     = {REFS}", flush=True)
    print(f"[emma] salida   = {SALIDA}", flush=True)
    print("[emma] conectando a AutoCAD (arranque en frio si hace falta)...", flush=True)
    t0 = time.time()
    try:
        out, kb = cc.capturar_croquis(DWG, X, Y, SALIDA, refs_folder=REFS)
        print(f"[emma] OK en {int(time.time()-t0)}s -> {out} ({kb} KB)", flush=True)
        sys.exit(0)
    except Exception as e:
        print(f"[emma] FAIL en {int(time.time()-t0)}s -> {e}", flush=True)
        import traceback
        traceback.print_exc()
        sys.exit(1)
