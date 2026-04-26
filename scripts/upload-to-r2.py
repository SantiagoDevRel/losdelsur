"""
scripts/upload-to-r2.py

Sube todos los audios desde public/audio/ al bucket Cloudflare R2.
Usa la API S3-compatible (boto3). Idempotente: re-correr no daña nada.

Uso:
  python scripts/upload-to-r2.py            # sube todos
  python scripts/upload-to-r2.py cd1/*      # solo CD1
  python scripts/upload-to-r2.py --dry      # mostrar plan, no subir
  python scripts/upload-to-r2.py --force    # re-subir aunque ya exista

Pre-requisitos:
  pip install boto3
  R2_* env vars en .env.local (cargadas via python-dotenv o manual)
"""

from __future__ import annotations
import argparse
import os
import sys
from fnmatch import fnmatch
from pathlib import Path

# Cargar .env.local manualmente (sin depender de python-dotenv).
def load_env():
    env_path = Path(__file__).resolve().parent.parent / ".env.local"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

load_env()

try:
    import boto3
    from botocore.config import Config
except ImportError:
    print("Falta boto3. pip install boto3")
    sys.exit(1)

R2_ENDPOINT = os.environ.get("R2_ENDPOINT")
R2_BUCKET = os.environ.get("R2_BUCKET")
R2_KEY = os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET = os.environ.get("R2_SECRET_ACCESS_KEY")

if not all([R2_ENDPOINT, R2_BUCKET, R2_KEY, R2_SECRET]):
    print("ERROR: faltan R2_ENDPOINT / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY en .env.local")
    sys.exit(1)


def make_client():
    # R2 es S3-compatible. Region "auto" porque Cloudflare distribuye
    # globalmente. signature_version v4 obligatorio.
    return boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_KEY,
        aws_secret_access_key=R2_SECRET,
        config=Config(signature_version="s3v4", region_name="auto"),
    )


def list_audio_files(patterns: list[str]) -> list[tuple[str, Path]]:
    """Recorre public/audio/ y devuelve [(key_remoto, path_local), ...]."""
    pub_audio = Path("public/audio")
    if not pub_audio.exists():
        print(f"ERROR: {pub_audio} no existe. Corré npm run sync-audio primero.")
        sys.exit(1)
    out = []
    for f in sorted(pub_audio.rglob("*.m4a")):
        # key remoto = path relativo a public/audio/
        # ej: public/audio/cd1/02-slug.v3.m4a -> cd1/02-slug.v3.m4a
        rel = f.relative_to(pub_audio).as_posix()
        if patterns and not any(fnmatch(rel, p) for p in patterns):
            continue
        out.append((rel, f))
    return out


def remote_exists(client, key: str) -> int | None:
    """Devuelve el size del objeto remoto si existe, None si no."""
    try:
        h = client.head_object(Bucket=R2_BUCKET, Key=key)
        return int(h["ContentLength"])
    except client.exceptions.ClientError as e:
        code = e.response.get("Error", {}).get("Code", "")
        if code in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def upload_one(client, key: str, path: Path, force: bool, dry: bool) -> str:
    local_size = path.stat().st_size
    if not force:
        remote_size = remote_exists(client, key)
        if remote_size == local_size:
            return f"skip  (ya existe igual)        {key}"
    if dry:
        return f"would upload  {local_size // 1024} KB         {key}"
    client.upload_file(
        Filename=str(path),
        Bucket=R2_BUCKET,
        Key=key,
        ExtraArgs={
            "ContentType": "audio/mp4",  # m4a / aac
            # Cache-Control en la respuesta del CDN: 1 mes browser cache,
            # SW cache offline maneja el resto. Sin "immutable" para no
            # repetir el bug de Vercel (cachear 404 por años).
            "CacheControl": "public, max-age=2592000",
        },
    )
    return f"OK    {local_size // 1024} KB         {key}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("patterns", nargs="*", help="Globs (ej: cd1/*). Vacío = todos")
    ap.add_argument("--dry", action="store_true", help="Solo reportar")
    ap.add_argument("--force", action="store_true", help="Re-subir aunque ya exista")
    args = ap.parse_args()

    client = make_client()

    # Verificar que el bucket existe.
    try:
        client.head_bucket(Bucket=R2_BUCKET)
    except Exception as e:
        print(f"ERROR: no puedo acceder al bucket {R2_BUCKET}: {e}")
        sys.exit(1)

    files = list_audio_files(args.patterns)
    if not files:
        print("No hay archivos para subir.")
        return
    print(f"Targets: {len(files)} archivo(s). Bucket: {R2_BUCKET}")
    if args.dry:
        print("--- DRY RUN ---")

    ok = err = skipped = 0
    for i, (key, path) in enumerate(files, 1):
        try:
            result = upload_one(client, key, path, args.force, args.dry)
            print(f"[{i}/{len(files)}] {result}")
            if result.startswith("skip"):
                skipped += 1
            elif "OK" in result or "would" in result:
                ok += 1
        except Exception as e:
            print(f"[{i}/{len(files)}] FAIL  {key}: {e}")
            err += 1

    print(f"\n==== {ok} subidos, {skipped} ya existían, {err} errores ====")


if __name__ == "__main__":
    main()
