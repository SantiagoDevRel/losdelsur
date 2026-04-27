// lib/auth/admin.ts
// Helper para chequear si un user es admin. Lee de la tabla `app_admins`
// (que solo es visible via service_role) — un user normal no puede saber
// si está o no en la lista, ni promoverse a sí mismo.

import { createAdminClient } from "@/lib/supabase/admin";

export async function isAdmin(userId: string): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("app_admins")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return false;
    return data !== null;
  } catch {
    // Si no hay SUPABASE_SERVICE_ROLE_KEY (dev sin env var), nadie es admin.
    return false;
  }
}
