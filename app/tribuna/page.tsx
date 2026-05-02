// app/tribuna/page.tsx
// Lista de partidos pasados con fotos. Click → detalle por sección.
//
// Si el user no está logueado, RLS de partido_fotos no le devuelve nada,
// igual mostramos los partidos como "encontrate cuando entres". El
// botón principal es ENTRAR.

export const dynamic = "force-dynamic";

import { TribunaList } from "./tribuna-list";

export const metadata = { title: "Tribuna — La Banda Los Del Sur" };

export default function Page() {
  return <TribunaList />;
}
