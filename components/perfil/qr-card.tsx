// components/perfil/qr-card.tsx
// Genera el QR del carnet client-side usando `qrcode`. El payload por
// ahora es `lds:v1:<userId>` — sin firma. En Phase E (admin scanner)
// vamos a swap a un token corto firmado HMAC server-side, generado on
// demand y rotable.
//
// La generación es síncrona y rápida (~10ms para datos cortos), así que
// la hacemos en un useEffect sin loader visible.

"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  userId: string;
  size?: number; // px del lado del QR. Default 96.
}

export function QrCard({ userId, size = 96 }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const payload = `lds:v1:${userId}`;
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: size * 2, // 2x para HiDPI
      color: {
        // Verde neón sobre negro. Mantiene la identidad visual de la app.
        dark: "#00FF80FF",
        light: "#000000FF",
      },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, size]);

  return (
    <div
      className="relative flex items-center justify-center overflow-hidden rounded-lg border-2 border-[var(--color-verde-neon)]/40 bg-black"
      style={{ width: size, height: size }}
    >
      {dataUrl ? (
        // Usamos <img> directo en vez de next/image — el QR es una data
        // URL pequeña y next/image no aporta nada.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt="QR del perfil sureño"
          width={size}
          height={size}
          style={{ imageRendering: "pixelated" }}
        />
      ) : (
        <div className="size-full animate-pulse bg-white/5" />
      )}
    </div>
  );
}
