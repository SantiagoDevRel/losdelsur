# La Banda Los Del Sur

PWA de cánticos de la barra Los Del Sur (Atlético Nacional, Medellín).
Letras + audio offline + cuentas sincronizadas + notificaciones push.

**Producción:** https://losdelsur.vercel.app
**Versión:** 0.4 (audio v4 a 192 kbps + cd4 re-mapeado)
**Roadmap:** ver [`docs/ROADMAP.md`](docs/ROADMAP.md)

---

## Stack

- **Frontend:** Next.js 16 (App Router, webpack), React 19, TypeScript.
- **Estilos:** Tailwind v4 + shadcn/ui + base-ui + lucide-react.
- **PWA / Offline:** `@serwist/next` (Service Worker + cache API).
- **Auth:** Supabase Auth (Phone OTP via Twilio + WhatsApp magic-link via Meta Cloud API + magic link email).
- **DB:** Supabase Postgres (RLS habilitado en todas las tablas).
- **Audio storage:** Cloudflare R2 (egress free, escala infinita).
- **Search:** Fuse.js (client-side, fuzzy).
- **Push:** Web Push (VAPID) + Service Worker.
- **App nativa Android:** Capacitor (wrapper PWA).
- **Hosting:** Vercel (Hobby tier).

> Next 16 tiene breaking changes vs 15 — ver `AGENTS.md`. Serwist
> requiere webpack, scripts `dev`/`build` usan `--webpack` explícito.

---

## Arquitectura clave

### Audio (post-migración v0.3)

```
content/cdN/NN-slug/audio.m4a   ← fuente de verdad local (commiteado)
       ↓ npm run sync-audio
public/audio/cdN/SLUG.vN.m4a    ← preview local (gitignored)
       ↓ python scripts/upload-to-r2.py
R2 bucket "losdelsur-audio"     ← producción (egress gratis)
       ↓ NEXT_PUBLIC_R2_PUBLIC_URL
https://pub-xxx.r2.dev/cdN/SLUG.vN.m4a   ← URL en la app
```

- **Calidad:** AAC 192 kbps stereo (subido desde 128k en v0.4 — algunos
  cánticos sonaban duros en parlantes de carro; 192k cubre mejor el
  rango medio-alto sin inflar mucho el tamaño).
- **Cache busting:** `audio_version` en `cd.json` se traduce a sufijo
  `.vN.m4a` en el path. Bumpear → URL nueva → CDN obligado a re-fetch.
  No usamos `?v=N` query — Vercel CDN lo ignora para asset cache.
  Versión actual: **v4**.
- **Tamaños:** ~4 MB promedio por cántico, ~470 MB total los 6 CDs.

### Auth + perfil

- **Login:** primary tab celular (Twilio SMS OTP). Debajo del input de
  OTP aparece un fallback **"¿No te llega? Probá por WhatsApp"** que abre
  el bot por `wa.me/`; el user manda un msg, el bot responde con un botón
  CTA con magic-link de un solo uso (10min). Costo: $0 dentro de la
  ventana de servicio de 24h iniciada por el user (Meta Cloud API).
  Secondary tab email magic link. Google OAuth eliminado.
- **Registro:** modal `RegisterGate` aparece al primer login y bloquea
  hasta completar **nombre + ciudad** (autocomplete con 95 ciudades
  colombianas + algunas internacionales). Combo opcional.
- **Sync localStorage ↔ Supabase:** `SyncManager` mergea favoritas/plays
  /downloads/font_size al login. Cada cambio dispara custom events que
  se pushean fire-and-forget a Supabase. **Offline-first** —
  localStorage es fuente de verdad en runtime.
- **Sesiones:** sistema "1 mobile + 1 desktop" con cooldown y
  switch limit. Detalles en `lib/sessions/utils.ts`.

### Service Worker / offline

