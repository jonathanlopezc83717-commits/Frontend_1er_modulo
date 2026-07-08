# Context
Swarm: default

## Decisions
- Usar `useEffect` para disparar análisis automático cuando cambian las imágenes
- Filtrar modelos solo a GPT-4o y GPT-4o Mini para optimizar costos
- Agregar columna `model_used` a tabla existente vía migración SQL
- Usar `data:image` base64 para enviar imágenes a OpenRouter
- Guardar solo primera imagen URL en historial (limitación actual - PENDIENTE CORREGIR)

## Pending QA Gate Selection
- reviewer: enabled (required)
- test_engineer: enabled (required)
- sme_enabled: enabled
- critic_pre_plan: enabled
- sast_enabled: disabled (user preference - not touching security)
- hallucination_guard: enabled
- drift_check: enabled
- mutation_test: disabled
- council_mode: disabled
- final_council: disabled

## Patterns
- Análisis automático: useEffect detecta cambios en array de imágenes
- Prompt ferroviario especializado en OpenRouter
- Supabase local para desarrollo

## Critical Context
- Supabase local corre en: http://127.0.0.1:54321
- Studio: http://127.0.0.1:54323
- Frontend: http://localhost:5173
- API Key OpenRouter requerida en `.env`
- Tabla tiene registros antiguos sin `model_used`, nuevos registros sí lo tendrán
- **PROBLEMA CRÍTICO**: Solo se guarda la primera imagen cuando se suben múltiples (máx 4)

## Relevant Files
- `src/App.tsx`: Componente principal con lógica de análisis automático e historial
- `src/lib/openrouter.ts`: Integración OpenRouter, 2 modelos, prompt ferroviario
- `src/lib/supabase.ts`: Cliente Supabase con variables de entorno
- `src/components/ImageUploader.tsx`: Dropzone para múltiples imágenes
- `src/components/AnalysisResult.tsx`: Visualización de resultados simplificada
- `src/components/ProgressBar.tsx`: Barra de progreso con mensajes dinámicos
- `src/components/ModelSelector.tsx`: Selector de 2 modelos
- `supabase/migrations/20240603000000_initial_schema.sql`: Esquema inicial
- `supabase/migrations/20240604000001_add_model_used.sql`: Migración columna model_used
- `.env`: Variables de entorno (Supabase URL, anon key, OpenRouter API key)

## Agent Activity

| Tool | Calls | Success | Failed | Avg Duration |
|------|-------|---------|--------|--------------|
| read | 554 | 554 | 0 | 633ms |
| edit | 478 | 478 | 0 | 45ms |
| bash | 306 | 306 | 0 | 14677ms |
| write | 140 | 140 | 0 | 24ms |
| grep | 100 | 100 | 0 | 363ms |
| todowrite | 61 | 61 | 0 | 6ms |
| glob | 44 | 44 | 0 | 380ms |
| build_check | 33 | 33 | 0 | 18812ms |
| declare_scope | 9 | 9 | 0 | 13ms |
| question | 9 | 9 | 0 | 139576ms |
| codebase-memory-mcp_get_code_snippet | 7 | 7 | 0 | 43ms |
| codebase-memory-mcp_search_graph | 7 | 7 | 0 | 1786ms |
| codebase-memory-mcp_search_code | 7 | 7 | 0 | 3121ms |
| save_plan | 5 | 5 | 0 | 166ms |
| search | 5 | 5 | 0 | 136229ms |
| update_task_status | 5 | 5 | 0 | 263ms |
| codebase-memory-mcp_query_graph | 5 | 5 | 0 | 51ms |
| knowledge_add | 5 | 5 | 0 | 59ms |
| codebase-memory-mcp_manage_adr | 4 | 4 | 0 | 35ms |
| set_qa_gates | 3 | 3 | 0 | 15ms |
| task | 3 | 3 | 0 | 85398ms |
| codebase-memory-mcp_trace_path | 3 | 3 | 0 | 40ms |
| swarm_command | 2 | 2 | 0 | 86ms |
| pre_check_batch | 2 | 2 | 0 | 1252ms |
| test_runner | 2 | 2 | 0 | 4445ms |
| lint | 2 | 2 | 0 | 1216ms |
| syntax_check | 2 | 2 | 0 | 511ms |
| codebase-memory-mcp_list_projects | 2 | 2 | 0 | 28ms |
| codebase-memory-mcp_get_architecture | 2 | 2 | 0 | 92ms |
| codebase-memory-mcp_index_status | 2 | 2 | 0 | 7ms |
| knowledge_query | 2 | 2 | 0 | 9ms |
| spec_write | 1 | 1 | 0 | 33ms |
| diff | 1 | 1 | 0 | 64ms |
| write_retro | 1 | 1 | 0 | 10ms |
| phase_complete | 1 | 1 | 0 | 50ms |
| imports | 1 | 1 | 0 | 148ms |
| summarize_work | 1 | 1 | 0 | 48ms |
| skill | 1 | 1 | 0 | 98ms |
| codebase-memory-mcp_index_repository | 1 | 1 | 0 | 2396ms |
| codebase-memory-mcp_get_graph_schema | 1 | 1 | 0 | 46ms |
| knowledge_recall | 1 | 1 | 0 | 459ms |
| symbols | 1 | 1 | 0 | 33ms |
