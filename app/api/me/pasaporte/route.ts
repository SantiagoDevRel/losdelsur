// app/api/me/pasaporte/route.ts
// GET — devuelve el pasaporte del user actual: lista de ciudades
// visitadas (distinct) + últimos partidos asistidos.
// Lee de `partido_asistencia` (RLS limita a self).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ciudades: [], asistencias: [] }, { status: 200 });
  }

  // RLS de partido_asistencia ya filtra por self — el .eq es redundante
  // pero explícito es mejor para auditar.
  const { data, error } = await supabase
    .from("partido_asistencia")
    .select("ciudad, created_at, partido_id, partidos:partido_id(rival, fecha)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ciudadesSet = new Set<string>();
  for (const row of data ?? []) {
    if (row.ciudad) ciudadesSet.add(row.ciudad);
  }

  return NextResponse.json({
    ciudades: Array.from(ciudadesSet),
    asistencias: (data ?? []).map((r) => ({
      ciudad: r.ciudad,
      partido_id: r.partido_id,
      // Supabase devuelve la relación como objeto si no es array, pero
      // por tipos PostgREST nos llega como array → desestructuramos.
      rival: Array.isArray(r.partidos) ? r.partidos[0]?.rival : (r.partidos as { rival?: string } | null)?.rival,
      fecha: Array.isArray(r.partidos) ? r.partidos[0]?.fecha : (r.partidos as { fecha?: string } | null)?.fecha,
    })),
  });
}
