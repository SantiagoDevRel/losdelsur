// app/admin/partidos/page.tsx
// Admin: lista de partidos + form para crear uno nuevo. CRUD mínimo.
// Solo create + list por ahora — edit/delete vendrá si se necesita.

export const dynamic = "force-dynamic";

import { PartidosAdmin } from "./partidos-admin";

export default function Page() {
  return <PartidosAdmin />;
}
