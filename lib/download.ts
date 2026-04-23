// lib/download.ts
// Lógica de descarga offline de audio. Usamos la Cache API (no IndexedDB)
// porque los mp3 son recursos HTTP y la Cache API es la manera canónica
// que el Service Worker también lee — el usuario descarga una vez y el
// SW puede servirlo offline sin configuración adicional.
//
// Nombre del cache: coincide con el que Serwist usa para runtime audio
// para evitar duplicar datos. Ver `app/sw.ts`.

export const AUDIO_CACHE_NAME = "lds-audio-v1";

// Chequea si un archivo ya está guardado en cache (usado para pintar ✅).
export async function isAudioCached(url: string): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const hit = await cache.match(url);
    return !!hit;
  } catch {
    return false;
  }
}

// Descarga un archivo de audio reportando progreso por callback.
// Guarda la Response resultante en el cache offline.
//
// `onProgress` recibe un número entre 0 y 1 (o null si el servidor no
// envía Content-Length). En iOS Safari a veces Content-Length no llega,
// por eso manejamos ese caso en vez de asumir.
export async function downloadAudio(
  url: string,
  onProgress?: (fraction: number | null) => void,
): Promise<void> {
  if (typeof caches === "undefined") {
    throw new Error("Cache API no disponible en este navegador");
  }

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Fallo la descarga: HTTP ${response.status}`);
  }

  const totalHeader = response.headers.get("Content-Length");
  const total = totalHeader ? parseInt(totalHeader, 10) : null;

  // Streameamos la respuesta para poder reportar progreso mientras
  // acumulamos los chunks en memoria. Al terminar reconstruimos una
  // Response nueva con los bytes totales para guardarla en el cache.
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      if (onProgress) onProgress(total ? received / total : null);
    }
  }

  // Juntamos los chunks en un único Blob para construir la Response.
  const blob = new Blob(chunks as BlobPart[], {
    type: response.headers.get("Content-Type") ?? "audio/mpeg",
  });
  const cachedResponse = new Response(blob, {
    headers: response.headers,
  });

  const cache = await caches.open(AUDIO_CACHE_NAME);
  await cache.put(url, cachedResponse);
  if (onProgress) onProgress(1);
}

// Borra un audio del cache (no usado en el MVP, pero útil para "liberar
// espacio" en una versión futura).
export async function removeCachedAudio(url: string): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  const cache = await caches.open(AUDIO_CACHE_NAME);
  return cache.delete(url);
}

export interface CacheStats {
  count: number;
  bytes: number;
}

// Cuenta canciones cacheadas + bytes totales. Usa Content-Length del
// header cuando está disponible (instantáneo); si no, lee el blob
// (más lento pero preciso). Los audios los servimos con Content-Length
// seteado desde Vercel, así que en producción es instantáneo.
export async function getAudioCacheStats(): Promise<CacheStats> {
  if (typeof caches === "undefined") return { count: 0, bytes: 0 };
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const keys = await cache.keys();
    let bytes = 0;
    for (const req of keys) {
      const res = await cache.match(req);
      if (!res) continue;
      const cl = res.headers.get("Content-Length");
      if (cl) {
        bytes += parseInt(cl, 10) || 0;
      } else {
        // Fallback: leer el blob. Es más lento pero solo pasa si el
        // server no mandó Content-Length (raro en producción).
        const blob = await res.clone().blob();
        bytes += blob.size;
      }
    }
    return { count: keys.length, bytes };
  } catch {
    return { count: 0, bytes: 0 };
  }
}

// Borra TODO el cache de audios offline. Devuelve cuántas canciones
// había antes de borrar (para feedback al user).
export async function clearAudioCache(): Promise<number> {
  if (typeof caches === "undefined") return 0;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const keys = await cache.keys();
    await Promise.all(keys.map((req) => cache.delete(req)));
    return keys.length;
  } catch {
    return 0;
  }
}
