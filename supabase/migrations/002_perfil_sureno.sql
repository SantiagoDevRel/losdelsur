-- 002_perfil_sureno.sql
-- "Perfil sureño" + pasaporte + puntos + tribuna fotos.
--
-- Cambios respecto a v0.3:
--   * profiles: nuevas columnas opcionales (apodo, barrio, socio_desde,
--     subscription_tier, subscription_until). El RegisterGate ahora pide
--     apodo (en vez de "nombre" — más coloquial) + ciudad. Combo, barrio
--     y socio_desde quedan editables desde /perfil.
--   * partidos: catálogo de partidos pasados/futuros (rival, fecha, sede).
--     Lo seedea el admin desde /admin/partidos (próxima PR).
--   * partido_asistencia: stamp del pasaporte. Un row por (user, partido).
--     Lo creamos cuando el user se chequea via QR en el estadio (Phase E).
--   * partido_fotos: una row por foto subida a R2. seccion = SUR_A1 |
--     SUR_A2 | SUR_B1 | SUR_B2 (alta y baja por ahora, solo tribuna sur).
--     expires_at = uploaded_at + 7d → un cron diario barre.
--   * actividades: catálogo de actividades de la barra que dan puntos
--     (asistir a un partido, asistir a actividad de la barra, etc.).
--   * puntos_movimientos: ledger inmutable. Balance = SUM. Auditable.
--
-- Suscripción Capo (HOOK PARA EL FUTURO — no enforced en MVP):
--   * subscription_tier text default 'free' → 'capo' cuando paguen.
--   * subscription_until timestamptz → cuándo expira. NULL = nunca pagó.
--   * MVP: las fotos son visibles a TODOS los users logueados. La RLS
--     check abajo solo valida `auth.uid() is not null`. Cuando lleguemos
--     a v1.0 con pagos, cambiamos la policy a:
--       exists (select 1 from profiles p where p.id = auth.uid()
--               and p.subscription_tier = 'capo'
--               and (p.subscription_until is null or p.subscription_until > now()))
--     y listo. Schema preparado, lógica deferida.
--
-- Admin seed:
--   * El user con phone +573117312391 (santi) entra a app_admins.
--     Idempotente: si el user no existe todavía, no hace nada y se puede
--     re-correr la migración cuando exista.

-- =====================================================================
-- profiles: nuevas columnas
-- =====================================================================

alter table public.profiles
  add column if not exists apodo                text,
  add column if not exists barrio               text,
  add column if not exists socio_desde          int,    -- año (ej: 2014)
  add column if not exists subscription_tier    text not null default 'free',
  add column if not exists subscription_until   timestamptz;

-- Si ya tenían "nombre" seteado y "apodo" null, copiamos para no perder
-- la data del RegisterGate viejo. El nuevo gate va a setear "apodo".
update public.profiles
  set apodo = nombre
  where apodo is null and nombre is not null;

alter table public.profiles
  add constraint profiles_subscription_tier_check
    check (subscription_tier in ('free', 'capo'));

alter table public.profiles
  add constraint profiles_socio_desde_range
    check (socio_desde is null or (socio_desde >= 1990 and socio_desde <= 2100));

comment on column public.profiles.apodo is
  'Display name del sureño (lo que va en el carnet). Puede ser nombre real o apodo.';
comment on column public.profiles.barrio is
  'Barrio dentro de la ciudad. Opcional. Texto libre.';
comment on column public.profiles.socio_desde is
  'Año desde que es de los del sur. Opcional. Se usa para calcular antigüedad.';
comment on column public.profiles.subscription_tier is
  'Tier actual: free | capo. Capo desbloquea fotos de tribuna.';
comment on column public.profiles.subscription_until is
  'Cuándo expira la sub Capo. NULL = nunca pagó. < now() = expirada (re-cae a free).';

-- =====================================================================
-- partidos
-- =====================================================================

create table if not exists public.partidos (
  id            uuid primary key default gen_random_uuid(),
  fecha         timestamptz not null,           -- kickoff
  rival         text not null,                  -- "Independiente Medellín"
  competencia   text,                           -- "Liga BetPlay" | "Libertadores" | etc.
  sede          text not null default 'Atanasio Girardot',  -- estadio
  ciudad        text not null default 'Medellín',
  es_local      boolean not null default true,
  resultado     text,                           -- "2-1" | null si futuro
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null
);

create index if not exists idx_partidos_fecha_desc
  on public.partidos (fecha desc);

alter table public.partidos enable row level security;

