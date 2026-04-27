// app/api/me/is-admin/route.ts
// Devuelve si el usuario actual es admin. Usado por la UI para mostrar
// el link "ADMIN" en /perfil solo a quien corresponde.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ isAdmin: false });
  return NextResponse.json({ isAdmin: await isAdmin(user.id) });
}
