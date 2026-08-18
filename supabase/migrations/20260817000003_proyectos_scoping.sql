-- ============================================================
-- Login & multi-project isolation — PR#2 (proyectos + scoping)
-- Change: login-multiproyecto (tasks 2.1 + 2.2)
--
-- 1) tablas proyectos + proyecto_miembros (RLS, matriz del design)
-- 2) helper fn_es_miembro() (SECURITY DEFINER: evita recursión)
-- 3) trigger: crear proyecto -> fila de membresía del creador
-- 4) puntos_ferroviarios.proyecto_id nullable + índice
-- 5) app_state_snapshots.user_id + proyecto_id
-- 6) policies de membership en puntos, 5 hijas y snapshots
-- 7) RPCs recreados con scoping (preservando modulo_data de
--    20260817000002_modulo_data_puntos.sql)
-- ============================================================

create table public.proyectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  creado_por uuid not null references auth.users (id) default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.proyecto_miembros (
  proyecto_id uuid not null references public.proyectos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  creado_por uuid not null references auth.users (id),
  creado_en timestamptz not null default now(),
  primary key (proyecto_id, user_id)
);

alter table public.proyectos enable row level security;
alter table public.proyecto_miembros enable row level security;

-- ---- helper de membresía (mismo patrón anti-recursión que PR#1) ----
create or replace function public.fn_es_miembro(p_proyecto uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.proyecto_miembros m
    where m.proyecto_id = p_proyecto and m.user_id = auth.uid()
  )
$$;

-- ---- membresía del creador ----
create or replace function public.fn_crear_miembro_creador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.proyecto_miembros (proyecto_id, user_id, creado_por)
  values (new.id, new.creado_por, new.creado_por)
  on conflict do nothing;
  return new;
end;
$$;

create trigger trg_crear_miembro_creador
after insert on public.proyectos
for each row execute function public.fn_crear_miembro_creador();

-- ---- scoping de puntos + snapshots ----
alter table public.puntos_ferroviarios
  add column if not exists proyecto_id uuid references public.proyectos (id);

create index if not exists idx_puntos_proyecto
  on public.puntos_ferroviarios (proyecto_id);

alter table public.app_state_snapshots
  add column if not exists user_id uuid default auth.uid(),
  add column if not exists proyecto_id uuid references public.proyectos (id);

-- ---- RLS proyectos: admin ve todo; miembros leen/editan; general crea ----
-- (sin policy de DELETE: la eliminación de proyectos queda fuera de alcance)
create policy proyectos_select on public.proyectos
  for select to authenticated
  using (public.fn_es_admin() or public.fn_es_miembro(id));

create policy proyectos_update on public.proyectos
  for update to authenticated
  using (public.fn_es_admin() or public.fn_es_miembro(id))
  with check (public.fn_es_admin() or public.fn_es_miembro(id));

create policy proyectos_insert on public.proyectos
  for insert to authenticated
  with check (creado_por = auth.uid()
    and (public.fn_es_admin() or public.fn_rol_actual() = 'general'));

-- ---- RLS proyecto_miembros: admin o miembro del proyecto ----
create policy miembros_acceso on public.proyecto_miembros
  for all to authenticated
  using (public.fn_es_admin() or public.fn_es_miembro(proyecto_id))
  with check (public.fn_es_admin() or public.fn_es_miembro(proyecto_id));

-- ---- RLS puntos_ferroviarios: membership; legacy NULL invisible ----
drop policy if exists authenticated_baseline on public.puntos_ferroviarios;

create policy puntos_acceso on public.puntos_ferroviarios
  for all to authenticated
  using (public.fn_es_admin()
    or (proyecto_id is not null and public.fn_es_miembro(proyecto_id)))
  with check (public.fn_es_admin()
    or (proyecto_id is not null and public.fn_es_miembro(proyecto_id)));

-- ---- RLS 5 hijas: EXISTS sobre el punto padre ----
do $$
declare
  t text;
begin
  foreach t in array array['coordenadas_gps','documentos_punto','analisis_imagenes','fotos_punto','historial_obras']
  loop
    execute format('drop policy if exists authenticated_baseline on public.%I', t);
    execute format(
      $sql$create policy %1$I on public.%2$I for all to authenticated
        using (exists (select 1 from public.puntos_ferroviarios p
          where p.id = %2$I.punto_id
            and (public.fn_es_admin()
              or (p.proyecto_id is not null and public.fn_es_miembro(p.proyecto_id)))))
        with check (exists (select 1 from public.puntos_ferroviarios p
          where p.id = %2$I.punto_id
            and (public.fn_es_admin()
              or (p.proyecto_id is not null and public.fn_es_miembro(p.proyecto_id)))))$sql$,
      t, t);
  end loop;
end $$;

-- ---- RLS snapshots: por usuario y proyecto (legacy NULL invisible) ----
drop policy if exists authenticated_baseline on public.app_state_snapshots;

create policy snapshots_select on public.app_state_snapshots
  for select to authenticated
  using (user_id = auth.uid());

create policy snapshots_insert on public.app_state_snapshots
  for insert to authenticated
  with check (user_id = auth.uid()
    and proyecto_id is not null
    and public.fn_es_miembro(proyecto_id));

create policy snapshots_delete on public.app_state_snapshots
  for delete to authenticated
  using (user_id = auth.uid());

-- ---- grants explícitos (auto_expose_new_tables inactivo) ----
grant select on public.proyectos, public.proyecto_miembros to anon;
grant select, insert, update on public.proyectos to authenticated;
grant select, insert, delete on public.proyecto_miembros to authenticated;
grant all on public.proyectos, public.proyecto_miembros to service_role;
grant execute on function public.fn_es_miembro(uuid) to anon, authenticated, service_role;

-- ============================================================
-- RPC cargar_puntos_completos: filtrado por proyecto
-- (recreada desde 20260817000002 conservando modulo_data)
-- ============================================================

drop function if exists cargar_puntos_completos();
drop function if exists cargar_puntos_completos(uuid);

create or replace function cargar_puntos_completos(p_proyecto uuid)
returns jsonb
language sql
as $$
    SELECT COALESCE(
        jsonb_agg(punto_obj ORDER BY numero_serie ASC),
        '[]'::jsonb
    )
    FROM (
        SELECT
            p.numero_serie,
            jsonb_build_object(
                'id', p.id,
                'numero_serie', p.numero_serie,
                'nombre', p.nombre,
                'descripcion', p.descripcion,
                'carpeta_path', p.carpeta_path,
                'coordenada_lat', p.coordenada_lat,
                'coordenada_lng', p.coordenada_lng,
                'coordenada_z', p.coordenada_z,
                'estado', p.estado,
                'created_at', p.created_at,
                'updated_at', p.updated_at,
                'modulo_data', p.modulo_data,
                'coordenadas_gps', (
                    SELECT jsonb_agg(jsonb_build_object(
                        'punto_id', c.punto_id,
                        'latitud', c.coordenada_y,
                        'longitud', c.coordenada_x,
                        'altitud', c.coordenada_z,
                        'notas', c.notas
                    ))
                    FROM coordenadas_gps c
                    WHERE c.punto_id = p.id
                ),
                'documentos_punto', (
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', d.id,
                        'punto_id', d.punto_id,
                        'nombre_archivo', d.nombre_archivo,
                        'contenido', d.contenido,
                        'tipo_documento', d.tipo_documento
                    ))
                    FROM documentos_punto d
                    WHERE d.punto_id = p.id
                ),
                'analisis_imagenes', (
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', a.id,
                        'punto_id', a.punto_id,
                        'image_url', a.image_url,
                        'image_urls', a.image_urls,
                        'description', a.description,
                        'objects', a.objects,
                        'mood', a.mood,
                        'quality', a.quality,
                        'model_used', a.model_used
                    ))
                    FROM analisis_imagenes a
                    WHERE a.punto_id = p.id
                ),
                'fotos_punto', (
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', f.id,
                        'punto_id', f.punto_id,
                        'indice', f.indice,
                        'nombre_archivo', f.nombre_archivo,
                        'nombre_formateado', f.nombre_formateado,
                        'subcarpeta', f.subcarpeta,
                        'preview_url', f.preview_url
                    ) ORDER BY f.indice ASC)
                    FROM fotos_punto f
                    WHERE f.punto_id = p.id
                )
            ) AS punto_obj
        FROM puntos_ferroviarios p
        WHERE p.estado = 'activo'
          AND p.proyecto_id = p_proyecto
    ) puntos;
