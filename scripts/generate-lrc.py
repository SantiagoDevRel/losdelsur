"""
scripts/generate-lrc.py
Genera letra.lrc (letras sincronizadas) junto al audio.mp3 de cada
canción. Usa faster-whisper para timestamps y, si hay letra.md con
contenido real, alinea las palabras de Whisper al texto canónico
(forced-alignment "de los pobres" — no usa WhisperX, solo matching
por similitud de texto).

Dos modos automáticos:
  1. MODO "aligned" — si letra.md tiene letra real, el .lrc resultante
     usa las palabras del letra.md (corregidas por Santiago) con los
     timestamps de Whisper. Si Whisper oye "de visión" pero la letra
     dice "te vistió", sale "te vistió" al tiempo que Whisper lo oyó.
  2. MODO "raw" — si letra.md es solo el placeholder, el .lrc tiene
     directamente lo que Whisper transcribió (util para CDs nuevos).

Uso:
  python scripts/generate-lrc.py                              # todos los audios sin letra.lrc
  python scripts/generate-lrc.py content/cd1                  # todos los de CD1
  python scripts/generate-lrc.py content/cd4/02-aristi-*      # uno específico
  python scripts/generate-lrc.py --force                      # regenerar aunque exista
"""

from __future__ import annotations
import argparse
import os
import re
import sys
from difflib import SequenceMatcher
from glob import glob
from pathlib import Path

try:
    from faster_whisper import WhisperModel
except ImportError:
    print("Falta faster-whisper. Instalalo con: pip install faster-whisper")
    sys.exit(1)


MODEL_SIZE = os.environ.get("WHISPER_MODEL", "small")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE", "int8")

# Si la letra.md tiene menos caracteres que esto, la consideramos
# placeholder y caemos a modo raw (solo Whisper).
LETRA_MIN_CHARS = 50

# Similitud mínima (0-1) para aceptar un match ref-line / whisper-segment.
# Por debajo, interpolamos tiempo desde vecinos.
MIN_MATCH_SIM = 0.25


def fmt_ts(seconds: float) -> str:
    mm = int(seconds // 60)
    ss = seconds - mm * 60
    return f"[{mm:02d}:{ss:05.2f}]"


def normalize(s: str) -> str:
    """Para comparar texto ignorando acentos, puntuación, mayúsculas."""
    import unicodedata

    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def read_letra_lines(path: Path) -> list[str]:
    """Lee letra.md, devuelve líneas no vacías (strip de comentarios mkd)."""
    if not path.exists():
        return []
    raw = path.read_text(encoding="utf-8")
    # Quitar H1 inicial si está
    raw = re.sub(r"^\s*#\s+.+\n+", "", raw)
    # Quitar comentarios cursivos del tipo "_placeholder_"
    raw = re.sub(r"^_[^_]+_\s*$", "", raw, flags=re.MULTILINE)
    lines = [ln.strip() for ln in raw.splitlines()]
    # Quitar vacías (pero mantener el orden)
    return [ln for ln in lines if ln and not ln.startswith("#")]


def transcribe(audio: Path, model: WhisperModel):
    """Devuelve:
      segments: list[{start, text, norm}] (para modo raw)
      words: list[{word, start}] (para modo aligned, palabra-a-palabra)
    """
    segments, _info = model.transcribe(
        str(audio),
        language="es",
        condition_on_previous_text=False,
        vad_filter=False,
        beam_size=5,
        word_timestamps=True,
    )
    segs = []
    words = []
    for s in segments:
        t = s.text.strip()
        if t:
            segs.append({"start": float(s.start), "text": t, "norm": normalize(t)})
        if s.words:
            for w in s.words:
                wt = (w.word or "").strip()
                if not wt:
                    continue
                words.append({"word": wt, "start": float(w.start)})
    return segs, words


def tokenize(s: str) -> list[str]:
    """Palabras normalizadas, sin puntuación ni acentos, minúsculas."""
    import unicodedata

    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9\s]", " ", s).lower()
    return [w for w in s.split() if w]


