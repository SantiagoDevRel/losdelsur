# Auth Setup — Los Del Sur

Este doc te guía a activar los métodos de login uno por uno.
Estado actual de la app:

| Método | Estado | Bloqueante |
|--------|--------|-----------|
| Email magic link | ✅ Activo | — |
| Celular (SMS OTP) | ⚠️ Código listo, falta config Twilio | Twilio + Supabase Phone Provider |
| WhatsApp magic-link (fallback gratis) | ⚠️ Código listo, falta SIM nuevo + Meta Business | Meta WhatsApp Cloud API + número dedicado |
| Google OAuth | ⚠️ Código listo, escondido por flag | Google Cloud + Supabase Google Provider |

---

## 1. Login por celular (RECOMENDADO — la mayoría de sureños no tiene gmail)

### Setup en Twilio (1 vez, ~15 min)

Twilio es el SMS provider más usado y el que Supabase soporta nativo.

1. Crear cuenta en **https://www.twilio.com/try-twilio** (free trial te da $15 USD de credit, suficiente para ~250 SMS).
2. Verificar tu email + tu celular personal.
3. En el dashboard:
   - Anotá **Account SID** y **Auth Token** (los necesitás abajo).
4. **Comprar un número de teléfono** (Phone Numbers → Buy a number):
   - País: USA recomendado (es el más barato, ~$1/mes, sirve para mandar SMS internacional).
   - Tildá **"SMS"** en capabilities.
   - Comprás. Anotá el número (ej `+15551234567`).

### Setup en Supabase (1 vez, ~5 min)

1. Andá a **https://supabase.com/dashboard/project/jivsjazbbihmyydemmht/auth/providers**.
2. Buscá **Phone** en la lista → toggle ON.
3. **Provider**: elegí **Twilio**.
4. Pegá:
   - **Account SID**: el de Twilio.
   - **Auth Token**: el de Twilio.
   - **Message Service SID**: dejá vacío al principio (usás el número directo).
   - **Twilio Phone Number**: el número que compraste (`+15551234567`).
5. **Template del SMS** (opcional, pero más profesional):
   ```
   {{ .Code }} es tu código para entrar a La Banda Los Del Sur.
   No lo compartas con nadie.
   ```
6. Save.

### Probá

Tu app en `losdelsur.vercel.app/login` → tab "CELULAR" → ponés tu celular → te llega el SMS → metés el código → adentro.

### Cuando quieras migrar a WhatsApp

Twilio soporta SMS y WhatsApp con **el mismo Account SID + Auth Token**. La diferencia:

1. En Twilio: registrar un **WhatsApp Sender** (requiere aprobar tu negocio en Meta Business Manager — proceso de 1-7 días).
2. En `app/login/login-view.tsx`, línea ~80, cambiá:
   ```ts
   options: { channel: "sms" }
   ```
   por:
   ```ts
   options: { channel: "whatsapp" }
   ```
3. En `app/login/login-view.tsx` línea ~115, cambiá:
   ```ts
   type: "sms"
   ```
   por:
   ```ts
   type: "whatsapp"
   ```

WhatsApp es ~30% más barato que SMS para Colombia y se siente mucho más natural a nuestros sureños.

### Costos

- Twilio cobra por SMS enviado. Colombia: ~$0.054 USD por SMS.
- 100 logins/mes ≈ $5.40 USD.
- 1000 logins/mes ≈ $54 USD.
- **Mitigación**: Supabase rate-limita a 1 OTP cada 60s por número, evita spam.

---

## 1.5. WhatsApp magic-link (RECOMENDADO como fallback gratis del SMS)

Mismo flujo que la-polla: el user toca **"¿No te llega? Probá por WhatsApp"** debajo del input de OTP. Eso abre el chat del bot por `wa.me/`. El user manda **"Quiero entrar a Los del Sur"**, el bot responde con un botón **ENTRAR**, el user toca → adentro. El link sirve 10 minutos y solo una vez.

### Por qué ahorra plata

- Twilio SMS Colombia: ~$0.054 USD por mensaje.
- Meta Cloud API: cuando la conversación la **inicia el user** (mensaje entrante), las respuestas del negocio (utility) caen en una **ventana de servicio gratuita de 24h**. Para auth eso siempre se cumple — el user manda primero, el bot responde con el botón.
- Resultado: cada login por WA cuesta **$0** en lugar de $0.054. 1000 logins/mes = $54 ahorrados.

### Prerrequisitos

- Una **SIM card nueva** (número dedicado para el bot — NO usar tu personal).
- Cuenta Meta Business (gratis).
- Acceso al dashboard de Vercel del proyecto.
- La migración SQL `supabase/migrations/001_wa_magic_auth.sql` corrida en el dashboard de Supabase.

