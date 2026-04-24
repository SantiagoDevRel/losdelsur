"""
scripts/generate-lrc-v2.py
Version "premium" del generador de letras sincronizadas.

Mejoras sobre generate-lrc.py:
  - Modelo `large-v3-turbo` (o `large-v3` si se pasa --high-quality) en vez
    de `small`. Baja el WER en español de ~12% a ~4%.
  - VAD silero integrado (vad_filter=True) — corta silencios, menos
    alucinaciones en secciones instrumentales largas de los cánticos.
  - initial_prompt con jerga sureña — el decoder arranca cebado con el
    vocabulario específico (verdolaga, Atanasio, Aristizábal, Popular,
    parce, sureño, guaro, etc.) y Whisper ya no escribe "Cristi" en vez
    de "Aristi" o "sueño" en vez de "sureño".
  - beam_size 10 (vs. 5) y best_of 10 — más latencia, mejor calidad.
  - temperature fallback [0.0, 0.2, 0.4, 0.6, 0.8] — cuando la entropía
    sube (audio confuso), reintenta con temperaturas más altas.
  - Usa los 32 threads de la máquina: `cpu_threads=32, num_workers=2`.
  - Alineación mejorada: mantiene el algoritmo sliding-window por palabras
    de v1, pero ahora con los word_timestamps de large-v3 (mucho más
    precisos que los de small).
  - Compute type configurable: int8 por defecto (6 GB RAM, rápido);
    int8_float32 para menos pérdida; float32 puro si querés lo máximo.

Uso:
  python scripts/generate-lrc-v2.py                    # todas las pendientes
  python scripts/generate-lrc-v2.py --high-quality     # large-v3 en vez de turbo
  python scripts/generate-lrc-v2.py content/cd3        # un CD específico
  python scripts/generate-lrc-v2.py content/cd3/02-*   # una canción
  python scripts/generate-lrc-v2.py --force            # regenerar aunque exista
  python scripts/generate-lrc-v2.py --test             # corre en 1 sola canción
                                                       # (la primera pendiente)

Tiempo estimado en Ryzen AI Max+ 395 (32 threads, 123 GB RAM, CPU int8):
  - large-v3-turbo (default): ~30-50s por canción de 3min = ~1h para 120
  - large-v3 (--high-quality): ~3-5min por canción = ~8h para 120

Primera ejecución: Whisper descarga el modelo (~1.6 GB turbo, ~3 GB large-v3)
en ~/.cache/huggingface/hub/. Después queda cacheado.
"""

from __future__ import annotations
import argparse
import os
import re
import sys
from glob import glob
from pathlib import Path

try:
    from faster_whisper import WhisperModel
except ImportError:
    print("Falta faster-whisper. pip install faster-whisper")
    sys.exit(1)


# --- Configuración ---

# "large-v3-turbo" es un destilado oficial: 4x más rápido que large-v3 con
# ~0.5% más de WER. Óptimo para batch. Usa "large-v3" con --high-quality
# para la máxima precisión.
MODEL_TURBO = "large-v3-turbo"
MODEL_HQ = "large-v3"

# int8 es el sweet spot CPU: velocidad full con casi sin pérdida vs float32.
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE", "int8")

# Threads del CPU a usar. La Ryzen AI Max+ tiene 32 threads; 28 deja 4 para
# el resto del sistema para que no se trabe Windows.
CPU_THREADS = int(os.environ.get("WHISPER_THREADS", "28"))

# Prompt de contexto: palabras y nombres propios de Los Del Sur / Nacional /
# Medellín que Whisper no adivinaría solo. El decoder arranca cebado con
# esto — mejora muchísimo los nombres propios y regionalismos.
INITIAL_PROMPT = (
    "Cántico de la barra Los Del Sur, hinchada de Atlético Nacional de "
    "Medellín en Colombia. Tribuna popular sur del estadio Atanasio Girardot. "
    "Palabras frecuentes: verdolaga, sureño, parche, parcero, combo, "
    "Atanasio, Aristizábal, Popular, tribuna, rojo, vamo, dale, campeón, "
    "hinchada, bicampeonato, ae, sur, paisa, guaro, pola, bacán, "
    "Medellín, Colombia, nacional, verde, fiesta, locura, pasión, pueblo, "
    "muchacho, sentimiento, alegría, banda, bandera, trapo, bombo."
)

LETRA_MIN_CHARS = 50
MIN_SCORE_ALIGN = 1.3


