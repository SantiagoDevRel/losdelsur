"""
scripts/fetch-lyrics-all.py
Busca letras reales de Los Del Sur para todas las canciones del catálogo,
matcheando los títulos de cada song.json contra dos fuentes públicas:
  - cancioneros.com (45 canciones catalogadas)
  - barrabrava.net (39 canciones catalogadas)

Usa fuzzy matching (SequenceMatcher) con umbral alto para no escribir
letras equivocadas. Al terminar reporta: cuántas encontradas, cuáles
quedaron pendientes.
"""

from __future__ import annotations
import os
import re
import html
import json
import time
import urllib.request
import unicodedata
from difflib import SequenceMatcher
from pathlib import Path

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36"
HEADERS = {"User-Agent": UA, "Accept": "text/html", "Accept-Language": "es-ES,es"}

# Umbral mínimo de similitud para aceptar un match título<->URL.
# 0.72 es conservador: filtra falsos positivos como "Sos Mi Enfermedad"
# matcheando con "Me Enamore De Ti" (~0.4) pero acepta variaciones
# ortográficas menores.
MIN_SIMILARITY = 0.72

# Catalogo público #1: cancioneros.com/lyrics/artist/48289/los-del-sur
# (listado obtenido manualmente — se prefiere sobre barrabrava por
# mejor HTML para scraping).
CANCIONEROS = [
    ("A ganar de nuevo la copa libertadores", "https://www.cancioneros.com/lyrics/song/2103782/a-ganar-de-nuevo-la-copa-libertadores-los-del-sur"),
    ("El aguante se muestra en la tribuna", "https://www.cancioneros.com/lyrics/song/1978354/el-aguante-se-muestra-en-la-tribuna-los-del-sur"),
    ("A la copa otra ves", "https://www.cancioneros.com/lyrics/song/1936643/a-la-copa-otra-ves-los-del-sur"),
    ("Al campeon yo lo llevo en el corazon", "https://www.cancioneros.com/lyrics/song/2111115/al-campeon-yo-lo-llevo-en-el-corazon-los-del-sur"),
    ("Aqui esta tu hinchada", "https://www.cancioneros.com/lyrics/song/1936647/aqui-esta-tu-hinchada-los-del-sur"),
    ("Aunque haya gente que no nos quiera", "https://www.cancioneros.com/lyrics/song/2011240/aunque-haya-gente-que-no-nos-quiera-los-del-sur"),
    ("Aunque Me Cueste Morir", "https://www.cancioneros.com/lyrics/song/1995052/aunque-me-cueste-morir-los-del-sur"),
    ("Brindo por vos Nacional", "https://www.cancioneros.com/lyrics/song/2069588/brindo-por-vos-nacional-los-del-sur"),
    ("Canta fuerte esta hinchada", "https://www.cancioneros.com/lyrics/song/1936638/canta-fuerte-esta-hinchada-los-del-sur"),
    ("Los colores de mi corazon", "https://www.cancioneros.com/lyrics/song/2037199/los-colores-de-mi-corazon-los-del-sur"),
    ("Cuando yo me muera", "https://www.cancioneros.com/lyrics/song/2037192/cuando-yo-me-muera-los-del-sur"),
    ("La Cumbia Nacional", "https://www.cancioneros.com/lyrics/song/2050286/la-cumbia-nacional-los-del-sur"),
    ("Dame una alegria", "https://www.cancioneros.com/lyrics/song/2022063/dame-una-alegria-los-del-sur"),
    ("Entre llantos y alegrias", "https://www.cancioneros.com/lyrics/song/2095103/entre-llantos-y-alegrias-los-del-sur"),
    ("Es La Banda Pirata", "https://www.cancioneros.com/lyrics/song/2100172/es-la-banda-pirata-los-del-sur"),
    ("Esta es tu hinchada de siempre", "https://www.cancioneros.com/lyrics/song/2019117/esta-es-tu-hinchada-de-siempre-los-del-sur"),
    ("La Gloria Esta De Estos Colores", "https://www.cancioneros.com/lyrics/song/2132160/la-gloria-esta-de-estos-colores-los-del-sur"),
    ("La gloria nunca la perdimos", "https://www.cancioneros.com/lyrics/song/1949907/la-gloria-nunca-la-perdimos-los-del-sur"),
    ("Guaro y pola", "https://www.cancioneros.com/lyrics/song/2069592/guaro-y-pola-los-del-sur"),
    ("Me lo ensenaron mis viejos", "https://www.cancioneros.com/lyrics/song/1936649/me-lo-ensenaron-mis-viejos-los-del-sur"),
    ("Mi equipo del alma", "https://www.cancioneros.com/lyrics/song/2010136/mi-equipo-del-alma-los-del-sur"),
    ("Millos No Venis A Medallo", "https://www.cancioneros.com/lyrics/song/1995045/millos-no-venis-a-medallo-los-del-sur"),
    ("No le falles a tu hinchada", "https://www.cancioneros.com/lyrics/song/1978351/no-le-falles-a-tu-hinchada-los-del-sur"),
    ("Oh Vamos Verdolaga", "https://www.cancioneros.com/lyrics/song/2062568/oh-vamos-verdolaga-los-del-sur"),
    ("Quiero dar la vuelta", "https://www.cancioneros.com/lyrics/song/1958545/quiero-dar-la-vuelta-los-del-sur"),
    ("Rene", "https://www.cancioneros.com/lyrics/song/2062563/rene-los-del-sur"),
    ("Rojo Cobarde", "https://www.cancioneros.com/lyrics/song/2116292/rojo-cobarde-los-del-sur"),
    ("Rojo que paso", "https://www.cancioneros.com/lyrics/song/1995059/rojo-que-paso-los-del-sur"),
    ("Rojo sos de la b", "https://www.cancioneros.com/lyrics/song/1947585/rojo-sos-de-la-b-los-del-sur"),
    ("Sabes que te amo", "https://www.cancioneros.com/lyrics/song/2013443/sabes-que-te-amo-los-del-sur"),
    ("Seguirte hasta la muerte", "https://www.cancioneros.com/lyrics/song/1946172/seguirte-hasta-la-muerte-los-del-sur"),
    ("Siempre te vengo a alentar", "https://www.cancioneros.com/lyrics/song/1937046/siempre-te-vengo-a-alentar-los-del-sur"),
    ("Sirvame Un Chorro De Guaro", "https://www.cancioneros.com/lyrics/song/2058959/sirvame-un-chorro-de-guaro-los-del-sur"),
    ("Si Sos del Rojo", "https://www.cancioneros.com/lyrics/song/1943771/si-sos-del-rojo-los-del-sur"),
    ("Somos de la ciudad de feria y flores", "https://www.cancioneros.com/lyrics/song/2111109/somos-de-la-ciudad-de-feria-y-flores-los-del-sur"),
    ("Sos el equipo que quiero", "https://www.cancioneros.com/lyrics/song/2089569/sos-el-equipo-que-quiero-los-del-sur"),
    ("Soy del verde desde que naci", "https://www.cancioneros.com/lyrics/song/2037195/soy-del-verde-desde-que-naci-los-del-sur"),
    ("Soy del verde soy feliz", "https://www.cancioneros.com/lyrics/song/2035761/soy-del-verde-soy-feliz-los-del-sur"),
    ("Te quiero como a mi vieja", "https://www.cancioneros.com/lyrics/song/1943315/te-quiero-como-a-mi-vieja-los-del-sur"),
    ("Vas a llorar rojo hijueputa", "https://www.cancioneros.com/lyrics/song/2091627/vas-a-llorar-rojo-hijueputa-los-del-sur"),
    ("Yo siempre estare", "https://www.cancioneros.com/lyrics/song/2062578/yo-siempre-estare-los-del-sur"),
    ("Yo Soy Del Verde Yo Lo Grito", "https://www.cancioneros.com/lyrics/song/1995053/yo-soy-del-verde-yo-lo-grito-los-del-sur"),
    ("Y vamos los verdolagas a ser campeones", "https://www.cancioneros.com/lyrics/song/2103775/y-vamos-los-verdolagas-a-ser-campeones-los-del-sur"),
]