### Step-by-step (~30 min en total)

#### Parte A — Supabase: correr la migración (2 min)

1. Abrí https://supabase.com/dashboard/project/jivsjazbbihmyydemmht/sql.
2. Pegá el contenido de `supabase/migrations/001_wa_magic_auth.sql`.
3. Run. Verificá que crea `public.wa_magic_tokens` y la función `find_auth_user_id_by_phone`.

#### Parte B — Meta Business: setear la app y el número (~20 min)

1. **Crear cuenta Meta Business**:
   - https://business.facebook.com → Crear cuenta business si no tenés.
2. **Crear app de WhatsApp Business**:
   - https://developers.facebook.com/apps → "Create App" → tipo **"Business"**.
   - Nombre: `Los del Sur`. Email de contacto: el tuyo.
   - Una vez creada, en el menú lateral → **Add product** → buscar **WhatsApp** → Set up.
3. **Conectar tu número**:
   - WhatsApp → API Setup. Te genera un número de prueba gratis para los primeros tests, pero ese caduca y solo manda a 5 destinatarios.
   - Para producción: en API Setup → **Add phone number** → escribir el número de la SIM nueva (E.164, ej `+573001234567`) → Meta manda código de verificación al SIM → metés el código.
   - Importante: el SIM **no puede** estar activo en WhatsApp normal (ni Business). Si ya lo está, primero desinstalalo de ese teléfono.
