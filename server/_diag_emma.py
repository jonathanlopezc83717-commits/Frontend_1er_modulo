import os, sys, openpyxl

sys.path.insert(0, r"C:\Users\YOGA-01\Documents\Frontend\server")
import croquis_com as cc

punto = r"C:\Users\YOGA-01\Documents\Carpeta Raiz\Emma 20_01_2026"
print(f"Carpeta: {punto}")
print("Archivos:", sorted(os.listdir(punto)))
print()

xlsxs = sorted(f for f in os.listdir(punto) if f.lower().endswith(".xlsx"))
if not xlsxs:
    print("SIN XLSX")
    sys.exit(0)
xf = os.path.join(punto, xlsxs[0])
print(f"xlsx: {xlsxs[0]}  ({os.path.getsize(xf)} bytes)")
print()
wb = openpyxl.load_workbook(xf, read_only=True, data_only=True)
ws = wb.active
print(f"hojas: {wb.sheetnames}")
print(f"--- {ws.title}: primeras 12 filas, cols A-F ---")
for r_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=12,
                                min_col=1, max_col=6, values_only=True), 1):
    celdas = [("" if v is None else str(v))[:24] for v in row]
    if any(c for c in celdas):
        print(f"  fila {r_idx}: {celdas}")
wb.close()
print()
print(f"_leer_centro() = {cc._leer_centro(punto)}")
