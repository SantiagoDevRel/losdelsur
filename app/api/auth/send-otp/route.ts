// app/api/auth/send-otp/route.ts
// Server-side wrapper de supabase.auth.signInWithOtp.
// Hacer esto server-side soluciona quirks de iOS Safari donde las
// cookies de auth no persistían correctamente cuando verifyOtp corría
// en el browser. Bonus: punto de control para rate-limit.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkLimit, ipFromRequest } from "@/lib/ratelimit";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export const runtime = "nodejs";

// Rate limit OTP send: 5/hora por IP. Twilio cobra ~$0.045/SMS, abuso
// puede romper el budget rápido. Mismo número limit aplica a Supabase
// internamente pero esto es defense-in-depth.
const hasRedis = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);
const otpSendLimit = hasRedis
  ? new Ratelimit({
      redis: new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      }),
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      analytics: true,
      prefix: "lds:rl:otp-send",
    })
  : null;

interface Body {
  phone: string;
  channel?: "sms" | "whatsapp";
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.phone || !body.phone.startsWith("+")) {
    return NextResponse.json(
      { error: "phone debe ser E.164 (+57...)" },
      { status: 400 },
    );
  }

  // Rate limit por IP + por phone (cualquiera de los dos cae primero).
  const ip = ipFromRequest(request);
  const rl1 = await checkLimit(otpSendLimit, `ip:${ip}`);
  const rl2 = await checkLimit(otpSendLimit, `phone:${body.phone}`);
  if (!rl1.success || !rl2.success) {
    return NextResponse.json(
      { error: "too many OTP requests, esperá un poco" },
      { status: 429 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    phone: body.phone,
    options: { channel: body.channel ?? "sms" },
  });
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("phone signups") || msg.includes("provider")) {
      return NextResponse.json(
        { error: "Login por celular no está activado todavía. Probá con email." },
        { status: 503 },
      );
    }
    if (msg.includes("rate") || msg.includes("limit")) {
      return NextResponse.json(
        { error: "Muchos intentos. Esperá un minuto." },
        { status: 429 },
      );
    }
    return NextResponse.json(
      { error: error.message || "No se pudo mandar el código" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
