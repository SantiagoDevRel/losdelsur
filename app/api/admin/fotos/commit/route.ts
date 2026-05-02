// app/api/admin/fotos/commit/route.ts
// POST — después de que el admin uploadeó cada foto a R2 con su presigned
// URL, llama acá con la metadata para que insertemos los rows de
// partido_fotos. Si el upload de R2 falla en alguna, el admin no incluye
// esa foto y nada queda colgado.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

interface FotoIn {
  id: string;
  r2_key_full: string;
  r2_key_thumb: string;
  width?: number | null;
  height?: number | null;
  size_bytes?: number | null;
}

interface Body {
  partido_id: string;
  seccion: "SUR_A1" | "SUR_A2" | "SUR_B1" | "SUR_B2";
  fotos: FotoIn[];
  // TTL custom opcional (default 7 días).
  ttl_days?: number;
}

const VALID_SECCIONES = new Set(["SUR_A1", "SUR_A2", "SUR_B1", "SUR_B2"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.partido_id || !VALID_SECCIONES.has(body.seccion)) {
    return NextResponse.json({ error: "partido_id + seccion required" }, { status: 400 });
  }
  if (!Array.isArray(body.fotos) || body.fotos.length === 0 || body.fotos.length > 50) {
    return NextResponse.json({ error: "fotos: 1 a 50" }, { status: 400 });
  }

  const ttlDays = Math.max(1, Math.min(30, body.ttl_days ?? 7));
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  // Service role para insert — RLS también permite (admin policy) pero
  // service-role evita race conditions de auth.uid() en la function.
  const admin = createAdminClient();
  const rows = body.fotos.map((f) => ({
    id: f.id,
    partido_id: body.partido_id,
    seccion: body.seccion,
    r2_key_thumb: f.r2_key_thumb,
    r2_key_full: f.r2_key_full,
    width: f.width ?? null,
    height: f.height ?? null,
    size_bytes: f.size_bytes ?? null,
    uploaded_by: user.id,
    expires_at: expiresAt,
  }));

  const { data, error } = await admin
    .from("partido_fotos")
    .insert(rows)
    .select("id, partido_id, seccion, r2_key_full, r2_key_thumb, expires_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, fotos: data });
}
