from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, TYPE_CHECKING

if TYPE_CHECKING:
    from .parser import ParsedCalendarItem

from cryptography.fernet import Fernet, InvalidToken


@dataclass(frozen=True, slots=True)
class ProviderFetchResult:
    items: tuple["ParsedCalendarItem", ...]
    next_cursor: str | None = None
    source_version: str | None = None


class ProviderSyncFailure(RuntimeError):
    pass


class ProviderAuthorizationExpired(ProviderSyncFailure):
    pass


class CalendarConnector(Protocol):
    key: str
    minimum_scopes: tuple[str, ...]
    def fetch_incremental(self, *, cursor: str | None = None) -> ProviderFetchResult: ...
    def revoke(self) -> None: ...


@dataclass(frozen=True, slots=True)
class ProviderConnectorContract:
    """Documentation/runtime contract for future explicitly-authorized providers.

    DOC-F23 deliberately does not instantiate a real university/LMS connector.
    """
    key: str
    minimum_scopes: tuple[str, ...] = ("calendar.read",)
    supports_incremental_sync: bool = True
    supports_revoke: bool = True


class CredentialCipher:
    """Encrypt/decrypt provider credentials when a future connector is authorized.

    Manual ICS/CSV imports never create credentials. A real provider integration must
    supply a Fernet key from secret storage; plaintext is never stored in project data.
    """
    def __init__(self, key: str):
        if not key:
            raise ValueError("Calendar credential encryption key is not configured.")
        self._fernet = Fernet(key.encode("ascii"))

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode("ascii")).decode("utf-8")
        except InvalidToken as exc:
            raise ValueError("Stored calendar credential could not be decrypted.") from exc