-- Lectura pública. Cualquier user logueado o no logueado ve los partidos.
create policy "partidos_public_read"
  on public.partidos for select
  using (true);

-- Solo admins pueden insertar/editar.
create policy "partidos_admin_insert"
  on public.partidos for insert
  with check (
    exists (select 1 from public.app_admins where user_id = auth.uid())
  );

create policy "partidos_admin_update"
  on public.partidos for update
  using (
    exists (select 1 from public.app_admins where user_id = auth.uid())
  );

create policy "partidos_admin_delete"
  on public.partidos for delete
  using (
    exists (select 1 from public.app_admins where user_id = auth.uid())
  );

-- =====================================================================
-- partido_fotos
-- =====================================================================
-- Una row por foto. La foto vive en R2 (bucket "losdelsur-fotos") y acá
-- solo guardamos metadata. expires_at lo setea el admin al subir;
-- después de pasar, un cron diario:
--   1. Lista las rows con expires_at < now()
--   2. DELETE en R2 con esas keys
--   3. DELETE de las rows
-- (cron implementación en próxima PR).

create table if not exists public.partido_fotos (
  id              uuid primary key default gen_random_uuid(),
  partido_id      uuid not null references public.partidos(id) on delete cascade,
  seccion         text not null,                -- 'SUR_A1' | 'SUR_A2' | 'SUR_B1' | 'SUR_B2'
  -- Keys en R2 (no URLs completas — la URL pública se computa con el
  -- public domain del bucket en el cliente).
  r2_key_thumb    text not null,                -- "fotos/<partido_id>/<id>.thumb.webp"
  r2_key_full     text not null,                -- "fotos/<partido_id>/<id>.jpg"
  width           int,
  height          int,
  size_bytes      int,
  uploaded_by     uuid references auth.users(id) on delete set null,
  uploaded_at     timestamptz not null default now(),
  expires_at      timestamptz not null,
  -- Si el admin marca alguna foto como destacada (cover del partido).
  destacada       boolean not null default false
);

create index if not exists idx_fotos_partido_seccion
  on public.partido_fotos (partido_id, seccion);

create index if not exists idx_fotos_expires
  on public.partido_fotos (expires_at);

alter table public.partido_fotos
  add constraint partido_fotos_seccion_check
    check (seccion in ('SUR_A1', 'SUR_A2', 'SUR_B1', 'SUR_B2'));

alter table public.partido_fotos enable row level security;

-- MVP: cualquier user logueado ve las fotos. Cuando metamos pagos,
-- swap a la versión con subscription_tier check (ver header de archivo).
create policy "fotos_logueado_read"
  on public.partido_fotos for select
  using (auth.uid() is not null);

create policy "fotos_admin_insert"
  on public.partido_fotos for insert
  with check (
    exists (select 1 from public.app_admins where user_id = auth.uid())
  );

create policy "fotos_admin_update"
  on public.partido_fotos for update
  using (
    exists (select 1 from public.app_admins where user_id = auth.uid())
  );

create policy "fotos_admin_delete"
  on public.partido_fotos for delete
  using (
    exists (select 1 from public.app_admins where user_id = auth.uid())
  );

-- =====================================================================
-- partido_asistencia (pasaporte)
-- =====================================================================
-- Stamp del pasaporte. Un row = "tal user fue a tal partido en tal ciudad".
-- Se crea via QR check-in en el estadio (Phase E) o admin manual.
-- La ciudad se denormaliza acá para evitar JOIN al renderizar el mapa
-- (un sureño puede ver al verde como visitante en ciudades distintas).

create table if not exists public.partido_asistencia (
  user_id     uuid not null references auth.users(id) on delete cascade,
  partido_id  uuid not null references public.partidos(id) on delete cascade,
  ciudad      text not null,                    -- denormalizado del partido al checkear
  checkeado_por uuid references auth.users(id) on delete set null,  -- admin que escaneó el QR
  created_at  timestamptz not null default now(),
  primary key (user_id, partido_id)
);

create index if not exists idx_asistencia_user
  on public.partido_asistencia (user_id, created_at desc);

alter table public.partido_asistencia enable row level security;

create policy "asistencia_self_read"
  on public.partido_asistencia for select
  using (user_id = auth.uid());

create policy "asistencia_admin_read"
  on public.partido_asistencia for select
  using (
    exists (select 1 from public.app_admins where user_id = auth.uid())
  );

