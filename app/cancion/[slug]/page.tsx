// app/cancion/[slug]/page.tsx
// Vista de canción rediseñada al estilo "rudo" del handoff:
// header minimal con back + dots, título gigante en Anton con barra
// lateral verde, strip de acciones (favorita/descargar/compartir),
// letra en uppercase con controles de tamaño, footer "grabada en
// Atanasio" + sticker "LA SUR", y mini-player flotante en la base
// (sustituye al reproductor grande del MVP original).
//
// Un solo componente "client" (SongView) hace toda la interactividad;
// esta página queda como server component que resuelve el slug y
// bootstrappea datos al cliente.

import { notFound } from "next/navigation";
import { getAllCanciones, getCancionBySlug } from "@/lib/content";
import { SongView } from "./song-view";
import { SwipeBack } from "@/components/swipe-back";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return getAllCanciones().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const hit = getCancionBySlug(slug);
  if (!hit) return { title: "Canción no encontrada" };
  return {
    title: `${hit.cancion.titulo} — La Banda Los Del Sur`,
    description: `Letra y audio de "${hit.cancion.titulo}", cántico de la barra Los Del Sur.`,
  };
}

export default async function CancionPage({ params }: PageProps) {
  const { slug } = await params;
  const hit = getCancionBySlug(slug);
  if (!hit) notFound();

  // Índice 1-based de la canción dentro de su CD, para el eyebrow
  // "CÁNTICO #N".
  const numero = hit.cd.canciones.findIndex((c) => c.id === hit.cancion.id) + 1;

  return (
    <SwipeBack fallbackHref={`/cds/${hit.cd.id}`}>
      <SongView cancion={hit.cancion} cd={hit.cd} numero={numero} />
    </SwipeBack>
  );
}