- Cache strategies (ver `app/sw.ts`):
  - **Audio** (R2 + /audio/*): `CacheFirst` cache `lds-audio-v1`.
  - **Páginas**: `NetworkFirst` con timeout 4s, fallback a `/offline`.
  - **API**: `NetworkOnly` (nunca cachear datos auth).
  - **Imágenes/fonts**: defaults de Serwist.
- **Push**: SW listener emite notificaciones, click navega al URL.

### DB schema (Supabase)

- `profiles(id, nombre, username, ciudad, combo, avatar_url, ...)` — 1:1 con `auth.users`.
- `user_favorites(user_id, cancion_id)`
- `user_plays(user_id, cancion_id, play_count, last_played_at)`
- `user_downloads(user_id, cancion_id, device_id)`
- `user_settings(user_id, font_size, shuffle_mode, repeat_mode, extra)`
- `push_subscriptions(id, user_id, endpoint, p256dh, auth_token, ...)`
- `user_sessions(id, user_id, device_type, device_label, auth_session_id, ...)`
- `session_switches(id, user_id, device_type, old/new device_label, ...)`

RLS en todas. `profiles` tiene SELECT público (para perfiles cross-user
futuros), todo lo demás es privado por `user_id`.

---

## Comandos

```bash
npm run dev                                  # dev server :3000
npm run build                                # prebuild sync-audio + build
npm run sync-audio                           # content/ → public/audio/

# Audio pipeline (cuando agregas/re-encodeas)
python scripts/extract-playlist.py cdN <playlist_url> --in-order
python scripts/redownload-audio.py "cdN/*"
python scripts/upload-to-r2.py "cdN/*"

# Letras sincronizadas (LRC karaoke)
python scripts/generate-lrc-v2.py "cdN/*"

# Capacitor Android
npx cap sync android                         # config + assets
npx cap open android                         # abre Android Studio
```

---

## Estado del contenido

| CD | Año | Tracks | Audio HQ | LRC sync | Letra real |
|----|-----|--------|---------|----------|------------|
| CD1 — Cuando Canta La Sur | 2001 | 20 | ✅ 20/20 | 20/20 | 15/20 |
| CD2 — El Orgullo de Ser Verdolaga | 2003 | 27 | ✅ 27/27 | 25/27 | 18/27 |
| CD3 — Soy del Verde, Soy Feliz | 2006 | 26 | ✅ 26/26 | 1/26 | 18/26 |
| CD4 — Alegría Popular | 2011 | 22 | ✅ 22/22 | 13/22 | 3/22 |
| CD5 — El Pueblo es Verdolaga | 2012 | 15 | ✅ 15/15 | 13/15 | 7/15 |
| CD6 — Para Amarte Nací | 2014 | 10 | ✅ 10/10 | 2/10 | 3/10 |
| **TOTAL** | | **120** | **120/120 HQ** | **74/120** | **64/120** |

Pendientes:
- 56 cánticos sin letra verificada → ver [`docs/letras-pendientes.md`](docs/letras-pendientes.md).
- 46 cánticos sin LRC sync → correr `generate-lrc-v2.py`.

---

## Sharing

- **Open Graph dinámico** por canción (`app/cancion/[slug]/opengraph-image.tsx`)
  con neón verde + título + CD. WhatsApp/Twitter/IG previews bonitos.
- **Deep links con timestamp**: `/cancion/<slug>?t=45` salta al segundo 45.
  Botón Share auto-añade `?t=` si está pausado >5s.

---

## Auth setup

- **Supabase Phone provider:** activado con Twilio SMS.
  Trial Twilio = $15 USD = ~270 SMS gratis. Después $0.054/SMS.
- **WhatsApp magic-link (fallback gratis):** flujo propio vía Meta Cloud
  API. Tablas: `wa_magic_tokens` (one-shot, 10min TTL) + RPC
  `find_auth_user_id_by_phone` para deduplicar accounts SMS↔WA.
  Endpoints: `/api/whatsapp/webhook` (HMAC verificado) y
  `/api/auth/wa-magic`. Setup completo en [`docs/AUTH-SETUP.md`](docs/AUTH-SETUP.md)
  sección 1.5. Requiere SIM dedicado + Meta Business app.
- **Email magic link**: funciona out-of-the-box vía Supabase Auth.
- **Google OAuth**: removido. La mayoría de sureños no usa gmail.

---

## App Android (Capacitor)

`capacitor.config.ts` envuelve la PWA — el APK es un WebView thin que
carga `losdelsur.vercel.app`. Cada update del front se hereda sin
rebuild del APK.

Setup completo: [`docs/ANDROID.md`](docs/ANDROID.md).

```bash
npx cap sync android        # sincroniza config a android/
npx cap open android        # abre Android Studio
```

---

## Push notifications

- **VAPID keys** generadas, en `.env.local` y Vercel production.
- **Endpoint admin**: `POST /api/push/send` con header `x-admin-secret`
  manda push con filtros (`user_ids`, `ciudades`, `all: true`).
  Implementación con batching + concurrency=10 (~1500 pushes/seg).
- **Opt-in**: card en `/perfil` → "Activar notificaciones".
- **iOS:** solo funciona si la PWA está instalada en Home Screen
  (iOS 16.4+).

Ejemplo dispatch:
```bash
curl -X POST https://losdelsur.vercel.app/api/push/send \
  -H "Content-Type: application/json" \
  -H "x-admin-secret: $ADMIN_PUSH_SECRET" \
  -d '{"title":"¡Partido mañana!","body":"Descargá tus cánticos","url":"/library","all":true}'
```

---

## Docs

- [`docs/ROADMAP.md`](docs/ROADMAP.md) — versiones + features futuras
  (auth ✅, fotos por sección de tribuna, boletería, gamificación, etc.).
- [`docs/letras-pendientes.md`](docs/letras-pendientes.md) — 56 cánticos sin
  letra verificada.
- [`docs/AUTH-SETUP.md`](docs/AUTH-SETUP.md) — guía Twilio / WhatsApp / Google.
- [`docs/ANDROID.md`](docs/ANDROID.md) — build APK, keystore, Play Store.
- [`AGENTS.md`](AGENTS.md) — reglas para agentes que toquen este repo.
- [`CLAUDE.md`](CLAUDE.md) — proxy a `AGENTS.md`.

---

## Deploy

```bash
git push origin main    # Vercel auto-deploy
```

`prebuild` corre `sync-audio.ts` (copia covers + audios locales).
Audios de PRODUCCIÓN ya viven en R2 — `lib/content.ts` los lee desde
`NEXT_PUBLIC_R2_PUBLIC_URL`. Si la env var no está, fallback a `/audio/*`.

---

## Credenciales

**Vivo en `~/Desktop/Los Del Sur App/credentials.env`**. No subir al repo.
Si alguna leak'eó en chat (Twilio Auth Token, R2 keys), rotarla en su
dashboard correspondiente.

Env vars necesarias (en `.env.local` localmente, Vercel Dashboard en prod):

| Var | Uso | Required |
|---|---|:-:|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API endpoint | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key | ✅ |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | R2 bucket public domain | ✅ |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Push opt-in (cliente) | ✅ |
| `VAPID_PRIVATE_KEY` | Push send (server) | ✅ |
| `VAPID_SUBJECT` | Push contact email | ✅ |
| `R2_ACCESS_KEY_ID` + secret | Upload audio (solo dev) | dev |
| `R2_ENDPOINT` + bucket | Upload audio (solo dev) | dev |
| `ADMIN_PUSH_SECRET` | Auth para `/api/push/send` | opcional |

---

Hecho por [@santiagotrujilloz](https://instagram.com/santiagotrujilloz).
