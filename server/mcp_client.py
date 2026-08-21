"""FastAPI bridge: Civil 3D MCP workstation -> Supabase Edge Functions.

Reuses the existing Edge Functions from PR #2-#3 (`mcp-upload-files`,
`mcp-create-puntos`) without duplicating their logic. The client holds one
Supabase session (`access_token` + `refresh_token`) for the technical user
`mcp-server@<domain>`, refreshes it when the proxied call returns 401, and
exposes a small HTTP surface that the Civil 3D Python script can hit without
needing to know the Supabase contract.

Endpoints:
  POST /login          -> forces a fresh login; returns the auth state
                          (does NOT accept credentials from the body -- they
                          are loaded from server/.mcp_credentials.json on
                          startup, mirroring the technical-user pattern).
  POST /upload-files   -> multipart proxy to /functions/v1/mcp-upload-files.
                          Accepts: metadata (JSON: {proyecto_id, slug_prefix?})
                          + any of fotos/croquis/documentos/referencias fields.
  POST /create-puntos  -> JSON proxy to /functions/v1/mcp-create-puntos.
                          Body: {proyecto_id: UUID, puntos: [...]}.
  GET  /health         -> {status: "ok", auth_state: {has_token, expires_in_seconds}}.
  GET  /login-state    -> convenience read of the current auth state.

Configuration:
  - server/.mcp_credentials.json (gitignored) holds {supabase_url,
    supabase_anon_key, mcp_user_email, mcp_user_password}. Loaded on lifespan
    startup.
  - env MCP_CLIENT_PORT (default 8001), MCP_CLIENT_HOST (default 127.0.0.1).

CLI:
  python -m server.mcp_client --dry-run
    Prints current auth state (logs in if needed) and exits 0. Useful to
    sanity-check credentials without starting the HTTP server.

  python -m server.mcp_client
    Starts uvicorn. The Civil 3D MCP server sends requests to /upload-files
    and /create-puntos; the rest is handled by the proxied Edge Functions.

CORS: open for local dev (Vite + the Civil 3D workstation on the same LAN).
ADR-006 honored: this is a separate OS process, run on the workstation.
"""
import argparse
import asyncio
import json
import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, Optional

import httpx
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

_RAIZ = Path(__file__).resolve().parent
_CRED_FILE = _RAIZ / ".mcp_credentials.json"
_EXAMPLE_CRED_FILE = _RAIZ / ".mcp_credentials.example.json"

REFRESH_MARGIN_SECONDS = 60
PROXY_TIMEOUT_SECONDS = 60.0

_AUTH_STATE: dict[str, Any] = {
    "access_token": None,
    "refresh_token": None,
    "expires_at": 0.0,
    "user_id": None,
    "email": None,
}

_CLIENT: Optional[httpx.AsyncClient] = None
_CREDENTIALS: dict[str, str] = {}
_SUPABASE_URL: str = ""


class SupabaseAuth:
    def __init__(self, url: str, anon_key: str, email: str, password: str):
        self.url = url.rstrip("/")
        self.anon_key = anon_key
        self.email = email
        self.password = password

    def _headers(self) -> dict[str, str]:
        return {
            "apikey": self.anon_key,
            "Content-Type": "application/json",
        }

    async def login(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=PROXY_TIMEOUT_SECONDS) as cli:
            resp = await cli.post(
                f"{self.url}/auth/v1/token?grant_type=password",
                headers=self._headers(),
                json={"email": self.email, "password": self.password},
            )
        if resp.status_code != 200:
            raise HTTPException(502, f"Supabase login falló: HTTP {resp.status_code} {resp.text[:200]}")
        body = resp.json()
        return self._apply(body)

    async def refresh(self) -> dict[str, Any]:
        if not _AUTH_STATE["refresh_token"]:
            return await self.login()
        async with httpx.AsyncClient(timeout=PROXY_TIMEOUT_SECONDS) as cli:
            resp = await cli.post(
                f"{self.url}/auth/v1/token?grant_type=refresh_token",
                headers=self._headers(),
                json={"refresh_token": _AUTH_STATE["refresh_token"]},
            )
        if resp.status_code != 200:
            return await self.login()
        body = resp.json()
        return self._apply(body)

    def _apply(self, body: dict[str, Any]) -> dict[str, Any]:
        access = body.get("access_token")
        refresh = body.get("refresh_token")
        expires_in = body.get("expires_in", 3600)
        user = body.get("user") or {}
        if not access or not refresh:
            raise HTTPException(502, f"Supabase token response inválida: {list(body.keys())}")
        _AUTH_STATE["access_token"] = access
        _AUTH_STATE["refresh_token"] = refresh
        _AUTH_STATE["expires_at"] = time.time() + int(expires_in)
        _AUTH_STATE["user_id"] = user.get("id")
        _AUTH_STATE["email"] = user.get("email") or self.email
        return self.summary()

    async def get_valid_token(self) -> str:
        access = _AUTH_STATE.get("access_token")
        expires_at = _AUTH_STATE.get("expires_at", 0.0)
        if not access or time.time() >= expires_at - REFRESH_MARGIN_SECONDS:
            await self.refresh()
        token = _AUTH_STATE.get("access_token")
        if not token:
            raise HTTPException(503, "No se pudo obtener un token válido de Supabase")
        return token

    def summary(self) -> dict[str, Any]:
        expires_at = _AUTH_STATE.get("expires_at", 0.0)
        return {
            "has_token": bool(_AUTH_STATE.get("access_token")),
            "expires_in_seconds": max(0, int(expires_at - time.time())),
            "email": _AUTH_STATE.get("email"),
            "user_id": _AUTH_STATE.get("user_id"),
        }


