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
| read | 440 | 440 | 0 | 725ms |
| edit | 353 | 353 | 0 | 39ms |
| bash | 181 | 181 | 0 | 15055ms |
| write | 117 | 117 | 0 | 20ms |
| todowrite | 61 | 61 | 0 | 6ms |
| grep | 41 | 41 | 0 | 415ms |
| build_check | 33 | 33 | 0 | 18812ms |
| glob | 23 | 23 | 0 | 562ms |
| declare_scope | 9 | 9 | 0 | 13ms |
| save_plan | 5 | 5 | 0 | 166ms |
| update_task_status | 4 | 4 | 0 | 77ms |
| set_qa_gates | 3 | 3 | 0 | 15ms |
| task | 3 | 3 | 0 | 85398ms |
| search | 3 | 3 | 0 | 201536ms |
| swarm_command | 2 | 2 | 0 | 86ms |
| pre_check_batch | 2 | 2 | 0 | 1252ms |
| test_runner | 2 | 2 | 0 | 4445ms |
| lint | 2 | 2 | 0 | 1216ms |
| syntax_check | 2 | 2 | 0 | 511ms |
| question | 2 | 2 | 0 | 127181ms |
| spec_write | 1 | 1 | 0 | 33ms |
| diff | 1 | 1 | 0 | 64ms |
| write_retro | 1 | 1 | 0 | 10ms |
| phase_complete | 1 | 1 | 0 | 50ms |
| imports | 1 | 1 | 0 | 148ms |
| summarize_work | 1 | 1 | 0 | 48ms |
