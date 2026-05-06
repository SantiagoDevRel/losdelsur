// app/marketplace/page.tsx
// MOCKUP — pantalla /marketplace: lista vertical de perfiles de la
// barra ofreciendo servicios profesionales (sicólogos, tatuadores,
// entrenadores, etc.). Por ahora 100% UI estática, sin DB ni auth.
// Es un prototipo visual para validar la idea antes de construir
// supabase, contacto real, etc.

import { Star, MapPin, MessageCircle } from "lucide-react";

interface Profile {
  id: string;
  initials: string;
  accent: string; // bg color del avatar
  nombre: string;
  profesion: string;
  bio: string;
  precio: string;
  ciudad: string;
  rating: number;
  reviews: number;
}

const PROFILES: Profile[] = [
  {
    id: "santiago-t",
    initials: "ST",
    accent: "#2BFF7F",
    nombre: "Santiago Trujillo",
    profesion: "Sicólogo clínico",
    bio: "Acompaño hinchas con ansiedad pre-clásico y manejo de emociones intensas.",
    precio: "$80.000 / sesión",
    ciudad: "Medellín · El Poblado",
    rating: 4.9,
    reviews: 47,
  },
  {
    id: "juli-m",
    initials: "JM",
    accent: "#17B85E",
    nombre: "Juliana Marín",
    profesion: "Tatuadora",
    bio: "Especialista en escudos, frases de cancha y blackwork. Estudio propio.",
    precio: "Desde $50.000",
    ciudad: "Medellín · Belén",
    rating: 5.0,
    reviews: 92,
  },
  {
    id: "pibe-a",
    initials: "AP",
    accent: "#0A7D3E",
    nombre: 'Andrés "Pibe" Ramírez',
    profesion: "Entrenador personal",
    bio: "Plan físico para aguantar 90 minutos saltando en la tribuna sin lesionarte.",
    precio: "$40.000 / sesión",
    ciudad: "Medellín · Laureles",
    rating: 4.8,
    reviews: 31,
  },
  {
    id: "cami-r",
    initials: "CR",
    accent: "#2BFF7F",
    nombre: "Camilo Restrepo",
    profesion: "Mecánico de motos",
    bio: "Mantenimiento, latonería y pintura. Atiendo a domicilio dentro del Valle.",
    precio: "Desde $30.000",
    ciudad: "Itagüí",
    rating: 4.7,
    reviews: 58,
  },
  {
    id: "vale-s",
    initials: "VS",
    accent: "#17B85E",
    nombre: "Valentina Sánchez",
    profesion: "Diseñadora gráfica",
    bio: "Logos para combos, banderas, parches y posters de cancha. Identidad visual completa.",
    precio: "Desde $150.000",
    ciudad: "Bello",
    rating: 4.9,
    reviews: 24,
  },
  {
    id: "mateo-l",
    initials: "ML",
    accent: "#0A7D3E",
    nombre: "Mateo López",
    profesion: "Profesor de inglés",
    bio: "Clases 1-a-1 online o presencial. Enfoque conversacional, sin libros aburridos.",
    precio: "$25.000 / hora",
    ciudad: "Online",
    rating: 4.8,
    reviews: 73,
  },
  {
    id: "dani-p",
    initials: "DP",
    accent: "#2BFF7F",
    nombre: "Daniela Pérez",
    profesion: "Fotógrafa",
    bio: "Fotos de cancha, retratos hinchas y eventos. Entrego en 48h editadas.",
    precio: "Desde $200.000",
    ciudad: "Medellín · Envigado",
    rating: 5.0,
    reviews: 19,
  },
  {
    id: "seba-v",
    initials: "SV",
    accent: "#17B85E",
    nombre: "Sebastián Velásquez",
    profesion: "Abogado laboral",
    bio: "Asesoría a hinchas con problemas de contrato, despidos y liquidaciones.",
    precio: "Primera consulta gratis",
    ciudad: "Medellín · Centro",
    rating: 4.9,
    reviews: 38,
  },
  {
    id: "laura-g",
    initials: "LG",
    accent: "#0A7D3E",
    nombre: "Laura Gómez",
    profesion: "Nutricionista deportiva",
    bio: "Plan alimentario para volver al gym, recuperación post-clásico y hábitos sostenibles.",
    precio: "$60.000 / consulta",
    ciudad: "Sabaneta",
    rating: 4.8,
    reviews: 42,
  },
  {
    id: "joaco-b",
    initials: "JB",
    accent: "#2BFF7F",
    nombre: 'Joaquín "Joaco" Betancur',
    profesion: "Productor musical",
    bio: "Grabo y mezclo cánticos, jingles y tracks para la barra. Estudio en casa.",
    precio: "Desde $100.000 / track",
    ciudad: "Medellín · Robledo",
    rating: 4.9,
    reviews: 27,
  },
];

