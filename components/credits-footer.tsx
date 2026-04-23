// components/credits-footer.tsx
// Créditos al final de cada pantalla: "Hecho por Santiago", con link
// al Instagram. Texto mínimo, sin apellido.

import Link from "next/link";

interface Props {
  variant?: "compact" | "full";
}

const INSTAGRAM_URL = "https://instagram.com/santiagotrujilloz";

export function CreditsFooter({ variant = "compact" }: Props) {
  const isFull = variant === "full";
  return (
    <div className={isFull ? "px-5 pb-4 pt-6 text-center" : "px-5 pb-3 pt-4 text-center"}>
      <p
        className={
          isFull
            ? "text-[11px] font-medium uppercase tracking-[0.15em] text-white/50"
            : "text-[10px] font-medium uppercase tracking-[0.15em] text-white/40"
        }
      >
        Hecho por{" "}
        <Link
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="border-b border-[var(--color-verde-neon)] text-white transition-colors hover:text-[var(--color-verde-neon)]"
        >
          Santiago
        </Link>
      </p>
    </div>
  );
}
