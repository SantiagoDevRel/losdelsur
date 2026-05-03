"""
scripts/trim-leading-silence.py

Recorta el silencio inicial de los audios en content/cdN/<song>/audio.m4a.
Útil para canciones que arrancan con 2-3 segundos de silencio antes del primer sonido.

Cómo funciona:
  1. Por cada audio.m4a, detecta silencio inicial con `ffmpeg silencedetect`.
     Considera "silencio" cualquier tramo bajo -50dB de duración > 50ms.
  2. Si el silencio inicial supera el threshold (default 500ms), recorta con
     el filtro `silenceremove`. Re-encodea AAC al bitrate del original
     (single re-encode, pérdida audible mínima en m4a 128k).
  3. Hace backup .m4a.bak antes de modificar (skip si ya existe).

Uso:
  python scripts/trim-leading-silence.py                # procesa todos los > threshold
  python scripts/trim-leading-silence.py --dry          # solo reporta, no modifica
  python scripts/trim-leading-silence.py "cd1/09*"      # filtro por pattern (glob)
  python scripts/trim-leading-silence.py --threshold-ms 1000   # threshold custom
  python scripts/trim-leading-silence.py --noise-db -45        # sensibilidad detect
  python scripts/trim-leading-silence.py --no-backup           # no crear .bak (peligroso)
  python scripts/trim-leading-silence.py --restore             # restaurar todos los .bak

Después de correr (cuando NO es --dry):
  - Los content/cdN/<song>/audio.m4a quedan modificados.
  - Hay que bumpear audio_version en cd.json (v4 → v5) para evitar
    cache poisoning del Service Worker, después correr sync-audio +
    upload-to-r2 + commit + push.

Requisitos:
  - ffmpeg en el PATH
  - ffprobe en el PATH (viene con ffmpeg)
"""

from __future__ import annotations
import argparse
import shutil
import subprocess
import sys
from fnmatch import fnmatch
from pathlib import Path

CONTENT = Path("content")


def check_ffmpeg() -> None:
    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            print(f"ERROR: '{tool}' no está en el PATH. Instalá ffmpeg.")
            sys.exit(1)


def find_audio_files(patterns: list[str]) -> list[tuple[str, Path]]:
    """Devuelve [(rel_key, path), ...] para cada audio.m4a en content/cdN/<song>/.
    rel_key es 'cdN/<song>' — sirve para filtrar con --pattern."""
    if not CONTENT.exists():
        print(f"ERROR: no existe {CONTENT}/. Estás corriendo desde la raíz del repo?")
        sys.exit(1)
    out: list[tuple[str, Path]] = []
    for cd_dir in sorted(CONTENT.iterdir()):
        if not cd_dir.is_dir() or not cd_dir.name.startswith("cd"):
            continue
        for song_dir in sorted(cd_dir.iterdir()):
            if not song_dir.is_dir():
                continue
            audio = song_dir / "audio.m4a"
            if not audio.exists():
                continue
            rel = f"{cd_dir.name}/{song_dir.name}"
            if patterns and not any(fnmatch(rel, p) for p in patterns):
                continue
            out.append((rel, audio))
    return out


def get_duration_seconds(path: Path) -> float:
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 0.0


def get_bitrate_kbps(path: Path) -> int:
    """Bitrate del stream de audio en kbps. Default 128 si no se puede leer."""
    r = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "a:0",
         "-show_entries", "stream=bit_rate", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True,
    )
    try:
        return max(64, int(r.stdout.strip()) // 1000)
    except ValueError:
        return 128


def detect_leading_silence_seconds(path: Path, noise_db: float, min_dur: float) -> float:
    """Devuelve cuántos segundos de silencio hay al inicio.
    silencedetect emite a stderr líneas tipo:
      [silencedetect ...] silence_start: 0
      [silencedetect ...] silence_end: 2.345 | silence_duration: 2.345
    Solo nos importa el primer par si silence_start está cerca de 0."""
    r = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
         "-af", f"silencedetect=n={noise_db}dB:d={min_dur}",
         "-f", "null", "-"],
        capture_output=True, text=True,
    )
    started_at_zero = False
    for line in r.stderr.splitlines():
        if "silence_start:" in line:
            try:
                t = float(line.split("silence_start:")[1].strip().split()[0])
            except (ValueError, IndexError):
                continue
            started_at_zero = t < 0.05  # tolerancia: arranca dentro de los primeros 50ms
        elif "silence_end:" in line and started_at_zero:
            try:
                t = float(line.split("silence_end:")[1].split("|")[0].strip())
                return t
            except (ValueError, IndexError):
                continue
    return 0.0


def trim_file(path: Path, noise_db: float, bitrate_kbps: int, keep_silence_s: float) -> bool:
    """Trimea silencio inicial in-place, dejando keep_silence_s segundos de
    'respiración' residual al inicio (evita que la canción arranque abrupta).
    Si el archivo ya tenía menos de keep_silence_s de silencio inicial,
    silenceremove no remueve nada — comportamiento safe."""
    # ffmpeg infiere el container del extension. Usamos .tmp.m4a (no .m4a.tmp)
    # para que ffmpeg sepa que el output es m4a.
    tmp = path.with_name(f"{path.stem}.tmp{path.suffix}")
    sr_filter = (
        f"silenceremove=start_periods=1:start_duration=0.05:"
        f"start_threshold={noise_db}dB:start_silence={keep_silence_s}"
    )
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(path),
        "-af", sr_filter,
        "-c:a", "aac", "-b:a", f"{bitrate_kbps}k",
        "-movflags", "+faststart",
        str(tmp),
    ]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not tmp.exists():
        if tmp.exists():
            tmp.unlink()
        print(f"  ffmpeg ERROR: {r.stderr.strip().splitlines()[-1] if r.stderr else 'unknown'}")
        return False
    tmp.replace(path)
    return True