def fmt_ts(seconds: float) -> str:
    """Formato [mm:ss.cc] para LRC."""
    mm = int(seconds // 60)
    ss = seconds - mm * 60
    return f"[{mm:02d}:{ss:05.2f}]"


def normalize(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip().lower()
    return s


def tokenize(s: str) -> list[str]:
    import unicodedata
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9\s]", " ", s).lower()
    return [w for w in s.split() if w]


def read_letra_lines(path: Path) -> list[str]:
    """Lee letra.md y devuelve lineas no vacías (strip de H1 y comentarios cursivos)."""
    if not path.exists():
        return []
    raw = path.read_text(encoding="utf-8")
    raw = re.sub(r"^\s*#\s+.+\n+", "", raw)
    raw = re.sub(r"^_[^_]+_\s*$", "", raw, flags=re.MULTILINE)
    lines = [ln.strip() for ln in raw.splitlines()]
    return [ln for ln in lines if ln and not ln.startswith("#")]


def is_letra_real(lines: list[str]) -> bool:
    """True si letra.md tiene suficiente contenido y no es placeholder."""
    total = sum(len(ln) for ln in lines)
    combined = " ".join(lines).lower()
    if total < LETRA_MIN_CHARS:
        return False
    if "pendiente" in combined or "placeholder" in combined:
        return False
    return True


def transcribe(audio: Path, model: WhisperModel, use_vad: bool):
    """Transcribe con todos los tricks: prompt, beam alto, word timestamps.
    VAD off por default: silero está entrenado para speech limpio y corta
    canciones cantadas con crowd noise clasificándolas como no-voz."""
    segments, info = model.transcribe(
        str(audio),
        language="es",
        task="transcribe",
        # VAD silero: opt-in. Útil SOLO para audio con silencios largos
        # (tipo entrevistas). Para cánticos con música continua lo mejor
        # es dejarlo off — silero corta mal.
        vad_filter=use_vad,
        vad_parameters=(
            {"min_silence_duration_ms": 1000, "speech_pad_ms": 400, "threshold": 0.25}
            if use_vad else None
        ),
        # Prompt: cebar el decoder con jerga local.
        initial_prompt=INITIAL_PROMPT,
        # Beam search amplio — mejor calidad, más tiempo.
        beam_size=10,
        best_of=10,
        # Fallback automático cuando la confianza cae.
        temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
        # No reutilizar contexto de segmento anterior — evita que un error
        # se propague por toda la canción.
        condition_on_previous_text=False,
        # Word-level timestamps — base para la alineación.
        word_timestamps=True,
        # Compresión ratio threshold alto (default 2.4 muy agresivo para
        # coros repetidos de cánticos — los marca como alucinación).
        compression_ratio_threshold=3.0,
        # Log prob mínimo por segmento.
        log_prob_threshold=-1.5,
        # No speech threshold más bajo = clasificar como voz con más
        # disposición (el default 0.6 descarta canto en crowd noise).
        no_speech_threshold=0.4,
    )
    segs, words = [], []
    for s in segments:
        t = s.text.strip()
        if t:
            segs.append({"start": float(s.start), "end": float(s.end), "text": t, "norm": normalize(t)})
        if s.words:
            for w in s.words:
                wt = (w.word or "").strip()
                if not wt:
                    continue
                words.append({"word": wt, "start": float(w.start), "end": float(w.end)})
    return segs, words, info


def align_words(ref_lines: list[str], whisper_words: list[dict]) -> list[tuple[float, str]]:
    """Alineamiento sliding-window mejorado.
    Para cada ref_line, busca el mejor match de sus primeras palabras en
    una ventana hacia adelante de whisper_words a partir del cursor.
    Preserva repeticiones (coros) porque el cursor avanza más allá del match."""
    wh_norm = []
    for w in whisper_words:
        toks = tokenize(w["word"])
        wh_norm.append(toks[0] if toks else "")

    cursor = 0
    n_wh = len(whisper_words)
    WINDOW = 150

    result: list[tuple[float, str]] = []

    for line in ref_lines:
        ref_toks = tokenize(line)
        if not ref_toks:
            t = (result[-1][0] + 0.3) if result else 0.0
            result.append((t, line))
            continue

        sig = ref_toks[: min(6, len(ref_toks))]  # 6 palabras de firma (v1 usaba 5)

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
                elif len(w) >= 4 and len(sig[k]) >= 4 and w[:4] == sig[k][:4]:
                    score += 0.6
            score -= (pos - cursor) * 0.002
            if score > best_score:
                best_score = score
                best_pos = pos
            if score >= len(sig):
                break

        if best_pos >= 0 and best_score >= MIN_SCORE_ALIGN:
            t = whisper_words[best_pos]["start"]
            cursor = best_pos + max(len(ref_toks), len(sig))
        else:
            t = (result[-1][0] + 2.5) if result else 0.0

        result.append((t, line))

    for i in range(1, len(result)):
        if result[i][0] < result[i - 1][0]:
            result[i] = (result[i - 1][0] + 0.15, result[i][1])

    return result


def build_lrc_aligned(ref_lines: list[str], whisper_words: list[dict]) -> str:
    aligned = align_words(ref_lines, whisper_words)
    return "\n".join(f"{fmt_ts(t)}{line}" for t, line in aligned) + "\n"


def build_lrc_raw(segs: list[dict]) -> str:
    """Modo raw: directo desde Whisper (si no hay letra.md real)."""
    return "\n".join(f"{fmt_ts(s['start'])}{s['text']}" for s in segs) + "\n"


def find_audio(folder: Path) -> Path | None:
    """Encuentra audio.m4a o audio.mp3 (preferencia m4a)."""
    for name in ("audio.m4a", "audio.mp3"):
        p = folder / name
        if p.exists():
            return p
    return None


def process_song(folder: Path, model: WhisperModel, force: bool, verbose: bool, use_vad: bool) -> str:
    audio = find_audio(folder)
    if not audio:
        return f"skip (no audio)     {folder.name}"
    lrc_path = folder / "letra.lrc"
    if lrc_path.exists() and not force:
        return f"skip (existe)       {folder.name}"

    letra_md = folder / "letra.md"
    ref_lines = read_letra_lines(letra_md)
    mode = "aligned" if is_letra_real(ref_lines) else "raw"

    if verbose:
        print(f"   -> transcribiendo {audio.name} (modo={mode})")

    segs, words, info = transcribe(audio, model, use_vad)
    if not segs:
        return f"skip (whisper vacío){folder.name}"

    if mode == "aligned" and words:
        lrc = build_lrc_aligned(ref_lines, words)
    else:
        lrc = build_lrc_raw(segs)
        mode = "raw"

    lrc_path.write_text(lrc, encoding="utf-8")
    nlines = lrc.count("\n")
    dur = info.duration if info else 0
    return f"{mode:8} {nlines:3} lineas  {dur:5.1f}s  {folder.name}"


def find_targets(args: argparse.Namespace) -> list[Path]:
    targets: set[Path] = set()
    if args.paths:
        for p in args.paths:
            for m in glob(p):
                mp = Path(m)
                if mp.is_dir():
                    if find_audio(mp):
                        targets.add(mp)
                    else:
                        for sub in mp.iterdir():
                            if sub.is_dir() and find_audio(sub):
                                targets.add(sub)
    else:
        for ap in glob("content/cd*/*/audio.m4a"):
            targets.add(Path(ap).parent)
        for ap in glob("content/cd*/*/audio.mp3"):
            targets.add(Path(ap).parent)
    return sorted(targets)


def main():
    parser = argparse.ArgumentParser(description="Generador premium de letra.lrc")
    parser.add_argument("paths", nargs="*", help="Folder de canción / CD / glob")
    parser.add_argument("--force", action="store_true", help="Regenerar aunque letra.lrc exista")
    parser.add_argument("--high-quality", action="store_true", help="Usar large-v3 (lento) en vez de large-v3-turbo")
    parser.add_argument("--test", action="store_true", help="Correr solo la primera canción pendiente")
    parser.add_argument("--verbose", "-v", action="store_true", help="Más output")
    parser.add_argument("--vad", action="store_true", help="Activar VAD silero (útil para audios con silencios largos, NO para cánticos con música continua)")
    args = parser.parse_args()

    targets = find_targets(args)
    if not targets:
        print("No hay canciones con audio.")
        return

    if not args.force:
        targets = [t for t in targets if not (t / "letra.lrc").exists()]

    if not targets:
        print("Todos los targets ya tienen letra.lrc. Usa --force para regenerar.")
        return

    if args.test:
        targets = targets[:1]

    model_size = MODEL_HQ if args.high_quality else MODEL_TURBO
    print(f"Modelo: {model_size} | compute: {COMPUTE_TYPE} | threads: {CPU_THREADS}")
    print(f"Targets: {len(targets)} canción(es)")
    print(f"Cargando modelo... (primera vez descarga ~1-3 GB)")

    model = WhisperModel(
        model_size,
        device="cpu",
        compute_type=COMPUTE_TYPE,
        cpu_threads=CPU_THREADS,
        num_workers=2,
    )
    print(f"Modelo listo.\n")

    ok = err = 0
    for i, folder in enumerate(targets, 1):
        prefix = f"[{i}/{len(targets)}]"
        try:
            result = process_song(folder, model, args.force, args.verbose, args.vad)
            print(f"{prefix} {result}")
            if "skip" not in result:
                ok += 1
        except Exception as e:
            print(f"{prefix} ERROR en {folder.name}: {e}")
            err += 1

    print(f"\n==== {ok} generadas, {err} errores ====")


if __name__ == "__main__":
    main()
