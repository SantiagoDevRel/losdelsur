// components/tab-bar.tsx
// Tab-bar inferior fija presente en las pantallas principales. Réplica
// del diseño del handoff: blur backdrop, indicador verde neón arriba
// del tab activo, texto condensado en uppercase.
//
// "Buscar" es especial: en vez de navegar a /search abre un modal
// bottom-sheet (search-modal-provider). Así el audio que está sonando
// no se interrumpe por una transición de página y el user puede
// seguir buscando mientras escucha. /search sigue funcional como
// route directa para bookmarks externos.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Disc3, Search, Camera, User } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
import { useSearchModal } from "./search-modal-provider";

type TabKey = "home" | "cds" | "search" | "tribuna" | "perfil";

interface Tab {
  key: TabKey;
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
  matches: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  { key: "home", href: "/", label: "Inicio", Icon: Home, matches: (p) => p === "/" },
  { key: "cds", href: "/cds", label: "CDs", Icon: Disc3, matches: (p) => p.startsWith("/cds") || p.startsWith("/cancion") || p.startsWith("/library") },
  { key: "search", href: "/search", label: "Buscar", Icon: Search, matches: (p) => p.startsWith("/search") },
  { key: "tribuna", href: "/tribuna", label: "Tribuna", Icon: Camera, matches: (p) => p.startsWith("/tribuna") },
  { key: "perfil", href: "/perfil", label: "Perfil", Icon: User, matches: (p) => p.startsWith("/perfil") || p.startsWith("/login") },
];

export function TabBar() {
  const pathname = usePathname();
  const { isOpen: searchOpen, open: openSearch } = useSearchModal();

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 h-[88px] border-t border-white/10 bg-black/85 px-2 pb-7 pt-3 backdrop-blur-xl"
    >
      <ul className="flex h-full">
        {TABS.map(({ key, href, label, Icon, matches }) => {
          // Search tab marca activo si el modal está abierto, sino
          // sigue la regla normal de pathname (cubre /search directo).
          const active = key === "search" ? searchOpen || matches(pathname) : matches(pathname);
          const tabBody = (
            <>
              {active && (
                <span
                  aria-hidden
                  className="absolute top-1 h-0.5 w-6"
                  style={{ background: "var(--color-verde-neon)" }}
                />
              )}
              <Icon size={22} strokeWidth={active ? 2.2 : 1.8} />
              {/* "CDs" queda con la "s" en minúscula; el resto de
                  labels se verían igual en mayúsculas de todas formas. */}
              <span style={label === "CDs" ? { textTransform: "none" } : undefined}>
                {label}
              </span>
            </>
          );
          const commonClass =
            "relative flex h-full w-full flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em]";
          const commonStyle = { color: active ? "var(--color-verde-neon)" : "#a8a8a3" };

          return (
            <li key={key} className="flex-1">
              {key === "search" ? (
                <button
                  type="button"
                  onClick={openSearch}
                  aria-label="Abrir buscador"
                  aria-expanded={searchOpen}
                  className={commonClass}
                  style={commonStyle}
                >
                  {tabBody}
                </button>
              ) : (
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={commonClass}
                  style={commonStyle}
                >
                  {tabBody}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
