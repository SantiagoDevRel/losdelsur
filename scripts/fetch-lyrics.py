"""
scripts/fetch-lyrics.py
Scrapea letras de los catalogos publicos de Los Del Sur en
cancioneros.com y barrabrava.net, y las escribe en los
content/cdN/<song-folder>/letra.md correspondientes.

NO sobreescribe letras que ya existen como "reales" (>50 chars).
Es decir: si ya pegaste la letra a mano, no se toca.

Uso:
  python scripts/fetch-lyrics.py          # aplica el mapeo del dict
  python scripts/fetch-lyrics.py --dry    # solo imprime, no escribe
  python scripts/fetch-lyrics.py --force  # sobreescribe todo
"""

from __future__ import annotations
import argparse
import html
import re
import sys
import urllib.request
from pathlib import Path

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

HEADERS = {
    "User-Agent": UA,
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "es-ES,es;q=0.9",
}

# ----- Mapeo folder -> URL ----------------------------------------------

# Claves: path relativo del folder bajo content/.
# Valores: URL canónica de la letra.
MAPPING: dict[str, str] = {
    # CD1 — Cuando Canta La Sur (2001)
    "content/cd1/03-venir-a-verte-es-amarte": "https://barrabrava.net/atletico-nacional/los-del-sur/letra/venir-a-verte-es-amarte/",
    "content/cd1/05-tu-eres-mi-equipo-del-alma": "https://barrabrava.net/atletico-nacional/los-del-sur/letra/tus-eres-mi-equipo-del-alma/",
    "content/cd1/07-seguirte-hasta-la-muerte": "https://www.cancioneros.com/lyrics/song/1946172/seguirte-hasta-la-muerte-los-del-sur",
    "content/cd1/08-soy-del-verde": "https://www.cancioneros.com/lyrics/song/2037195/soy-del-verde-desde-que-naci-los-del-sur",
    "content/cd1/12-mi-pasion-es-grande": "https://barrabrava.net/atletico-nacional/los-del-sur/letra/mi-pasion-es-grande/",
    "content/cd1/13-heavy-metal-dale-dale-verde-no-le-falles-a-tu-gente": "https://www.cancioneros.com/lyrics/song/1978351/no-le-falles-a-tu-hinchada-los-del-sur",
    "content/cd1/16-al-campeon-yo-lo-llevo-en-el-corazon": "https://www.cancioneros.com/lyrics/song/2111115/al-campeon-yo-lo-llevo-en-el-corazon-los-del-sur",
    "content/cd1/18-cuando-canta-la-sur-una-vez-mas-te-venimos-a-alentar": "https://barrabrava.net/atletico-nacional/los-del-sur/letra/cuando-canta-la-sur/",
    "content/cd1/19-dame-una-alegria": "https://www.cancioneros.com/lyrics/song/2022063/dame-una-alegria-los-del-sur",
    "content/cd1/20-el-aguante-se-muestra-en-la-tribuna": "https://www.cancioneros.com/lyrics/song/1978354/el-aguante-se-muestra-en-la-tribuna-los-del-sur",
}


def http_get(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        data = r.read()
    # Cancioneros sirve UTF-8, barrabrava ISO-8859-1 (segun sus headers).
    for enc in ("utf-8", "iso-8859-1", "cp1252"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _clean_lyric_html(body: str) -> str:
    # Quitar <audio>...</audio>
    body = re.sub(r"<audio[^>]*>.*?</audio>", "", body, flags=re.S | re.I)
    # <br/> -> newline
    body = re.sub(r"<br\s*/?>", "\n", body, flags=re.I)
    # <p> boundaries -> double newline
    body = re.sub(r"</p\s*>", "\n\n", body, flags=re.I)
    body = re.sub(r"<p[^>]*>", "", body, flags=re.I)
    # strip all tags
    body = re.sub(r"<[^>]+>", "", body)
    body = html.unescape(body)
    # normalize whitespace
    body = re.sub(r"[ \t]+", " ", body)
    body = re.sub(r"\n[ \t]+", "\n", body)
    body = re.sub(r"[ \t]+\n", "\n", body)
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body.strip()


def extract_cancioneros(raw: str) -> str | None:
    m = re.search(r"<p class=['\"]lletra_can['\"][^>]*>(.*?)</p>", raw, re.S)
    if not m:
        return None
    return _clean_lyric_html(m.group(1))


def extract_barrabrava(raw: str) -> str | None:
    # La letra vive dentro de #letra o un <div class="letra">
    # Como la estructura es HTML simple, buscamos ese contenedor.
    m = re.search(r"<div[^>]*id=['\"]letra['\"][^>]*>(.*?)</div>", raw, re.S | re.I)
    if not m:
        m = re.search(r"<div[^>]*class=['\"][^'\"]*letra[^'\"]*['\"][^>]*>(.*?)</div>", raw, re.S | re.I)
    if not m:
        # Fallback: bloque <pre>
        m = re.search(r"<pre[^>]*>(.*?)</pre>", raw, re.S)
    if not m:
        return None
    return _clean_lyric_html(m.group(1))


def fetch_one(url: str) -> str | None:
    raw = http_get(url)
    if "cancioneros.com" in url:
        return extract_cancioneros(raw)
    if "barrabrava.net" in url:
        return extract_barrabrava(raw)
    return None


def current_letra_is_placeholder(letra_path: Path) -> bool:
    if not letra_path.exists():
        return True
    raw = letra_path.read_text(encoding="utf-8").strip()
    # Quita cualquier H1 heredado
    raw = re.sub(r"^\s*#\s+.+\n+", "", raw)
    return len(raw) < 50 or "pendiente" in raw.lower()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry", action="store_true", help="Solo imprimir, no escribir")
    parser.add_argument("--force", action="store_true", help="Sobreescribir letras existentes")
    args = parser.parse_args()

    ok = 0
    fail = 0
    skipped = 0
    for folder, url in MAPPING.items():
        fp = Path(folder)
        if not fp.exists():
            print(f"SKIP (no folder)  {folder}")
            skipped += 1
            continue
        letra_path = fp / "letra.md"
        if not args.force and not current_letra_is_placeholder(letra_path):
            print(f"SKIP (ya tiene)   {folder}")
            skipped += 1
            continue

        print(f"fetch  {folder}")
        try:
            lyric = fetch_one(url)
        except Exception as e:
            print(f"  ERROR fetch: {e}")
            fail += 1
            continue
        if not lyric or len(lyric) < 30:
            print(f"  ERROR: no pude extraer letra")
            fail += 1
            continue

        if args.dry:
            print("  ---")
            print(lyric[:200])
            print("  ---")
            ok += 1
            continue

        letra_path.write_text(lyric + "\n", encoding="utf-8")
        print(f"  OK -> {letra_path}  ({len(lyric)} chars)")
        ok += 1

    print(f"\n{ok} ok, {fail} failed, {skipped} skipped")


if __name__ == "__main__":
    main()
