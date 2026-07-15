"""Probar el launcher en frio con pickers simulados."""
import importlib.util
import pathlib

RAIZ = pathlib.Path(r"C:\Users\YOGA-01\Documents\Frontend")
spec = importlib.util.spec_from_file_location(
    "launcher", RAIZ / "server" / "croquis_batch_launcher.py")
ln = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ln)

# Pickers simulados: Carpeta Raiz + Emma, 1 punto por subcarpeta, salida junto al punto
ln._pickers = lambda: (
    r"C:\Users\YOGA-01\Documents\Carpeta Raiz\OIC-PLA-003.dwg",
    r"C:\Users\YOGA-01\Documents\Carpeta Raiz\Ortomosaico",
    [r"C:\Users\YOGA-01\Documents\Carpeta Raiz\Emma 20_01_2026"],
    1,
    None,
)
ln.main()
