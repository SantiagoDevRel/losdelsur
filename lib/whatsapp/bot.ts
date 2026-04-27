// lib/whatsapp/bot.ts
// Wrappers minimalistas de Meta WhatsApp Cloud API (graph v21.0).
// Solo lo que necesitamos para auth: enviar texto + botón URL CTA.
//
// Por qué fetch nativo (no axios): no agregamos dependencia, y el body
// es JSON simple. El error handling es responsabilidad del caller.
//
// Env vars (server-only):
//   META_WA_ACCESS_TOKEN     — token permanente de la app de Meta
//   META_WA_PHONE_NUMBER_ID  — ID del número del bot (NO el número, el id)

const GRAPH_VERSION = "v21.0";

function endpoint(): string {
  const phoneId = process.env.META_WA_PHONE_NUMBER_ID;
  if (!phoneId) throw new Error("META_WA_PHONE_NUMBER_ID not set");
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
}

function authHeader(): string {
  const token = process.env.META_WA_ACCESS_TOKEN;
  if (!token) throw new Error("META_WA_ACCESS_TOKEN not set");
  return `Bearer ${token}`;
}

interface MetaResponse {
  ok: boolean;
  status: number;
  body: unknown;
}

async function postToMeta(payload: Record<string, unknown>): Promise<MetaResponse> {
  const res = await fetch(endpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("[wa] Meta API error", res.status, body);
  }
  return { ok: res.ok, status: res.status, body };
}

// Enviar texto plano. `to` es E.164 sin +, ej "573001234567".
export async function sendText(to: string, text: string): Promise<MetaResponse> {
  return postToMeta({
    messaging_product: "whatsapp",
    to,
    type: "text",
    text: { body: text, preview_url: false },
  });
}

// Enviar mensaje interactivo con botón URL CTA. El botón abre `url` en
// el browser del user. Es perfecto para magic-links: el user toca, el
// browser arranca, llega a /api/auth/wa-magic con el token, queda logueado.
//
// Nota Meta: button.text máx 20 chars, header.text máx 60, body.text 1024.
export async function sendCTAButton(
  to: string,
  opts: {
    bodyText: string;
    buttonText: string;
    url: string;
    headerText?: string;
    footerText?: string;
  },
): Promise<MetaResponse> {
  const interactive: Record<string, unknown> = {
    type: "cta_url",
    body: { text: opts.bodyText },
    action: {
      name: "cta_url",
      parameters: {
        display_text: opts.buttonText.slice(0, 20),
        url: opts.url,
      },
    },
  };
  if (opts.headerText) {
    interactive.header = { type: "text", text: opts.headerText.slice(0, 60) };
  }
  if (opts.footerText) {
    interactive.footer = { text: opts.footerText.slice(0, 60) };
  }
  return postToMeta({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive,
  });
}
