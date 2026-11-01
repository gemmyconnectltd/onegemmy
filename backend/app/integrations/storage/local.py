import asyncio
import uuid
from pathlib import Path

from app.integrations.storage import StorageBackend


class LocalStorage(StorageBackend):
    def __init__(self, base_dir: str | Path):
        self.base_dir = Path(base_dir).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def save(self, subdir: str, filename: str, content: bytes) -> str:
        dir_path = self.base_dir / subdir
        await asyncio.to_thread(dir_path.mkdir, parents=True, exist_ok=True)
        ext = Path(filename).suffix or ""
        unique_name = f"{uuid.uuid4().hex}{ext}"
        file_path = dir_path / unique_name
        await asyncio.to_thread(file_path.write_bytes, content)
        return f"/uploads/{subdir}/{unique_name}"

    async def delete(self, url_path: str) -> None:
        relative = url_path.replace("/uploads/", "", 1)
        file_path = self.base_dir / relative
        if file_path.exists():
            await asyncio.to_thread(file_path.unlink)


    async def read(self, url_path: str) -> bytes:
        path = (self.base_dir / url_path.removeprefix("/uploads/")).resolve()
        if not path.is_relative_to(self.base_dir):
            raise ValueError("Invalid storage path")
        return await asyncio.to_thread(path.read_bytes)
