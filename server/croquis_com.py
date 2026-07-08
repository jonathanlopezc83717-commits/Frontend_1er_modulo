"""Croquis de localizacion via AutoCAD COM.

Servicio que captura un area cuadrada centrada en (x, y) del DWG, usando la
instancia de AutoCAD ya abierta (pywin32). Reemplaza al MCP headless para los
DWG cuyo render WYSIWYG real importa.

Flujo:
    codigo (en nombre de archivo/carpeta) -> Supabase (numero_serie) -> (x,y)
    -> AutoCAD: Open DWG -> ZoomWindow -> PNGOUT -> cerrar sin guardar

Dependencias:  pywin32  (pip install pywin32)
Requiere:      AutoCAD (32/64) corriendo en esta maquina (Windows).
Config (env):  SUPABASE_URL, SUPABASE_ANON_KEY, CROQUIS_SIZE_CM (def 200),
               CROQUIS_PROGID (def "AutoCAD.Application")
"""

import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

import pythoncom
import win32com.client


def _pto(x: float, y: float, z: float = 0.0):
    """Punto 3D como VARIANT(VT_ARRAY|VT_R8) que exige la API COM de AutoCAD."""
    return win32com.client.VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_R8, (x, y, z))


def conectar_autocad(prog_id: str | None = None):
    """Se adhiere a la instancia de AutoCAD abierta; si no hay, lanza una nueva."""
    pid = prog_id or os.environ.get("CROQUIS_PROGID", "AutoCAD.Application")
    try:
        acad = win32com.client.GetActiveObject(pid)
    except Exception:
        acad = win32com.client.Dispatch(pid)
    acad.Visible = True
    return acad


def capturar_croquis(
    archivo_dwg: str,
    x: float,
    y: float,
    salida_png: str,
    size_cm: float | None = None,
    acad=None,
) -> tuple[str, int]:
    """Abre el DWG, recorta size_cm x size_cm centrado en (x,y) y exporta PNG.

    Devuelve (ruta_png, kilobytes). Lanza si AutoCAD reporta error.
    ponytail: PNGOUT usa la resolucion de pantalla actual; para DPI fijo usar
    PLOT a configuracion PNG (mas codigo) si la salida sale borrosa.
    """
    size = float(size_cm or os.environ.get("CROQUIS_SIZE_CM", 200))
    half = size / 2.0
    propio = acad is None
    acad = acad or conectar_autocad()
    doc = None
    filedia_prev = 0
    try:
        doc = acad.Documents.Open(os.path.abspath(archivo_dwg))
        # Ventana cuadrada centrada en (x, y), plano Z=0.
        acad.ZoomWindow(_pto(x - half, y - half), _pto(x + half, y + half))
        # PNGOUT sin dialogo: ruta por linea de comandos.
        filedia_prev = doc.GetVariable("FILEDIA")
        doc.SetVariable("FILEDIA", 0)
        out = os.path.abspath(salida_png).replace("\\", "/")
        # ponytail: SendCommand via LISP; comillas dobles y '/' evitan escapes.
        doc.SendCommand(f'(command "_.PNGOUT" "{out}")\n')
        # Esperar a que AutoCAD escriba el archivo (export es async).
        limite = time.time() + 15
        while time.time() < limite and not os.path.exists(out):
            time.sleep(0.2)
        if not os.path.exists(out):
            raise RuntimeError("AutoCAD no genero el PNG (¿version sin PNGOUT?)")
        kb = os.path.getsize(out) // 1024
        return out, kb
    finally:
        try:
            if doc is not None:
                if filedia_prev is not None:
                    doc.SetVariable("FILEDIA", filedia_prev)
                doc.Close(False)
        except Exception:
            pass
        if propio:
            try:
                acad.Quit()
            except Exception:
                pass


def resolver_coords(supabase_url: str, supabase_key: str, codigo: int):
    """(x, y) del punto desde Supabase por numero_serie (join a coordenadas_gps).

    Devuelve (coordenada_x, coordenada_y) en unidades del dibujo o None.
    """
    url = (
        f"{supabase_url.rstrip('/')}/rest/v1/puntos_ferroviarios"
        f"?select=numero_serie,coordenadas_gps(coordenada_x,coordenada_y)"
        f"&numero_serie=eq.{int(codigo)}&limit=1"
    )
    req = urllib.request.Request(
        url,
        headers={
            "apikey": supabase_key,
            "Authorization": f"Bearer {supabase_key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        data = json.load(r)
    if not data:
        return None
    coords = data[0].get("coordenadas_gps") or []
    if not coords:
        return None
    c = coords[0]
    return float(c["coordenada_x"]), float(c["coordenada_y"])


def extraer_codigo(ruta: str) -> int | None:
    """Primer entero del nombre de archivo o carpeta -> numero_serie.
    ponytail: heuristica de naming; ajustar el regex a la convencion del NAS.
    """
    m = re.search(r"\d+", Path(ruta).name)
    return int(m.group()) if m else None


def _demo():
    """Self-check: conecta a AutoCAD (reporta version) y resuelve coords si hay env."""
    print("[demo] Conectando a AutoCAD...")
    try:
        acad = conectar_autocad()
        print(f"  OK: {acad.Version}")
    except Exception as e:
        print(f"  FAIL: {e}")
        return 1
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_ANON_KEY")
    if url and key:
        cod = int(os.environ.get("CROQUIS_DEMO_CODIGO", "1"))
        print(f"[demo] Resolviendo coords para numero_serie={cod}...")
        xy = resolver_coords(url, key, cod)
        print(f"  -> {xy}" if xy else "  -> no encontrado")
    return 0


def main(argv):
    """Uso:
      python croquis_com.py                              # self-check (conecta AutoCAD)
      python croquis_com.py <dwg> --xy <x> <y> [salida]  # coords directas (calibracion)
      python croquis_com.py <dwg> <codigo> [salida]      # resuelve coords por Supabase
    """
    if not argv:
        print(__doc__)
        return _demo()
    dwg = argv[0]
    if len(argv) >= 4 and argv[1] == "--xy":
        x, y = float(argv[2]), float(argv[3])
        salida = argv[4] if len(argv) > 4 else str(Path(dwg).with_suffix(".png"))
        print(f"[calibracion] Capturando {dwg} en ({x}, {y})...")
        out, kb = capturar_croquis(dwg, x, y, salida)
        print(f"OK: {out} ({kb} KB)")
        return 0
    codigo = int(argv[1]) if len(argv) > 1 else extraer_codigo(dwg)
    salida = argv[2] if len(argv) > 2 else str(Path(dwg).with_suffix(".png"))
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_ANON_KEY")
    if not (url and key):
        print("Falta SUPABASE_URL / SUPABASE_ANON_KEY en el entorno.")
        return 2
    if codigo is None:
        print(f"No se pudo extraer codigo de: {dwg}")
        return 2
    xy = resolver_coords(url, key, codigo)
    if not xy:
        print(f"Punto numero_serie={codigo} sin coordenadas en Supabase.")
        return 3
    x, y = xy
    print(f"Capturando {dwg} en ({x}, {y})...")
    out, kb = capturar_croquis(dwg, x, y, salida)
    print(f"OK: {out} ({kb} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