def _load_credentials() -> dict[str, str]:
    if not _CRED_FILE.exists():
        if _EXAMPLE_CRED_FILE.exists():
            raise RuntimeError(
                f"Falta {_CRED_FILE.name} (encontré solo {_EXAMPLE_CRED_FILE.name}). "
                f"Copiá el example, completá los valores reales y reintentá."
            )
        raise RuntimeError(f"Falta {_CRED_FILE.name}; copiá .mcp_credentials.example.json y completá los valores.")
    try:
        data = json.loads(_CRED_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise RuntimeError(f"{_CRED_FILE.name} no es JSON válido: {e}") from e
    required = ("supabase_url", "supabase_anon_key", "mcp_user_email", "mcp_user_password")
    missing = [k for k in required if not data.get(k)]
    if missing:
        raise RuntimeError(f"{_CRED_FILE.name} le faltan claves: {missing}")
    return {k: str(data[k]) for k in required}


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _CLIENT, _CREDENTIALS, _SUPABASE_URL
    _CREDENTIALS = _load_credentials()
    _SUPABASE_URL = _CREDENTIALS["supabase_url"]
    _CLIENT = httpx.AsyncClient(timeout=PROXY_TIMEOUT_SECONDS)
    auth = SupabaseAuth(
        url=_CREDENTIALS["supabase_url"],
        anon_key=_CREDENTIALS["supabase_anon_key"],
        email=_CREDENTIALS["mcp_user_email"],
        password=_CREDENTIALS["mcp_user_password"],
    )
    try:
        state = await auth.login()
        print(f"[mcp_client] login OK: {state['email']} (expires_in={state['expires_in_seconds']}s)", file=sys.stderr)
    except Exception as e:
        print(f"[mcp_client] AVISO: login inicial falló ({e}); se reintentará en la primera request.", file=sys.stderr)
    try:
        yield
    finally:
        if _CLIENT is not None:
            await _CLIENT.aclose()
            _CLIENT = None


app = FastAPI(title="MCP client bridge", version="1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _auth() -> SupabaseAuth:
    if not _CREDENTIALS:
        raise HTTPException(503, "Credenciales no cargadas; el servidor está arrancando.")
    return SupabaseAuth(
        url=_CREDENTIALS["supabase_url"],
        anon_key=_CREDENTIALS["supabase_anon_key"],
        email=_CREDENTIALS["mcp_user_email"],
        password=_CREDENTIALS["mcp_user_password"],
    )


async def _proxy_upload_files(
    metadata_json: str,
    fotos: list[UploadFile],
    croquis: list[UploadFile],
    documentos: list[UploadFile],
    referencias: list[UploadFile],
    auth: SupabaseAuth,
) -> dict[str, Any]:
    if _CLIENT is None:
        raise HTTPException(503, "Cliente HTTP no inicializado")
    files_payload: list[tuple[str, tuple[str, bytes, str]]] = []
    field_map = (("fotos", fotos), ("croquis", croquis), ("documentos", documentos), ("referencias", referencias))
    for field, items in field_map:
        for f in items:
            content = await f.read()
            files_payload.append((field, (f.filename or "file", content, f.content_type or "application/octet-stream")))
    if not files_payload:
        raise HTTPException(400, "Sin archivos: usá al menos un campo entre fotos/croquis/documentos/referencias.")
    try:
        metadata_obj = json.loads(metadata_json)
    except json.JSONDecodeError as e:
        raise HTTPException(400, f"metadata no es JSON válido: {e}")
    if not isinstance(metadata_obj, dict) or "proyecto_id" not in metadata_obj:
        raise HTTPException(400, "metadata debe ser objeto JSON con clave 'proyecto_id'")
    try:
        token = await auth.get_valid_token()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"No se pudo obtener token: {e}")
    headers = {"Authorization": f"Bearer {token}", "apikey": _CREDENTIALS["supabase_anon_key"]}
    data = {"metadata": (None, json.dumps(metadata_obj), "application/json")}
    resp = await _CLIENT.post(
        f"{_SUPABASE_URL}/functions/v1/mcp-upload-files",
        headers=headers,
        files=data + files_payload,
    )
    if resp.status_code == 401:
        await auth.refresh()
        token = _AUTH_STATE["access_token"]
        headers["Authorization"] = f"Bearer {token}"
        resp = await _CLIENT.post(
            f"{_SUPABASE_URL}/functions/v1/mcp-upload-files",
            headers=headers,
            files=data + files_payload,
        )
    if resp.status_code >= 400:
        raise HTTPException(resp.status_code, f"mcp-upload-files: {resp.text[:500]}")
    return resp.json()


async def _proxy_create_puntos(
    payload: dict[str, Any],
    auth: SupabaseAuth,
) -> dict[str, Any]:
    if _CLIENT is None:
        raise HTTPException(503, "Cliente HTTP no inicializado")
    if "proyecto_id" not in payload or "puntos" not in payload:
        raise HTTPException(400, "Body debe incluir 'proyecto_id' y 'puntos'")
    try:
        token = await auth.get_valid_token()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"No se pudo obtener token: {e}")
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey": _CREDENTIALS["supabase_anon_key"],
        "Content-Type": "application/json",
    }
    resp = await _CLIENT.post(
        f"{_SUPABASE_URL}/functions/v1/mcp-create-puntos",
        headers=headers,
        content=json.dumps(payload),
    )
    if resp.status_code == 401:
        await auth.refresh()
        token = _AUTH_STATE["access_token"]
        headers["Authorization"] = f"Bearer {token}"
        resp = await _CLIENT.post(
            f"{_SUPABASE_URL}/functions/v1/mcp-create-puntos",
            headers=headers,
            content=json.dumps(payload),
        )
    if resp.status_code >= 400:
        raise HTTPException(resp.status_code, f"mcp-create-puntos: {resp.text[:500]}")
    return resp.json()


