# La Banda Los Del Sur

PWA de cánticos de la barra Los Del Sur con letras y audio offline.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS v4 + shadcn/ui
- Fuse.js para búsqueda fuzzy
- Serwist (`@serwist/next`) para Service Worker / PWA
- Contenido JSON estático, audio servido desde `/public/audio/`

> Nota: `create-next-app@latest` instaló Next 16.2 (no 15, ya está vieja).
> Serwist requiere webpack, así que los scripts `dev` y `build` usan
> `--webpack` explícitamente (Next 16 defaultea a Turbopack).

## Comandos

```bash
npm run dev                                    # dev server (webpack) en :3000
npm run build                                  # corre sync-audio y buildea para prod
npm run sync-audio                             # manual: refrescar public/audio/ desde content/
python scripts/recompress-audio.py             # re-encodea audio.mp3 → audio.m4a (AAC 64k mono)
python scripts/generate-lrc.py                 # genera letra.lrc con Whisper small (legacy)
python scripts/generate-lrc-v2.py              # genera letra.lrc con large-v3-turbo (premium)
python scripts/generate-lrc-v2.py --test       # prueba en 1 canción
python scripts/generate-lrc-v2.py --high-quality  # usa large-v3 (más lento, más preciso)
```

## Estructura del contenido

```
content/
  cdN/
    cd.json                    # metadata del CD
    <cover>.jpg                # portada (→ public/covers/cdN.jpg)
    NN-slug/
      song.json                # metadata de la canción
      letra.md                 # letra en markdown
      letra.lrc                # letra con timestamps (opcional, modo karaoke)
      audio.m4a                # AAC 64 kbps mono (~1.5 MB por canción)
```

`sync-audio.ts` copia cada `content/cdN/NN-slug/audio.m4a` a
`public/audio/cdN/NN-slug.m4a` y la portada del CD a `public/covers/cdN.jpg`.

## Performance

- **Audio AAC 64k mono (.m4a)** en vez de MP3 117k stereo: ~50% menos
  bytes por canción sin pérdida perceptible para cánticos. 80 canciones
  ≈ 114 MB (antes 216 MB).
- **AudioPlayer context split**: `useAudioPlayer()` expone estado
  discreto (track, play/pause, modes). `useAudioTime()` expone el
  `currentTime` que cambia ~4×/seg. Los consumers que no muestran el
  tiempo (cover, título, controles) no re-renderizan en cada timeupdate.
- **Cache offline**: cada canción descargada vive en el cache
  `lds-audio-v1`. La pantalla `/settings` muestra cuántas canciones hay
  y cuánto pesan, con botón para borrar todo.

## Deploy

`npm run build && vercel --prod` — sync-audio corre en prebuild y
popula `public/audio/` desde `content/`.

## Sharing

- Cada canción tiene **Open Graph image dinámica** (`app/cancion/[slug]/opengraph-image.tsx`) —
  preview con neón verde + título + CD al compartir el link por WhatsApp/Twitter/IG.
- **Deep links con timestamp**: `/cancion/<slug>?t=45` abre la canción y salta
  al segundo 45. El botón Share, cuando la canción está pausada >5s, incluye
  `?t=<segundo-actual>` automáticamente.

## Auth + cuentas (Supabase)

- Proyecto Supabase: `jivsjazbbihmyydemmht` (región `us-east-1`).
- Env vars en `.env.local`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Rutas:
  - `/login` — magic link por email (funciona out-of-the-box) + Google OAuth
    (requiere activar provider en Supabase Dashboard).
  - `/auth/callback` — intercambio code ↔ session (OAuth + magic link).
  - `/auth/sign-out` — cerrar sesión (POST).
  - `/perfil` — reemplaza al viejo `/settings`. Hero distinto con/sin login.
- `proxy.ts` refresca la sesión en cada request (Next 16 renombró
  `middleware` → `proxy`).
- Al primer login, si falta `ciudad` en el profile, `RegisterGate` muestra
  un modal obligatorio (ciudad + combo opcional).
- **Sync bidireccional**: `SyncManager` mergea `localStorage` ↔ Supabase al
  loguear (favoritas, plays, font size) y sube cada cambio fire-and-forget.
  Offline-first: `localStorage` sigue siendo fuente de verdad en runtime.

### Schema

- `profiles(id, username, ciudad, combo, avatar_url, ...)` — 1:1 con `auth.users`.
- `user_favorites(user_id, cancion_id)`
- `user_plays(user_id, cancion_id, play_count, last_played_at)`
- `user_downloads(user_id, cancion_id, device_id)`
- `user_settings(user_id, font_size, shuffle_mode, repeat_mode, extra)`
- RLS: todos privados excepto `profiles` (select público para futuros
  perfiles públicos cross-user).

## App Android (Capacitor)

`capacitor.config.ts` envuelve la PWA — el APK es un WebView thin que carga
`losdelsur.vercel.app`. Ver [`docs/ANDROID.md`](docs/ANDROID.md) para
instrucciones de build con Android Studio.

```bash
npx cap sync android        # sincroniza config a android/
npx cap open android        # abre en Android Studio
```

## Docs y roadmap

- [`docs/ROADMAP.md`](docs/ROADMAP.md) — plan de features futuras (fotos por
  sección de tribuna, boletería, push notifications, gamificación, etc.).
- [`docs/letras-pendientes.md`](docs/letras-pendientes.md) — 54 cánticos sin
  letra verificada, con prompts listos para copy-paste a Claude browser.
- [`docs/ANDROID.md`](docs/ANDROID.md) — build del APK, keystore, Play Store.

