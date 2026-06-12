# Solución al Error 404 - Tabla No Encontrada

## Problema
```
Failed to load resource: the server responded with a status of 404 (Not Found)
Could not find the table 'public.puntos_ferroviarios' in the schema cache
```

## Causa
La tabla `puntos_ferroviarios` (y las demás tablas del sistema) NO existen en tu base de datos Supabase Local. Solo existen las tablas por defecto (`coordenadas_gps`, `image_analyses`).

## Solución - Ejecutar la Migración SQL

### Opción 1: Usando Supabase Studio (Recomendado)

1. Abre el Supabase Studio en tu navegador:
   ```
   http://127.0.0.1:54323
   ```

2. Ve a la sección **"SQL Editor"** (Editor SQL)

3. Crea una nueva consulta (**"New query"**)

4. Copia y pega TODO el contenido del archivo:
   ```
   supabase/migrations/20250101000000_create_obras_ferroviarias_complete.sql
   ```

5. Ejecuta con **"Run"** o presiona `Ctrl+Enter`

6. Verifica que las tablas se crearon correctamente

### Opción 2: Usando psql (Terminal)

Si tienes acceso a la base de datos PostgreSQL directamente:

```bash
# Conectar a la base de datos local
psql -h localhost -p 54322 -U postgres -d postgres

# O ejecutar el archivo SQL directamente
psql -h localhost -p 54322 -U postgres -d postgres -f supabase/migrations/20250101000000_create_obras_ferroviarias_complete.sql
```

**Nota**: La contraseña por defecto de Supabase Local es: `postgres`

### Opción 3: Usando la API REST (curl)

```bash
# Primero, ejecuta el SQL a través de la API de management
# Necesitas el SERVICE_ROLE_KEY (no el anon key)

# El SERVICE_ROLE_KEY está en:
# http://127.0.0.1:54323/project/default/settings/api
```

## Verificación

Después de ejecutar la migración, verifica que las tablas existen:

```bash
curl -s http://127.0.0.1:54321/rest/v1/puntos_ferroviarios \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0"
```

Debería devolver: `[]` (array vacío, no error 404)

## Tablas que se crean

La migración crea estas 10 tablas:

1. `puntos_ferroviarios` - Tabla principal
2. `coordenadas_gps` - Coordenadas GPS
3. `documentos_punto` - Documentos técnicos
4. `analisis_imagenes` - Resultados de análisis IA
5. `fotos_punto` - Fotos indexadas
6. `historial_obras` - Historial de cambios
7. `inspeccion_punto` - Checklist de inspección
8. `materiales_punto` - Inventario de materiales
9. `riesgos_punto` - Análisis de riesgos
10. `ambiental_punto` - Estudio ambiental

## Notas importantes

- **Supabase Local** se reinicia cuando reinicias la computadora, pero los datos persisten en el volumen de Docker
- Si borras el volumen de Docker, perderás todas las tablas y tendrás que ejecutar la migración de nuevo
- Las políticas RLS están configuradas como "Allow all" para desarrollo local

## Si sigue fallando después de ejecutar la migración

1. **Verifica que Supabase Local esté corriendo**:
   ```bash
   docker ps | findstr supabase
   ```

2. **Reinicia Supabase Local**:
   ```bash
   npx supabase stop
   npx supabase start
   ```

3. **Vuelve a ejecutar la migración SQL**

4. **Verifica en los logs**:
   ```bash
   npx supabase status
   ```
