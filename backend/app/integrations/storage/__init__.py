from abc import ABC, abstractmethod

from app.core.config import settings
from app.integrations.storage.local import LocalStorage


class StorageBackend(ABC):
    @abstractmethod
    async def save(self, subdir: str, filename: str, content: bytes) -> str: ...

    @abstractmethod
    async def delete(self, url_path: str) -> None: ...


storage: StorageBackend = LocalStorage(base_dir=settings.UPLOAD_DIR)
