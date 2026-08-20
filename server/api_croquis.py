"""Servidor HTTP puente: frontend <-> generacion de croquis.

Reutiliza la misma funcion `renderizar` de scripts/dwg-to-croquis.py que ya
usa el MCP (scripts/mcp_croquis.py). Sin duplicacion de logica.

Endpoints:
  POST /api/indexar             JSON  {carpeta}
      -> escanea la carpeta raiz, mapea cada subcarpeta de punto a su DWG + (x,y)
         del CSV que contenga. Persiste en .croquis_index.json.
  POST /api/croquis/por-clave   JSON  {clave, x?, y?, size?}
      -> busca el DWG en el indice por nombre de subcarpeta o numero_serie,
         renderiza y devuelve {imagen: dataURL, ruta, kb}.
  POST /api/croquis             multipart  file, x, y, ancho, alto
      -> upload directo (contrato que ya espera src/lib/dwg-croquis.ts).
  POST /api/croquis/batch       multipart  file (un DWG) + puntos (JSON)
      -> abre el DWG UNA vez en Civil 3D via COM (croquis_com.py) y captura
         ZoomWindow por punto. Unico camino que sabe renderizar ortomosaicos
         ECW (matplotlib no puede). 409 si ya hay un batch en curso.
  GET  /api/health              -> {ok, hostname, civil3d, nas}
  GET  /api/nas-pending         -> pending-approval.json del watcher NAS
  POST /api/nas-pending/ack     JSON {eventIds} -> filtra pendientes (escritura atomica)
  GET  /api/nas-file?path=      -> sirve un archivo del NAS (anti path-traversal)
  GET  /api/nas-stream          -> SSE `nas:eventos` con {updatedAt, pendientes}
  POST /api/nas-snapshots       JSON {proyectoId, tipo, descripcion, guardadoPor, snapshot}
      -> guarda snapshot en {NAS}/.snapshots/{proyectoId}/ (tmp+rename, retencion 10)
  GET  /api/nas-snapshots?proyectoId= -> indice de snapshots del proyecto
  GET  /api/nas-snapshot?proyectoId=&id= -> cuerpo completo de un snapshot

Arranque:
  uvicorn server.api_croquis:app --reload --port 8000
  o:  python server/api_croquis.py

Dependencias:  fastapi, uvicorn, pydantic, ezdxf, matplotlib
               (+ dwg2dxf de LibreDWG en PATH si se procesan .dwg)
CORS abierto para dev local (Vite en otro puerto).
Indice persistente:  server/.croquis_index.json
Cache PNG:           server/.croquis_cache/
Produccion: sirve dist/ (npm run build) y los endpoints NAS si
NAS_WATCH_PATH esta configurado. Sin NAS_WATCH_PATH los endpoints NAS
devuelven 503 {"error": "NAS no configurado"}.
"""
import asyncio
import base64
import csv
import importlib.util
import json
import math
import os
import re
import shutil
import socket
import sys
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

_RAIZ = Path(__file__).resolve().parent
_SCRIPTS = _RAIZ.parent / "scripts"

# Mismo patron que mcp_croquis.py: importar renderizar/dwg_a_dxf sin duplicar.
_spec = importlib.util.spec_from_file_location("dwg_to_croquis", _SCRIPTS / "dwg-to-croquis.py")
_mod = importlib.util.module_from_spec(_spec)
sys.modules["dwg_to_croquis"] = _mod
_spec.loader.exec_module(_mod)
renderizar = _mod.renderizar
dwg_a_dxf = _mod.dwg_a_dxf

_INDICE_PATH = _RAIZ / ".croquis_index.json"
_CACHE_DIR = _RAIZ / ".croquis_cache"
_CACHE_DIR.mkdir(exist_ok=True)

_BATCH_LOCK = threading.Lock()


def _mod_croquis_com():
    """Importa server/croquis_com.py (primitivas COM ya probadas)."""
    if str(_RAIZ) not in sys.path:
        sys.path.insert(0, str(_RAIZ))
    import croquis_com

    return croquis_com

