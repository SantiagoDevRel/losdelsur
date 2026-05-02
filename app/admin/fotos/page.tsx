// app/admin/fotos/page.tsx
// Admin: subir fotos por (partido + sección de tribuna). Drag-drop +
// thumbs WebP cliente-side + upload directo a R2 con presigned URLs.

export const dynamic = "force-dynamic";

import { FotosAdmin } from "./fotos-admin";

export default function Page() {
  return <FotosAdmin />;
}
