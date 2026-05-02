// lib/r2-public.ts
// Helper liviano para construir URLs públicas de R2. Sin dependencias
// del AWS SDK — usable desde client components, server components, o
// route handlers indistintamente.

export function fotosPublicBase(): string {
  return (
    process.env.NEXT_PUBLIC_R2_FOTOS_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL ||
    ""
  );
}

export function publicUrlForKey(key: string): string {
  const base = fotosPublicBase();
  if (!base) return "";
  return `${base.replace(/\/$/, "")}/${key}`;
}
