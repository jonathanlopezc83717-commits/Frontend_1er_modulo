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
| read | 380 | 380 | 0 | 810ms |
| edit | 321 | 321 | 0 | 35ms |
| bash | 166 | 166 | 0 | 14275ms |
| write | 116 | 116 | 0 | 19ms |
| todowrite | 61 | 61 | 0 | 6ms |
| build_check | 32 | 32 | 0 | 17220ms |
| glob | 20 | 20 | 0 | 602ms |
| grep | 20 | 20 | 0 | 270ms |
| declare_scope | 6 | 6 | 0 | 9ms |
| save_plan | 4 | 4 | 0 | 120ms |
| update_task_status | 4 | 4 | 0 | 77ms |
| set_qa_gates | 3 | 3 | 0 | 15ms |
| search | 3 | 3 | 0 | 201536ms |
| swarm_command | 2 | 2 | 0 | 86ms |
| task | 2 | 2 | 0 | 97908ms |
| spec_write | 1 | 1 | 0 | 33ms |
| pre_check_batch | 1 | 1 | 0 | 460ms |
| diff | 1 | 1 | 0 | 64ms |
| test_runner | 1 | 1 | 0 | 4ms |
| write_retro | 1 | 1 | 0 | 10ms |
| phase_complete | 1 | 1 | 0 | 50ms |
| lint | 1 | 1 | 0 | 17ms |
| syntax_check | 1 | 1 | 0 | 580ms |
| question | 1 | 1 | 0 | 219467ms |
