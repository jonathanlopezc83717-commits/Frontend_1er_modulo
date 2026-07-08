"""Servidor MCP: expone la generacion de croquis (DWG/DXF -> PNG) como tool.

Reutiliza la logica de dwg-to-croquis.py (no duplica). Al ser un proceso local,
puede encadenar DWG -> DXF via LibreDWG (dwg2dxf), algo que el navegador no puede.

Registro en opencode.json:
  "mcp": {
    "croquis-cad": {
      "enabled": true,
      "type": "local",
      "command": ["<venv>/python.exe", "<repo>/scripts/mcp_croquis.py"]
    }
  }
"""
import importlib.util
import os
import pathlib

from mcp.server.fastmcp import FastMCP

_raiz = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location("dwg_to_croquis", _raiz / "dwg-to-croquis.py")
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
renderizar = _mod.renderizar
dwg_a_dxf = _mod.dwg_a_dxf

mcp = FastMCP("croquis-cad")


@mcp.tool()
def croquis_desde_cad(
    archivo: str,
    x: float,
    y: float,
    size: float = 200.0,
    salida: str = "",
) -> str:
    """Genera un PNG tipo 'croquis de localizacion' desde un DXF o DWG.

    Recorta una ventana cuadrada de `size` cm centrada en las coordenadas (x, y)
    del punto. DWG requiere LibreDWG (dwg2dxf) en PATH; si no, entrega un .dxf.

    Args:
        archivo: ruta absoluta al .dxf o .dwg.
        x: coordenada X del punto (unidades del dibujo, normalmente cm).
        y: coordenada Y del punto.
        size: lado de la ventana en cm (defecto 200 = +-100 cm por lado).
        salida: ruta del PNG de salida; si vacio, junto al archivo de entrada.

    Returns:
        Ruta del PNG generado y su tamano en KB.
    """
    es_dwg = archivo.lower().endswith(".dwg")
    dxf = dwg_a_dxf(archivo) if es_dwg else archivo
    try:
        out = salida or (os.path.splitext(archivo)[0] + "_croquis.png")
        renderizar(dxf, x, y, size, out, dpi=150, anclar_esquina=False)
    finally:
        if es_dwg:
            os.unlink(dxf)
    kb = os.path.getsize(out) / 1024
    return f"{out} ({kb:.1f} KB) - ventana {size}x{size} cm en ({x},{y})"


if __name__ == "__main__":
    mcp.run()
