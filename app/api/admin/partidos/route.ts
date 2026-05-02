// app/api/admin/partidos/route.ts
// GET — lista de partidos (admin).
// POST — crea un nuevo partido.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

interface PartidoBody {
  fecha: string;
  rival: string;
  competencia?: string | null;
  sede?: string;
  ciudad?: string;
  es_local?: boolean;
  resultado?: string | null;
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("partidos")
    .select("id, fecha, rival, competencia, sede, ciudad, es_local, resultado, created_at")
    .order("fecha", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partidos: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: PartidoBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.fecha || !body.rival) {
    return NextResponse.json({ error: "fecha + rival required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("partidos")
    .insert({
      fecha: body.fecha,
      rival: body.rival.trim(),
      competencia: body.competencia?.trim() || null,
      sede: body.sede?.trim() || "Atanasio Girardot",
      ciudad: body.ciudad?.trim() || "Medellín",
      es_local: body.es_local ?? true,
      resultado: body.resultado?.trim() || null,
      created_by: user.id,
    })
    .select("id, fecha, rival, competencia, sede, ciudad, es_local, resultado, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ partido: data });
}