4. **Anotar credenciales** (vas a necesitarlas para Vercel):
   - **App Secret**: App Settings → Basic → **App Secret** (botón Show). Esto es el `META_WA_APP_SECRET`.
   - **Phone Number ID**: WhatsApp → API Setup → arriba del todo, "From" tiene un dropdown con tu número y abajo dice **Phone number ID** (un número largo). Eso es `META_WA_PHONE_NUMBER_ID`.
   - **Permanent Access Token**: API Setup te da un "Temporary access token" (24h, sirve para tests). Para prod necesitás un **System User Token permanente**:
     - Business Settings (https://business.facebook.com/settings) → Users → System users → Add → nombre `losdelsur-bot`, role Admin.
     - Click en el system user → Generate New Token → seleccionar tu app → permisos: `whatsapp_business_messaging` y `whatsapp_business_management` → Never expires → Generate.
     - Copiar el token (solo se ve una vez). Eso es `META_WA_ACCESS_TOKEN`.
   - **Asignar la app y el número al system user**: Business Settings → System Users → tu user → Add Assets → seleccionar tu app y tu WhatsApp Business Account.
5. **Webhook Verify Token**: lo inventás vos. Cualquier string random (ej `lds-wa-verify-9k2h7x4`). Eso es `META_WA_WEBHOOK_VERIFY_TOKEN`.

#### Parte C — Vercel: setear env vars (5 min)

En el dashboard de Vercel del proyecto → Settings → Environment Variables, agregar (todas en **Production + Preview + Development**):

```
META_WA_ACCESS_TOKEN          = <token permanente del system user>
META_WA_PHONE_NUMBER_ID       = <phone number id del bot>
META_WA_WEBHOOK_VERIFY_TOKEN  = <string random que inventaste>
META_WA_APP_SECRET            = <app secret>
NEXT_PUBLIC_WHATSAPP_BOT_NUMBER = 573001234567
NEXT_PUBLIC_APP_URL           = https://losdelsur.vercel.app
```

Notas:
- `NEXT_PUBLIC_WHATSAPP_BOT_NUMBER`: E.164 sin `+`. Es público (lo lee el cliente para construir el link `wa.me/`).
- `NEXT_PUBLIC_APP_URL`: dominio público. Si usás dominio custom (ej `losdelsur.com`), usá ese. Sin trailing slash.
- Las otras 4 son **server-only** (no lleves prefix `NEXT_PUBLIC_`). Críticas: si filtran, alguien puede impersonar a Meta o mandar mensajes desde tu bot.

#### Parte D — Push & deploy

```bash
git push origin main
```

Vercel detecta el push y deploya con las nuevas env vars. Una vez verde:

#### Parte E — Configurar el webhook en Meta (3 min)

1. WhatsApp → Configuration → Webhook → **Edit**.
2. **Callback URL**: `https://losdelsur.vercel.app/api/whatsapp/webhook` (o tu dominio custom).
3. **Verify token**: el mismo string random que pusiste en `META_WA_WEBHOOK_VERIFY_TOKEN`.
4. Verify and save → Meta hace un GET al endpoint y debe responder 200 con el challenge.
5. Una vez verificado, abajo aparece **Webhook fields** → **Manage** → tildar **`messages`** → Save.

#### Parte F — Smoke test

1. Desde tu propio celular, mandale al bot por WhatsApp el texto: **"Quiero entrar a Los del Sur"**.
2. El bot debería responder con un mensaje + botón **ENTRAR** en ~2 segundos.
3. Tocá el botón → te abre `losdelsur.vercel.app/api/auth/wa-magic?token=...` → debería redirigirte a `/perfil` logueado.
4. Si algo falla, mirá los logs en Vercel: Deployments → último deploy → Functions → `/api/whatsapp/webhook`. Los errores de Meta API se loguean ahí.

### Costos

| Concepto | Costo |
|----|----|
| Meta Cloud API: respuesta utility en ventana de servicio (user inició) | **$0** |
| Meta Cloud API: 1000 conversaciones de servicio fuera de ventana | $0 (las primeras 1000/mes son gratis en cualquier caso) |
| SIM card colombiana | ~$5–10 USD una vez |
| Plan de datos del SIM | El bot **NO necesita data en el SIM**. Meta Cloud API funciona via internet del server. El SIM solo recibe el SMS de verificación inicial. Podés usar prepago sin recarga después. |

**TL;DR**: ~$10 USD una vez por la SIM, $0/mes en ongoing.

### Cómo coexistir con el bot de la-polla (si reutilizás cuenta Meta Business)

Si usás **el mismo número y misma app** para los dos proyectos, ambos webhooks reciben todos los mensajes (no se puede subscribir un app a un solo proyecto). Los webhooks discriminan por **texto del mensaje**:

- `app/api/whatsapp/webhook/route.ts` (este proyecto) matchea: `/entrar/i` Y `/los del sur/i`.
- la-polla matchea: `/entrar.*la polla/i` o similar.

Mientras los textos preconfigurados en `wa.me/?text=...` sean distintos, no hay colisión. **Pero usar la misma cuenta significa que un susto en una app afecta a la otra** (rate limits, ban, etc.). **Recomendado: número y app separados** para los-del-sur, aunque la cuenta Meta Business sea la misma.

---

## 2. Google OAuth (OPCIONAL — los sureños prefieren celular)

### Setup en Google Cloud (10 min)

1. **https://console.cloud.google.com** → crear proyecto **"losdelsur"**.
2. Menú izq → **APIs & Services** → **OAuth consent screen**:
   - User type: **External** → Create.
   - App name: `La Banda Los Del Sur`.
   - User support email: tu email.
   - Authorized domains: `supabase.co`.
   - Save & Continue → skip scopes y test users con Save.
3. **APIs & Services** → **Credentials** → **+ CREATE CREDENTIALS** → **OAuth client ID**:
   - Application type: **Web application**.
   - Name: `losdelsur-web`.
   - Authorized redirect URIs:
     ```
     https://jivsjazbbihmyydemmht.supabase.co/auth/v1/callback
     ```
   - Create.
4. Copiá el **Client ID** y **Client Secret** que te muestra el modal.

### Setup en Supabase

1. **https://supabase.com/dashboard/project/jivsjazbbihmyydemmht/auth/providers**.
2. **Google** → toggle ON.
3. Pegá Client ID + Client Secret.
4. Save.

### Activar el botón en la app

El botón de Google está escondido detrás del flag `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED`. Para activarlo:

1. **Local** (`.env.local`):
   ```
   NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED=true
   ```
2. **Vercel production**:
   ```bash
   echo "true" | vercel env add NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED production
   ```
3. Redeploy.

### Publicar la OAuth app (para que cualquiera, no solo testers, pueda usar Google)

Mientras la app esté en modo "Testing" en Google Cloud, solo los emails que agregues como "test users" pueden loguear. Para abrir al público:

1. Google Cloud Console → OAuth consent screen → **PUBLISH APP**.
2. Como solo pedimos scopes básicos (email + profile), Google no requiere verificación oficial — sale aprobado automático.

---

## 3. Email magic link (YA FUNCIONA — no requiere setup)

Supabase manda emails desde su dominio (`@supabase.io`) por default. Funciona out-of-the-box pero los emails llegan a Spam con frecuencia y dicen "supabase".

### Mejorar deliverability (opcional, cuando tengas tráfico)

1. Configurar un **SMTP custom** en Supabase Dashboard → Auth → SMTP Settings.
2. Opciones recomendadas:
   - **Resend** (https://resend.com) — 3000 emails/mes gratis, simple.
   - **AWS SES** — 62k emails/mes gratis (si tenés cuenta AWS).
3. Templates de email custom: Auth → Email Templates.
   - Agregar el verde neón + logo + tono "sureño".
