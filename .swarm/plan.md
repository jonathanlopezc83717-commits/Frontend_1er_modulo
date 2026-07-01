<!-- PLAN_HASH: 2lqrkte2jv9fy -->
# Analizador de Imágenes Ferroviarias - Mejoras de Alto Impacto
Swarm: default
Phase: 1 [PENDING] | Updated: 2026-07-01T17:47:26.891Z

---
## Phase 1: Backend y Schema [PENDING]
- [x] 1.1: Actualizar schema Supabase: migrar columna image_url a image_urls (array de TEXT), agregar índice GIN para búsquedas, migrar datos existentes de image_url a image_urls [MEDIUM]
- [ ] 1.2: Actualizar tipado TypeScript: definir interfaces estrictas para OpenRouter response, análisis, props de componentes, y tipos de Supabase [MEDIUM]
- [ ] 1.3: Implementar rate limiting y debounce: prevenir análisis múltiples simultáneos, agregar debounce de 500ms en cambios de imagen, estado isProcessing claro [SMALL]

---
## Phase 2: Frontend UI y UX [PENDING]
- [ ] 2.1: Actualizar lógica de guardado: soportar múltiples URLs en análisis, modificar App.tsx para guardar array completo de URLs y resultados en Supabase [MEDIUM] (depends: 1.1)
- [ ] 2.2: Permitir subir nuevas imágenes sin limpiar primero: agregar lógica para reemplazar imágenes existentes, mostrar alerta de confirmación cuando hay imágenes cargadas y se intenta subir nuevas [MEDIUM] (depends: 2.1)
- [ ] 2.3: Actualizar UI del historial: mostrar galería de miniaturas (hasta 4), modal para ver imagen completa con análisis, mostrar todas las imágenes del análisis [MEDIUM] (depends: 2.1)
- [ ] 2.4: Actualizar AnalysisResult para mostrar todas las imágenes analizadas con sus previews [SMALL] (depends: 2.1)