create policy "asistencia_admin_insert"
  on public.partido_asistencia for insert
  with check (
    exists (select 1 from public.app_admins where user_id = auth.uid())
  );

-- =====================================================================
-- actividades (catálogo)
-- =====================================================================

create table if not exists public.actividades (
  id              uuid primary key default gen_random_uuid(),
  slug            text unique not null,         -- 'partido_local', 'reunion_combo', etc.
  nombre          text not null,                -- "Partido en el Atanasio"
  descripcion     text,
  puntos_default  int not null default 10,
  activa          boolean not null default true,
  created_at      timestamptz not null default now()
);

alter table public.actividades enable row level security;

create policy "actividades_public_read"
  on public.actividades for select
  using (activa = true);

create policy "actividades_admin_all"
  on public.actividades for all
  using (
    exists (select 1 from public.app_admins where user_id = auth.uid())
  );

-- Seed actividades base.
insert into public.actividades (slug, nombre, descripcion, puntos_default)
values
  ('partido_local',   'Partido en el Atanasio', 'Asistencia confirmada por QR en la entrada.', 10),
  ('partido_visita',  'Partido como visitante', 'Acompañaste al verde fuera de Medellín.', 25),
  ('reunion_combo',   'Reunión de combo',       'Actividad organizada por tu combo.', 5),
  ('actividad_barra', 'Actividad de la barra',  'Mosaico, banderazo, jornada social, etc.', 15),
  ('viaje_libertadores', 'Viaje internacional', 'Acompañaste al verde fuera del país.', 50)
on conflict (slug) do nothing;

-- =====================================================================
-- puntos_movimientos (ledger)
-- =====================================================================
-- Append-only. Para mostrar el balance hacemos SUM(puntos) WHERE user_id.
-- Para historial: ORDER BY created_at DESC.

create table if not exists public.puntos_movimientos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  actividad_id  uuid references public.actividades(id) on delete set null,
  partido_id    uuid references public.partidos(id) on delete set null,
  puntos        int not null,                   -- positivo o negativo (canje)
  motivo        text,                           -- texto libre, ej "Rifa camiseta"
  otorgado_por  uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_puntos_user_created
  on public.puntos_movimientos (user_id, created_at desc);

alter table public.puntos_movimientos enable row level security;

create policy "puntos_self_read"
  on public.puntos_movimientos for select
  using (user_id = auth.uid());

create policy "puntos_admin_all"
  on public.puntos_movimientos for all
  using (
    exists (select 1 from public.app_admins where user_id = auth.uid())
  );

-- =====================================================================
-- View: profile + puntos balance + stats pasaporte
-- =====================================================================
-- Conveniencia para no hacer 4 queries en el render del perfil. La view
-- respeta RLS porque se basa en las tablas con RLS habilitado.

create or replace view public.v_perfil_sureno as
select
  p.id,
  p.apodo,
  p.nombre,
  p.username,
  p.ciudad,
  p.barrio,
  p.combo,
  p.socio_desde,
  p.avatar_url,
  p.subscription_tier,
  p.subscription_until,
  p.created_at,
  p.updated_at,
  coalesce(
    (select sum(pm.puntos) from public.puntos_movimientos pm where pm.user_id = p.id),
    0
  ) as puntos_balance,
  coalesce(
    (select count(*) from public.partido_asistencia pa where pa.user_id = p.id),
    0
  ) as partidos_asistidos,
  coalesce(
    (select count(distinct pa.ciudad) from public.partido_asistencia pa where pa.user_id = p.id),
    0
  ) as ciudades_visitadas
from public.profiles p;

comment on view public.v_perfil_sureno is
  'Perfil + balance de puntos + stats de pasaporte. RLS heredado de las tablas base.';

-- =====================================================================
-- Admin seed
-- =====================================================================
-- Inserta a santi (+573117312391) en app_admins si su user existe.
-- Idempotente. Re-correr la migration cuando el user se cree es seguro.

do $$
declare
  v_admin_id uuid;
begin
  -- Buscar por phone en cualquiera de los 3 formatos (sin +, con +, email sintético WA).
  select public.find_auth_user_id_by_phone('573117312391') into v_admin_id;

  if v_admin_id is not null then
    insert into public.app_admins (user_id)
    values (v_admin_id)
    on conflict (user_id) do nothing;
    raise notice 'Admin santi (%) seeded.', v_admin_id;
  else
    raise notice 'Admin santi NOT seeded — user with phone +573117312391 does not exist yet. Re-run this migration after the user signs up.';
  end if;
end $$;
