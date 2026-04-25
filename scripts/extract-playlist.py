"""
scripts/extract-playlist.py

Toma una playlist URL de YouTube + un CD (ej: cd1), extrae todos los
videos de la playlist, los matchea contra los song.json del CD por
título (fuzzy), y rellena content/audio-sources.json con los
youtube_url correspondientes.

Uso:
  python scripts/extract-playlist.py <cd_id> <playlist_url>

Ejemplo:
  python scripts/extract-playlist.py cd1 https://youtube.com/playlist?list=PLxxxxxx

Output:
  - Actualiza content/audio-sources.json con los youtube_url de cd1/*
  - Imprime un reporte: matches confiables, dudosos, sin match.
  - NO baja los audios. Eso lo hace redownload-audio.py después.

Modo --review:
  Después de matchear, abrir un editor para que confirmes manualmente
  los matches dudosos antes de escribir al JSON.
"""

from __future__ import annotations
import argparse
import json
import re
import subprocess
import sys
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

# Windows: forzar stdout UTF-8 para que los emojis (✅⚠️❌) no rompan
# print() cuando la consola está en cp1252.
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

CONTENT = Path("content")
SOURCES = CONTENT / "audio-sources.json"


def normalize(s: str) -> str:
    """Para fuzzy match: lowercase, sin acentos, sin puntuación, una palabra."""
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-z0-9\s]", " ", s.lower())
    s = re.sub(r"\s+", " ", s).strip()
    return s


def get_cd_songs(cd_id: str) -> list[dict]:
    """Lee todos los song.json de un CD. Devuelve lista ordenada por número."""
    cd_dir = CONTENT / cd_id
    if not cd_dir.exists():
        print(f"ERROR: {cd_dir} no existe")
        sys.exit(1)
    songs = []
    for s in sorted(cd_dir.iterdir()):
        if not s.is_dir():
            continue
        sj = s / "song.json"
        if not sj.exists():
            continue
        meta = json.loads(sj.read_text(encoding="utf-8"))
        songs.append(
            {
                "folder_key": f"{cd_id}/{s.name}",
                "numero": meta["numero"],
                "titulo": meta["titulo"],
                "titulo_norm": normalize(meta["titulo"]),
            }
        )
    songs.sort(key=lambda x: x["numero"])
    return songs


def fetch_playlist(playlist_url: str) -> list[dict]:
    """yt-dlp --flat-playlist devuelve metadata de cada video sin bajar."""
    import os
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--flat-playlist",
        "--print", "%(id)s\t%(title)s",
        "--no-warnings",
        playlist_url,
    ]
    # Forzar UTF-8 en el subprocess para que yt-dlp escriba bien los
    # acentos. Sin esto, en Windows con cp1252, se rompen "ó" → "�".
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}
    print(f"[yt-dlp] extrayendo playlist...")
    try:
        r = subprocess.run(
            cmd,
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=env,
        )
    except subprocess.CalledProcessError as e:
        print(f"ERROR yt-dlp: {(e.stderr or '')[-300:]}")
        sys.exit(1)
    videos = []
    for line in r.stdout.strip().splitlines():
        if "\t" not in line:
            continue
        vid_id, title = line.split("\t", 1)
        videos.append(
            {
                "id": vid_id,
                "title": title,
                "title_norm": normalize(title),
                "url": f"https://www.youtube.com/watch?v={vid_id}",
            }
        )
    return videos


