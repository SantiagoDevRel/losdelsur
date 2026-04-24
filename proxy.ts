// proxy.ts (antes middleware.ts — renombrado en Next 16)
// Interceptor global — refresca la sesión Supabase en cada navegación
// para que el access token no expire silenciosamente.

import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Ignoramos assets, sw, y rutas next internas. El SW es crítico:
    // si el proxy lo toca, Serwist puede confundirse.
    "/((?!_next/static|_next/image|favicon.ico|icons|covers|audio|design-assets|install-art|sw.js|swe-worker|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|m4a|mp3|mp4|webm|ico)$).*)",
  ],
};
