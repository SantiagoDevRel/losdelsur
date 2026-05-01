"""scripts/extract-letra-drafts.py

Para canciones cuya letra.md es placeholder ("Letra pendiente de
transcripción"), extrae las líneas del letra.lrc raw (Whisper) y las
guarda como `letra.draft.md` con un header de review.

NO sobreescribe letra.md — el draft queda al lado para que vos lo
revises, edites, y cuando esté bueno renombrés letra.draft.md → letra.md
y corras `python scripts/generate-lrc-v2.py --force <folder>` para
regenerar el .lrc en modo aligned (timing real contra las palabras
correctas).

Limpia alucinaciones típicas de Whisper:
  - "Gracias por ver el video", "Subscribe", "Like and subscribe", etc.
  - Líneas que son solo "Música" o "[Música]"
  - Líneas duplicadas consecutivas (estribillos repetidos los colapsa
    a una sola — vos volves a poner las repeticiones que correspondan).

Uso:
  python scripts/extract-letra-drafts.py             # todas las pendientes
  python scripts/extract-letra-drafts.py cd5/        # solo cd5
  python scripts/extract-letra-drafts.py --overwrite # rehacer drafts existentes
"""

from __future__ import annotations
import argparse
import re
import sys
from pathlib import Path

# Frases típicas de YouTube/Whisper-hallucination que filtramos.
HALLUCINATIONS = [
    r"^gracias por ver el video$",
    r"^suscr[ií]bete",
    r"^subscribe",
    r"^like and subscribe",
    r"^dale like",
    r"^sigue\w* el canal",
    r"^canal de youtube",
    r"^m[uú]sica$",
    r"^\[m[uú]sica\]$",
    r"^aplausos$",
    r"^\[aplausos\]$",
    r"^sub[ií]ndoles[a]?$",
    r"^subt[ií]tulos por la comunidad",
    r"^subt[ií]tulos$",
    r"^¡suscr[ií]bete!?$",
]
HALLUCINATION_RE = re.compile("|".join(HALLUCINATIONS), re.IGNORECASE)

# Pattern de línea LRC: [mm:ss.cc]texto
LRC_LINE_RE = re.compile(r"^\[(\d{2}):(\d{2})\.(\d{2})\](.*)$")

PLACEHOLDER_RE = re.compile(r"pendiente de transcripci|placeholder", re.IGNORECASE)


def is_placeholder(letra_path: Path) -> bool:
    if not letra_path.exists():
        return True
    content = letra_path.read_text(encoding="utf-8")
    text = re.sub(r"[#_*\s]+", "", content).strip()
    if len(text) < 50:
        return True
    return bool(PLACEHOLDER_RE.search(content))


def parse_lrc(lrc_path: Path) -> list[tuple[float, str]]:
    """Devuelve [(seconds, text), ...] de las líneas válidas del LRC."""
    if not lrc_path.exists():
        return []
    out = []
    for line in lrc_path.read_text(encoding="utf-8").splitlines():
        m = LRC_LINE_RE.match(line.strip())
        if not m:
            continue
        mm, ss, cc, text = m.groups()
        seconds = int(mm) * 60 + int(ss) + int(cc) / 100
        text = text.strip()
        if text:
            out.append((seconds, text))
    return out


def clean_lines(lines: list[tuple[float, str]]) -> list[str]:
    """Filtra alucinaciones y deduplica líneas consecutivas idénticas."""
    cleaned: list[str] = []
    last_norm = ""
    for _, text in lines:
        if HALLUCINATION_RE.search(text):
            continue
        norm = re.sub(r"\s+", " ", text.lower().strip())
        # Saltar duplicadas consecutivas (Whisper a veces repite el
        # mismo verso 4 veces seguidas en un coro)
        if norm == last_norm:
            continue
        last_norm = norm
        cleaned.append(text)
    return cleaned


