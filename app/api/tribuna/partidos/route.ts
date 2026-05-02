// app/api/tribuna/partidos/route.ts
// GET — lista partidos pasados con fotos (no expiradas) + conteo por
// sección. Usado por la home de /tribuna para mostrar la lista.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface FotoCount {
  partido_id: string;
  seccion: string;
}

export async function GET() {
  const supabase = await createClient();

  // Solo partidos pasados — los futuros no tienen fotos.
  const { data: partidos, error } = await supabase
    .from("partidos")
    .select("id, fecha, rival, competencia, sede, ciudad, es_local, resultado")
    .lte("fecha", new Date().toISOString())
    .order("fecha", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!partidos || partidos.length === 0) {
    return NextResponse.json({ partidos: [] });
  }

  // Conteos por (partido, seccion). Solo fotos no expiradas.
  // RLS de partido_fotos gatea por user logueado — si el caller no está
  // logueado, va a recibir 0 fotos. Se renderiza el partido igual con
  // count=0 para que la lista tenga estructura.
  const { data: fotos } = await supabase
    .from("partido_fotos")
    .select("partido_id, seccion")
    .gt("expires_at", new Date().toISOString())
    .in(
      "partido_id",
      partidos.map((p) => p.id),
    );

  const countMap = new Map<string, Record<string, number>>();
  for (const f of (fotos ?? []) as FotoCount[]) {
    if (!countMap.has(f.partido_id)) countMap.set(f.partido_id, {});
    const m = countMap.get(f.partido_id)!;
    m[f.seccion] = (m[f.seccion] ?? 0) + 1;
  }

  const rows = partidos.map((p) => {
    const counts = countMap.get(p.id) ?? {};
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      ...p,
      fotos_total: total,
      fotos_por_seccion: {
        SUR_A1: counts.SUR_A1 ?? 0,
        SUR_A2: counts.SUR_A2 ?? 0,
        SUR_B1: counts.SUR_B1 ?? 0,
        SUR_B2: counts.SUR_B2 ?? 0,
      },
    };
  });

  return NextResponse.json({ partidos: rows });
}