app = FastAPI(title="Croquis puente", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class IndexarBody(BaseModel):
    carpeta: str


class CroquisBody(BaseModel):
    clave: str
    x: Optional[float] = None
    y: Optional[float] = None
    size: float = 200.0


class PuntoBatch(BaseModel):
    clave: str
    x: float
    y: float
    size: Optional[float] = None


def _cargar_indice() -> dict:
    if _INDICE_PATH.exists():
        try:
            return json.loads(_INDICE_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"carpeta": "", "dwg_comun": "", "puntos": {}}


def _guardar_indice(idx: dict) -> None:
    _INDICE_PATH.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")


def _primer_entero(nombre: str) -> Optional[str]:
    m = re.search(r"\d+", nombre)
    return m.group() if m else None


def _leer_xy_csv(carpeta_punto: Path) -> Optional[tuple[float, float]]:
    """Centro (x, y) del primer CSV en la carpeta. Formato: numero,X,Y,Z,codigo."""
    csvs = sorted(p for p in carpeta_punto.iterdir() if p.is_file() and p.suffix.lower() == ".csv")
    for p in csvs:
        try:
            with p.open(newline="", encoding="utf-8-sig", errors="replace") as f:
                for row in csv.reader(f):
                    if len(row) >= 3:
                        try:
                            return float(row[1]), float(row[2])
                        except ValueError:
                            continue
        except Exception:
            continue
    return None


def _sanitizar(s: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", s)[:80]


def _renderizar_a_dataurl(dwg: str, x: float, y: float, size: float, nombre_cache: str) -> dict:
    """Pipeline DWG -> DXF -> PNG -> dataURL. Devuelve dict para la respuesta JSON."""
    if not Path(dwg).exists():
        raise HTTPException(404, f"DWG no encontrado: {dwg}")
    es_dwg = dwg.lower().endswith(".dwg")
    dxf = dwg_a_dxf(dwg) if es_dwg else dwg
    out = _CACHE_DIR / f"{_sanitizar(nombre_cache)}.png"
    try:
        renderizar(dxf, x, y, size, str(out), dpi=150, anclar_esquina=False)
    finally:
        if es_dwg:
            os.unlink(dxf)
    data = base64.b64encode(out.read_bytes()).decode()
    return {
        "imagen": f"data:image/png;base64,{data}",
        "ruta": str(out),
        "kb": round(out.stat().st_size / 1024, 1),
    }


@app.post("/api/indexar")
def indexar(body: IndexarBody):
    """Escanea `carpeta` y mapea cada subcarpeta de punto -> {dwg, x, y, codigo}.

    Si hay un solo .dwg en la raiz, se asigna a todos los puntos. Si un punto
    tiene su propio .dwg en su subcarpeta, ese tiene prioridad.
    """
    raiz = Path(body.carpeta).resolve()
    if not raiz.is_dir():
        raise HTTPException(400, f"No existe la carpeta: {raiz}")
    dwgs = sorted(p.name for p in raiz.iterdir() if p.is_file() and p.suffix.lower() == ".dwg")
    if not dwgs:
        raise HTTPException(400, f"No hay archivo .dwg en {raiz}")
    dwg_comun = str(raiz / dwgs[0]) if len(dwgs) == 1 else ""

    puntos = {}
    for sub in sorted(p for p in raiz.iterdir() if p.is_dir() and not p.name.startswith(".")):
        dwg_punto = ""
        for p in sub.iterdir():
            if p.is_file() and p.suffix.lower() == ".dwg":
                dwg_punto = str(p)
                break
        xy = _leer_xy_csv(sub)
        puntos[sub.name] = {
            "dwg": dwg_punto or dwg_comun,
            "x": xy[0] if xy else None,
            "y": xy[1] if xy else None,
            "codigo": _primer_entero(sub.name),
        }

    idx = {"carpeta": str(raiz), "dwg_comun": dwg_comun, "puntos": puntos}
    _guardar_indice(idx)
    return {"ok": True, "carpeta": str(raiz), "total": len(puntos), "puntos": list(puntos.keys())}


@app.post("/api/croquis/por-clave")
def croquis_por_clave(body: CroquisBody):
    """Busca el DWG en el indice por nombre de subcarpeta o numero_serie.

    Coordenadas: si el body trae x/y se usan; si no, las del CSV indexado.
    El PNG se cachea en server/.croquis_cache/ para reusar como respaldo.
    """
    idx = _cargar_indice()
    pts = idx.get("puntos", {})
    entry = pts.get(body.clave)
    if not entry:
        # fallback: buscar por numero_serie (codigo)
        for v in pts.values():
            if v.get("codigo") and v["codigo"] == body.clave:
                entry = v
                break
    if not entry:
        raise HTTPException(
            404,
            f"Clave '{body.clave}' no esta en el indice. "
            f"Llama primero a POST /api/indexar con la carpeta raiz.",
        )
    dwg = entry.get("dwg", "")
    if not dwg:
        raise HTTPException(400, f"El punto '{body.clave}' no tiene DWG asignado en el indice.")

    x = body.x if body.x is not None else entry.get("x")
    y = body.y if body.y is not None else entry.get("y")
    if x is None or y is None:
        raise HTTPException(
            400,
            f"Faltan x/y para '{body.clave}' (ni en el body ni en el CSV indexado).",
        )

    return _renderizar_a_dataurl(dwg, float(x), float(y), body.size, f"{body.clave}_{int(x)}_{int(y)}")


@app.post("/api/croquis")
async def croquis_upload(
    file: UploadFile = File(...),
    x: float = Form(...),
    y: float = Form(...),
    ancho: float = Form(200),
    alto: float = Form(200),
):
    """Upload directo de un DWG/DXF. Contrato que ya espera dwg-croquis.ts.

    El frontend manda ancho/alto del area; renderizar usa ventana cuadrada,
    asi que tomamos el promedio (el PNG de croquis es cuadrado por diseno).
    """
    contenido = await file.read()
    suffix = Path(file.filename or "input.dwg").suffix or ".dwg"
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    try:
        tmp.write(contenido)
        tmp.close()
        size = (ancho + alto) / 2
        return _renderizar_a_dataurl(tmp.name, x, y, size, f"upload_{int(x)}_{int(y)}")
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


@app.get("/api/health")
def health():
    """Estado del puente: hostname (que maquina renderiza) y si Civil 3D responde por COM."""
    civil3d = False
    try:
        import pythoncom
        import win32com.client

        pythoncom.CoInitialize()
        try:
            progid = os.environ.get("CROQUIS_PROGID", "AutoCAD.Application")
            win32com.client.GetActiveObject(progid)
            civil3d = True
        except Exception:
            civil3d = False
        finally:
            pythoncom.CoUninitialize()
    except Exception:
        civil3d = False
    nas = bool(_NAS_ROOT) and _NAS_ROOT.is_dir()
    return {"ok": True, "hostname": socket.gethostname(), "civil3d": civil3d, "nas": nas}


@app.post("/api/croquis/batch")
def croquis_batch(
    file: UploadFile = File(...),
    puntos: str = Form(...),
):
    """Batch de croquis via Civil 3D COM (reusa las primitivas de croquis_com.py).

    Restriccion de seleccion de maquina: las referencias ECW dentro del DWG son
    rutas absolutas que deben resolver en la maquina que corre esta API (Civil
    3D abierto y NAS montado con la misma letra de unidad que el DWG
    referencia). El render matplotlib de los otros endpoints NO puede dibujar
    ECW; este endpoint si, porque captura la pantalla de Civil 3D.

    Multipart: `file` = un DWG, `puntos` = JSON "[{clave,x,y,size?}]". Abre el
    DWG una sola vez y hace ZoomWindow por punto (captura -> recorte -> PNG ->
    dataURL). Lock secuencial en memoria: 409 si ya hay un batch en curso. Las
    fallas por punto no abortan el batch (van a `errores`).
    """
    try:
        pts = [PuntoBatch(**p) for p in json.loads(puntos)]
    except Exception:
        raise HTTPException(400, "`puntos` debe ser JSON [{clave,x,y,size?}]")
    pts = [p for p in pts if p.clave and math.isfinite(p.x) and math.isfinite(p.y)]
    if not pts:
        raise HTTPException(400, "Sin puntos validos (clave + x/y finitos)")

    if not _BATCH_LOCK.acquire(blocking=False):
        raise HTTPException(409, "Ya hay un batch de croquis en curso")

    tmp_dwg = None
    tmp_dir = None
    try:
        contenido = file.file.read()
        tmp_dwg = tempfile.NamedTemporaryFile(suffix=".dwg", delete=False)
        tmp_dwg.write(contenido)
        tmp_dwg.close()
        tmp_dir = tempfile.mkdtemp(prefix="croquis_batch_")

        croquis = {}
        errores = []
        try:
            cc = _mod_croquis_com()
            import pythoncom

            pythoncom.CoInitialize()
            keep_open_prev = os.environ.get("CROQUIS_KEEP_OPEN")
            os.environ["CROQUIS_KEEP_OPEN"] = "1"
            try:
                acad = cc.conectar_autocad()
                for p in pts:
                    png = os.path.join(tmp_dir, f"{_sanitizar(p.clave)}.png")
                    try:
                        cc.capturar_croquis(tmp_dwg.name, p.x, p.y, png, size_cm=p.size, acad=acad)
                        with open(png, "rb") as fh:
                            croquis[p.clave] = "data:image/png;base64," + base64.b64encode(fh.read()).decode()
                    except Exception as e:
                        errores.append({"clave": p.clave, "error": str(e)})
            finally:
                if keep_open_prev is None:
                    os.environ.pop("CROQUIS_KEEP_OPEN", None)
                else:
                    os.environ["CROQUIS_KEEP_OPEN"] = keep_open_prev
                try:
                    cc._com(lambda: acad.ActiveDocument.Close(False), intentos=10)
                except Exception:
                    pass
                pythoncom.CoUninitialize()
        except Exception as e:
            raise HTTPException(500, f"Civil 3D / COM: {e}")
        return {"croquis": croquis, "errores": errores}
    finally:
        _BATCH_LOCK.release()
        if tmp_dwg:
            try:
                os.unlink(tmp_dwg.name)
            except OSError:
                pass
        if tmp_dir:
            shutil.rmtree(tmp_dir, ignore_errors=True)


@app.get("/api/indice")
def ver_indice():
    """Inspeccion del indice actual (util para depurar desde el navegador)."""
    return _cargar_indice()


def _leer_env_archivo() -> dict:
    """Parsea KEY=VALUE del .env del repo.

    Vite carga .env solo en dev; en produccion (start-prod.cjs) el proceso
    Python no lo lee. Este fallback permite configurar NAS_WATCH_PATH una
    sola vez en .env para ambos entornos.
    """
    valores: dict = {}
    ruta = Path(__file__).resolve().parent.parent / ".env"
    if not ruta.exists():
        return valores
    for linea in ruta.read_text(encoding="utf-8-sig").splitlines():
        linea = linea.strip()
        if not linea or linea.startswith("#") or "=" not in linea:
            continue
        clave, _, valor = linea.partition("=")
        valores[clave.strip()] = valor.strip().strip('"').strip("'")
    return valores


_NAS_ENV = (
    os.environ.get("NAS_WATCH_PATH", "").strip()
    or _leer_env_archivo().get("NAS_WATCH_PATH", "").strip()
)
_NAS_ROOT = Path(_NAS_ENV).resolve() if _NAS_ENV else None
_PENDIENTES_PATH = _NAS_ROOT / ".watcher" / "pending-approval.json" if _NAS_ROOT else None


def _nas_no_configurado() -> JSONResponse:
    return JSONResponse(status_code=503, content={"error": "NAS no configurado"})


def _leer_pendientes() -> dict:
    if _PENDIENTES_PATH and _PENDIENTES_PATH.exists():
        try:
            return json.loads(_PENDIENTES_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {"pending": []}
    return {"pending": [], "updatedAt": None}


def _nas_join(rel: str) -> Optional[Path]:
    """Une NAS_WATCH_PATH + rel a prueba de path-traversal. None si escapa de la raiz."""
    if not _NAS_ROOT or not rel:
        return None
    try:
        destino = (_NAS_ROOT / rel).resolve()
    except OSError:
        return None
    if not destino.is_relative_to(_NAS_ROOT):
        return None
    return destino


@app.get("/api/nas-pending")
def nas_pending():
    if not _NAS_ROOT:
        return _nas_no_configurado()
    return _leer_pendientes()


class AckBody(BaseModel):
    eventIds: list[str] = []


@app.post("/api/nas-pending/ack")
def nas_pending_ack(body: AckBody):
    if not _NAS_ROOT:
        return _nas_no_configurado()
    id_set = set(body.eventIds)
    actual = _leer_pendientes()
    filtrados = [e for e in (actual.get("pending") or []) if e.get("eventId") not in id_set]
    nuevo = {**actual, "updatedAt": datetime.now(timezone.utc).isoformat(), "pending": filtrados}
    tmp = Path(str(_PENDIENTES_PATH) + ".tmp")
    tmp.write_text(json.dumps(nuevo, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, _PENDIENTES_PATH)
    return {"acked": len(id_set), "remaining": len(filtrados)}


@app.get("/api/nas-file")
def nas_file(path: str = ""):
    abs_path = _nas_join(path) if _NAS_ROOT else None
    if not abs_path or not abs_path.is_file():
        return Response(status_code=404, content="Not found")
    return FileResponse(abs_path)


@app.get("/api/nas-stream")
async def nas_stream():
    """SSE `nas:eventos` con {updatedAt, pendientes}. Polling del archivo cada 2s.

    El watcher reescribe pending-approval.json atomicamente (tmp + rename),
    por eso se compara mtime+size en vez de vigilar el archivo. Sin hilos:
    el polling vive en el generador asincrono y muere con la conexion.
    """
    if not _NAS_ROOT:
        return _nas_no_configurado()

    async def eventos():
        marca = object()
        while True:
            firma = None
            try:
                st = _PENDIENTES_PATH.stat()
                firma = (st.st_mtime_ns, st.st_size)
            except OSError:
                pass
            if firma != marca:
                marca = firma
                data = _leer_pendientes()
                payload = {"updatedAt": data.get("updatedAt"), "pendientes": len(data.get("pending") or [])}
                yield f"event: nas:eventos\ndata: {json.dumps(payload)}\n\n"
            await asyncio.sleep(2)

    return StreamingResponse(
        eventos(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


_UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
_SNAPSHOTS_RETENCION = 10


def _es_uuid(valor: str) -> bool:
    return bool(_UUID_RE.match(valor or ""))


def _dir_snapshots(proyecto_id: str) -> Optional[Path]:
    return _nas_join(f".snapshots/{proyecto_id}")


def _escribir_json_atomico(ruta: Path, valor) -> None:
    tmp = Path(str(ruta) + ".tmp")
    tmp.write_text(json.dumps(valor, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, ruta)


def _leer_indice_snapshots(dir_proyecto: Path) -> dict:
    ruta = dir_proyecto / "index.json"
    if ruta.exists():
        try:
            data = json.loads(ruta.read_text(encoding="utf-8"))
            if isinstance(data.get("snapshots"), list):
                return data
        except Exception:
            pass
    return {"updatedAt": None, "snapshots": []}


class SnapshotBody(BaseModel):
    proyectoId: str
    tipo: str
    descripcion: str
    guardadoPor: str = ""
    snapshot: dict


@app.post("/api/nas-snapshots")
def nas_snapshots_crear(body: SnapshotBody):
    """Guarda un snapshot de estado de app en {NAS}/.snapshots/{proyectoId}/.

    Cuerpo tmp+rename, indice reescrito atomicamente con retencion 10:
    los archivos y entradas mas alla del tope se eliminan.
    """
    if not _NAS_ROOT:
        return _nas_no_configurado()
    if not _es_uuid(body.proyectoId):
        return JSONResponse(status_code=400, content={"error": "proyectoId debe ser un UUID valido"})
    if body.tipo not in ("manual", "automatico"):
        return JSONResponse(status_code=400, content={"error": "tipo debe ser 'manual' o 'automatico'"})

    dir_proyecto = _dir_snapshots(body.proyectoId)
    if dir_proyecto is None:
        return JSONResponse(status_code=400, content={"error": "ruta de snapshots invalida"})
    dir_proyecto.mkdir(parents=True, exist_ok=True)

    snap_id = str(uuid.uuid4())
    creado = datetime.now(timezone.utc)
    created_at = creado.isoformat()
    sello = creado.strftime("%Y-%m-%dT%H%M%S.%f")[:-3] + "Z"
    nombre = f"{sello}-{snap_id}.json"
    ruta_body = dir_proyecto / nombre

    _escribir_json_atomico(ruta_body, body.snapshot)

    entradas = _leer_indice_snapshots(dir_proyecto)["snapshots"]
    entradas.append(
        {
            "id": snap_id,
            "tipo": body.tipo,
            "descripcion": body.descripcion,
            "created_at": created_at,
            "guardadoPor": body.guardadoPor,
            "kb": round(ruta_body.stat().st_size / 1024, 1),
            "archivo": nombre,
        }
    )
    entradas.sort(key=lambda e: e["created_at"], reverse=True)
    for excedente in entradas[_SNAPSHOTS_RETENCION:]:
        try:
            (dir_proyecto / excedente["archivo"]).unlink(missing_ok=True)
        except OSError:
            pass
    entradas = entradas[:_SNAPSHOTS_RETENCION]
    _escribir_json_atomico(
        dir_proyecto / "index.json",
        {"updatedAt": created_at, "snapshots": entradas},
    )

    return {"ok": True, "id": snap_id, "created_at": created_at}


@app.get("/api/nas-snapshots")
def nas_snapshots_listar(proyectoId: str = ""):
    """Metadatos del indice de snapshots del proyecto (desc por created_at)."""
    if not _NAS_ROOT:
        return _nas_no_configurado()
    if not _es_uuid(proyectoId):
        return JSONResponse(status_code=400, content={"error": "proyectoId debe ser un UUID valido"})
    dir_proyecto = _dir_snapshots(proyectoId)
    if dir_proyecto is None or not dir_proyecto.is_dir():
        return {"updatedAt": None, "snapshots": []}
    indice = _leer_indice_snapshots(dir_proyecto)
    claves = ("id", "tipo", "descripcion", "created_at", "guardadoPor", "kb")
    return {
        "updatedAt": indice.get("updatedAt"),
        "snapshots": [{k: e.get(k) for k in claves} for e in indice.get("snapshots", [])],
    }


@app.get("/api/nas-snapshot")
def nas_snapshot_leer(proyectoId: str = "", id: str = ""):
    """Cuerpo completo de un snapshot: entrada del indice + archivo JSON."""
    if not _NAS_ROOT:
        return _nas_no_configurado()
    if not _es_uuid(proyectoId) or not _es_uuid(id):
        return JSONResponse(status_code=400, content={"error": "proyectoId e id deben ser UUID validos"})
    dir_proyecto = _dir_snapshots(proyectoId)
    entrada = None
    if dir_proyecto is not None and dir_proyecto.is_dir():
        entrada = next((e for e in _leer_indice_snapshots(dir_proyecto)["snapshots"] if e.get("id") == id), None)
    if not entrada:
        return JSONResponse(status_code=404, content={"error": "snapshot no encontrado"})
    ruta_body = _nas_join(f".snapshots/{proyectoId}/{entrada.get('archivo', '')}")
    if ruta_body is None or not ruta_body.is_file():
        return JSONResponse(status_code=404, content={"error": "snapshot no encontrado"})
    try:
        snapshot = json.loads(ruta_body.read_text(encoding="utf-8"))
    except Exception:
        return JSONResponse(status_code=404, content={"error": "snapshot no encontrado"})
    return {
        "id": entrada["id"],
        "tipo": entrada["tipo"],
        "descripcion": entrada["descripcion"],
        "created_at": entrada["created_at"],
        "guardadoPor": entrada.get("guardadoPor", ""),
        "snapshot": snapshot,
    }


_DIST = _RAIZ.parent / "dist"
if _DIST.is_dir():
    app.mount("/", StaticFiles(directory=str(_DIST), html=True), name="frontend")
else:
    print(
        "AVISO: no existe dist/ — el frontend estatico no se sirve. "
        "Ejecuta `npm run build` antes de usar este servidor en produccion. "
        "Los endpoints /api siguen disponibles.",
        file=sys.stderr,
    )


if __name__ == "__main__":
    import uvicorn

    if _NAS_ROOT:
        print(f"NAS configurado: {_NAS_ROOT}")
    else:
        print("NAS NO configurado: los endpoints /api/nas-* devolveran 503")
    uvicorn.run(
        app,
        host=os.environ.get("CROQUIS_API_HOST", "127.0.0.1"),
        port=int(os.environ.get("CROQUIS_API_PORT", "8000")),
    )
