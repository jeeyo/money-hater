import hashlib
from pathlib import Path

from PIL import Image as PILImage
from pillow_heif import register_heif_opener

from app.config import settings

register_heif_opener()

THUMB_MAX = 512

EXT_BY_MIME = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/gif": "gif",
    "image/tiff": "tiff",
}


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def media_dir(user_id: int, sha256: str) -> Path:
    # Shard by hash prefix so a directory never accumulates millions of entries
    return settings.media_root / str(user_id) / sha256[:2]


def save_original(user_id: int, sha256: str, ext: str, data: bytes) -> Path:
    directory = media_dir(user_id, sha256)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{sha256}.{ext}"
    if not path.exists():
        path.write_bytes(data)
    return path


def make_thumbnail(original_path: Path) -> Path:
    thumb_path = original_path.with_name(f"{original_path.stem}_thumb.jpg")
    with PILImage.open(original_path) as im:
        im = im.convert("RGB")
        im.thumbnail((THUMB_MAX, THUMB_MAX))
        im.save(thumb_path, "JPEG", quality=82)
    return thumb_path


def sniff_mime(data: bytes, fallback: str = "application/octet-stream") -> str:
    import io

    try:
        with PILImage.open(io.BytesIO(data)) as im:
            fmt = (im.format or "").lower()
    except Exception:
        return fallback
    return {
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "heif": "image/heic",
        "gif": "image/gif",
        "tiff": "image/tiff",
    }.get(fmt, fallback)
