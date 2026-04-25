// lib/ciudades.ts
// Ciudades/municipios para el autocomplete del registro.
//
// Formato:
//   - Colombia:    "<Ciudad>, <Departamento>"  (ej: "Medellín, Antioquia")
//   - Internacional: "<Ciudad> (<País>)"        (ej: "Madrid (España)")
//
// Orden: priorizamos área metropolitana de Medellín (donde está el
// Atanasio y la mayoría de los sureños), después resto de Antioquia,
// Eje Cafetero, Bogotá + Cundinamarca, y el resto del país. Al final
// las internacionales, para sureños que viven afuera.
//
// El usuario PUEDE escribir cualquier ciudad libre — esta lista es
// solo un shortcut para los casos comunes.

export const CIUDADES_COLOMBIA: string[] = [
  // Área Metropolitana del Valle de Aburrá — Antioquia
  "Medellín, Antioquia",
  "Bello, Antioquia",
  "Itagüí, Antioquia",
  "Envigado, Antioquia",
  "Sabaneta, Antioquia",
  "La Estrella, Antioquia",
  "Caldas, Antioquia",
  "Copacabana, Antioquia",
  "Girardota, Antioquia",
  "Barbosa, Antioquia",

  // Antioquia — otros municipios populares
  "Rionegro, Antioquia",
  "Marinilla, Antioquia",
  "El Retiro, Antioquia",
  "La Ceja, Antioquia",
  "Guarne, Antioquia",
  "Apartadó, Antioquia",
  "Turbo, Antioquia",
  "Caucasia, Antioquia",
  "Yarumal, Antioquia",
  "Santa Fe de Antioquia, Antioquia",
  "Jardín, Antioquia",
  "Jericó, Antioquia",
  "Sonsón, Antioquia",
  "Necoclí, Antioquia",
  "Carepa, Antioquia",
  "Chigorodó, Antioquia",
  "Amagá, Antioquia",
  "Andes, Antioquia",
  "Urrao, Antioquia",

  // Eje Cafetero
  "Manizales, Caldas",
  "Chinchiná, Caldas",
  "Villamaría, Caldas",
  "La Dorada, Caldas",
  "Pereira, Risaralda",
  "Dosquebradas, Risaralda",
  "Santa Rosa de Cabal, Risaralda",
  "Armenia, Quindío",
  "Calarcá, Quindío",

  // Bogotá + Cundinamarca
  "Bogotá, D.C.",
  "Soacha, Cundinamarca",
  "Girardot, Cundinamarca",
  "Fusagasugá, Cundinamarca",
  "Zipaquirá, Cundinamarca",
  "Chía, Cundinamarca",
  "Cajicá, Cundinamarca",
  "Cota, Cundinamarca",
  "Funza, Cundinamarca",
  "Mosquera, Cundinamarca",
  "Madrid, Cundinamarca",
  "Facatativá, Cundinamarca",
  "Tabio, Cundinamarca",
  "Tenjo, Cundinamarca",

  // Valle del Cauca
  "Cali, Valle del Cauca",
  "Palmira, Valle del Cauca",
  "Buenaventura, Valle del Cauca",
  "Tuluá, Valle del Cauca",
  "Cartago, Valle del Cauca",
  "Buga, Valle del Cauca",
  "Yumbo, Valle del Cauca",
  "Jamundí, Valle del Cauca",

  // Costa Caribe
  "Barranquilla, Atlántico",
  "Soledad, Atlántico",
  "Malambo, Atlántico",
  "Sabanagrande, Atlántico",
  "Cartagena, Bolívar",
  "Magangué, Bolívar",
  "Turbaco, Bolívar",
  "El Carmen de Bolívar, Bolívar",
  "Santa Marta, Magdalena",
  "Fundación, Magdalena",
  "Ciénaga, Magdalena",
  "Riohacha, La Guajira",
  "Maicao, La Guajira",
  "Valledupar, Cesar",
  "Aguachica, Cesar",
  "Montería, Córdoba",
  "Sincelejo, Sucre",

  // Santanderes
  "Cúcuta, Norte de Santander",
  "Ocaña, Norte de Santander",
  "Bucaramanga, Santander",
  "Floridablanca, Santander",
  "Girón, Santander",
  "Piedecuesta, Santander",

  // Tolima + Huila + Boyacá
  "Ibagué, Tolima",
  "Espinal, Tolima",
  "Honda, Tolima",
  "Neiva, Huila",
  "Tunja, Boyacá",
  "Sogamoso, Boyacá",
  "Duitama, Boyacá",
  "Chiquinquirá, Boyacá",

  // Sur del país
  "Pasto, Nariño",
  "Popayán, Cauca",
  "Florencia, Caquetá",
  "Mocoa, Putumayo",

  // Llanos + Amazonía + Pacífico chocó
  "Villavicencio, Meta",
  "Yopal, Casanare",
  "Arauca, Arauca",
  "Quibdó, Chocó",
  "Leticia, Amazonas",
  "Mitú, Vaupés",
  "Inírida, Guainía",
  "San José del Guaviare, Guaviare",
  "Puerto Carreño, Vichada",

  // Internacionales — para sureños que viven afuera
  "Miami (Estados Unidos)",
  "Nueva York (Estados Unidos)",
  "Madrid (España)",
  "Barcelona (España)",
  "Buenos Aires (Argentina)",
  "Ciudad de México (México)",
  "Toronto (Canadá)",
];

// Normaliza para búsqueda: minúsculas + sin acentos.
// El range ̀-ͯ cubre los "combining diacritical marks" que
// quedan después de NFKD (ej: "Medellín" → "medellin").
export function normalizeCiudad(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
}

// Filtra ciudades que empiezan con o contienen el query, max N resultados.
// Prioriza las que EMPIEZAN con el query (ej: "med" → "Medellín, Antioquia"
// primero, no "Almagro" o ciudades intermedias).
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
