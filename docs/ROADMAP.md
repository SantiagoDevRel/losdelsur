# ROADMAP — La Banda Los Del Sur

Visión: convertir el cancionero en **la app central del sureño** — no solo letras y audio offline, sino comunidad, memoria, encuentros, y servicios del día de partido.

Estado actual: **Fase 1 (MVP)** — 120 cánticos en 6 CDs con audio AAC offline, letras sincronizadas donde están, PWA instalable, búsqueda fuzzy, player global con Media Session API.

---

## Fase 2 — Cuentas + personalización (1-2 meses)

Pre-requisito para todo lo demás que implique pago o contenido personal.

### Auth
- **Clerk** o **Supabase Auth** como provider. Clerk es más turnkey; Supabase viene con DB gratis que nos sirve para el resto (favoritas, plays, pronto fotos).
- Login social: Google, Apple, **Instagram** (importante para la audiencia de la barra).
- Opción "continuar como invitado" — no obligar registro para escuchar.
- Backup de `localStorage` (favoritas, plays, fontSize, modos shuffle/repeat) a cuenta en Supabase. Si cambia de celu, no pierde nada.

### Perfil público mínimo
- Username sureño (@tu-nombre), foto, combo al que pertenece (opcional), años de hincha, barrio, partidos asistidos (self-report).
- Privacidad: perfil puede ser público, solo-combo, o privado.

### Suscripción (opt-in)
- Nivel `free`: todo el cancionero + favoritas + hasta 20 descargas offline.
- Nivel `sureño` (~COP 5.000/mes): descargas ilimitadas + fotos + carnet digital + features futuras.
- Nivel `capo` (~COP 15.000/mes): todo + badge dorado + anuncios antes que el público general (partidos, buses, excursiones).
- Pago via **MercadoPago** o **Wompi** (Stripe no corre bien transferencias COP).
- Anual con 2 meses gratis.

---

## Fase 3 — Fotos de la tribuna (la killer feature)

Los fotógrafos de la barra suben las fotos del partido, los hinchas se encuentran. Expiran en 7 días para no acumular storage.

### Estructura
- **Secciones del Atanasio** modeladas como entidades: `Popular Sur Baja`, `Popular Sur Alta`, `Lateral Sur`, y dentro de cada una los **combos** (con geometría aprox de cada bloque).
- Cada foto se geotaggea con: partido (fecha + rival), sección, combo aproximado, fotógrafo.
- Upload por fotógrafos verificados (rol `fotografo` en la DB).

### Encontrate
- **Modo "buscame"**: el usuario toma una selfie al registrarse. Cuando hay fotos nuevas, sistema face-matchea y notifica "apareciste en 3 fotos del partido de ayer".
- Opciones de implementación:
  - **AWS Rekognition** (~$1 por 1000 caras, alta precisión).
  - **face-api.js** (gratis, client-side, menos preciso pero zero backend).
  - **Hybrid**: face-api para match rápido; Rekognition para verificación.
- Privacidad: el usuario puede borrar su embedding en cualquier momento. Opt-in explícito para face-match.

### Monetización
- Fotos gratis en thumbnail con marca de agua "LOS DEL SUR".
- `sureño` desbloquea versión HD sin marca de agua.
- Fotógrafos cobran % de cada descarga HD (revenue share).

### Infra
- Storage: **Cloudflare R2** (~10x más barato que S3 para egress).
- DB: Supabase (foto metadata + embeddings).
- Auto-delete job semanal (Vercel Cron) que borra fotos >7 días y sus thumbnails.
- Compresión: avif para thumbnail, webp/jpeg para HD.

---

## Fase 4 — Partido (día de match day)

### Agenda
- Próximo partido: rival, fecha, hora, sede, clima, link de boletería oficial.
- Countdown en la home.
- Historial de partidos (resultado, formación, mis asistencias).

### Push notifications
- "Hay partido mañana — ¿ya descargaste los cánticos?"
- "Gol de Nacional" (si tenemos API de score).
- "Sale boletería mañana a las 10" (si integramos con Eticket).
- "El bus del Combo X sale a las 2pm desde Y".
- Infra: **Supabase Edge Functions** + **Web Push API** (el SW de Serwist ya está listo para recibir `push` events, solo falta el endpoint).

