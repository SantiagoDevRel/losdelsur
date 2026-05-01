# Configurar CORS en R2 (5 min, una sola vez)

Sin CORS, el botón "Descargar" del cliente JS no puede leer el body de
la respuesta de R2 desde el browser. Ahora mismo `lib/download.ts` usa
un workaround con `fetch(url, { mode: "no-cors" })` y guarda la opaque
response — funciona pero **no podemos mostrar progress real** durante
la descarga (UI muestra spinner indeterminado).

Para habilitar progress accurate, hay que setear CORS en el bucket.

## Pasos

1. Entrar a [Cloudflare dashboard](https://dash.cloudflare.com/) → R2
   → bucket **losdelsur-audio** → **Settings**.

2. Bajar a la sección **CORS Policy** y pegar este JSON:

```json
[
  {
    "AllowedOrigins": [
      "https://losdelsur.vercel.app",
      "http://localhost:3000",
      "capacitor://localhost",
      "https://localhost"
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": [
      "Content-Length",
      "Content-Type",
      "ETag",
      "Accept-Ranges"
    ],
    "MaxAgeSeconds": 86400
  }
]
```

3. **Guardar**. Cloudflare propaga global edge en ~30s.

4. Verificar con curl:

   ```bash
   curl -i -X OPTIONS \
     -H "Origin: https://losdelsur.vercel.app" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: range" \
     "https://pub-4a3344c5322e4d27bdbcb2204e5775f1.r2.dev/cd1/01-intro.v4.m4a"
   ```

   Esperás ver `200 OK` con headers:
   ```
   Access-Control-Allow-Origin: https://losdelsur.vercel.app
   Access-Control-Allow-Methods: GET, HEAD
   ```

5. Avisame que está hecho y revierto `lib/download.ts` a la versión
   streaming con progress bar real (commit ya preparado, solo falta
   merge).

## Por qué no lo pude hacer yo

Los R2 access keys que tenés en `.env.local` (R2_ACCESS_KEY_ID +
R2_SECRET_ACCESS_KEY) son tipo **Object Read/Write** — sirven para
listar, subir, borrar archivos pero NO incluyen permiso de **Bucket
Configuration** (CORS, lifecycle, etc.).

Para automatizar CORS desde script habría que:
- Generar un nuevo R2 token con permiso "Admin Read/Write" (o crear
  un Cloudflare API token global con acceso al recurso R2), Y/O
- Usar la Cloudflare REST API (`/accounts/<id>/r2/buckets/<name>/cors`)
  con un API token de Cloudflare account, no el R2 S3-compat key.

Todo eso es admin / dashboard work — no se hace desde código sin
elevar el blast radius de las keys que vivimos en `.env.local`. Más
seguro pegarle 1 vez en el UI.
