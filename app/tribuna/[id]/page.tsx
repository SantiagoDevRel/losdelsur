// app/tribuna/[id]/page.tsx
// Detalle de un partido. Tabs por sección de tribuna, grid de thumbs +
// lightbox al tocar una foto.

export const dynamic = "force-dynamic";

import { TribunaPartido } from "./tribuna-partido";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <TribunaPartido partidoId={id} />;
}
