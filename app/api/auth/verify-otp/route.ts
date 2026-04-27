// app/api/auth/verify-otp/route.ts
// Server-side wrapper de supabase.auth.verifyOtp. CRÍTICO: hacer esto
// server-side persiste las cookies via Set-Cookie HttpOnly que Safari
// iOS respeta sí o sí, evitando el bug donde verifyOtp en el browser
// dejaba al user "medio logueado" — sesión válida en memory pero
// cookies perdidas, y al navegar a /perfil parecía no logueado.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface Body {
  phone: string;
  token: string;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.phone || !body.token) {
    return NextResponse.json(
      { error: "phone y token requeridos" },
      { status: 400 },
    );
  }
  if (!/^\d{4,8}$/.test(body.token)) {
    return NextResponse.json(
      { error: "código inválido" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    phone: body.phone,
    token: body.token,
    type: "sms",
  });
  if (error) {
    return NextResponse.json(
      { error: error.message || "Código inválido o vencido" },
      { status: 401 },
    );
  }
  // En este punto las cookies de session ya quedaron seteadas por el
  // server client via setAll callback en lib/supabase/server.ts.
  return NextResponse.json({
    ok: true,
    user: data.user ? { id: data.user.id } : null,
  });
}
