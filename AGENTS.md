# AGENTS.md — Analizador de Imágenes Ferroviarias

Reglas de operación para cualquier agente que trabaje en este repo.
**Lee esto antes de tocar código.**

## Consulta de código: MCP PRIMERO, archivos después

Este proyecto tiene un **grafo de conocimiento indexado** en
`codebase-memory-mcp` con **3096 nodos / 4198 aristas**. Úsalo como fuente
primaria de información estructural. Leer archivos individuales es la ÚLTIMA
opción, no la primera.

**Project ID:** `C-Users-YOGA-01-Documents-Frontend`

### Orden obligatorio

1. **MCP graph tools** — respuesta en ~500 tokens vs ~80K leyendo archivos.
2. **`grep` / `glob`** — solo para strings literales, mensajes de error,
   valores de config, o archivos no-code (`.sql`, `.bat`, `.toml`, `.env`).
3. **`read` de archivo completo** — solo cuando necesites editar, o el MCP no
   tuvo resultado y ya agotaste `get_code_snippet`.

### Matriz rápida MCP

| Pregunta | Tool MCP | Ejemplo con datos reales |
|----------|----------|--------------------------|
| ¿Quién llama a X? | `trace_path(direction="inbound")` | `trace_path(function_name="useApp", direction="inbound")` |
| ¿Qué llama X? | `trace_path(direction="outbound")` | `trace_path(function_name="analyzeImages", direction="outbound")` |
| Flujo completo | `trace_path(direction="both", depth=3)` | `trace_path(function_name="guardarPuntoCompleto", direction="both")` |
| Buscar por nombre | `search_graph(name_pattern="...")` | `search_graph(name_pattern=".*Nomenclatura.*")` |
| Buscar por texto | `search_code(pattern="...")` | `search_code(pattern="PGRST204")` |
| Código fuente de 1 función | `get_code_snippet(qualified_name=...)` | `get_code_snippet(qualified_name="...src.lib.openrouter.analyzeImages")` |
| ¿Función muerta? | `search_graph(max_degree=0, exclude_entry_points=true)` | — |
| Alta fan-out / fan-in | `search_graph(min_degree=10, relationship="CALLS")` | — |
| Query compleja / patrones | `query_graph` (Cypher) | ver ejemplos abajo |
| Arquitectura / capas | `get_architecture(aspects=["all"])` | — |
| Cambios git → impacto | `detect_changes` | — |
| Schema del grafo | `get_graph_schema` | — |

### Ejemplos Cypher para `query_graph`

```
MATCH (a)-[r:HTTP_CALLS]->(b) RETURN a.name, b.name, r.url_path LIMIT 20
MATCH (f:Function) WHERE f.name =~ '.*Modulo.*' RETURN f.name, f.file_path
MATCH (a)-[r:CALLS]->(b) WHERE a.name = 'analyzeImages' RETURN b.name
MATCH (f:Function) WHERE f.transitive_loop_depth >= 3 RETURN f.qualified_name
```

### Anti-patrones prohibidos

- ❌ `read` de `AppContext.tsx` (690 líneas) para ver qué hace `useApp` →
  ✅ `get_code_snippet(qualified_name="...AppContext.useApp")`
- ❌ `grep "registrarHistorial"` para ver quién lo usa →
  ✅ `trace_path(function_name="registrarHistorial", direction="inbound")`
- ❌ Leer toda una carpeta para "entender el módulo" →
  ✅ `get_architecture(aspects=["all"])` y revisar los **clusters**
- ❌ `read` antes de `search_graph` "para estar seguro" → el grafo ya indexó
  imports, calls, definitions. Confía en él.

## Arquitectura (del análisis del grafo)

```
ENTRY     components/ (UI + ui/), scripts/nas-watcher, App.tsx
INTERNAL  context/AppContext.tsx
CORE      lib/ (supabase-service, storage, openrouter,
                excel-sync, nomenclaturas, excel-to-image)
DATA      Supabase (Postgres) + NAS (SMB)
```

Límites medidos: `components → lib` (46 calls), `context → lib` (19),
`components → context` (14). Sin ciclos entre capas.

### Hotspots — tocar con cuidado

| Función | Fan-in | Por qué importa |
|---------|--------|-----------------|
| `src/lib/utils.ts → cn` | 16 | utilidad shadcn, no modificar |
| `src/context/AppContext.tsx → useApp` | 15 | todo el árbol React la consume |
| `src/lib/excel-to-image.ts → log` | 15 | pipeline Excel completo |
| `src/lib/supabase-service.ts → registrarHistorial` | 5 | persistencia análisis |
| `src/lib/nomenclaturas.ts → consolidarNomenclaturas` | 4 | dedup en sync Excel |
| `src/lib/utils.ts → generarUUID` | 5 | generación IDs puntos |

Antes de cambiar cualquiera de estas, corre
`trace_path(function_name="...", direction="inbound", depth=2)` para ver el
blast radius.

## Decisiones arquitectónicas (ADR)

El grafo tiene un **ADR consolidado** accesible vía
`manage_adr(mode="get")`. Léelo antes de:

- Cambiar modelos de IA (ADR-001: solo GPT-4o y GPT-4o-mini)
- Modificar persistencia (ADR-003: dual localStorage + Supabase)
- Tocar `PuntoFerroviario.moduloData` (ADR-004)
- Cambiar columnas Postgres (ADR-005: mantener compat legacy)
- Mover el NAS watcher (ADR-006: debe quedar como proceso OS separado)

## Stack y convenciones

- **React 19 + Vite 6 + TypeScript estricto + Tailwind v4 + Radix UI**
- **Backend:** Supabase local (`http://127.0.0.1:54321`)
- **Estado:** `Context + useReducer` en `AppContext`, no Redux/Zustand
- **Tipos centralizados:** `src/types/index.ts` — no crear archivos de tipos sueltos
- **Migraciones Postgres:** siempre archivo nuevo en `supabase/migrations/`
  con timestamp, nunca `ALTER` directo
- **Test runner:** `vitest` (`src/tests/`)
- **Lint:** `eslint .` · **Build:** `tsc -b && vite build`

## Reglas adicionales

- **Comentarios:** no agregar comentarios salvo petición explícita.
- **Persistencia:** commitear `.codebase-memory/graph.db.zst` para compartir el
  índice con el equipo. Re-indexar solo si `index_status` está stale.
- **Bug conocido (PEND-1):** al subir múltiples imágenes solo se guarda la
  primera. Ver ADR sección 4 antes de tocar `analyzeImages` o `registrarHistorial`.
- **Nuevo módulo:** crear `src/components/modulos/ModuloX.tsx`, agregar entrada
  a `MODULOS` en `src/types/index.ts`, opcionalmente key en `moduloData`.
