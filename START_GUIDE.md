# Guía de Inicio Rápido - Image Analyzer

## 1. Verificar Supabase Local

Asegúrate de que Supabase esté corriendo:

```bash
# Verificar estado de Supabase
supabase status

# Si no está corriendo, iniciarlo
supabase start
```

## 2. Configurar Base de Datos

Ejecuta el script SQL de inicialización en tu Supabase local:

```bash
# Conectar a la base de datos y ejecutar el script
psql postgresql://postgres:postgres@localhost:54322/postgres -f supabase/init.sql

# O usa la interfaz de Supabase Studio (http://localhost:54323)
# Ve al SQL Editor y pega el contenido de supabase/init.sql
```

## 3. Configurar Variables de Entorno

Copia el archivo de ejemplo y actualiza con tus credenciales:

```bash
cp .env.example .env
```

Edita `.env` con:
- `VITE_SUPABASE_URL`: URL de tu Supabase local (por defecto: http://localhost:54321)
- `VITE_SUPABASE_ANON_KEY`: La anon key que te da `supabase status`
- `VITE_OPENROUTER_API_KEY`: Tu API key de OpenRouter

## 4. Iniciar el Proyecto

```bash
# Instalar dependencias (si no lo has hecho)
npm install

# Iniciar servidor de desarrollo
npm run dev
```

El frontend estará disponible en `http://localhost:5173`

## 5. URLs de Supabase Local

- **API REST**: http://localhost:54321
- **Supabase Studio** (UI): http://localhost:54323
- **Base de datos PostgreSQL**: postgresql://postgres:postgres@localhost:54322/postgres

## 6. Obtener Credenciales de Supabase

```bash
supabase status
```

Esto te mostrará:
- API URL
- GraphQL URL  
- S3 Storage URL
- DB URL
- Studio URL
- JWT secret
- anon key
- service_role key

## 7. Flujo de Uso

1. **Sube una imagen** arrastrándola o haciendo clic
2. **Haz clic en "Analizar Imagen"**
3. La imagen se sube al storage de Supabase
4. OpenRouter analiza la imagen
5. Los resultados se guardan en la base de datos
6. Puedes ver el historial de análisis

## 8. Solución de Problemas

### Error de CORS
Si ves errores de CORS, asegúrate de que Supabase esté configurado para permitir tu origen:
```bash
supabase config set api.cors_origins="http://localhost:5173"
supabase stop
supabase start
```

### Error de Storage
Verifica que el bucket 'images' existe en Supabase Studio > Storage

### Error de Base de Datos
Verifica que la tabla 'image_analyses' existe en Supabase Studio > Table Editor
