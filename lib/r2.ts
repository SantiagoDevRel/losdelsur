// lib/r2.ts
// Cliente S3 apuntado al bucket R2 + helper para presigned PUT URLs.
//
// Estrategia para fotos en el MVP:
//   * Si `R2_FOTOS_BUCKET` está seteado, ese es el bucket dedicado.
//   * Si no, usa el bucket del audio (`R2_BUCKET`) con prefix `fotos/`.
//     Eso evita tener que crear y configurar un bucket nuevo para el
//     primer demo. Más adelante se puede separar sin tocar la UI.
//
// Public URL para servir las fotos al user:
//   * Prefer `NEXT_PUBLIC_R2_FOTOS_PUBLIC_URL` (si bucket separado).
//   * Fallback `NEXT_PUBLIC_R2_PUBLIC_URL` (mismo bucket que audio).

import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export { fotosPublicBase, publicUrlForKey } from "./r2-public";

let _s3: S3Client | null = null;

export function r2Client(): S3Client {
  if (_s3) return _s3;
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 client requires R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY");
  }
  _s3 = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    // R2 no requiere checksums de body — apagarlos evita firmas extra
    // que rompen los presigned URLs en el browser.
    forcePathStyle: true,
  });
  return _s3;
}

export function fotosBucket(): string {
  const dedicated = process.env.R2_FOTOS_BUCKET;
  if (dedicated) return dedicated;
  const fallback = process.env.R2_BUCKET;
  if (!fallback) throw new Error("Need R2_FOTOS_BUCKET or R2_BUCKET");
  return fallback;
}

export async function presignPut(
  key: string,
  contentType: string,
  expiresInSec = 60 * 5,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: fotosBucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2Client(), cmd, { expiresIn: expiresInSec });
}

export async function deleteObject(key: string): Promise<void> {
  await r2Client().send(
    new DeleteObjectCommand({
      Bucket: fotosBucket(),
      Key: key,
    }),
  );
}
