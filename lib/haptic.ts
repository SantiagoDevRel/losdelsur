// lib/haptic.ts
// Feedback háptico (vibración) para interacciones táctiles clave.
// Solo funciona en Android — iOS Safari no expone la API para web.
// Usamos patrones bien cortos (5-20ms) — vibración larga molesta.

type Pattern = "tap" | "double" | "long" | "error";

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,
  double: [6, 40, 6],
  long: 20,
  error: [12, 60, 12],
};

// Llama a navigator.vibrate con manejo defensivo de navegadores que no lo tienen.
export function haptic(pattern: Pattern = "tap") {
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(PATTERNS[pattern]);
  } catch {
    /* algunas veces el browser deshabilita vibrate por policy */
  }
}
