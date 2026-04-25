// lib/ciudades.ts
// Ciudades y municipios colombianos para el autocomplete del registro.
// Priorizadas: área metropolitana de Medellín (donde está la barra),
// Eje Cafetero, capitales de departamento, ciudades grandes.
//
// El usuario PUEDE escribir cualquier ciudad libre — esto es solo un
// shortcut para los casos comunes.

export const CIUDADES_COLOMBIA: string[] = [
  // Área Metropolitana del Valle de Aburrá (donde está el Atanasio)
  "Medellín",
  "Bello",
  "Itagüí",
  "Envigado",
  "Sabaneta",
  "La Estrella",
  "Caldas",
  "Copacabana",
  "Girardota",
  "Barbosa",

  // Antioquia — otros municipios populares
  "Rionegro",
  "Marinilla",
  "El Retiro",
  "La Ceja",
  "Guarne",
  "Apartadó",
  "Turbo",
  "Caucasia",
  "Yarumal",
  "Santa Fe de Antioquia",
  "Jardín",
  "Jericó",
  "Sonsón",
  "Necoclí",
  "Carepa",
  "Chigorodó",
  "Amagá",
  "Andes",
  "Urrao",

  // Eje Cafetero
  "Manizales",
  "Pereira",
  "Armenia",
  "Chinchiná",
  "Villamaría",
  "Calarcá",
  "Dosquebradas",
  "Santa Rosa de Cabal",
  "La Dorada",

  // Capitales y ciudades grandes
  "Bogotá",
  "Cali",
  "Barranquilla",
  "Cartagena",
  "Cúcuta",
  "Bucaramanga",
  "Santa Marta",
  "Ibagué",
  "Pasto",
  "Neiva",
  "Villavicencio",
  "Montería",
  "Sincelejo",
  "Popayán",
  "Tunja",
  "Florencia",
  "Valledupar",
  "Riohacha",
  "Quibdó",
  "Yopal",
  "Mocoa",
  "Arauca",
  "Leticia",
  "Mitú",
  "Inírida",
  "San José del Guaviare",
  "Puerto Carreño",

  // Otros municipios populares
  "Soacha",
  "Floridablanca",
  "Girón",
  "Piedecuesta",
  "Palmira",
  "Buenaventura",
  "Tuluá",
  "Cartago",
  "Buga",
  "Yumbo",
  "Jamundí",
  "Soledad",
  "Malambo",
  "Sabanagrande",
  "Magangué",
  "Turbaco",
  "El Carmen de Bolívar",
  "Aguachica",
  "Ocaña",
  "Maicao",
  "Fundación",
  "Ciénaga",
  "Sogamoso",
  "Duitama",
  "Chiquinquirá",
  "Espinal",
  "Honda",
  "Girardot",
  "Fusagasugá",
  "Zipaquirá",
  "Chía",
  "Cajicá",
  "Cota",
  "Funza",
  "Mosquera",
  "Madrid",
  "Facatativá",
  "Tabio",
  "Tenjo",

  // Internacional — para sureños que viven afuera
  "Miami",
  "Madrid (España)",
  "Buenos Aires",
  "Ciudad de México",
  "Nueva York",
  "Toronto",
];

// Normaliza para búsqueda: minúsculas + sin acentos.
// El range ̀-ͯ cubre los "combining diacritical marks" que
// quedan después de NFKD (ej: "Medellín" → "Medellín" → "medellin").
export function normalizeCiudad(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

// Filtra ciudades que empiezan con o contienen el query, max N resultados.
// Prioriza las que EMPIEZAN con el query para que "med" → Medellín primero.
export function searchCiudades(query: string, max = 6): string[] {
  const q = normalizeCiudad(query.trim());
  if (!q) return [];
  const startsWith: string[] = [];
  const includes: string[] = [];
  for (const c of CIUDADES_COLOMBIA) {
    const norm = normalizeCiudad(c);
    if (norm.startsWith(q)) startsWith.push(c);
    else if (norm.includes(q)) includes.push(c);
    if (startsWith.length >= max) break;
  }
  return [...startsWith, ...includes].slice(0, max);
}
