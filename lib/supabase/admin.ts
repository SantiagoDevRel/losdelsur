// lib/supabase/admin.ts
// Server-only Supabase client con service_role key. Bypassa RLS.
// SOLO usar en route handlers detrás de auth/admin secret. Nunca en
// client components ni en código que pueda llegar al browser.

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error("Supabase admin client requires SUPABASE_SERVICE_ROLE_KEY");
  }
  return createSupabaseClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
