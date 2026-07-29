import uuid
from pathlib import Path

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent.parent / "uploads"


class LocalStorage:
    def __init__(self, base_dir: Path = UPLOAD_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def save(self, subdir: str, filename: str, content: bytes) -> str:
        dir_path = self.base_dir / subdir
        dir_path.mkdir(parents=True, exist_ok=True)
        ext = Path(filename).suffix or ""
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = dir_path / unique_name
        file_path.write_bytes(content)
        return f"/uploads/{subdir}/{unique_name}"

    async def delete(self, url_path: str) -> None:
        relative = url_path.replace("/uploads/", "", 1)
        file_path = self.base_dir / relative
        if file_path.exists():
            file_path.unlink()
