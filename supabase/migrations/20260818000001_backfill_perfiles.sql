-- Backfill: usuarios pre-existentes en auth.users no disparan el trigger
-- de perfiles (solo dispara en INSERT nuevos). El primero por created_at
-- queda administrador (misma semantica que el bootstrap del trigger);
-- el resto queda usuario hasta que un admin lo cambie.

insert into public.perfiles (id, email, nombre, rol)
select
  u.id,
  u.email,
  split_part(u.email, '@', 1),
  case
    when u.created_at = (select min(created_at) from auth.users)
      then 'administrador'::public.rol_usuario
    else 'usuario'::public.rol_usuario
  end
from auth.users u
on conflict (id) do nothing;
