# Analizador de Imágenes Ferroviarias - Mejoras de Alto Impacto

## Descripción
Mejoras de alto impacto para el analizador de imágenes de obras ferroviarias existente.

## Requerimientos Funcionales

### FR-1: Soporte Múltiples Imágenes en Historial
- **FR-1.1**: La tabla debe almacenar un array de URLs de imágenes, no solo una
- **FR-1.2**: Todas las imágenes subidas (máximo 4) deben persistirse en el historial
- **FR-1.3**: El historial debe mostrar miniaturas de todas las imágenes analizadas

### FR-2: Tipado Estricto TypeScript
- **FR-2.1**: Definir interfaces para respuestas de OpenRouter
- **FR-2.2**: Tipar todas las props de componentes React
- **FR-2.3**: Eliminar tipos implícitos `any`

### FR-3: Rate Limiting y Debounce
- **FR-3.1**: Prevenir análisis simultáneos múltiples
- **FR-3.2**: Implementar debounce de 500ms en cambios de imagen
- **FR-3.3**: Mostrar estado de "procesando" claramente

### FR-4: UI de Galería en Historial
- **FR-4.1**: Mostrar hasta 4 miniaturas por entrada de historial
- **FR-4.2**: Clic en miniatura abre modal con imagen completa
- **FR-4.3**: Modal muestra imagen grande + análisis completo

## Requerimientos No Funcionales
- **NFR-1**: Zero errores de TypeScript en build
- **NFR-2**: Migración de datos existentes sin pérdida
- **NFR-3**: Mantener compatibilidad con funcionalidades actuales

## Escenarios de Prueba

### SC-1: Subir 4 imágenes
- Dado que el usuario selecciona 4 imágenes
- Cuando se completa el análisis
- Entonces el historial muestra 4 miniaturas
- Y todas las URLs están persistidas en la base de datos

### SC-2: Clic en miniatura del historial
- Dado que existe una entrada con múltiples imágenes en el historial
- Cuando el usuario hace clic en una miniatura
- Entonces se abre un modal con la imagen a tamaño completo
- Y se muestra el análisis completo asociado

### SC-3: Rate limiting
- Dado que un análisis está en progreso
- Cuando el usuario intenta subir más imágenes
- Entonces el nuevo análisis se encola o se ignora hasta completar el actual