def align_words(ref_lines: list[str], whisper_words: list[dict]) -> list[tuple[float, str]]:
    """Alineamiento por sliding-window: para cada ref_line, buscamos
    el mejor match de sus primeras palabras en una ventana hacia
    adelante de whisper_words a partir del cursor actual. Después
    avanzamos el cursor más allá del match.

    Ventajas sobre SequenceMatcher:
      - Coros repetidos: cada ocurrencia en ref_lines encuentra su
        propia instancia en whisper_words (el cursor avanza y ya no
        ve los matches previos).
      - Tolerante a errores de transcripción: usa prefijos de 3+ chars
        cuando la palabra exacta no matchea.
    """
    # Pre-normalizamos las palabras de Whisper a tokens ASCII.
    wh_norm: list[str] = []
    for w in whisper_words:
        toks = tokenize(w["word"])
        wh_norm.append(toks[0] if toks else "")

    cursor = 0
    n_wh = len(whisper_words)
    WINDOW = 120  # palabras de whisper a considerar por ref-line
    MIN_SCORE = 1.3  # threshold para aceptar un match

    result: list[tuple[float, str]] = []

    for line in ref_lines:
        ref_toks = tokenize(line)
        if not ref_toks:
            # Línea vacía o sin palabras: usar timing del anterior + 0.3s
            t = (result[-1][0] + 0.3) if result else 0.0
            result.append((t, line))
            continue

        # Firma: primeras 5 palabras (o menos si la línea es corta)
        sig = ref_toks[: min(5, len(ref_toks))]

        best_score = -1.0
        best_pos = -1
        search_end = min(n_wh, cursor + WINDOW)

        for pos in range(cursor, search_end):
            score = 0.0
            for k in range(len(sig)):
                j = pos + k
                if j >= n_wh:
                    break
                w = wh_norm[j]
                if not w:
                    continue
                if w == sig[k]:
                    score += 1.0
                elif len(w) >= 3 and len(sig[k]) >= 3 and w[:3] == sig[k][:3]:
                    score += 0.4
            # Preferimos matches más cercanos al cursor (penalizamos distancia).
            score -= (pos - cursor) * 0.002
            if score > best_score:
                best_score = score
                best_pos = pos
            if score >= len(sig):
                break

        if best_pos >= 0 and best_score >= MIN_SCORE:
            t = whisper_words[best_pos]["start"]
            # Avanzar cursor más allá del match para que la siguiente
            # ref_line busque a partir de ahí.
            cursor = best_pos + max(len(ref_toks), len(sig))
        else:
            # Sin match: interpolamos desde el anterior
            t = (result[-1][0] + 2.5) if result else 0.0

        result.append((t, line))

    # Forzar monotonía estricta.
    for i in range(1, len(result)):
        if result[i][0] < result[i - 1][0]:
            result[i] = (result[i - 1][0] + 0.15, result[i][1])

    return result


def build_lrc_aligned(ref_lines: list[str], whisper_words: list[dict]) -> str:
    aligned = align_words(ref_lines, whisper_words)
    return "\n".join(f"{fmt_ts(t)}{line}" for t, line in aligned) + "\n"


def build_lrc_raw(segs: list[dict]) -> str:
    return "\n".join(f"{fmt_ts(s['start'])}{s['text']}" for s in segs) + "\n"


def process_song(folder: Path, model: WhisperModel, force: bool) -> str:
    """Procesa una canción. Devuelve string de resumen."""
    audio = folder / "audio.mp3"
    lrc_path = folder / "letra.lrc"
    if not audio.exists():
        return f"skip (no audio.mp3)  {folder.name}"
    if lrc_path.exists() and not force:
        return f"skip (existe)        {folder.name}"

    letra_md = folder / "letra.md"
    ref_lines = read_letra_lines(letra_md)
    ref_chars = sum(len(ln) for ln in ref_lines)
    mode = "aligned" if ref_chars >= LETRA_MIN_CHARS else "raw"

    segs, words = transcribe(audio, model)
    if not segs:
        return f"skip (whisper vacio) {folder.name}"

    if mode == "aligned" and words:
        lrc = build_lrc_aligned(ref_lines, words)
    else:
        lrc = build_lrc_raw(segs)
        mode = "raw"

    lrc_path.write_text(lrc, encoding="utf-8")
    nlines = lrc.count("\n")
    return f"{mode:8} {nlines:3} lineas    {folder.name}"


def find_targets(args: argparse.Namespace) -> list[Path]:
    targets: set[Path] = set()
    if args.paths:
        for p in args.paths:
            for m in glob(p):
                mp = Path(m)
                if mp.is_dir():
                    # ¿Es un folder de canción o un CD entero?
                    if (mp / "audio.mp3").exists():
                        targets.add(mp)
                    else:
                        for sub in mp.iterdir():
                            if sub.is_dir() and (sub / "audio.mp3").exists():
                                targets.add(sub)
    else:
        for ap in glob("content/cd*/*/audio.mp3"):
            targets.add(Path(ap).parent)
    return sorted(targets)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="*", help="Folder de canción / CD / glob")
    parser.add_argument("--force", action="store_true", help="Regenerar aunque letra.lrc exista")
    args = parser.parse_args()

    targets = find_targets(args)
    if not targets:
        print("No hay targets.")
        return

    pending = [t for t in targets if args.force or not (t / "letra.lrc").exists() or not t.joinpath("audio.mp3").exists() is False]
    if not pending:
        print("Todos los targets ya tienen letra.lrc. Usa --force para regenerar.")
        return

    print(f"Cargando modelo whisper '{MODEL_SIZE}' ({COMPUTE_TYPE})...")
    model = WhisperModel(MODEL_SIZE, device="cpu", compute_type=COMPUTE_TYPE)

    for folder in targets:
        print(process_song(folder, model, args.force))


if __name__ == "__main__":
    main()