const CATEGORIAS = [
  "Todos",
  "Salud",
  "Arte",
  "Servicios",
  "Educación",
  "Legal",
];

export const metadata = {
  title: "Marketplace — La Banda Los Del Sur",
};

export default function MarketplacePage() {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl pb-[110px] pt-14 sm:pt-20">
      <header className="px-5 pb-4 sm:px-8 sm:pb-6">
        <div className="eyebrow">
          {PROFILES.length} HINCHAS · OFRECIENDO SERVICIOS
        </div>
        <h1
          className="mt-1.5 text-white"
          style={{
            fontFamily: "var(--font-display), Anton, sans-serif",
            fontSize: "clamp(56px, 9vw, 96px)",
            lineHeight: 0.85,
            letterSpacing: "-0.01em",
          }}
        >
          MARKET
          <br />
          <span style={{ color: "var(--color-verde-neon)" }}>PLACE</span>
        </h1>
        <p className="mt-4 max-w-md text-[13px] leading-relaxed text-white/60">
          Conectá con profesionales de la barra. Apoyá a tu gente,
          ahorrate intermediarios.
        </p>
      </header>

      {/* Chips de categoría — solo visual, no filtran nada en el mockup */}
      <div className="hide-scrollbar mb-2 flex gap-2 overflow-x-auto px-5 pb-2 sm:px-8">
        {CATEGORIAS.map((cat, i) => (
          <button
            key={cat}
            type="button"
            className="shrink-0 border px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors"
            style={{
              borderColor:
                i === 0 ? "var(--color-verde-neon)" : "rgba(255,255,255,0.15)",
              color: i === 0 ? "var(--color-verde-neon)" : "#a8a8a3",
              background: i === 0 ? "rgba(43,255,127,0.08)" : "transparent",
              borderRadius: 999,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Lista vertical de perfiles */}
      <ul className="flex flex-col gap-3 px-5 pt-4 sm:px-8">
        {PROFILES.map((p) => (
          <li
            key={p.id}
            className="flex gap-4 border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/20 sm:p-5"
            style={{ borderRadius: 14 }}
          >
            {/* Avatar con iniciales */}
            <div
              className="flex h-16 w-16 shrink-0 items-center justify-center text-[22px] font-extrabold text-black sm:h-20 sm:w-20 sm:text-[26px]"
              style={{
                background: p.accent,
                fontFamily: "var(--font-display), Anton, sans-serif",
                borderRadius: 999,
                letterSpacing: "0.02em",
              }}
              aria-hidden
            >
              {p.initials}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <div
                  className="uppercase text-white"
                  style={{
                    fontFamily: "var(--font-display), Anton, sans-serif",
                    fontSize: 18,
                    lineHeight: 1.05,
                    letterSpacing: "0.01em",
                  }}
                >
                  {p.nombre}
                </div>
                <div className="flex items-center gap-1 text-[11px] font-semibold text-white/70">
                  <Star
                    size={12}
                    fill="var(--color-verde-neon)"
                    stroke="var(--color-verde-neon)"
                  />
                  <span>{p.rating.toFixed(1)}</span>
                  <span className="text-white/40">·</span>
                  <span className="text-white/40">{p.reviews} reseñas</span>
                </div>
              </div>

              <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--color-verde-neon)]">
                {p.profesion}
              </div>

              <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-white/70">
                {p.bio}
              </p>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-[11px] text-white/50">
                  <span className="flex items-center gap-1">
                    <MapPin size={11} />
                    {p.ciudad}
                  </span>
                  <span
                    className="font-bold uppercase tracking-[0.05em] text-white"
                    style={{ fontSize: 12 }}
                  >
                    {p.precio}
                  </span>
                </div>
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-black transition-transform active:scale-95"
                  style={{
                    background: "var(--color-verde-neon)",
                    borderRadius: 8,
                  }}
                >
                  <MessageCircle size={13} strokeWidth={2.5} />
                  Contactar
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Footer disclaimer del mockup */}
      <p className="mt-8 px-5 text-center text-[10px] uppercase tracking-[0.12em] text-white/30 sm:px-8">
        Mockup · Próximamente perfiles reales
      </p>
    </main>
  );
}
