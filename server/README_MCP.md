# MCP Client (`server/mcp_client.py`)

FastAPI HTTP bridge that the Civil 3D MCP server (running on a workstation
with AutoCAD + Civil 3D) hits to push data into Supabase. It logs in once as
the `mcp-server@<domain>` technical user, caches the JWT, auto-refreshes it
on 401 from the proxied Edge Functions, and forwards calls to
`mcp-upload-files` / `mcp-create-puntos`.

The Edge Functions (PR #2 + #3 of the `mcp-server-endpoints` change) own
the Supabase contract — this client is a thin shell that just owns the
JWT lifecycle. ADR-006: this runs as a separate OS process on the
workstation, NOT inside the React app.

## Endpoints exposed

| Method | Path              | Purpose                                                            |
|--------|-------------------|--------------------------------------------------------------------|
| POST   | `/login`          | Force a fresh login (re-applies tokens). No body needed.           |
| POST   | `/upload-files`   | Multipart proxy → `mcp-upload-files`. Body: `metadata` JSON + `fotos`/`croquis`/`documentos`/`referencias` file fields. |
| POST   | `/create-puntos`  | JSON proxy → `mcp-create-puntos`. Body: `{proyecto_id, puntos[]}`. |
| GET    | `/health`         | Liveness + current auth state (token expiry, user id).             |
| GET    | `/login-state`    | Auth state only (no network call).                                 |

## Install

```bash
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

(Python 3.11+ recommended; the venv in this repo already has the deps.)

## Create credentials

1. Make sure the `mcp-server@<domain>` technical user exists. Run the
   bootstrap script (creates `auth.users` + `perfiles` row with `rol='mcp'`):

   ```bash
   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
     -f supabase/bootstrap_mcp_user.sql
   ```

   Edit the email placeholder in that file before running. Add the user as
   a member of the target project:

   ```sql
   INSERT INTO public.proyecto_miembros (proyecto_id, user_id, rol_proyecto)
   SELECT '<PROYECTO_ID>', id, 'editor'
   FROM auth.users WHERE email = 'mcp-server@analizador-ferroviario.local'
   ON CONFLICT DO NOTHING;
   ```

2. Copy the template and fill in the real values:

   ```bash
   copy server\.mcp_credentials.example.json server\.mcp_credentials.json
   ```

   The file is **gitignored** — never commit it.

3. Sanity-check the credentials (login + print state, no HTTP server):

   ```bash
   .venv\Scripts\python.exe -m server.mcp_client --dry-run
   ```

   Expect: `login OK: user_id=... expires_in=...s` and exit 0.

## Run as a service

```bash
.venv\Scripts\python.exe -m server.mcp_client
```

Defaults to `127.0.0.1:8001`. Override with env vars
`MCP_CLIENT_HOST` / `MCP_CLIENT_PORT`. The server prints a `login OK` line
on startup; if it fails, the next proxied call will retry automatically.

For unattended deployment, wrap with [NSSM](https://nssm.cc/) (Windows) or
`systemd --user` (Linux). Logs go to stdout/stderr — pipe to a file.

## Call from the Civil 3D MCP server (Python example)

```python
import httpx

BRIDGE = "http://127.0.0.1:8001"

def upload_files(proyecto_id: str, slug_prefix: str, jpeg_paths: list[str]):
    files = [("fotos", (p, open(p, "rb"), "image/jpeg")) for p in jpeg_paths]
    metadata = json.dumps({"proyecto_id": proyecto_id, "slug_prefix": slug_prefix})
    return httpx.post(
        f"{BRIDGE}/upload-files",
        data={"metadata": metadata},
        files=files,
        timeout=120,
    ).json()

def create_puntos(proyecto_id: str, puntos: list[dict]):
    return httpx.post(
        f"{BRIDGE}/create-puntos",
        json={"proyecto_id": proyecto_id, "puntos": puntos},
        timeout=60,
    ).json()
```

The MCP server never sees the JWT; the bridge owns the session. If the
bridge is restarted, the next request auto-relogs-in.

## Auto-refresh contract

- `access_token` expires in ~1h (`config.toml:164`).
- The bridge refreshes when the current token is within 60s of expiry OR
  when the proxied Edge Function returns 401 (retry once).
- If refresh fails, the bridge re-logs in from scratch using the file-loaded
  password. No silent failures — every refresh path surfaces the new state.