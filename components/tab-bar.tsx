// components/tab-bar.tsx
// Tab-bar inferior fija presente en las pantallas principales. Réplica
// del diseño del handoff: blur backdrop, indicador verde neón arriba
// del tab activo, texto condensado en uppercase.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Disc3, Search, Download, Settings } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type TabKey = "home" | "cds" | "search" | "library" | "settings";

interface Tab {
  key: TabKey;
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;
  matches: (pathname: string) => boolean;
}

const TABS: Tab[] = [
  { key: "home", href: "/", label: "Inicio", Icon: Home, matches: (p) => p === "/" },
  { key: "cds", href: "/cds", label: "CDs", Icon: Disc3, matches: (p) => p.startsWith("/cds") || p.startsWith("/cancion") },
  { key: "search", href: "/search", label: "Buscar", Icon: Search, matches: (p) => p.startsWith("/search") },
  { key: "library", href: "/library", label: "Offline", Icon: Download, matches: (p) => p.startsWith("/library") },
  { key: "settings", href: "/settings", label: "Ajustes", Icon: Settings, matches: (p) => p.startsWith("/settings") },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 h-[88px] border-t border-white/10 bg-black/85 px-2 pb-7 pt-3 backdrop-blur-xl"
    >
      <ul className="flex h-full">
        {TABS.map(({ key, href, label, Icon, matches }) => {
          const active = matches(pathname);
          return (
            <li key={key} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="relative flex h-full flex-col items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: active ? "var(--color-verde-neon)" : "#a8a8a3" }}
              >
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
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
