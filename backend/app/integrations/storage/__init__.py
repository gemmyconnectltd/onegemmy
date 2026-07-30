from abc import ABC, abstractmethod

from app.core.config import settings


class StorageBackend(ABC):
    @abstractmethod
    async def save(self, subdir: str, filename: str, content: bytes) -> str: ...

    @abstractmethod
    async def delete(self, url_path: str) -> None: ...


from app.integrations.storage.local import LocalStorage

storage: StorageBackend = LocalStorage(base_dir=settings.UPLOAD_DIR)
