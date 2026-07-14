"""Backend HTTP para croquis: cumple el contrato de src/lib/dwg-croquis.ts.

Expone renderizar() de dwg-to-croquis.py como REST API para que el frontend
(VITE_DWG_API_URL) lo consuma. 3 endpoints:

  POST /api/indexar             {carpeta}
      -> indexa carpeta raiz: registra el CAD unico + mapeo clave->subcarpeta
  POST /api/croquis             multipart: file, x, y, ancho, alto
      -> renderiza el DWG/DXF subido, devuelve {imagen: dataURL}
  POST /api/croquis/por-clave   {clave, x, y, size}
      -> busca el CAD indexado por clave (nombre de subcarpeta), renderiza

Correr:
  python scripts/croquis_api.py
  (levanta uvicorn en 127.0.0.1:8000)

Frontend (.env):
  VITE_DWG_API_URL=http://127.0.0.1:8000/api/croquis
"""
import base64
import importlib.util
import os
import pathlib
import tempfile

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

_RAIZ = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location(
    "dwg_to_croquis", _RAIZ / "dwg-to-croquis.py")
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
renderizar = _mod.renderizar
dwg_a_dxf = _mod.dwg_a_dxf

app = FastAPI(title="croquis-cad API")
# ponytail: CORS abierto para dev local (Vite en :5173 -> API en :8000).
# En prod, restringir allow_origins al host del frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Estado en memoria: carpeta indexada + mapeo clave(nombre subcarpeta) -> DWG.
# ponytail: sin persistencia; se pierde al reiniciar. Suficiente para dev local.
_ESTADO: dict = {"carpeta": None, "puntos": {}}


class IndexarReq(BaseModel):
    carpeta: str


class PorClaveReq(BaseModel):
    clave: str
    x: float
    y: float
    size: float = 200.0


def _png_a_dataurl(out: str) -> str:
    with open(out, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _render_a_dataurl(dxf_path: str, x: float, y: float, size: float) -> str:
    out = tempfile.NamedTemporaryFile(suffix=".png", delete=False).name
    try:
        renderizar(dxf_path, x, y, size, out, dpi=150, anclar_esquina=False)
        return _png_a_dataurl(out)
    finally:
        if os.path.exists(out):
            os.unlink(out)


def _abrir_cad_como_dxf(archivo_cad: str) -> tuple[str, bool]:
    """Devuelve (ruta_dxf, es_temporal_a_borrar)."""
    if archivo_cad.lower().endswith(".dwg"):
        return dwg_a_dxf(archivo_cad), True
    return archivo_cad, False


@app.post("/api/indexar")
def indexar(req: IndexarReq):
    carpeta = pathlib.Path(req.carpeta)
    if not carpeta.is_dir():
        raise HTTPException(400, f"No es carpeta: {req.carpeta}")
    cad = sorted(carpeta.glob("*.dwg")) + sorted(carpeta.glob("*.dxf"))
    if not cad:
        raise HTTPException(400, f"No hay .dwg/.dxf en: {req.carpeta}")
    if len(cad) > 1:
        raise HTTPException(400, f"Hay {len(cad)} CAD en la raiz. Deje solo uno.")
    dwg = str(cad[0])
    puntos = {sub.name: {"dwg": dwg}
              for sub in sorted(p for p in carpeta.iterdir() if p.is_dir())}
    _ESTADO["carpeta"] = str(carpeta)
    _ESTADO["puntos"] = puntos
    return {"ok": True, "carpeta": str(carpeta), "dwg": dwg,
            "puntos_indexados": len(puntos), "claves": list(puntos.keys())}


@app.post("/api/croquis")
async def croquis_upload(
    file: UploadFile = File(...),
    x: float = Form(...),
    y: float = Form(...),
    ancho: float = Form(100),
    alto: float = Form(100),
):
    contenido = await file.read()
    suffix = ".dwg" if (file.filename or "").lower().endswith(".dwg") else ".dxf"
    tmp_in = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp_in.write(contenido)
    tmp_in.close()
    dxf, borrar_dxf = _abrir_cad_como_dxf(tmp_in.name)
    try:
        # ponytail: renderizar usa ventana cuadrada; si ancho != alto, tomamos max.
        size = max(ancho, alto) if ancho != alto else ancho
        imagen = _render_a_dataurl(dxf, x, y, size)
    finally:
        if borrar_dxf:
            os.unlink(dxf)
        os.unlink(tmp_in.name)
    return {"imagen": imagen}


@app.post("/api/croquis/por-clave")
def croquis_por_clave(req: PorClaveReq):
    if not _ESTADO["puntos"]:
        raise HTTPException(
            400, "No hay carpeta indexada. Llama POST /api/indexar primero.")
    punto = _ESTADO["puntos"].get(req.clave)
    if not punto:
        raise HTTPException(
            404,
            f"Clave no indexada: {req.clave}. "
            f"Disponibles: {list(_ESTADO['puntos'])}")
    dxf, borrar_dxf = _abrir_cad_como_dxf(punto["dwg"])
    try:
        imagen = _render_a_dataurl(dxf, req.x, req.y, req.size)
    finally:
        if borrar_dxf:
            os.unlink(dxf)
    return {"imagen": imagen}


@app.get("/api/health")
def health():
    return {"ok": True, "carpeta": _ESTADO["carpeta"],
            "puntos": len(_ESTADO["puntos"])}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
