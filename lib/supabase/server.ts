// lib/supabase/server.ts
// Cliente Supabase para Server Components, Route Handlers y Server Actions.
// Lee y actualiza cookies via next/headers. NO usar en Client Components.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // En Server Components puros (fuera de Server Actions) no se
            // pueden escribir cookies. El middleware refresca la sesión —
            // acá lo ignoramos con seguridad.
          }
        },
      },
    },
  );
}
