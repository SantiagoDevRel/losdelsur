"""
scripts/move-downloads.py
Mueve los mp3 desde Downloads a content/cdN/<NN-slug>/audio.mp3 según
el patrón "N CD <Album>Titulo.mp3".

Empareja por similitud del título con los folders existentes. Solo
mueve si el folder todavía no tiene audio.mp3 — no re-procesa.
"""

from __future__ import annotations
import os
import re
import shutil
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

DL = Path(r"C:\Users\STZTR\Downloads")
CONTENT = Path("content")

# Per-CD prefix patterns en Downloads. Varios formatos observados:
#   "! CD Cuando canta la surTITLE.mp3"
#   "2 CD El orgullo de ser verdolagaTITLE.mp3"
#   "5C El pueblo es verdolaga_TITLE.mp3"
#   "LOS DEL SUR 4 CD - TITLE.mp3"
#   "LOS DEL SUR CD 6 - TITLE.mp3"
CD_PATTERNS = {
    1: [
        r"!?\s*\d*\s*CD\s*Cuando canta la sur",
        r"LOS DEL SUR\s*(?:CD\s*)?1\s*CD",
        r"LOS DEL SUR\s*CD\s*1",
    ],
    2: [
        r"\d+\s*CD\s*El orgullo de ser verdolaga",
        r"LOS DEL SUR\s*(?:CD\s*)?2\s*CD",
        r"LOS DEL SUR\s*CD\s*2",
    ],
    3: [
        r"\d+\s*CD\s*Soy del verde soy feliz",
        r"LOS DEL SUR\s*(?:CD\s*)?3\s*CD",
        r"LOS DEL SUR\s*CD\s*3",
    ],
    4: [
        r"\d+\s*CD\s*Alegr[ií]a popular",
        r"LOS DEL SUR\s*(?:CD\s*)?4\s*CD",
        r"LOS DEL SUR\s*CD\s*4",
    ],
    5: [
        # "5 CD", "5 Cd", "5C" (sin d), "5 CD El pueblo" — todos válidos.
        r"\d+\s*C[dD]?\s*El pueblo es verdolaga",
        r"LOS DEL SUR\s*(?:CD\s*)?5\s*CD",
        r"LOS DEL SUR\s*CD\s*5",
    ],
    6: [
        r"\d+\s*CD\s*Para amarte nac[ií]",
        r"LOS DEL SUR\s*(?:CD\s*)?6\s*CD",
        r"LOS DEL SUR\s*CD\s*6",
    ],
}


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"\[[^\]]*\]", "", s)
    s = re.sub(r"\(\d+\)", "", s)
    s = re.sub(r"\.(mp3|wav|m4a)$", "", s, flags=re.I)
    s = re.sub(r"[^a-zA-Z0-9]+", " ", s).lower().strip()
    return s


def extract_title(filename: str, cd_num: int) -> str:
    s = filename
    # Strip known prefix
    for pat in CD_PATTERNS[cd_num]:
        s = re.sub(pat, "", s, flags=re.I)
    s = re.sub(r"^\s*-\s*", " ", s)  # "- TITLE" → " TITLE"
    s = re.sub(r"_+", " ", s)
    return norm(s)


def folder_text(folder_name: str) -> str:
    # "02-verdolaga-por-siempre-voy-a-ser" -> "verdolaga por siempre voy a ser"
    base = re.sub(r"^\d+-", "", folder_name)
    return base.replace("-", " ")


def classify_cd(filename: str) -> int | None:
    low = filename.lower()
    for n, patterns in CD_PATTERNS.items():
        for pat in patterns:
            if re.search(pat, low, re.I):
                return n
    if filename.startswith("!") and "cuando canta" in low:
        return 1
    return None


def main():
    if not DL.exists():
        print("No existe Downloads.")
        return

    all_mp3 = [f for f in os.listdir(DL) if f.lower().endswith(".mp3")]
    print(f"mp3s en Downloads: {len(all_mp3)}")

    # Agrupar por CD
    by_cd: dict[int, list[str]] = {}
    for f in all_mp3:
        cd = classify_cd(f)
        if cd:
            by_cd.setdefault(cd, []).append(f)

    for cd_num in sorted(by_cd.keys()):
        files = by_cd[cd_num]
        cd_dir = CONTENT / f"cd{cd_num}"
        if not cd_dir.exists():
            print(f"cd{cd_num}: no existe folder, skip")
            continue

        folders = [
            f for f in sorted(os.listdir(cd_dir))
            if re.match(r"^\d+-", f) and (cd_dir / f).is_dir()
        ]
        folder_texts = {f: norm(folder_text(f)) for f in folders}

        print(f"\n=== CD{cd_num}: {len(files)} archivos, {len(folders)} folders ===")

        # Por folder, buscar mejor match. Preferir el menos-ruidoso (sin (1) (2)).
        for folder in folders:
            dst = cd_dir / folder / "audio.mp3"
            m4a = cd_dir / folder / "audio.m4a"
            # Skip si ya tiene audio (mp3 o m4a recomprimido).
            if (dst.exists() and dst.stat().st_size > 0) or (
                m4a.exists() and m4a.stat().st_size > 0
            ):
                continue
            target = folder_texts[folder]

            scored = []
            for f in files:
                title = extract_title(f, cd_num)
                if not title:
                    continue
                s = SequenceMatcher(None, target, title).ratio()
                penalty = 0.05 if re.search(r"\(\d+\)", f) else 0
                scored.append((s - penalty, f))
            if not scored:
                continue
            scored.sort(reverse=True)
            best_score, best_file = scored[0]
            if best_score < 0.55:
                print(f"  ? {folder}: sin match bueno (mejor: {best_score:.2f})")
                continue

            src = DL / best_file
            try:
                shutil.move(str(src), str(dst))
                print(f"  OK {folder}  <-  {best_file[:55]}  ({best_score:.2f})")
            except Exception as e:
                print(f"  ERR {folder}: {e}")

    # Resumen final: folders de cd2-6 sin audio
    print("\n=== Folders sin audio despues del match ===")
    for cd_num in range(2, 7):
        cd_dir = CONTENT / f"cd{cd_num}"
        if not cd_dir.exists():
            continue
        for f in sorted(os.listdir(cd_dir)):
            fp = cd_dir / f
            if not fp.is_dir() or not re.match(r"^\d+-", f):
                continue
            audio = fp / "audio.mp3"
            if not audio.exists() or audio.stat().st_size == 0:
                print(f"  cd{cd_num}/{f}")


if __name__ == "__main__":
    main()
