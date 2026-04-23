// lib/search.ts
// Wrapper de Fuse.js para búsqueda fuzzy client-side. Se indexa por
// título, letra, y la canción original (artista + título) con un
// threshold tolerante a typos. Todo corre en el navegador, así que la
// búsqueda sigue funcionando offline una vez cargada la app.

import Fuse from "fuse.js";
import type { Cancion } from "./types";

// Claves a indexar y su peso relativo.
// - `titulo` pesa más porque es el match más relevante.
// - `letra` pesa menos porque es larga y puede generar falsos positivos.
const FUSE_OPTIONS: ConstructorParameters<typeof Fuse<Cancion>>[1] = {
  keys: [
    { name: "titulo", weight: 0.7 },
    { name: "letra", weight: 0.3 },
  ],
  threshold: 0.3, // Tolerante a typos pero no absurdamente permisivo.
  ignoreLocation: true,
  includeScore: false,
};

// Crea un índice Fuse reutilizable para un catálogo dado.
export function createSearchIndex(canciones: Cancion[]): Fuse<Cancion> {
  return new Fuse(canciones, FUSE_OPTIONS);
}

// Ejecuta una búsqueda. Si el query está vacío, devuelve el catálogo
// completo tal cual, para que la UI pueda mostrar la lista sin filtrar.
export function searchCanciones(
  index: Fuse<Cancion>,
  canciones: Cancion[],
  query: string,
): Cancion[] {
  const q = query.trim();
  if (!q) return canciones;
  return index.search(q).map((r) => r.item);
}
