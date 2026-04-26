// lib/ratelimit.ts
// Rate limiting con Upstash Redis para endpoints críticos.
//
// Por qué Upstash:
//  - REST API → funciona en Vercel serverless / edge sin pool issues.
//  - Free tier 10k commands/día (un wrapper de rate limit hace 1-2
//    commands por request, así que aguanta ~5k requests/día gratis).
//  - Region us-east-1, mismo que Supabase → latency mínima.
//
// Por qué los límites que elegimos:
//  - profile_update: 10/min — ediciones legítimas son raras, este
//    cap evita scripts de spam de profile.
//  - push_subscribe: 5/min por IP — un device legítimo se suscribe
//    una vez. Más de 5 en un minuto = bot.
//  - push_send_admin: 10/min con secret válido — defensa en profundidad
//    aunque tenga el secret.
//
// Pendiente (TODO): rate limit de OTP send. Supabase lo emite
// directamente desde el cliente sin pasar por nuestros endpoints, así
// que para protegerlo habría que wrappear con un endpoint propio
// /api/auth/send-otp. Por ahora confiamos en el rate limit interno
// de Supabase Auth (60 OTP/hora por phone, configurable en dashboard).

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Si las env vars no están seteadas (build local sin Upstash), exportamos
// un mock que siempre permite. Útil para desarrollo offline.
const hasRedis = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

const redis = hasRedis
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
  : null;

// Helper para crear limiters consistentes. `prefix` separa los counters
// por tipo de operación (no se mezclan entre sí en Redis).
function makeLimit(
  windowSec: number,
  max: number,
  prefix: string,
): Ratelimit | null {
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
    analytics: true, // graficas en el dashboard de Upstash
    prefix: `lds:rl:${prefix}`,
  });
}

// --- Limiters por endpoint ---

export const profileUpdateLimit = makeLimit(60, 10, "profile-update");
export const pushSubscribeLimit = makeLimit(60, 5, "push-subscribe");
export const pushSendLimit = makeLimit(60, 10, "push-send");

// --- API estándar para usar en route handlers ---

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Chequea el rate limit. Si el Redis no está configurado, siempre devuelve
 * success: true (modo permisivo para desarrollo / fallback).
 *
 * Uso típico:
 *   const rl = await checkLimit(profileUpdateLimit, `user:${user.id}`);
 *   if (!rl.success) return tooManyRequests(rl);
 */
export async function checkLimit(
  limiter: Ratelimit | null,
  identifier: string,
): Promise<RateLimitResult> {
  if (!limiter) {
    // Sin Redis configurado, no bloqueamos. Logueamos para observabilidad.
    console.warn("[ratelimit] Upstash no configurado — saltando check");
    return { success: true, limit: 0, remaining: 0, reset: 0 };
  }
  return limiter.limit(identifier);
}

// Helper para extraer un identificador de IP de la request.
// Vercel agrega `x-forwarded-for` automáticamente. Si vienen múltiples
// IPs (proxy chain), tomamos la primera (cliente real).
export function ipFromRequest(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
