// app/admin/admin-nav.tsx
// Nav header para todas las páginas /admin/*. Client component porque
// usePathname para resaltar el activo.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, BarChart3, Bell, Calendar, Camera, QrCode, Users } from "lucide-react";

const ITEMS = [
  { href: "/admin", label: "INICIO", icon: BarChart3 },
  { href: "/admin/partidos", label: "PARTIDOS", icon: Calendar },
  { href: "/admin/fotos", label: "FOTOS", icon: Camera },
  { href: "/admin/scan", label: "SCAN", icon: QrCode },
  { href: "/admin/push", label: "PUSH", icon: Bell },
  { href: "/admin/users", label: "USERS", icon: Users },
  { href: "/admin/analytics", label: "STATS", icon: BarChart3 },
] as const;

export function AdminNav() {
  const pathname = usePathname();
  return (
    <div className="mb-6 px-5">
      <div className="flex items-center gap-3">
        <Link
          href="/perfil"
          aria-label="Volver al perfil"
          className="grid size-10 place-items-center bg-black/60 text-white"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="eyebrow">ADMIN</div>
      </div>

      <nav className="mt-4 flex gap-2 overflow-x-auto" aria-label="Admin nav">
        {ITEMS.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border-2 px-3 py-2 text-[10px] font-extrabold uppercase tracking-[0.1em] transition-colors"
              style={{
                borderColor: isActive
                  ? "var(--color-verde-neon)"
                  : "rgba(255,255,255,0.18)",
                background: isActive ? "var(--color-verde-neon)" : "transparent",
                color: isActive ? "#000" : "#ddd",
              }}
            >
              <Icon size={12} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
