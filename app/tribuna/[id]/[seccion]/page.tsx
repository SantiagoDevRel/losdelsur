// app/tribuna/[id]/[seccion]/page.tsx
// Fotos de UNA sección de la tribuna sur de un partido específico.
// Grid + lightbox.

export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { TribunaSeccion } from "./tribuna-seccion";

const SECCIONES_VALIDAS = new Set(["sur_a1", "sur_a2", "sur_b1", "sur_b2"]);

interface PageProps {
  params: Promise<{ id: string; seccion: string }>;
}

export default async function Page({ params }: PageProps) {
  const { id, seccion } = await params;
  const seccionLower = seccion.toLowerCase();
  if (!SECCIONES_VALIDAS.has(seccionLower)) notFound();
  return (
    <TribunaSeccion
      partidoId={id}
      seccion={seccionLower.toUpperCase() as "SUR_A1" | "SUR_A2" | "SUR_B1" | "SUR_B2"}
    />
  );
}
