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

// Descarga un archivo de audio y lo guarda en el cache offline.
//
// El bucket R2 público no devuelve headers CORS, así que un `fetch()` en
// modo "cors" (default) no puede leer el body desde JS — la promise
// resuelve OK pero el browser bloquea acceso al stream. Por eso usamos
// `mode: "no-cors"` que retorna una "opaque response": el JS no la puede
// leer, PERO se puede guardar tal cual en Cache API y el SW después la
// sirve al `<audio>` cuando el user toca play offline.
//
// Trade-off: perdemos progress reporting preciso (no podemos leer
// Content-Length ni hacer stream del body). Si en el futuro se setea
// CORS en el bucket R2 (Cloudflare dashboard → R2 → settings → CORS),
// podemos volver a la versión streaming con progress real.
//
// `onProgress` se llama con null mientras descarga (UI muestra spinner
// indeterminado) y con 1 al terminar.
export async function downloadAudio(
  url: string,
  onProgress?: (fraction: number | null) => void,
): Promise<void> {
  if (typeof caches === "undefined") {
    throw new Error("Cache API no disponible en este navegador");
  }

  if (onProgress) onProgress(null);

  // Modo no-cors: opaque response, no podemos leer status ni body, pero
  // sí cachearla. Si la URL es 404 el browser igual devuelve una opaque
  // response "exitosa" — la verificación real de existencia ya pasó al
  // generar el audio_url en lib/content.ts.
  const response = await fetch(url, {
    mode: "no-cors",
    credentials: "omit",
    cache: "no-store",
  });

  // En no-cors, response.type === "opaque" y response.ok es false (sí,
  // raro). No podemos diferenciar 200 de 404. Igual la cacheamos: si
  // fuera 404 el SW devolvería el error al cliente cuando intente
  // reproducir, y el user verá que la canción no carga. Es el mejor
  // esfuerzo posible sin CORS.
  const cache = await caches.open(AUDIO_CACHE_NAME);
  await cache.put(url, response);

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

// Cuenta canciones cacheadas + bytes totales.
//
// Como descargamos con `mode: "no-cors"` (R2 sin CORS), las responses
// guardadas son opaque: NO exponen Content-Length ni permiten leer el
// blob. Para esos casos usamos un promedio estimado por canción (4 MB
// con el actual encoding 192k AAC stereo).
//
// Si en el futuro se setea CORS en R2 y volvemos a streaming reads,
// los bytes serán exactos automáticamente.
const ESTIMATED_BYTES_PER_SONG = 4 * 1024 * 1024;

export async function getAudioCacheStats(): Promise<CacheStats> {
  if (typeof caches === "undefined") return { count: 0, bytes: 0 };
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const keys = await cache.keys();
    let bytes = 0;
    for (const req of keys) {
      const res = await cache.match(req);
      if (!res) continue;
      // Opaque responses: type === "opaque", headers vacíos, body
      // ilegible. Caemos al estimado.
      if (res.type === "opaque") {
        bytes += ESTIMATED_BYTES_PER_SONG;
        continue;
      }
      const cl = res.headers.get("Content-Length");
      if (cl) {
        bytes += parseInt(cl, 10) || 0;
      } else {
        const blob = await res.clone().blob();
        bytes += blob.size || ESTIMATED_BYTES_PER_SONG;
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
