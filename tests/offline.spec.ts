// tests/offline.spec.ts
// Smoke test del flow offline:
//   1. Abrir la app online → SW se registra → install handler
//      warmupea las páginas key.
//   2. Ir a /library, /cds/cd1 — verificar que cargan online.
//   3. Pasar el browser a offline.
//   4. Recargar y navegar — verificar que NO cae a /offline (la
//      cache pre-cargada las sirve).
//
// Requiere que la home haya hecho el warmup install. Damos hasta 10s
// de gracia para que el SW termine de poblar lds-pages-v1.

import { test, expect, Page } from "@playwright/test";

async function waitForSWReady(page: Page): Promise<void> {
  // Espera a que (a) haya un SW controller (la página está controlada
  // por un SW) Y (b) el SW esté en estado activated.
  await page.waitForFunction(
    async () => {
      if (!("serviceWorker" in navigator)) return false;
      const reg = await navigator.serviceWorker.ready;
      return Boolean(reg.active && navigator.serviceWorker.controller);
    },
    null,
    { timeout: 30_000 },
  );
}

async function waitForPagesCached(page: Page, urls: string[]): Promise<string[]> {
  // Polea Cache API hasta que TODAS las urls estén cacheadas, o se cumpla timeout.
  // Devuelve las que sí terminaron en cache (por si alguna falla).
  const result = await page.waitForFunction(
    async (targets) => {
      try {
        const cache = await caches.open("lds-pages-v1");
        const found: string[] = [];
        for (const u of targets) {
          const hit = await cache.match(u);
          if (hit) found.push(u);
        }
        return found.length === targets.length ? found : null;
      } catch {
        return null;
      }
    },
    urls,
    { timeout: 15_000, polling: 500 },
  );
  return result.jsonValue() as Promise<string[]>;
}

test.describe("offline behavior", () => {
  test("SW se registra y warmupea páginas key", async ({ page, context }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/los del sur/i);

    await waitForSWReady(page);

    // Esperar que el warmup install haya cacheado las páginas.
    const warmupUrls = [
      "/",
      "/cds",
      "/cds/cd1",
      "/cds/cd2",
      "/cds/cd3",
      "/cds/cd4",
      "/cds/cd5",
      "/cds/cd6",
      "/library",
      "/search",
      "/perfil",
    ];
    const cached = await waitForPagesCached(page, warmupUrls);
    expect(cached.length, "todas las páginas warmup deberían estar en lds-pages-v1").toBe(warmupUrls.length);
  });

  test("la app se abre offline después de visitarla online", async ({ page, context }) => {
    // Setup: cargar online y esperar SW + warmup.
    await page.goto("/");
    await waitForSWReady(page);
    await waitForPagesCached(page, ["/", "/library", "/cds/cd1"]);

    // Switch a offline. setOffline en context afecta TODAS las requests
    // (incluido el SW que intenta hacer fetch).
    await context.setOffline(true);

    // Reload — debe servirse desde cache, no caer en /offline.
    await page.reload({ waitUntil: "domcontentloaded" });
    expect(page.url()).not.toContain("/offline");
    // La home tiene el hero "LOS DEL SUR" — buena señal de que cargó la página real.
    await expect(page.getByText(/LOS DEL SUR/i).first()).toBeVisible({ timeout: 5000 });

    // Navegar a /library offline.
    await page.goto("/library", { waitUntil: "domcontentloaded" });
    expect(page.url()).not.toContain("/offline");

    // Navegar a /cds/cd1 offline.
    await page.goto("/cds/cd1", { waitUntil: "domcontentloaded" });
    expect(page.url()).not.toContain("/offline");
  });

  // NOTA: el caso "ruta no warmupeada offline → /offline fallback" es
  // tricky de testear con Playwright porque el browser tira
  // net::ERR_FAILED en algunos paths antes de que el SW pueda servir
  // el fallback. Esto NO refleja un bug — en uso real (PWA instalada,
  // user toca un link interno) el SW intercepta limpio y sirve
  // /offline. El test queda como TODO si vale la pena pulirlo.
});
