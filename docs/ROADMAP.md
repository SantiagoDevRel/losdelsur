# ROADMAP — La Banda Los Del Sur

Versiones que ya shippeamos + plan futuro.

---

## ✅ v0.1 — MVP de cancionero (Apr 21-22, 2026)

Primera versión funcional — solo lectura, sin cuentas.

- 120 cánticos en 6 CDs (audio AAC 64k mono inicial).
- Player global con Media Session API (controles lockscreen).
- Letras sincronizadas (modo karaoke con `.lrc`).
- Búsqueda fuzzy con Fuse.js.
- PWA instalable (Android + iOS Safari).
- Service Worker + cache offline (Cache API).
- Page transitions y view transitions.
- Tab bar inferior fijo.
- Modal de instalación + push prompt placeholder.
- Splash + ambient video del humo de la tribuna.
- Open Graph images dinámicas + deep links `?t=`.

**Stack:** Next 16, React 19, Tailwind v4, Serwist.
**Hosting:** Vercel Hobby tier.

---

## ✅ v0.2 — Cuentas + sync (Apr 23-24, 2026)

Auth real con Supabase, registro, sync entre devices.

- **Supabase Auth** activado (project `jivsjazbbihmyydemmht`).
- **Login por celular** (Twilio SMS OTP) como método principal.
- **Login por email** (magic link) secundario.
- **Google OAuth removido** — la mayoría de sureños no usa gmail.
- **Modal de registro obligatorio** post-login (nombre, ciudad con
  autocomplete de 95 municipios colombianos, combo opcional).
- **Sync bidireccional** localStorage ↔ Supabase (favoritas, plays,
  font size, descargas). Offline-first.
- **Tabla `profiles`** + RLS en todas las tablas user-data.
- **Sesiones "1 mobile + 1 desktop"** con cooldown y switch limit.
- **Push notifications** end-to-end (VAPID + opt-in + endpoint admin).
- **Política de privacidad** en `/privacy` para Play Store.
- **Iconos Android adaptables** + splash screens (136 assets generados).
- **Capacitor Android** wrapper configurado.

**Hitos técnicos:**
- Bug fix `createClient` no memoizado (provocaba RegisterGate invisible).
- `proxy.ts` (ex-middleware en Next 16) refresca sesión Supabase.
- Service Worker `NetworkFirst` para navegaciones (fix Safari iOS
  "FetchEvent.respondWith no-response" cuando red mala).
- Endpoints `/api/push/*`, `/api/profile`, `/api/sessions/*`.

---

## ✅ v0.3 — Audio HQ + escalabilidad (Apr 25-26, 2026)

Re-encode a calidad estudio + storage en Cloudflare R2.

- **Re-download de los 120 cánticos desde YouTube** (calidad estudio).
- **Re-encode a AAC 128 kbps stereo** (de 64k mono → calidad pro,
  notable en parlantes grandes / carros).