### Setlist del partido
- Capos de la barra arman una playlist ordenada: "esta noche cantamos estos 15 en este orden".
- Los hinchas la ven en la app — saben qué viene.
- Post-partido: vos marcás cuáles cantaste → alimenta tu "dedicación" (gamificación).

### Modo "estadio"
- Pantalla full-screen con lyrics gigantes, sin distracciones.
- Bluetooth speaker mode: conectás tu celular a un parlante del bombo y todo el combo ve la misma letra sincronizada (casteo via LAN/WebRTC).
- Auto-brightness máximo + lock orientation.

### Boletería / excursiones / buses
- **Boletería**: alertas cuando sale en Eticket, link directo. Integración API si hay, scraper si no.
- **Excursiones away**: formulario de pre-registro + pago, lista de espera, historial de viajes con galería de fotos.
- **Buses del combo**: cada combo publica dónde sale su bus para cada partido.

---

## Fase 5 — Social + gamificación

### Identidad
- **Carnet digital de sureño** con QR, foto, combo, años, partidos, nivel.
- Rangos: `Sureño Nuevo → Combo Regular → Combo Veterano → Capo de Bandera`.
- Badges por logros: "Primer partido", "10 partidos", "50 partidos", "Me sé 50 cánticos de memoria" (con quiz auto-grabado), "Viajé con la banda a X".

### Comunidad
- **Chat por combo / sección** (Discord-lite, moderado).
- **Muro de historias** — "Mi primer partido", "Mi cántico favorito y por qué".
- **Feed de videos** — capos publican clips cortos (gol, mosaico, bengala). Expira en 14 días.

### Funcionalidades de cancionero avanzadas
- **"Encontrá tu cántico"** — grabás 3-5s con el mic en el estadio, Shazam-style fingerprint, te dice qué cántico es. Usar AcoustID / ChromaPrint.
- **Karaoke score** — grabás tu voz cantando, el sistema da match score vs. la canción. Ranking semanal por combo.
- **Historia de cada cántico** — quién lo compuso, cuándo se cantó primero, foto de ese momento.
- **Ensayo solo** — pista vocal aislada (usando Demucs) para practicar antes del partido.

---

## Fase 6 — Utilidad / partnerships

- **Mapa del Atanasio** — puertas, baños, bares cercanos, punto de encuentro por combo.
- **Directorio aliado** — bares y tiendas con descuento para `sureño`.
- **Marketplace P2P** — intercambio de boletas entre socios verificados a precio de cara (anti-reventa). Fee de 2-3% como sustento.
- **Merchandising oficial** — integración con tienda oficial si existe.
- **Donaciones** — para causas de la barra (ayuda a familiares, enfermos, funerales). Transparencia total con reportes.

---

## Fase 7 — App nativa (iOS + Android)

Ver sección "App Store vs PWA" abajo.

- **Capacitor** o **Expo** para envolver la PWA actual.
- Ventajas: push reales (no solo Web Push), rendimiento, presencia en stores, shortcuts.
- Costos: Apple $99/año + Google $25 pago único + tiempo de review (~1-2 semanas primera vez).

---

## Mejoras técnicas transversales (no-features)

Estas van en paralelo a todo lo demás.

- [x] **Deep links `?t=45`** — compartir canción apuntando a un segundo específico.
- [x] **Open Graph dinámico** — preview bonito con título + CD + neón al compartir por WhatsApp/Twitter/IG.
- [ ] **PWA Push notifications** — wire del SW a un backend (Supabase Edge Functions).
- [ ] **Background sync** — si el usuario descarga offline pero pierde conexión, retomar al volver.
- [ ] **Service Worker update flow** — banner "hay versión nueva, recargá" en vez de update silencioso.
- [ ] **Analytics** — Plausible o PostHog para entender qué cánticos se escuchan más (sin trackear PII).
- [ ] **Error reporting** — Sentry free tier.
- [ ] **i18n-ready** — aunque sea todo en español, preparar la estructura por si se quiere añadir inglés/portugués para hinchas que no hablan español.

---

## Transcripción de letras (estado)

