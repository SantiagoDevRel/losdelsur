// app/api/admin/fotos/presign/route.ts
// POST — admin pide presigned URLs para subir un batch de fotos a R2.
// El admin manda la lista de archivos (con sus content types y tamaños);
// le devolvemos un par de URLs por foto (full + thumb) y los R2 keys
// definitivos. El admin sube directo browser → R2 (skipea Vercel
// function body limit).
//
// Después de uploadear, el admin llama a POST /api/admin/fotos/commit
// con los IDs y nosotros insertamos los rows de partido_fotos.

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { presignPut } from "@/lib/r2";

export const runtime = "nodejs";

interface FileSpec {
  contentType: string; // ej "image/jpeg"
  thumbContentType: string; // ej "image/webp"
}

interface Body {
  partido_id: string;
  seccion: "SUR_A1" | "SUR_A2" | "SUR_B1" | "SUR_B2";
  files: FileSpec[]; // 1 entry por foto
}

const VALID_SECCIONES = new Set(["SUR_A1", "SUR_A2", "SUR_B1", "SUR_B2"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await isAdmin(user.id)))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  if (!body.partido_id || !VALID_SECCIONES.has(body.seccion)) {
    return NextResponse.json({ error: "partido_id + seccion required" }, { status: 400 });
  }
  if (!Array.isArray(body.files) || body.files.length === 0 || body.files.length > 50) {
    return NextResponse.json({ error: "files: 1 a 50" }, { status: 400 });
  }

  const items = await Promise.all(
    body.files.map(async (f) => {
      const id = randomUUID();
      const fullKey = `fotos/${body.partido_id}/${id}.jpg`;
      const thumbKey = `fotos/${body.partido_id}/${id}.thumb.webp`;
      const [fullUrl, thumbUrl] = await Promise.all([
        presignPut(fullKey, f.contentType || "image/jpeg"),
        presignPut(thumbKey, f.thumbContentType || "image/webp"),
      ]);
      return {
        id,
        full: { key: fullKey, url: fullUrl },
        thumb: { key: thumbKey, url: thumbUrl },
      };
    }),
  );

  return NextResponse.json({ items });
}