@app.post("/login")
async def login() -> dict[str, Any]:
    return await _auth().login()


@app.post("/upload-files")
async def upload_files(
    metadata: str = Form(...),
    fotos: list[UploadFile] = File(default=[]),
    croquis: list[UploadFile] = File(default=[]),
    documentos: list[UploadFile] = File(default=[]),
    referencias: list[UploadFile] = File(default=[]),
) -> dict[str, Any]:
    return await _proxy_upload_files(metadata, fotos, croquis, documentos, referencias, _auth())


@app.post("/create-puntos")
async def create_puntos(payload: dict[str, Any]) -> dict[str, Any]:
    return await _proxy_create_puntos(payload, _auth())


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "auth_state": _auth().summary()}


@app.get("/login-state")
async def login_state() -> dict[str, Any]:
    return _auth().summary()


def _run_dry_run() -> int:
    global _CREDENTIALS
    _CREDENTIALS = _load_credentials()
    print(f"[mcp_client] Supabase URL: {_CREDENTIALS['supabase_url']}")
    print(f"[mcp_client] Usuario: {_CREDENTIALS['mcp_user_email']}")

    async def go():
        auth = SupabaseAuth(
            url=_CREDENTIALS["supabase_url"],
            anon_key=_CREDENTIALS["supabase_anon_key"],
            email=_CREDENTIALS["mcp_user_email"],
            password=_CREDENTIALS["mcp_user_password"],
        )
        state = await auth.login()
        return state

    try:
        state = asyncio.run(go())
        print(f"[mcp_client] login OK: user_id={state['user_id']}, expires_in={state['expires_in_seconds']}s")
        return 0
    except Exception as e:
        print(f"[mcp_client] login FALLÓ: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FastAPI bridge: Civil 3D MCP -> Supabase.")
    parser.add_argument("--dry-run", action="store_true", help="Login + print state, exit (no HTTP server).")
    args = parser.parse_args()
    if args.dry_run:
        sys.exit(_run_dry_run())
    host = os.environ.get("MCP_CLIENT_HOST", "127.0.0.1")
    port = int(os.environ.get("MCP_CLIENT_PORT", "8001"))
    print(f"[mcp_client] uvicorn {host}:{port}", file=sys.stderr)
    uvicorn.run(app, host=host, port=port)