// playwright.config.ts
// Smoke tests E2E para verificar que el SW se instala bien, las páginas
// se cachean en warmup, y la app es navegable offline después de cargar
// una vez online.
//
// Por default apunta a producción (losdelsur.vercel.app). Para testear
// un build local: PW_BASE_URL=http://localhost:3000 npx playwright test.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,  // tests serial: lazy con state de SW entre runs
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PW_BASE_URL || "https://losdelsur.vercel.app",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // SW solo funciona en HTTPS (o localhost). En tests forzamos
    // contexto donde caches funciona.
    serviceWorkers: "allow",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
