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
npm run dev                          # dev server (webpack) en :3000
npm run build                        # corre sync-audio y buildea para prod
npm run sync-audio                   # manual: refrescar public/audio/ desde content/
python scripts/recompress-audio.py   # re-encodea audio.mp3 → audio.m4a (AAC 64k mono)
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
