// lib/colombia-cities.ts
// Coordenadas de ciudades clave de Colombia para el mapa del pasaporte.
// El SVG del pasaporte usa un viewBox 0 0 100 140 alineado aproximadamente
// con lng [-79, -67] horizontal y lat [12, -4] vertical.
//
// Conversión:
//   x = (lng + 79) / 12 * 100
//   y = (12 - lat) / 16 * 140
//
// Las ciudades acá tienen que matchear (case-insensitive, normalizado)
// con lo que se guarda en `partido_asistencia.ciudad`. Si una ciudad
// asistida no está en este catálogo, igual cuenta para el contador de
// `ciudades_visitadas` pero no aparece en el mapa visual.

export interface CityPoint {
  nombre: string; // canonical, lo que mostramos
  aliases: string[]; // matchings (todo lower-case, sin tildes)
  x: number;
  y: number;
  // Si es Medellín, lo destacamos siempre como "casa" aunque no haya
  // asistencias. La barra es de allá.
  casa?: boolean;
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

export const COLOMBIA_CITIES: CityPoint[] = [
  { nombre: "Medellín", aliases: ["medellin"], x: 28.7, y: 50.3, casa: true },
  { nombre: "Bogotá", aliases: ["bogota", "bogota dc", "bogota d.c.", "bogotá d.c."], x: 41.1, y: 63.8 },
  { nombre: "Cali", aliases: ["cali"], x: 20.7, y: 75.1 },
  { nombre: "Barranquilla", aliases: ["barranquilla"], x: 35.2, y: 9.1 },
  { nombre: "Cartagena", aliases: ["cartagena"], x: 29.1, y: 14.1 },
  { nombre: "Bucaramanga", aliases: ["bucaramanga"], x: 49.0, y: 42.7 },
  { nombre: "Pereira", aliases: ["pereira"], x: 27.6, y: 62.9 },
  { nombre: "Manizales", aliases: ["manizales"], x: 29.0, y: 60.6 },
  { nombre: "Cúcuta", aliases: ["cucuta"], x: 54.2, y: 36.0 },
  { nombre: "Pasto", aliases: ["pasto"], x: 14.4, y: 94.4 },
  { nombre: "Ibagué", aliases: ["ibague"], x: 31.4, y: 66.2 },
  { nombre: "Villavicencio", aliases: ["villavicencio"], x: 44.8, y: 68.8 },
  { nombre: "Santa Marta", aliases: ["santa marta"], x: 38.5, y: 8.0 },
  { nombre: "Neiva", aliases: ["neiva"], x: 31.0, y: 75.0 },
  { nombre: "Armenia", aliases: ["armenia"], x: 27.3, y: 64.5 },
];

export function findCity(input: string): CityPoint | null {
  const q = norm(input);
  for (const c of COLOMBIA_CITIES) {
    if (c.aliases.includes(q)) return c;
    if (norm(c.nombre) === q) return c;
  }
  return null;
}
