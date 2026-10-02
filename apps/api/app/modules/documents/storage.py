from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import secrets


@dataclass(frozen=True, slots=True)
class StoredObject:
    storage_name: str
    path: Path


class LocalPrivateObjectStorage:
    """Prototype private object store.

    Files live outside Next.js/public with random names and are never exposed by a static route.
    Replace this adapter with S3/R2/GCS private buckets without changing the document service.
    """

    def __init__(self, root: str) -> None:
        self.root = Path(root).expanduser().resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, data: bytes, extension: str) -> StoredObject:
        suffix = extension.lower() if extension.startswith(".") else f".{extension.lower()}"
        storage_name = f"{secrets.token_urlsafe(24)}{suffix}"
        path = self.root / storage_name
        path.write_bytes(data)
        return StoredObject(storage_name=storage_name, path=path)

    def path_for(self, storage_name: str) -> Path:
        candidate = (self.root / storage_name).resolve()
        if candidate.parent != self.root:
            raise ValueError("Invalid storage path.")
        return candidate

    def delete(self, storage_name: str) -> None:
        path = self.path_for(storage_name)
        if path.exists():
            path.unlink()