- 120 cánticos totales, 66 con letra real verificada (55%), 74 con LRC (62%).
- 54 pendientes de letra manual. Lista completa en `docs/letras-pendientes.md`.
- Script Whisper v2 en `scripts/generate-lrc-v2.py` usa `large-v3-turbo` + `initial_prompt` con jerga sureña. Corre ~1.8x realtime en Ryzen AI Max+ 395. 120 canciones ≈ 1-2h batch.

### Mejora futura de transcripción
- **Demucs** para aislar voz del crowd noise antes del Whisper → mejoraría mucho la precisión en CD3/CD4 que tienen mucho ambiente de tribuna.
  - Bloqueado por: Python 3.14 + AMD no tiene soporte PyTorch estable; habría que venv de Python 3.12.
- **WhisperX** con wav2vec2 español para forced alignment de precisión ±20ms → karaoke más exacto.
  - Mismo bloqueo de PyTorch.
- Alternativa pro: **ElevenLabs Scribe** o **AssemblyAI Universal-2** vía API. ~$2-3 USD para transcribir los 120 audios con calidad state-of-the-art.

---

## App Store vs PWA — comparación

### PWA (estado actual)
- **Costo**: $0.
- **Distribución**: URL. iOS requiere Safari + "Añadir a pantalla de inicio" (ya lo manejamos en `install-card.tsx`).
- **Push notifications**: sí en Android (Web Push), iOS solo si el usuario la instaló con "Add to Home Screen" (desde iOS 16.4).
- **Background playback**: sí (Media Session API, ya implementado).
- **Limitaciones iOS**: no aparece en App Store, no vibración, storage limitado (~50 MB hasta que el user instale).

### Android nativa (Play Store)
- **Costo**: **$25 USD** pago único (cuenta developer).
- **Esfuerzo**: `Capacitor` o `Bubblewrap` envuelven la PWA actual en un APK. ~2 días de trabajo.
- **Review**: ~1-3 días, muy permisivo.
- **Requisitos**: ícono adaptable, screenshots, descripción, política de privacidad (página web).
- **Ganás**: push reales sin restricción, install count "oficial", appears en search, mejor UX de instalación.

### iOS nativa (App Store)
- **Costo**: **$99 USD/año** (Apple Developer Program).
- **Esfuerzo**: `Capacitor` funciona pero requires Mac para build/sign.
- **Review**: estricto. Apple rechaza apps que son "solo wrappers de PWA sin valor nativo". Hay que añadir al menos algo nativo (push, haptics, home screen widget, Apple Watch companion) para que pase.
- **Review**: 1-2 semanas primera vez, después ~2 días por update.
- **Requisitos**: todo lo anterior + screenshots en todos los tamaños de iPhone, App Preview video opcional, política de privacidad detallada, TestFlight para beta testers.

### Recomendación
1. **Año 1**: solo PWA + Android. Android cubre la mayoría del Atanasio (~70% Android en Colombia según StatCounter). El $25 se paga solo en la primera suscripción `sureño`.
2. **Año 2**: iOS nativa si la app ya tiene 1000+ usuarios activos y la suscripción funciona. $99/año justifica solo si hay revenue.

---

## Prioridades sugeridas (orden de ejecución)

1. **Completar letras pendientes** (54 canciones) — desbloquea que el 100% tenga LRC y la UX se sienta "completa".
2. **Auth + backup localStorage** — prerequisito de todo pago y contenido personal.
3. **Push notifications + agenda partidos** — primer hook de engagement recurrente.
4. **Fotos tribuna (killer)** — primer hook de viralidad ("mandame la app para ver si estás en las fotos del sábado").
5. **Carnet digital + gamificación** — retention y identidad.
6. **Boletería / excursiones** — monetización indirecta (la app se vuelve utility real).
7. **App nativa Android** — alcance + push sin restricción.
8. **Modo estadio + cast LAN** — diferenciador para capos/combos.
9. **App nativa iOS** — cuando haya revenue que justifique $99/año.

---

*Este roadmap es vivo. Cada fase se actualiza cuando arrancamos. Ideas nuevas van al final con fecha para poder debatirlas antes de comprometerlas.*
