---
name: new-supabase-migration
description: Crea una migración SQL nueva para Supabase con template estándar (RLS, índices, comentarios) y la valida contra el schema actual usando el MCP de Supabase antes de aplicarla.
disable-model-invocation: true
---

# new-supabase-migration

Skill invocable solo por el usuario (`/new-supabase-migration <descripción>`).

## Pasos

1. **Pedir descripción** si no vino como argumento (qué tabla/columna/cambio).

2. **Inspeccionar schema actual**
   - Llamar `mcp__claude_ai_Supabase__list_tables` para ver tablas existentes.
   - Si la migración toca una tabla existente, leer sus columnas y políticas.

3. **Generar archivo de migración**
   - Path: `supabase/migrations/<YYYYMMDDHHMMSS>_<slug>.sql` (crear carpeta si no existe).
   - Timestamp en UTC.
   - Slug: kebab-case de la descripción.

4. **Template obligatorio**

```sql
-- Migration: <descripción>
-- Author: <git user>
-- Date: <ISO date>

begin;

-- 1. Schema changes
-- create table / alter table / add column ...

-- 2. Indexes (si aplica)
-- create index ... on ... (...);

-- 3. RLS
-- alter table <t> enable row level security;
-- create policy "<name>" on <t> for <op> using (...) with check (...);

-- 4. Comments (documenta intent)
-- comment on column <t>.<c> is '...';

commit;
```

5. **Reglas**
   - Toda tabla nueva en `public` → `enable row level security` + al menos una policy por operación usada.
   - Columnas con datos de usuario → policy basada en `auth.uid()`.
   - Nada de `drop table` / `drop column` sin confirmar con el usuario (destructivo).
   - Si la columna es NOT NULL y la tabla tiene filas, requerir DEFAULT o backfill explícito.

6. **Validación previa a aplicar**
   - Mostrar el SQL al usuario y preguntar si aplicar con `mcp__claude_ai_Supabase__apply_migration` o solo dejar el archivo.
   - Tras aplicar, correr `mcp__claude_ai_Supabase__get_advisors` y reportar warnings de seguridad.
   - Si se agregaron tipos, sugerir regenerar con `mcp__claude_ai_Supabase__generate_typescript_types` y guardar en `lib/supabase/database.types.ts`.

## NO hacer

- No aplicar migraciones destructivas sin confirmación explícita.
- No saltarse RLS "por ahora".
- No commitear sin que el usuario confirme.
