// app/api/admin/users/route.ts
// GET — lista de users con búsqueda + paginación.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const search = url.searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);

  const admin = createAdminClient();

  // Pull profiles + auth.users data en paralelo. Usamos admin.auth.admin
  // para listAll users (que incluye phone, email, last_sign_in_at).
  const [profilesRes, authRes] = await Promise.all([
    (() => {
      let q = admin
        .from("profiles")
        .select("id, apodo, nombre, ciudad, combo, created_at, updated_at", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (search) {
        // Búsqueda simple: apodo/nombre/ciudad/combo ilike. Phone/email
        // se matchean abajo via auth.users.
        q = q.or(
          `apodo.ilike.%${search}%,nombre.ilike.%${search}%,ciudad.ilike.%${search}%,combo.ilike.%${search}%`,
        );
      }
      return q;
    })(),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (profilesRes.error) {
    return NextResponse.json({ error: profilesRes.error.message }, { status: 500 });
  }

  // Index auth.users por id para join.
  const authById = new Map<string, { phone: string | null; email: string | null; last_sign_in_at: string | null }>();
  for (const u of authRes.data?.users ?? []) {
    authById.set(u.id, {
      phone: u.phone ?? null,
      email: u.email ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
    });
  }

  const users = (profilesRes.data ?? []).map((p) => {
    const a = authById.get(p.id) ?? { phone: null, email: null, last_sign_in_at: null };
    return {
      id: p.id,
      // Display: apodo (nuevo) > nombre (legacy). El admin UI ya usa el
      // campo `nombre` para mostrar — mantenemos esa key pero rellenamos
      // con apodo cuando exista para que se vea el nombre nuevo.
      nombre: p.apodo ?? p.nombre,
      ciudad: p.ciudad,
      combo: p.combo,
      phone: a.phone,
      email: a.email,
      last_sign_in_at: a.last_sign_in_at,
      created_at: p.created_at,
    };
  });

  return NextResponse.json({
    users,
    total: profilesRes.count ?? users.length,
    limit,
    offset,
  });
}
