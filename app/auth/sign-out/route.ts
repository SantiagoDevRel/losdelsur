// app/auth/sign-out/route.ts
// Cerrar sesión. POST → borra la sesión de Supabase y redirige a /.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", new URL(request.url).origin), {
    status: 303,
  });
}