- **Cloudflare R2** como storage de audio (egress 100% free, escala
  infinita sin importar # de listeners simultáneos).
- **Cache busting por path** (`.vN.m4a` en filename — Vercel CDN
  ignora query strings, paths sí los respeta).
- **Push send con batching + concurrency** — soporta miles de subs
  sin timeout.
- **Bug fix Vercel build size** — audios excluidos del bundle de
  serverless functions con `outputFileTracingExcludes`.

**Pipeline para agregar audio nuevo:**
```bash
python scripts/extract-playlist.py cdN <playlist_url> --in-order
python scripts/redownload-audio.py "cdN/*"
python scripts/upload-to-r2.py "cdN/*"
# Bump cd.json audio_version, commit, push.
```

---

## 🔜 v0.4 — Pre-launch hardening (próximo)

Cerrar gaps de seguridad y observabilidad antes del primer lanzamiento
público (internal testing en Play Store).

- [ ] **Rate limiting** con Upstash Redis (free tier 10k req/día):
  - `/api/profile` PATCH: 10/min por user
  - OTP send: 3/hora por celular (protege saldo Twilio)
  - OTP verify: 10/15min por celular
  - `/api/push/subscribe`: 5/min por IP
  - `/api/push/send`: 1/min con admin secret
- [ ] **Letras pendientes**: completar las 56 que faltan (52% sin
  letra verificada todavía). Prompt en `docs/letras-pendientes.md`.
- [ ] **LRC sync** para los 46 cánticos sin sync (todo CD3 + mitad de
  CD4 + parte CD6) usando `scripts/generate-lrc-v2.py`.
- [ ] **Pre-cache top songs en Service Worker** — al instalar PWA,
  pre-bajar las 10-20 más populares automático.
- [ ] **Vercel Analytics** (free tier) o Plausible para entender uso.
- [ ] **Sentry o similar** para error reporting.

---

## 🔜 v0.5 — Internal testing en Play Store

- [ ] **Cuenta Google Play Console** ($25 USD, identity verification 1-3 días).
- [ ] **Keystore Android release** + signed build.
- [ ] **Listing assets**: feature graphic 1024×500, screenshots 1080×1920×6,
  short + long description.
- [ ] **Internal testing track** con 5-10 sureños amigos.
- [ ] **Iteración** según feedback de testers.

---

## 🔜 v1.0 — Lanzamiento público

Después de 1-2 semanas de internal testing exitoso.

- [ ] Mover de Internal → Closed Testing (50-1000 testers).
- [ ] **Subscripciones** (free + sureño + capo) via MercadoPago/Wompi.
- [ ] **Email SMTP custom** (Resend) para magic links profesionales.
- [ ] **WhatsApp Cloud API** para OTP (de Twilio SMS) — más barato +
  mejor UX para Colombia.
- [ ] Producción pública en Play Store.

---

## 🟡 v1.1+ — Features de comunidad (post-launch)

### Identidad y gamificación
- Carnet digital de sureño (QR, foto, combo, partidos).
- Rangos: Sureño Nuevo → Combo Veterano → Capo de Bandera.
- Badges por logros (primer partido, 50 cánticos memorizados, etc.).

### Partido / día de match
- Agenda de partidos (countdown, rival, clima, link boletería).
- Push automático "hay partido mañana — descargá los cánticos".
- Setlist del partido (capos arman lista, hinchas la ven).
- Modo "estadio" full-screen + Bluetooth speaker.

### Killer feature: fotos de tribuna
- Fotógrafos de la barra suben fotos por partido + sección Atanasio.
- Face-match opt-in (AWS Rekognition o face-api.js).
- Notif "apareciste en 3 fotos del sábado".
- Fotos expiran en 7 días.
- Storage en R2 (mismo provider que audio, free egress).
- Free thumbnail con marca de agua, HD desbloqueado por subscripción.

### Boletería + utilidad
- Alertas cuando sale boletería oficial.
- Excursiones away (formulario + pago + lista de espera).
- Buses por combo.
- Mapa Atanasio (puertas, baños, bares pre-partido).
- Marketplace P2P de boletas anti-reventa (fee 2-3%).
- Donaciones para causas de la barra.

### Social
- Chat por combo / sección (Discord-lite).
- Muro de historias.
- Feed de videos cortos (gol, mosaico, bengala) — expira 14 días.
- "Encontrá tu cántico" — Shazam-style fingerprint con 3-5 seg de mic.
- Karaoke score (grabás voz, score vs original, ranking semanal).

---

## 🌐 v2.0 — App nativa iOS

Pre-requisito: cuenta Apple Developer ($99/año) + Mac (o Expo EAS Build,
o GitHub Actions con runner macos-latest).

- Mismo `capacitor.config.ts` sirve para iOS.
- **Apple suele rechazar** PWAs envueltas — agregar al menos 1 feature
  nativa (push real con APNS, haptics, widget, share extension).
- Review estricto, 1-2 semanas primera vez.
- Vale la pena solo cuando v1.1+ tenga revenue que justifique los $99/año.

---

## 📊 Costos proyectados por etapa

| Etapa | Users activos/mes | Vercel | Supabase | Twilio/WhatsApp | R2 | Total |
|---|---|---|---|---|---|---|
| v0.3 (hoy) | 0-100 | $0 | $0 | $5 trial | $0 | **$5** |
| v0.4 | 100-1k | $0 | $0 | $54 (Twilio) | $0 | **$54** |
| v0.5 | 1k-5k | $0 (R2 ya descongestionó) | $0 | $80 (WhatsApp) | $0 | **$80** |
| v1.0 | 5k-20k | $20 (Pro) | $25 (Pro) | $500 (WhatsApp) | $1 | **$546** |
| v1.1 | 20k-50k | $50 | $25 | $1.250 | $5 | **$1.330** |

A $546/mes con 20k MAU: si capturás 1% en suscripción a $5.000 COP/mes =
$260 USD MRR. Cubre la mitad. Con 2-3% de conversion ($1k+ MRR) ya rentable.

---

*Este roadmap es vivo. Cuando arrancamos una nueva etapa, agregamos el
checkmark + fecha. Items dentro de cada versión se priorizan según
feedback de testers reales.*
