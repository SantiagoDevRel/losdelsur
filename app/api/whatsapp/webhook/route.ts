// app/api/whatsapp/webhook/route.ts
// Webhook de Meta WhatsApp Cloud API.
//
// GET  → handshake de verificación inicial (Meta envía hub.challenge).
// POST → mensajes entrantes del user. Si el contenido huele a "intent
//        de login", generamos magic-link token y respondemos con botón CTA.
//        Cualquier otro mensaje recibe un fallback genérico.
//
// Seguridad:
//  - El POST trae header X-Hub-Signature-256 = "sha256=<hex>" calculado
//    con META_WA_APP_SECRET sobre el body raw. Verificamos con
//    timingSafeEqual antes de procesar nada.
//  - Rate limit por phone (5/hora) para prevenir spam de tokens.
//  - Tokens guardados con SHA-256 NO necesario aquí: el token mismo es
//    32 bytes random; lo guardamos plano + tiene TTL 10min + one-shot.
//    Si la DB se compromete los tokens vencidos no sirven y los activos
//    son ventana corta.

import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendCTAButton, sendText } from "@/lib/whatsapp/bot";
import { normalizePhone, isValidNormalizedPhone } from "@/lib/auth/phone";

export const runtime = "nodejs";

// =====================================================================
// GET: handshake de verificación
// =====================================================================
// Meta llama una sola vez al setear el webhook. Comparamos hub.verify_token
// con META_WA_WEBHOOK_VERIFY_TOKEN (string que VOS elegís en Meta dashboard).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.META_WA_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && token && expected && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

// =====================================================================
// POST: mensajes entrantes
// =====================================================================

interface WAMessage {
  from: string; // E.164 sin + (ej "573001234567")
  id: string;
  type: string;
  text?: { body: string };
}

interface WABody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: WAMessage[];
        metadata?: { phone_number_id: string };
      };
    }>;
  }>;
}

export async function POST(request: Request) {
  // 1. Verificar firma HMAC con el body raw.
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const appSecret = process.env.META_WA_APP_SECRET;

  if (!appSecret) {
    console.error("[wa-webhook] META_WA_APP_SECRET not set");
    return new NextResponse("server misconfigured", { status: 500 });
  }
  if (!verifySignature(raw, signature, appSecret)) {
    console.warn("[wa-webhook] invalid signature");
    return new NextResponse("invalid signature", { status: 401 });
  }

  // 2. Parsear body. Meta puede mandar webhook events sin messages
  // (status updates, read receipts, etc.) — esos los ignoramos.
  let body: WABody;
  try {
    body = JSON.parse(raw) as WABody;
  } catch {
    return new NextResponse("invalid json", { status: 400 });
  }

  const messages = body.entry?.[0]?.changes?.[0]?.value?.messages ?? [];
  if (messages.length === 0) {
    // Status update, read receipt, etc. — ack y listo.
    return NextResponse.json({ ok: true });
  }

  // 3. Procesar cada mensaje. En la práctica viene 1 a la vez.
  // Respondemos 200 rápido a Meta y procesamos en paralelo (no bloqueante
  // para Meta, pero sí esperamos a que termine antes de devolver — el
  // serverless de Vercel se va a sleep si retornamos antes).
  for (const msg of messages) {
    await handleMessage(msg, request).catch((err) => {
      console.error("[wa-webhook] handle error", err);
    });
  }

  return NextResponse.json({ ok: true });
}

async function handleMessage(msg: WAMessage, request: Request): Promise<void> {
  const phone = normalizePhone(msg.from);
  if (!isValidNormalizedPhone(phone)) {
    console.warn("[wa-webhook] invalid phone", msg.from);
    return;
  }

  // Solo procesamos texto. Stickers, audios, imágenes → fallback.
  const text = msg.type === "text" ? (msg.text?.body ?? "").trim() : "";

  if (!isLoginIntent(text)) {
    await sendText(
      phone,
      "Hola 👋 Para entrar a Los del Sur, mandame el mensaje:\n\n" +
        "Quiero entrar a Los del Sur\n\n" +
        "Te mando un link mágico para iniciar sesión.",
    );
    return;
  }

  // Rate limit: máx 5 tokens/hora por phone para prevenir spam.
  const admin = createAdminClient();
  const sinceISO = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("wa_magic_tokens")
    .select("token", { count: "exact", head: true })
    .eq("phone", phone)
    .gte("created_at", sinceISO);

  if ((count ?? 0) >= 5) {
    await sendText(
      phone,
      "Pediste muchos links seguidos. Esperá una hora y volvé a intentar 🙏",
    );
    return;
  }

  // Generar token y guardar.
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const { error } = await admin.from("wa_magic_tokens").insert({
    token,
    phone,
    expires_at: expiresAt,
    ip,
  });
  if (error) {
    console.error("[wa-webhook] insert token failed", error);
    await sendText(phone, "Tuvimos un problema generando tu link. Probá en un minuto.");
    return;
  }

  // Construir URL del magic link y enviar botón CTA.
  const baseUrl = resolveBaseUrl(request);
  const magicUrl = `${baseUrl}/api/auth/wa-magic?token=${token}`;

  await sendCTAButton(phone, {
    headerText: "LOS DEL SUR",
    bodyText:
      `Tocá el botón para entrar como +${phone}.\n\n` +
      `El link sirve por 10 minutos y solo una vez.`,
    buttonText: "ENTRAR",
    url: magicUrl,
    footerText: "Si no fuiste vos, ignorá este mensaje.",
  });
}

// =====================================================================
// Helpers
// =====================================================================

// Match relajado del intent. Cualquier mensaje que mencione "entrar"
// y "los del sur" (case-insensitive, con o sin tilde). Si el bot atiende
// el mismo número que la-polla, esto NO matchea con "entrar a la polla"
// — discriminamos correctamente.
function isLoginIntent(text: string): boolean {
  if (!text) return false;
  const norm = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // strip diacríticos
  return /entrar/.test(norm) && /los del sur/.test(norm);
}

function verifySignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature.startsWith("sha256=")) return false;
  const provided = signature.slice("sha256=".length);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  // timingSafeEqual requiere mismo length. Si difieren, fail rápido.
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

// Resuelve la URL base para construir el magic-link. Prioridad:
//   1. NEXT_PUBLIC_APP_URL (si está seteada — recomendado en prod)
//   2. VERCEL_URL (auto-injectado por Vercel, sin protocolo)
//   3. origin del request (fallback dev local)
function resolveBaseUrl(request: Request): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return new URL(request.url).origin;
}
