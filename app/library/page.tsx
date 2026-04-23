// app/library/page.tsx
// "Biblioteca offline": lista las canciones que el hincha ya descargó
// (que viven en el Cache API bajo `lds-audio-v1`). Client component
// porque necesitamos leer `caches` del navegador.

import { getAllCanciones } from "@/lib/content";
import { LibraryView } from "./library-view";

export const metadata = { title: "Biblioteca offline — La Banda Los Del Sur" };

export default function LibraryPage() {
  return <LibraryView canciones={getAllCanciones()} />;
}
