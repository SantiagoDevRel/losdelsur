// app/api/admin/lookup-user/route.ts
// GET ?id=<userId> — admin pide info pública de un user para mostrar
// confirmación antes de sumarle puntos. Solo nombre/apodo/ciudad
// (no PII como phone/email).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("v_perfil_sureno")
    .select("id, apodo, nombre, ciudad, combo, puntos_balance, partidos_asistidos, ciudades_visitadas")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "user not found" }, { status: 404 });

  return NextResponse.json({ user: data });
}