def restore_backups() -> int:
    files = list(CONTENT.rglob("audio.m4a.bak"))
    if not files:
        print("No hay .bak para restaurar.")
        return 0
    n = 0
    for bak in files:
        target = bak.with_suffix("")  # audio.m4a.bak -> audio.m4a
        bak.replace(target)
        print(f"  restored {target.relative_to(CONTENT)}")
        n += 1
    return n


def main() -> int:
    ap = argparse.ArgumentParser(description="Trim leading silence from content/cdN/<song>/audio.m4a")
    ap.add_argument("patterns", nargs="*", help="Globs estilo cd1/09* (opcional). Si no se pasa, procesa todo.")
    ap.add_argument("--dry", action="store_true", help="Solo reporta, no modifica nada.")
    ap.add_argument("--threshold-ms", type=int, default=200,
                    help="Solo trim si el silencio inicial supera este threshold (default 200ms = Spotify-tight).")
    ap.add_argument("--keep-silence-ms", type=int, default=150,
                    help="Cuánta 'respiración' inicial dejar tras el trim (default 150ms — evita arranque abrupto).")
    ap.add_argument("--noise-db", type=float, default=-50.0,
                    help="Threshold dB para considerar silencio (default -50dB).")
    ap.add_argument("--min-dur", type=float, default=0.05,
                    help="Duración mínima en segundos para que silencedetect lo cuente (default 0.05).")
    ap.add_argument("--no-backup", action="store_true", help="No crear .bak (peligroso).")
    ap.add_argument("--restore", action="store_true", help="Restaurar todos los .bak y salir.")
    args = ap.parse_args()

    check_ffmpeg()

    if args.restore:
        n = restore_backups()
        print(f"\nRestaurados: {n}")
        return 0

    files = find_audio_files(args.patterns)
    if not files:
        print("No se encontraron audios. Patterns?:", args.patterns)
        return 1

    threshold_s = args.threshold_ms / 1000.0
    print(f"Targets: {len(files)} archivo(s). Threshold: {args.threshold_ms}ms a {args.noise_db}dB")
    print(f"Modo: {'DRY-RUN' if args.dry else 'TRIM IN-PLACE'}")
    print()

    n_trimmed = 0
    n_skipped_below = 0
    n_failed = 0
    total_ms_saved = 0

    for i, (rel, path) in enumerate(files, 1):
        leading = detect_leading_silence_seconds(path, args.noise_db, args.min_dur)
        leading_ms = int(leading * 1000)
        prefix = f"[{i}/{len(files)}] {rel}"

        if leading_ms < args.threshold_ms:
            print(f"{prefix}: skip ({leading_ms}ms inicial — bajo threshold)")
            n_skipped_below += 1
            continue

        if args.dry:
            # Saved real = silencio detectado − keep_silence_ms (lo que queda como "respiración")
            est_saved_ms = max(0, leading_ms - args.keep_silence_ms)
            print(f"{prefix}: WOULD TRIM (detect {leading_ms}ms -> keep {args.keep_silence_ms}ms, save ~{est_saved_ms}ms)")
            total_ms_saved += est_saved_ms
            n_trimmed += 1
            continue

        # Backup
        bak = path.with_suffix(".m4a.bak")
        if not args.no_backup and not bak.exists():
            shutil.copy2(path, bak)

        bitrate = get_bitrate_kbps(path)
        dur_before = get_duration_seconds(path)
        ok = trim_file(path, args.noise_db, bitrate, args.keep_silence_ms / 1000.0)
        if not ok:
            n_failed += 1
            continue

        dur_after = get_duration_seconds(path)
        saved_ms = int((dur_before - dur_after) * 1000)
        total_ms_saved += saved_ms
        n_trimmed += 1
        print(f"{prefix}: trimmed {saved_ms}ms (was {leading_ms}ms detected) | {bitrate}k")

    print()
    print(f"==== {n_trimmed} {'would be trimmed' if args.dry else 'trimmed'}, "
          f"{n_skipped_below} skipped (under threshold), {n_failed} errors ====")
    print(f"Total tiempo recortado: {total_ms_saved}ms ({total_ms_saved/1000:.1f}s)")
    if not args.dry and n_trimmed > 0:
        print()
        print("[!] Proximos pasos para que los users reciban los audios trimmed:")
        print("    1. Bumpear audio_version en content/cdN/cd.json (v4 -> v5)")
        print("    2. LDS_COPY_LOCAL_AUDIO=1 npm run sync-audio")
        print("    3. python scripts/upload-to-r2.py    (sin --force, son keys nuevos .v5.m4a)")
        print("    4. git add . && git commit -m 'audio: trim leading silence + bump v5' && git push")
    return 0 if n_failed == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