def best_match(song: dict, videos: list[dict]) -> tuple[dict | None, float]:
    """Devuelve el video que mejor matchea + score (0-1)."""
    best = None
    best_score = 0.0
    for v in videos:
        score = SequenceMatcher(None, song["titulo_norm"], v["title_norm"]).ratio()
        # Bonus si el título normalizado del cántico está incluido en
        # el título normalizado del video (palabra por palabra).
        song_words = song["titulo_norm"].split()
        if len(song_words) >= 2 and all(w in v["title_norm"] for w in song_words):
            score += 0.15
        if score > best_score:
            best_score = score
            best = v
    return best, best_score


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cd_id", help="ej: cd1")
    ap.add_argument("playlist_url", help="URL de YouTube playlist")
    ap.add_argument(
        "--threshold",
        type=float,
        default=0.55,
        help="Score mínimo para auto-aceptar match (0-1, default 0.55)",
    )
    ap.add_argument("--dry", action="store_true", help="Solo reportar, no escribir JSON")
    ap.add_argument(
        "--in-order",
        action="store_true",
        help="Matchear por posición (track #N playlist → cántico #N CD). "
        "Usalo cuando estés seguro de que la playlist está en orden — más "
        "confiable que fuzzy match cuando los títulos tienen variaciones.",
    )
    args = ap.parse_args()

    songs = get_cd_songs(args.cd_id)
    print(f"[CD] {args.cd_id} tiene {len(songs)} canciones")

    videos = fetch_playlist(args.playlist_url)
    print(f"[Playlist] {len(videos)} videos encontrados")
    if not videos:
        print("Playlist vacía o yt-dlp falló.")
        sys.exit(1)

    # Match cada canción al mejor video. Marcamos como dudoso si score < threshold.
    matches = []
    if args.in_order:
        # Match por posición: track i de playlist → cántico i de CD.
        # Asumimos orden 1-a-1. Si difiere length, los extras quedan
        # sin match.
        n = min(len(songs), len(videos))
        for i in range(n):
            matches.append((songs[i], videos[i], 1.0))
        for i in range(n, len(songs)):
            matches.append((songs[i], None, 0.0))
    else:
        used_video_ids: set[str] = set()
        for song in songs:
            # Excluir videos ya asignados a otra canción (evitar doble-match).
            candidates = [v for v in videos if v["id"] not in used_video_ids]
            if not candidates:
                matches.append((song, None, 0.0))
                continue
            v, score = best_match(song, candidates)
            matches.append((song, v, score))
            if v and score >= args.threshold:
                used_video_ids.add(v["id"])

    # Reporte
    print(f"\n{'='*70}")
    print(f"REPORTE — {args.cd_id}")
    print(f"{'='*70}\n")
    confident = []
    doubtful = []
    missing = []
    for song, video, score in matches:
        marker = "✅" if score >= args.threshold else ("⚠️" if score >= 0.30 else "❌")
        line = (
            f"{marker} #{song['numero']:02d} {song['titulo'][:40]:40s}"
            f" → score={score:.2f}  {video['title'][:60] if video else '(NADA)'}"
        )
        print(line)
        if score >= args.threshold:
            confident.append((song, video))
        elif video and score >= 0.30:
            doubtful.append((song, video, score))
        else:
            missing.append(song)

    print(f"\n{'='*70}")
    print(f"✅ Auto-matched (score ≥ {args.threshold}): {len(confident)}/{len(songs)}")
    print(f"⚠️  Dudosos (revisar a mano): {len(doubtful)}")
    print(f"❌ Sin match: {len(missing)}")
    print(f"{'='*70}\n")

    if doubtful:
        print("Para los DUDOSOS, revisa los videos manualmente y editá")
        print(f"{SOURCES} a mano. Después corré redownload-audio.py.\n")

    if missing:
        print("Los SIN MATCH no van a tener audio nuevo. Revisalos a mano.\n")

    if args.dry:
        print("DRY RUN — no se modificó audio-sources.json")
        return

    # Escribir confident matches al audio-sources.json
    if not SOURCES.exists():
        print(f"ERROR: {SOURCES} no existe")
        sys.exit(1)
    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    written = 0
    for song, video in confident:
        key = song["folder_key"]
        if key not in sources:
            print(f"  warn: {key} no está en audio-sources.json, salto")
            continue
        sources[key]["youtube_url"] = video["url"]
        written += 1
    SOURCES.write_text(json.dumps(sources, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ Escritos {written} URLs en {SOURCES}")
    print(f"\nPróximo paso:")
    print(f"  python scripts/redownload-audio.py {args.cd_id}/* --dry  # verificar plan")
    print(f"  python scripts/redownload-audio.py {args.cd_id}/*        # bajar de verdad")


if __name__ == "__main__":
    main()
