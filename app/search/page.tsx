// app/search/page.tsx
// Búsqueda fuzzy del catálogo completo. Server component que pasa las
// canciones al buscador cliente.

import { getAllCanciones } from "@/lib/content";
import { SearchView } from "./search-view";

export const metadata = { title: "Buscar — La Banda Los Del Sur" };

export default function SearchPage() {
  return <SearchView canciones={getAllCanciones()} />;
}
