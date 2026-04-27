// app/admin/push/page.tsx
// Composer de push notifications — envía a todos / por ciudad / por user.
// Server component que pasa la lista de ciudades disponibles al composer.

import { createAdminClient } from "@/lib/supabase/admin";
import { PushComposer } from "./push-composer";

export const dynamic = "force-dynamic";

async function loadCiudades(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("ciudad");
  const set = new Set<string>();
  for (const row of data ?? []) {
    if (row.ciudad) set.add(row.ciudad);
  }
  return [...set].sort();
}

export default async function AdminPushPage() {
  const ciudades = await loadCiudades();
  return <PushComposer availableCiudades={ciudades} />;
}
