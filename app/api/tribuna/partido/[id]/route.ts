// app/api/tribuna/partido/[id]/route.ts
// GET — detalle de un partido + fotos no expiradas, agrupadas por sección.
// El `seccion` filtra opcionalmente para una sola sección (paginar mejor).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { publicUrlForKey } from "@/lib/r2-public";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const url = new URL(request.url);
  const seccion = url.searchParams.get("seccion");

  const supabase = await createClient();

  const { data: partido, error: pErr } = await supabase
    .from("partidos")
    .select("id, fecha, rival, competencia, sede, ciudad, es_local, resultado")
    .eq("id", id)
    .maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!partido) return NextResponse.json({ error: "not found" }, { status: 404 });

  let fotosQ = supabase
    .from("partido_fotos")
    .select("id, seccion, r2_key_thumb, r2_key_full, width, height, uploaded_at, destacada")
    .eq("partido_id", id)
    .gt("expires_at", new Date().toISOString())
    .order("uploaded_at", { ascending: false });

  if (seccion) {
    fotosQ = fotosQ.eq("seccion", seccion);
  }

  const { data: fotos, error: fErr } = await fotosQ;
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });

  // Resolver URLs públicas en el server (env var solo disponible acá).
  const fotosWithUrls = (fotos ?? []).map((f) => ({
    id: f.id,
    seccion: f.seccion,
    width: f.width,
    height: f.height,
    destacada: f.destacada,
    thumb_url: publicUrlForKey(f.r2_key_thumb),
    full_url: publicUrlForKey(f.r2_key_full),
    uploaded_at: f.uploaded_at,
  }));

  return NextResponse.json({ partido, fotos: fotosWithUrls });
}
