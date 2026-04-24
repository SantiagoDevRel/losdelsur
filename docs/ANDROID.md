# App Android — Los Del Sur

Estado: **proyecto Capacitor creado**, listo para build del APK con Android Studio.

## Estructura

- `capacitor.config.ts` — config del wrapper; apunta a `https://los-del-sur-app.vercel.app` como `server.url`.
- `android/` — proyecto Gradle nativo generado por Capacitor. Se commitea.
- El APK es un thin WebView que carga la PWA desde Vercel. No build del front local.

## Cómo buildear el APK

### Pre-requisitos (una sola vez)

1. Instalar **Android Studio**: https://developer.android.com/studio
   - Durante la instalación, incluí Android SDK + Platform Tools + un emulador (API 34+ recomendado).
2. Instalar **JDK 17** (el que Gradle 8+ usa por default). Android Studio lo trae, pero si usás CLI asegurate de tenerlo en PATH.
3. Configurar `ANDROID_HOME` env var apuntando a `C:\Users\STZTR\AppData\Local\Android\Sdk`.

### Build debug (testeo local)

```bash
# Desde la raíz del repo:
npx cap sync android                     # sincroniza capacitor.config + assets
npx cap open android                     # abre Android Studio con el proyecto
# En Android Studio: Build > Build Bundle(s)/APK(s) > Build APK(s)
# APK queda en android/app/build/outputs/apk/debug/app-debug.apk
```

Para instalar en tu celu conectado por USB (con USB debug activo):

```bash
cd android
./gradlew installDebug
```

### Build release (para Play Store o distribución)

1. **Crear keystore** (UNA SOLA VEZ, guardala en un lugar seguro — si la perdés no podés publicar updates):

```bash
keytool -genkey -v -keystore los-del-sur-release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias los-del-sur
```

2. **Guardar la password** en `android/keystore.properties` (NO commitear — ya está en `.gitignore`):

```properties
storeFile=../../los-del-sur-release.keystore
storePassword=TU_PASSWORD
keyAlias=los-del-sur
keyPassword=TU_PASSWORD
```

3. Editá `android/app/build.gradle` para leer ese archivo y firmar release builds. Android Studio te guía con un wizard: **Build > Generate Signed Bundle / APK**.

4. Build:

```bash
cd android
./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab (para Play Store)
```

Para APK instalable directo:

```bash
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```

## Subir a Google Play Store

1. **Crear cuenta developer** en https://play.google.com/console — **$25 USD pago único**.
2. Crear nueva app ("Los Del Sur — Cancionero Oficial"), completar formulario (descripción, screenshots mínimo 2 en formato mobile 1080x1920, ícono 512x512, política de privacidad pública).
3. Subir `.aab` a "Production" track.
4. Review: 1-3 días. Permisivo para PWAs wrapped.

## Gotchas conocidos

- **OAuth Google desde WebView**: Google bloquea auth flows en `android.webkit.WebView` por seguridad (error "disallowed_useragent"). Soluciones:
  - Usar `@capacitor/browser` para abrir el flow en Chrome Custom Tabs.
  - **Más simple: magic link por email** sigue funcionando sin problema dentro del WebView. Para v1 del APK recomiendo deshabilitar Google OAuth y usar solo magic link.
- **Deep links**: si querés que `lds://cancion/xxx` abra la app, configurá intent filter en `AndroidManifest.xml`. Para v1 no es necesario — los links web abren el browser.
- **Push notifications**: necesita Firebase Cloud Messaging. Plugin `@capacitor/push-notifications`. No incluido en el MVP.
- **Tamaño del APK**: ~5-8 MB (vacío, solo WebView). Los cánticos se descargan a demanda desde la PWA — no pesan el APK.

## Update flow

Cuando hagas cambios al front:

```bash
# 1. Deploy a Vercel (git push main)
git push origin main
# Vercel redeploya automático.

# 2. Los usuarios del APK ven el update en su próxima apertura —
#    el WebView carga la nueva versión desde Vercel.
# 3. Solo necesitás rebuilder el APK si cambiás el wrapper nativo
#    (icons, splash, permisos, plugins).
```

## Cuando quieras iOS

Pre-requisito: **Mac** + Xcode + **$99/año Apple Developer Program**.

```bash
npm install @capacitor/ios --save-dev
npx cap add ios
npx cap open ios
# En Xcode: firmar, build, submit a App Store Connect.
```

La misma `capacitor.config.ts` sirve para iOS.
