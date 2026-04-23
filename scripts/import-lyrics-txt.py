"""
scripts/import-lyrics-txt.py
Parsea un archivo de texto con TODAS las letras de Los Del Sur (tal
cual como lo tiene Santiago en Downloads) y las escribe en los
content/cdN/<song-folder>/letra.md correspondientes.

Estructura del archivo fuente:
  "                     LOS DEL SUR
                            CD1
              TITULO EN MAYUSCULAS
       (espacios)
       Letra en mixed-case, con (bis), Coro:, etc.
       (blanco)

       SIGUIENTE TITULO
       ..."

El script:
  1. Detecta CD por "CDN" solo en una línea.
  2. Detecta títulos: líneas ALL-CAPS con ≥3 chars letra (excluye "CD1",
     "LOS DEL SUR", "1. ...", etc).
  3. Acumula líneas siguientes como la letra hasta el próximo título.
  4. Matchea fuzzy cada título al folder más similar del CD activo.
  5. Escribe letra.md, skipeando folders que ya tienen letra real.

Reporte final: qué canciones se actualizaron.
"""

from __future__ import annotations
import json
import os
import re
import sys
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

SRC = Path(r"C:\Users\STZTR\Downloads\downloads 22\letras los del lsur.txt")

if not SRC.exists():
    print(f"ERROR: no se encontró el archivo {SRC}")
    sys.exit(1)

MIN_MATCH_SIMILARITY = 0.62

# Overrides manuales: (cd_num, title-in-txt) → folder-slug-sin-prefijo.
# El script los aplica sin fuzzy matching.
MANUAL_OVERRIDES: dict[tuple[int, str], str] = {
    (1, "NO LE FALLES A TU HINCHADA"): "13-heavy-metal-dale-dale-verde-no-le-falles-a-tu-gente",
    (1, "CUANDO CANTA LA SUR"): "18-cuando-canta-la-sur-una-vez-mas-te-venimos-a-alentar",
    (1, "EL EMPUJE DE UN PUEBLO"): "15-empuje-de-un-pueblo-la-hinchada-del-verdolaga",
}

# Blacklist: (cd_num, title-in-txt) → True si hay que rechazar match
# aunque fuzzy diga que coincide. Para casos donde el txt tiene una
# canción que SE PARECE pero NO es la misma que el folder.
BLACKLIST: set[tuple[int, str]] = {
    (2, "SENTIMIENTO DE TODO MI PUEBLO"),  # NO es "Minuto de silencio Millos"
    (3, "YO TE QUIERO"),  # NO es "Yo soy aquel"
}

# Patterns de títulos falsos (no son canciones reales, solo headers).
JUNK_TITLE_PATTERNS = [
    re.compile(r"^CORO[:\s]*$", re.I),
    re.compile(r"^BIS\s*$", re.I),
    re.compile(r"^INDICE\s*$", re.I),
]


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9\s]", " ", s).lower()
    return re.sub(r"\s+", " ", s).strip()


def is_title_line(line: str) -> bool:
    """Heurística: línea ≥3 letras, todas mayúsculas, no es header ni junk."""
    s = line.strip()
    if len(s) < 3:
        return False
    if re.match(r"^(LOS DEL SUR|CD\s*\d+|INDICE|INDEX)\b", s, re.I):
        return False
    for pat in JUNK_TITLE_PATTERNS:
        if pat.match(s):
            return False
    letters = [c for c in s if c.isalpha()]
    if len(letters) < 3:
        return False
    if not all(c.isupper() for c in letters):
        return False
    return True


def parse_cd_file(path: Path) -> list[tuple[int, str, str]]:
    """Devuelve lista de (cd_num, title, lyrics_text)."""
    raw = path.read_text(encoding="utf-8", errors="replace")
    lines = raw.splitlines()
    current_cd: int | None = None
    current_title: str | None = None
    current_lyric: list[str] = []
    result: list[tuple[int, str, str]] = []

    def flush():
        nonlocal current_title, current_lyric
        if current_cd and current_title:
            text = "\n".join(current_lyric).strip()
            if text and len(text) > 20:
                result.append((current_cd, current_title, text))
        current_title = None
        current_lyric = []

    for ln in lines:
        s = ln.strip()
        m_cd = re.match(r"^CD\s*(\d)\b", s, re.I)
        if m_cd:
            flush()
            current_cd = int(m_cd.group(1))
            continue
        if current_cd is None:
            continue
        if is_title_line(ln):
            flush()
            current_title = s
            continue
        if current_title is None:
            continue
        current_lyric.append(ln)

    flush()
    return result