def write_draft(folder: Path, lines: list[str], titulo: str) -> Path:
    draft_path = folder / "letra.draft.md"
    body = "\n".join(lines).strip()
    content = f"""# {titulo}

> ⚠️ **DRAFT — REVIEW REQUIRED**
> Letra generada automáticamente por Whisper a partir del audio.
> Puede tener errores de transcripción, palabras inventadas o
> orden incorrecto. **Revisar y editar antes de promover a letra.md.**
>
> Cuando esté bueno:
>   1. mv letra.draft.md letra.md
>   2. python scripts/generate-lrc-v2.py --force <este-folder>
>   3. Verificar el .lrc nuevo (modo aligned con timing real).

{body}
"""
    draft_path.write_text(content, encoding="utf-8")
    return draft_path


def get_titulo(folder: Path) -> str:
    """Toma el título del song.json (que sí está bien)."""
    song_json = folder / "song.json"
    if not song_json.exists():
        return folder.name
    import json
    try:
        data = json.loads(song_json.read_text(encoding="utf-8"))
        return data.get("titulo", folder.name)
    except Exception:
        return folder.name


def process_folder(
    folder: Path,
    overwrite: bool,
    verbose: bool = False,
) -> str:
    letra_md = folder / "letra.md"
    letra_lrc = folder / "letra.lrc"
    draft_md = folder / "letra.draft.md"

    if not is_placeholder(letra_md):
        return f"skip (letra real)   {folder.name}"
    if not letra_lrc.exists():
        return f"skip (no .lrc)      {folder.name}"
    if draft_md.exists() and not overwrite:
        return f"skip (draft existe) {folder.name}"

    raw_lines = parse_lrc(letra_lrc)
    if not raw_lines:
        return f"skip (.lrc vacío)   {folder.name}"

    cleaned = clean_lines(raw_lines)
    if len(cleaned) < 2:
        return f"skip (muy pocas líneas tras filtro) {folder.name}"

    titulo = get_titulo(folder)
    write_draft(folder, cleaned, titulo)
    return f"DRAFT  {len(cleaned):3} líneas  {folder.name}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*", help="Folders/globs (ej: cd5/). Vacío = todas las placeholder")
    ap.add_argument("--overwrite", action="store_true", help="Rehacer letra.draft.md aunque exista")
    ap.add_argument("--verbose", "-v", action="store_true")
    args = ap.parse_args()

    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass

    targets: list[Path] = []
    if args.paths:
        for p in args.paths:
            base = Path("content") / p.rstrip("/").replace("content/", "")
            if base.is_dir():
                if (base / "letra.md").exists() or (base / "letra.lrc").exists():
                    targets.append(base)
                else:
                    for sub in base.iterdir():
                        if sub.is_dir() and (sub / "letra.lrc").exists():
                            targets.append(sub)
    else:
        for cd_dir in sorted(Path("content").glob("cd*")):
            if not cd_dir.is_dir():
                continue
            for song in sorted(cd_dir.iterdir()):
                if song.is_dir() and (song / "letra.lrc").exists():
                    targets.append(song)

    if not targets:
        print("No hay targets.")
        return

    print(f"Inspeccionando {len(targets)} canción(es)...")
    drafts = errors = skipped = 0
    for i, folder in enumerate(targets, 1):
        try:
            result = process_folder(folder, args.overwrite, args.verbose)
            print(f"[{i}/{len(targets)}] {result}")
            if result.startswith("DRAFT"):
                drafts += 1
            else:
                skipped += 1
        except Exception as e:
            print(f"[{i}/{len(targets)}] ERROR {folder.name}: {e}")
            errors += 1

    print(f"\n==== {drafts} drafts generados, {skipped} skipped, {errors} errores ====")
    if drafts:
        print("\nProximos pasos:")
        print("  1. Revisá los letra.draft.md generados (algunos van a estar inservibles)")
        print("  2. Para los que se entiendan, editá → mv letra.draft.md letra.md")
        print("  3. python scripts/generate-lrc-v2.py --force <folder>")


if __name__ == "__main__":
    main()
