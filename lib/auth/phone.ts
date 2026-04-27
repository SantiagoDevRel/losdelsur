// lib/auth/phone.ts
// Normalización de phone numbers. Source-of-truth único para que rate
// limits, lookups en wa_magic_tokens y find_auth_user_id_by_phone usen
// el mismo formato.
//
// Convención: stripeamos TODO non-digit (incluido el +). Resultado:
// "573001234567" para un colombiano. Supabase Auth guarda phone sin +
// internamente, así que esto matchea naturalmente.

export function normalizePhone(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/\D/g, "");
}

// Email sintético derivado del phone normalizado. Lo usamos para users
// que entraron por WA magic-link y no tienen email real — Supabase admin
// API requiere email para generateLink({type:'magiclink'}).
export function emailForPhone(normalizedPhone: string): string {
  return `${normalizedPhone}@wa.losdelsur.app`;
}

// Valida un phone normalizado. E.164 son 8-15 dígitos (incluyendo
// country code). Más permisivo que la spec porque algunos países usan 7.
export function isValidNormalizedPhone(p: string): boolean {
  return /^\d{7,15}$/.test(p);
}
