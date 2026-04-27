// lib/sessions/utils.ts
// Utilidades para el sistema de sesiones por device.

export type DeviceType = "mobile" | "desktop";

// Detecta si el User-Agent corresponde a un celular/tablet (mobile)
// o computadora (desktop). Tablets cuentan como mobile — el caso de
// uso real es "1 cel + 1 laptop", una tablet ocupa el slot mobile.
export function detectDeviceType(userAgent: string): DeviceType {
  if (!userAgent) return "desktop";
  return /Mobile|Android|iPhone|iPad|iPod|Windows Phone/i.test(userAgent)
    ? "mobile"
    : "desktop";
}

// Genera una etiqueta humana corta para mostrar al user, ej:
//  - "iPhone — Safari"
//  - "Android — Chrome"
//  - "Mac — Chrome"
//  - "Windows — Edge"
export function buildDeviceLabel(userAgent: string): string {
  const ua = userAgent || "";

  let device = "Otro";
  if (/iPhone/.test(ua)) device = "iPhone";
  else if (/iPad/.test(ua)) device = "iPad";
  else if (/Android/.test(ua)) device = "Android";
  else if (/Macintosh|Mac OS/.test(ua)) device = "Mac";
  else if (/Windows/.test(ua)) device = "Windows";
  else if (/Linux/.test(ua)) device = "Linux";

  // Orden importa: Edge antes que Chrome (Edge UA contiene "Chrome").
  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\//.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  return `${device} — ${browser}`;
}

// Decodifica el access_token JWT y extrae el claim session_id.
// Supabase incluye este claim desde GoTrue v2.x. Usado para identificar
// la sesión concreta y matchearla contra user_sessions.auth_session_id.
export function decodeJWTSessionId(accessToken: string): string | null {
  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { session_id?: string };
    return payload.session_id ?? null;
  } catch {
    return null;
  }
}

// Constantes de policy. Centralizadas acá para que los tests / UI
// las lean del mismo lugar y evitar drift.
export const SESSION_POLICY = {
  // Cuánto tiempo después de crear una sesión, antes de poder kickearla.
  // Evita el patrón "amigo me kickea hoy, yo lo kickeo mañana".
  COOLDOWN_HOURS: 24,
  // Ventana del hard cap.
  SWITCH_LIMIT_DAYS: 30,
  // Máximo cambios de device permitidos en la ventana.
  SWITCH_LIMIT_COUNT: 3,
} as const;

// Cookie name para el device_id persistente. httpOnly + 5 años. Mismo
// device físico = mismo device_id aunque la sesión Supabase cambie
// (logout/relogin/clear-cookies-de-supabase pero no las nuestras).
export const DEVICE_ID_COOKIE = "lds-device-id";
export const DEVICE_ID_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 365 * 5; // 5 años

// Genera un device_id seguro (UUID v4 via crypto.randomUUID si está
// disponible, sino fallback hex random). Server-side.
export function generateDeviceId(): string {
  // crypto.randomUUID está en Node 19+ y todos los runtimes modernos.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (no debería pasar en Vercel).
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
}
