# Auth Setup — Los Del Sur

Este doc te guía a activar los métodos de login uno por uno.
Estado actual de la app:

| Método | Estado | Bloqueante |
|--------|--------|-----------|
| Email magic link | ✅ Activo | — |
| Celular (SMS OTP) | ⚠️ Código listo, falta config Twilio | Twilio + Supabase Phone Provider |
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
