# 📋 Guía de Instalación - Base de Datos Supabase

## Modo local vs proyecto en la nube

Este repositorio esta configurado para Supabase local por defecto:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=tu-anon-key-de-supabase-local
```

Para trabajar localmente no necesitas ejecutar `supabase link`.

Usa `supabase link --project-ref ...` solo si quieres conectar este repositorio con un proyecto hospedado en Supabase Cloud. El `project-ref` no es la URL completa ni el nombre del proyecto: es la parte de 20 caracteres antes de `.supabase.co`.

Ejemplo:

```bash
supabase link --project-ref abcdefghijklmnopqrst
```

## 1. Crear las Tablas

### Opción A: Usando el Editor SQL (Recomendado)

1. Ve a tu proyecto en [Supabase](https://supabase.com)
2. Navega a **SQL Editor** (Editor SQL)
3. Crea una **"New query"** (Nueva consulta)
4. Copia y pega el contenido del archivo:
   ```
   supabase/migrations/20250101000000_create_obras_ferroviarias_complete.sql
   ```
5. Ejecuta con **"Run"**

### Opción B: Usando la Interfaz Gráfica (Table Editor)

Si prefieres crear las tablas manualmente:

#### Tabla: `puntos_ferroviarios`
| Columna | Tipo | Opciones |
|---------|------|----------|
| id | uuid | Primary Key, Default: gen_random_uuid() |
| numero_serie | int8 | Not Null |
| nombre | varchar | Not Null |
| descripcion | text | |
| carpeta_path | varchar | |
| coordenada_lat | float8 | |
| coordenada_lng | float8 | |
| coordenada_z | float8 | |
| estado | varchar | Default: 'activo' |
| created_at | timestamptz | Default: now() |
| updated_at | timestamptz | Default: now() |

#### Tabla: `coordenadas_gps`
| Columna | Tipo | Opciones |
|---------|------|----------|
| id | uuid | Primary Key |
| punto_id | uuid | Foreign Key → puntos_ferroviarios(id) |
| coordenada_x | float8 | Not Null |
| coordenada_y | float8 | Not Null |
| coordenada_z | float8 | |
| sistema_coordenadas | varchar | Default: 'WGS84' |
| notas | text | |

#### Tabla: `documentos_punto`
| Columna | Tipo | Opciones |
|---------|------|----------|
| id | uuid | Primary Key |
| punto_id | uuid | Foreign Key |
| nombre_archivo | varchar | |
| contenido | text | |
| tipo_documento | varchar | Default: 'txt' |

#### Tabla: `analisis_imagenes`
| Columna | Tipo | Opciones |
|---------|------|----------|
| id | uuid | Primary Key |
| punto_id | uuid | Foreign Key |
| image_urls | jsonb | Default: '[]' |
| description | text | |
| objects | jsonb | Default: '[]' |
| model_used | varchar | |

#### Tabla: `fotos_punto`
| Columna | Tipo | Opciones |
|---------|------|----------|
| id | uuid | Primary Key |
| punto_id | uuid | Foreign Key |
| indice | int8 | Not Null |
| nombre_archivo | varchar | Not Null |
| subcarpeta | varchar | Default: 'raiz' |
| preview_url | text | |

#### Tabla: `historial_obras`
| Columna | Tipo | Opciones |
|---------|------|----------|
| id | uuid | Primary Key |
| punto_id | uuid | Foreign Key |
| tipo_evento | varchar | Not Null |
| modulo | varchar | |
| descripcion | text | |
| datos_anteriores | jsonb | |
| datos_nuevos | jsonb | |

## 2. Configurar Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=tu-anon-key-de-supabase-local
```

Obtienes estos valores con:

```bash
supabase.cmd status
```

Si usas un proyecto en la nube, cambia `VITE_SUPABASE_URL` por `https://abcdefghijklmnopqrst.supabase.co` y usa la anon key desde Supabase Dashboard -> Project Settings -> API.

## 3. Verificar Conexión

El sistema cargará automáticamente los datos desde Supabase al iniciar.

Para verificar que todo funciona:

1. Inicia la aplicación: `npm run dev`
2. Abre la consola del navegador (F12)
3. Deberías ver: `📂 X puntos cargados desde Supabase`

## 4. Sincronización Manual

Si necesitas sincronizar datos manualmente:

1. Haz clic en el icono **💾 (Guardar)** en el header
2. O ve a Configuración (⚙️) → "Sincronizar ahora"

## 5. Estructura de Datos

```
puntos_ferroviarios (tabla principal)
├── coordenadas_gps (1:1)
├── documentos_punto (1:1)
├── analisis_imagenes (1:1)
├── fotos_punto (1:N)
├── historial_obras (1:N)
├── inspeccion_punto (1:1)
├── materiales_punto (1:N)
├── riesgos_punto (1:N)
└── ambiental_punto (1:1)
```

## 6. Políticas de Seguridad (RLS)

Por defecto, las tablas tienen RLS habilitado con política "Allow all" para desarrollo.

**IMPORTANTE**: Para producción, configura políticas apropiadas:

```sql
-- Ejemplo: Solo usuarios autenticados pueden leer
CREATE POLICY "Authenticated users can read" 
ON puntos_ferroviarios 
FOR SELECT 
TO authenticated 
USING (true);
```

## 7. Backup y Restore

### Backup (Exportar datos)
```bash
# Usando Supabase CLI
supabase db dump --local -f backup.sql
```

### Restore (Importar datos)
```bash
# Usando psql
psql -h tu-host -U postgres -d postgres -f backup.sql
```

## 8. Troubleshooting

### Error: "No se encontró el elemento root"
- Verifica que el archivo `index.html` tenga `<div id="root"></div>`

### Error: "Missing Supabase environment variables"
- Verifica que el archivo `.env` exista y tenga las variables correctas
- Reinicia el servidor de desarrollo

### Error: "relation does not exist"
- Las tablas no se han creado. Ejecuta la migración SQL.

### Los datos no persisten
- Verifica la consola del navegador para errores
- Asegúrate de que las políticas RLS permitan las operaciones

## 9. Queries Útiles

Ver archivo: `supabase/queries/queries_utiles.sql`

Incluye:
- Insertar puntos
- Actualizar coordenadas
- Consultar historial
- Estadísticas del sistema
- Backup de datos