$$;

-- ============================================================
-- RPC guardar_punto_completo: escribe proyecto_id en el INSERT
-- (el UPDATE a propósito NO toca proyecto_id: un punto no migra
-- de proyecto). Conserva el comportamiento modulo_data de
-- 20260817000002 (COALESCE en el UPDATE).
-- ============================================================

drop function if exists guardar_punto_completo(jsonb);

create or replace function guardar_punto_completo(p_payload jsonb)
returns jsonb
language plpgsql
as $$
DECLARE
    v_punto_id uuid := (p_payload->'punto'->>'id')::uuid;
    v_punto    jsonb := p_payload->'punto';
    v_coord    jsonb := p_payload->'coordenadas';
    v_doc      jsonb := p_payload->'documentos';
    v_analisis jsonb := p_payload->'analisis';
    v_fotos    jsonb := p_payload->'fotos';
    v_proyecto uuid := NULLIF(p_payload->'punto'->>'proyecto_id', '')::uuid;
BEGIN
    -- 1a. Punto principal (upsert por PK id; proyecto_id sólo al crear)
    INSERT INTO puntos_ferroviarios (
        id, numero_serie, nombre, descripcion, carpeta_path,
        coordenada_lat, coordenada_lng, coordenada_z, estado,
        modulo_data, proyecto_id, updated_at
    ) VALUES (
        v_punto_id,
        (v_punto->>'numero_serie')::int,
        v_punto->>'nombre',
        v_punto->>'descripcion',
        v_punto->>'carpeta_path',
        NULLIF(v_punto->>'coordenada_lat', '')::numeric,
        NULLIF(v_punto->>'coordenada_lng', '')::numeric,
        NULLIF(v_punto->>'coordenada_z', '')::numeric,
        COALESCE(v_punto->>'estado', 'activo'),
        v_punto->'modulo_data',
        v_proyecto,
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        numero_serie   = EXCLUDED.numero_serie,
        nombre         = EXCLUDED.nombre,
        descripcion    = EXCLUDED.descripcion,
        carpeta_path   = EXCLUDED.carpeta_path,
        coordenada_lat = EXCLUDED.coordenada_lat,
        coordenada_lng = EXCLUDED.coordenada_lng,
        coordenada_z   = EXCLUDED.coordenada_z,
        estado         = EXCLUDED.estado,
        modulo_data    = COALESCE(EXCLUDED.modulo_data, puntos_ferroviarios.modulo_data),
        updated_at     = now();

    -- 1b. Coordenadas GPS (upsert por punto_id, sólo si viene en el payload)
    IF v_coord IS NOT NULL THEN
        INSERT INTO coordenadas_gps (
            punto_id, coordenada_x, coordenada_y, coordenada_z, notas, updated_at
        ) VALUES (
            v_punto_id,
            NULLIF(v_coord->>'coordenada_x', '')::numeric,
            NULLIF(v_coord->>'coordenada_y', '')::numeric,
            NULLIF(v_coord->>'coordenada_z', '')::numeric,
            v_coord->>'notas',
            now()
        )
        ON CONFLICT (punto_id) DO UPDATE SET
            coordenada_x = EXCLUDED.coordenada_x,
            coordenada_y = EXCLUDED.coordenada_y,
            coordenada_z = EXCLUDED.coordenada_z,
            notas        = EXCLUDED.notas,
            updated_at   = now();
    END IF;

    -- 1c. Documentación (upsert por punto_id, sólo si viene en el payload)
    IF v_doc IS NOT NULL THEN
        INSERT INTO documentos_punto (
            punto_id, nombre_archivo, contenido, updated_at
        ) VALUES (
            v_punto_id,
            v_doc->>'nombre_archivo',
            v_doc->>'contenido',
            now()
        )
        ON CONFLICT (punto_id) DO UPDATE SET
            nombre_archivo = EXCLUDED.nombre_archivo,
            contenido      = EXCLUDED.contenido,
            updated_at     = now();
    END IF;

    -- 1d. Análisis (upsert por punto_id, sólo si viene en el payload)
    IF v_analisis IS NOT NULL THEN
        INSERT INTO analisis_imagenes (
            punto_id, image_urls, description, objects, mood, quality, model_used
        ) VALUES (
            v_punto_id,
            COALESCE(v_analisis->'image_urls', '[]'::jsonb),
            v_analisis->>'description',
            COALESCE(v_analisis->'objects', '[]'::jsonb),
            v_analisis->>'mood',
            v_analisis->>'quality',
            v_analisis->>'model_used'
        )
        ON CONFLICT (punto_id) DO UPDATE SET
            image_urls  = EXCLUDED.image_urls,
            description = EXCLUDED.description,
            objects     = EXCLUDED.objects,
            mood        = EXCLUDED.mood,
            quality     = EXCLUDED.quality,
            model_used  = EXCLUDED.model_used;
    END IF;

    -- 1e. Fotos: si el array viene y NO es vacío -> reemplazo (delete + insert).
    --     Si es null o vacío -> NO se tocan las fotos existentes.
    IF v_fotos IS NOT NULL AND jsonb_array_length(v_fotos) > 0 THEN
        DELETE FROM fotos_punto WHERE punto_id = v_punto_id;

        INSERT INTO fotos_punto (
            punto_id, indice, nombre_archivo, nombre_formateado, subcarpeta, preview_url
        )
        SELECT
            v_punto_id,
            (f.obj->>'indice')::int,
            f.obj->>'nombre_archivo',
            f.obj->>'nombre_formateado',
            f.obj->>'subcarpeta',
            f.obj->>'preview_url'
        FROM jsonb_array_elements(v_fotos) AS f(obj);
    END IF;

    RETURN jsonb_build_object('success', true);

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
