-- 001_wa_magic_auth.sql
-- WhatsApp magic-link auth (canal alternativo a SMS OTP de Twilio).
--
-- Flujo: user manda msg al bot por WA → webhook genera token one-shot
-- (10 min TTL) → bot responde con botón CTA al user → user toca botón
-- → /api/auth/wa-magic?token=XXX → consume atómico → mintea sesión.
--
-- Ahorra plata vs Twilio: la conversación la abre el USER (mensaje
-- entrante), entonces las respuestas utility de Meta caen en la ventana
-- de servicio gratuita de 24h. SMS de Twilio en Colombia: ~$0.054/msg.

-- =====================================================================
-- Tabla: wa_magic_tokens
-- =====================================================================
-- Tokens efímeros de un solo uso. consumed_at + WHERE consumed_at IS NULL
-- en el UPDATE de consumo previene race conditions (dos taps simultáneos
-- al botón → solo uno gana).

create table if not exists public.wa_magic_tokens (
  token       text primary key,                 -- 64 hex chars (32 bytes)
  phone       text not null,                    -- normalizado, sin + (ej "573001234567")
  expires_at  timestamptz not null,             -- now() + 10 min
  consumed_at timestamptz,                      -- null = pendiente; set = usado
  ip          text,                             -- audit
  created_at  timestamptz not null default now()
);

-- Lookup por phone para rate-limit del webhook + cleanup de pendientes.
create index if not exists idx_wa_magic_tokens_phone_created
  on public.wa_magic_tokens (phone, created_at desc);

-- Cleanup de tokens viejos (corre periódicamente vía cron interno o manual).
create index if not exists idx_wa_magic_tokens_expires
  on public.wa_magic_tokens (expires_at)
  where consumed_at is null;

-- RLS: nadie del client la toca. Solo service_role server-side.
alter table public.wa_magic_tokens enable row level security;
-- Sin policies = nadie puede leer/escribir desde el cliente. Service role
-- bypassa RLS por diseño, así que el server tiene acceso completo.

comment on table public.wa_magic_tokens is
  'Tokens efímeros (10min, one-shot) para auth via WhatsApp magic-link. RLS denies all client access.';

-- =====================================================================
-- RPC: find_auth_user_id_by_phone
-- =====================================================================
-- Busca un auth.users.id existente para un phone normalizado, matcheando
-- contra los 3 formatos en que un user puede estar guardado:
--   1. auth.users.phone = '573001234567' (formato Supabase, sin +)
--   2. auth.users.phone = '+573001234567' (por si entró con +)
--   3. auth.users.email = '573001234567@wa.losdelsur.app' (sintético, para
--      users que SOLO entraron por WA y no tienen phone — caso raro pero
--      previene duplicados si la lookup por phone falla)
--
-- SECURITY DEFINER porque auth.users no es accesible vía PostgREST normal
-- — ejecuta con permisos del owner (postgres) pero solo retorna el id,
-- nunca data sensible.

create or replace function public.find_auth_user_id_by_phone(p_phone text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_synth_email text;
begin
  if p_phone is null or length(p_phone) < 7 then
    return null;
  end if;

  v_synth_email := p_phone || '@wa.losdelsur.app';

  -- 1. Match exacto de phone (sin +)
  select id into v_user_id
  from auth.users
  where phone = p_phone
  limit 1;

  if v_user_id is not null then
    return v_user_id;
  end if;

  -- 2. Match con + prefix
  select id into v_user_id
  from auth.users
  where phone = '+' || p_phone
  limit 1;

  if v_user_id is not null then
    return v_user_id;
  end if;

  -- 3. Match por email sintético (solo accounts WA-only)
  select id into v_user_id
  from auth.users
  where email = v_synth_email
  limit 1;

  return v_user_id;
end;
$$;

revoke all on function public.find_auth_user_id_by_phone(text) from public;
grant execute on function public.find_auth_user_id_by_phone(text) to service_role;

comment on function public.find_auth_user_id_by_phone(text) is
  'Encuentra auth.users.id por phone normalizado. Matchea los 3 formatos de storage (sin +, con +, email sintético). Solo service_role.';
