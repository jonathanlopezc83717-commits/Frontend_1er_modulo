"""Diagnostico: inspecciona la instancia viva de AutoCAD."""
import importlib.util
import pathlib

RAIZ = pathlib.Path(r"C:\Users\YOGA-01\Documents\Frontend")
SCRIPT = RAIZ / "server" / "croquis_com.py"
spec = importlib.util.spec_from_file_location("croquis_com", SCRIPT)
cc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cc)

cc.pythoncom.CoInitialize()
acad = cc.conectar_autocad()
print(f"Version: {acad.Version}", flush=True)
print(f"Visible: {acad.Visible}", flush=True)
docs = acad.Documents
n = cc._com(lambda: docs.Count)
print(f"Documentos abiertos: {n}", flush=True)
for i in range(n):
    d = cc._com(lambda: docs.Item(i))
    print(f"  [{i}] Name={cc._com(lambda: d.Name)!r} FullName={cc._com(lambda: d.FullName)!r}", flush=True)
print(f"ActiveDocument: {cc._com(lambda: acad.ActiveDocument.Name)!r}", flush=True)