# Catalogo público #2: barrabrava.net/atletico-nacional/los-del-sur/letras/
BARRABRAVA = [
    ("A mi me volvio loco ser de Nacional", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/a-mi-me-volvio-loco-ser-de-nacional/"),
    ("Al campeon yo lo llevo en el corazon", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/al-campeon-yo-lo-llevo-en-el-corazon/"),
    ("Campeon al Chapecoense", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/campeon-al-chapecoense/"),
    ("Cantemos Surenos", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/cantemos-surenos/"),
    ("Cuando Canta La Sur", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/cuando-canta-la-sur/"),
    ("Cuando Yo Me Muera", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/cuando-yo-me-muera/"),
    ("Dale ve que quiero festejar", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/dale-ve-que-quiero-festejar/"),
    ("De la cuna hasta el cajon", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/de-la-cuna-hasta-el-cajon/"),
    ("Dejo todo por verte", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/dejo-todo-por-verte/"),
    ("Desde La cuna hasta el cajon", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/desde-la-cuna-hasta-el-cajon/"),
    ("El Cielo Puede Esperar", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/el-cielo-puede-esperar/"),
    ("En el Cielo alentando esta la Banda Inmortal", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/en-el-cielo-alentando-esta-la-banda-inmortal/"),
    ("En la tribuna canta la hinchada", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/en-la-tribuna-canta-la-hinchada/"),
    ("Juntos como antes", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/juntos-como-antes/"),
    ("La banda Inmortal", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/la-banda-inmortal/"),
    ("La de honor verdadero", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/la-de-honor-verdadero/"),
    ("Llora rojo, Lloren Todos", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/llora-rojo-lloren-todos/"),
    ("Me conto el Abuelo Que en el ano 81", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/me-conto-el-abuelo-que-en-el-ano-81/"),
    ("Me enamore de ti", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/me-enamore-de-ti/"),
    ("Mi Juramento Para Ti", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/mi-juramento-para-ti/"),
    ("Mi pasion es grande", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/mi-pasion-es-grande/"),
    ("Mis abuelos me ensenaron a quererte a alentarte", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/mis-abuelos-me-ensenaron-a-quererte-a-alentarte/"),
    ("Muchas veces me rompi la voz", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/muchas-veces-me-rompi-la-voz/"),
    ("Nacional el orgullo de mi ciudad", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/nacional-el-orgullo-de-mi-ciudad/"),
    ("Nunca pero nunca verde te abandonaremos", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/nunca-pero-nunca-verde-te-abandonaremos/"),
    ("Oh vamos verdolaga", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/oh-vamos-verdolaga/"),
    ("Para salir campeones, hay que poner mas", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/para-salir-campeones-hay-que-poner-mas/"),
    ("Pobre diablo", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/pobre-diablo/"),
    ("Por Sos Verde Me Muero", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/por-sos-verde-me-muero/"),
    ("Queremos ganar la copa libertadores", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/queremos-ganar-la-copa-libertadores/"),
    ("Sentimiento que llevo en el corazon", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/sentimiento-que-llevo-en-el-corazon/"),
    ("Sirvame cerveza, sirvame mas guaro", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/sirvame-cerveza-sirvame-mas-guaro/"),
    ("Te Quiero Como A Mi Vieja", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/te-quiero-como-a-mi-vieja/"),
    ("Tus eres mi equipo del alma", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/tus-eres-mi-equipo-del-alma/"),
    ("Vamos todos juntos la hinchada y los jugadores", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/vamos-todos-juntos-la-hinchada-y-los-jugadores/"),
    ("Vamos Verdolagas, aqui esta tu gente", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/vamos-verdolagas-aqui-esta-tu-gente/"),
    ("Venir a verte es amarte", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/venir-a-verte-es-amarte/"),
    ("Verde vos sos la alegria del mundo entero", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/verde-vos-sos-la-alegria-del-mundo-entero/"),
    ("Donde estan los Indigentes", "https://barrabrava.net/atletico-nacional/los-del-sur/letra/donde-estan-los-indigentes/"),
]


def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9\s]", " ", s).lower()
    return re.sub(r"\s+", " ", s).strip()


def http_get(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        data = r.read()
    for enc in ("utf-8", "iso-8859-1", "cp1252"):
        try:
            return data.decode(enc)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def _clean(body: str) -> str:
    body = re.sub(r"<audio[^>]*>.*?</audio>", "", body, flags=re.S | re.I)
    body = re.sub(r"<br\s*/?>", "\n", body, flags=re.I)
    body = re.sub(r"</p\s*>", "\n\n", body, flags=re.I)
    body = re.sub(r"<p[^>]*>", "", body, flags=re.I)
    body = re.sub(r"<[^>]+>", "", body)
    body = html.unescape(body)
    # Quitar emojis (🎶 etc.) y caracteres extraños.
    body = re.sub(r"[\U0001F000-\U0001FFFF\U00002600-\U000027FF]", "", body)
    body = re.sub(r"[ \t]+", " ", body)
    body = re.sub(r"\n[ \t]+", "\n", body)
    body = re.sub(r"[ \t]+\n", "\n", body)
    body = re.sub(r"\n{3,}", "\n\n", body)
    return body.strip()


def extract_cancioneros(raw: str) -> str | None:
    m = re.search(r"<p class=['\"]lletra_can['\"][^>]*>(.*?)</p>", raw, re.S)
    return _clean(m.group(1)) if m else None


def extract_barrabrava(raw: str) -> str | None:
    m = (
        re.search(r"<div[^>]*id=['\"]letra['\"][^>]*>(.*?)</div>", raw, re.S | re.I)
        or re.search(r"<div[^>]*class=['\"][^'\"]*letra[^'\"]*['\"][^>]*>(.*?)</div>", raw, re.S | re.I)
        or re.search(r"<pre[^>]*>(.*?)</pre>", raw, re.S)
    )
    return _clean(m.group(1)) if m else None


def fetch(url: str) -> str | None:
    raw = http_get(url)
    if "cancioneros.com" in url:
        return extract_cancioneros(raw)
    if "barrabrava.net" in url:
        return extract_barrabrava(raw)
    return None


def match_title(song_title: str, catalog: list[tuple[str, str]]) -> tuple[float, str] | None:
    """Devuelve (score, url) del mejor match en el catálogo."""
    target = norm(song_title)
    best = (0.0, "")
    for cat_title, url in catalog:
        s = SequenceMatcher(None, target, norm(cat_title)).ratio()
        if s > best[0]:
            best = (s, url)
    return best if best[0] >= MIN_SIMILARITY else None


def current_is_placeholder(path: Path) -> bool:
    if not path.exists():
        return True
    raw = path.read_text(encoding="utf-8").strip()
    raw = re.sub(r"^\s*#\s+.+\n+", "", raw)
    return len(raw) < 60 or bool(re.search(r"pendiente de transcripci", raw, re.I))


def main():
    found = 0
    skipped = 0
    failed = 0
    missing: list[str] = []

    for cd_num in range(1, 7):
        cd_dir = Path("content") / f"cd{cd_num}"
        if not cd_dir.exists():
            continue
        for song_folder in sorted(os.listdir(cd_dir)):
            if not re.match(r"^\d+-", song_folder):
                continue
            folder = cd_dir / song_folder
            if not folder.is_dir():
                continue
            song_json = folder / "song.json"
            if not song_json.exists():
                continue
            letra_md = folder / "letra.md"

            if not current_is_placeholder(letra_md):
                skipped += 1
                continue

            meta = json.loads(song_json.read_text(encoding="utf-8"))
            title = meta["titulo"]

            # Matchear preferente en cancioneros (mejor calidad HTML),
            # fallback en barrabrava.
            match = match_title(title, CANCIONEROS)
            if not match:
                match = match_title(title, BARRABRAVA)
            if not match:
                missing.append(f"cd{cd_num}/{song_folder}: {title}")
                continue

            score, url = match
            try:
                lyric = fetch(url)
            except Exception as e:
                print(f"  FETCH ERROR {song_folder}: {e}")
                failed += 1
                continue
            if not lyric or len(lyric) < 30:
                print(f"  EMPTY {song_folder}")
                failed += 1
                continue
            letra_md.write_text(lyric + "\n", encoding="utf-8")
            print(f"  OK cd{cd_num}/{song_folder} ({score:.2f})")
            found += 1
            time.sleep(0.15)  # delay cortés al server

    print(f"\n=== {found} letras escritas, {skipped} ya tenían, {failed} fallaron ===")
    print(f"Sin match en catalogos ({len(missing)}):")
    for m in missing:
        print(f"  {m}")


if __name__ == "__main__":
    main()
