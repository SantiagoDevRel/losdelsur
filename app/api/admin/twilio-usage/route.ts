// app/api/admin/twilio-usage/route.ts
// Lee uso de Twilio desde su API REST para mostrar costo de SMS al admin.
// Requiere TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN como env vars en Vercel.
// Si faltan, devuelve un placeholder con "not_configured: true" y la UI
// muestra un mensaje pidiendo configurarlas.
//
// Twilio Usage API docs:
//   https://www.twilio.com/docs/usage/api/usage-record

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

interface TwilioUsageRecord {
  category: string;
  description: string;
  count: string;
  count_unit: string;
  usage: string;
  usage_unit: string;
  price: string;
  price_unit: string;
  start_date: string;
  end_date: string;
}

interface TwilioUsageResponse {
  usage_records: TwilioUsageRecord[];
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    return NextResponse.json({
      configured: false,
      message:
        "Configurá TWILIO_ACCOUNT_SID y TWILIO_AUTH_TOKEN en Vercel env vars para ver el costo real.",
    });
  }

  // Fetch usage de este mes y total all-time.
  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}` };

  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const endOfMonth = today.toISOString().slice(0, 10);

  try {
    const [monthRes, allTimeRes] = await Promise.all([
      fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Usage/Records.json?Category=sms&StartDate=${startOfMonth}&EndDate=${endOfMonth}`,
        { headers, cache: "no-store" },
      ),
      fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sid}/Usage/Records/AllTime.json?Category=sms`,
        { headers, cache: "no-store" },
      ),
    ]);
    if (!monthRes.ok || !allTimeRes.ok) {
      return NextResponse.json(
        { configured: true, error: "Twilio API rejected request" },
        { status: 502 },
      );
    }
    const monthData = (await monthRes.json()) as TwilioUsageResponse;
    const allTimeData = (await allTimeRes.json()) as TwilioUsageResponse;

    // Agregamos totales (suma de todos los records SMS).
    const sumPrice = (data: TwilioUsageResponse) =>
      data.usage_records.reduce((s, r) => s + (parseFloat(r.price) || 0), 0);
    const sumCount = (data: TwilioUsageResponse) =>
      data.usage_records.reduce((s, r) => s + (parseInt(r.count, 10) || 0), 0);

    return NextResponse.json({
      configured: true,
      currency: monthData.usage_records[0]?.price_unit?.toUpperCase() ?? "USD",
      this_month: {
        sms_count: sumCount(monthData),
        cost: sumPrice(monthData),
      },
      all_time: {
        sms_count: sumCount(allTimeData),
        cost: sumPrice(allTimeData),
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        configured: true,
        error: e instanceof Error ? e.message : "fetch failed",
      },
      { status: 500 },
    );
  }
}