def normalize_lyric(raw: str) -> str:
    """Limpia la letra: quita leading whitespace por línea, normaliza
    múltiples espacios entre palabras, colapsa blank lines múltiples."""
    lines = []
    for ln in raw.splitlines():
        t = ln.strip()
        # Colapsar múltiples espacios internos
        t = re.sub(r"[ \t]{2,}", " ", t)
        lines.append(t)
    text = "\n".join(lines)
    # Colapsar 3+ blank lines a 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


def best_folder_match(cd_num: int, title: str) -> tuple[str, float] | None:
    """Busca el folder de canción más similar por título."""
    cd_dir = Path(f"content/cd{cd_num}")
    if not cd_dir.exists():
        return None
    target = norm(title)
    best = (0.0, "")
    for folder in os.listdir(cd_dir):
        fp = cd_dir / folder
        if not fp.is_dir() or not re.match(r"^\d+-", folder):
            continue
        sj = fp / "song.json"
        if not sj.exists():
            continue
        meta = json.loads(sj.read_text(encoding="utf-8"))
        cand = norm(meta["titulo"])
        s = SequenceMatcher(None, target, cand).ratio()
        if s > best[0]:
            best = (s, folder)
    if best[0] >= MIN_MATCH_SIMILARITY:
        return (best[1], best[0])
    return None


def current_is_placeholder(letra_md: Path) -> bool:
    if not letra_md.exists():
        return True
    raw = letra_md.read_text(encoding="utf-8").strip()
    raw = re.sub(r"^\s*#\s+.+\n+", "", raw)
    return len(raw) < 60 or bool(re.search(r"pendiente de transcripci", raw, re.I))


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="Sobreescribir letras existentes")
    ap.add_argument("--dry", action="store_true", help="Solo mostrar, no escribir")
    args = ap.parse_args()

    songs = parse_cd_file(SRC)
    print(f"Parseadas {len(songs)} canciones del archivo.\n")

    applied: list[tuple[int, str, str]] = []
    skipped_already: list[tuple[int, str, str]] = []
    no_match: list[tuple[int, str]] = []
    low_conf: list[tuple[int, str, str, float]] = []

    for cd_num, title, lyric in songs:
        # Blacklist: rechazo directo.
        if (cd_num, title) in BLACKLIST:
            continue
        # Override manual: folder específico.
        override_folder = MANUAL_OVERRIDES.get((cd_num, title))
        if override_folder:
            folder, score = override_folder, 1.0
        else:
            m = best_folder_match(cd_num, title)
            if not m:
                no_match.append((cd_num, title))
                continue
            folder, score = m
        letra_md = Path(f"content/cd{cd_num}/{folder}/letra.md")
        if not args.force and not current_is_placeholder(letra_md):
            skipped_already.append((cd_num, title, folder))
            continue
        if score < 0.75:
            low_conf.append((cd_num, title, folder, score))
        if not args.dry:
            letra_md.write_text(normalize_lyric(lyric), encoding="utf-8")
        applied.append((cd_num, title, folder))

    print(f"\n==== {len(applied)} letras {'a escribir' if args.dry else 'escritas'} ====")
    for cd_num, title, folder in applied:
        print(f"  CD{cd_num}/{folder}   <-   \"{title}\"")

    if low_conf:
        print(f"\n==== {len(low_conf)} matches con score bajo (revisar a mano) ====")
        for cd_num, title, folder, score in low_conf:
            print(f"  CD{cd_num}/{folder}   <-   \"{title}\"   ({score:.2f})")

    if skipped_already:
        print(f"\n==== {len(skipped_already)} ya tenían letra (skip) ====")

    if no_match:
        print(f"\n==== {len(no_match)} del archivo sin match en folders ====")
        for cd_num, title in no_match:
            print(f"  CD{cd_num}: \"{title}\"")


if __name__ == "__main__":
    main()
